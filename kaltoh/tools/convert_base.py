"""Convert a Meshy base OBJ + texture - the stone basin, or the obsidian altar - into compact game
assets.

Usage: python3 -I convert_base.py <model.obj> <texture.png> <out_dir> [name] [faces]

  name   what the files are called (base, the stone, by default; altar, the obsidian altar)
  faces  simplify the model to this many triangles first (pymeshlab, keeping its texture
         coordinates): the altar comes at 431,554, far more than a phone need draw

Writes:
  <name>.bin   quantized mesh: int16 positions, int8 normals, uint16 uvs, uint16 indices
  <name>.json  bounds plus a radial height profile used for falling-rod collisions
  <name>.jpg   2048px colour texture
  <name>-bump.jpg  1024px greyscale relief derived from the texture (the stone's grain: the altar's
                   relief is in its mesh, and its texture's patches would only roughen its polish)
"""
import json
import os
import struct
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None


def load_obj(path):
    positions, uvs, normals, corners = [], [], [], []
    with open(path) as f:
        for line in f:
            if line.startswith('v '):
                positions.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('vn '):
                normals.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('f '):
                face = [tuple(int(i) - 1 for i in c.split('/')) for c in line.split()[1:]]
                for k in range(1, len(face) - 1):
                    corners.extend([face[0], face[k], face[k + 1]])
    return np.array(positions), np.array(uvs), np.array(normals), corners


def surface_heights(p, tris, reach, size=401):
    """The highest of the mesh's triangles over each point of a grid across it (x and z from -reach
    to reach): its upper surface, from above (-inf where there is none)."""
    grid = np.linspace(-reach, reach, size)
    top = np.full((size, size), -np.inf)
    for a, b, c in p[tris]:
        i0, i1 = np.searchsorted(grid, min(a[0], b[0], c[0])), np.searchsorted(grid, max(a[0], b[0], c[0]), 'right')
        j0, j1 = np.searchsorted(grid, min(a[2], b[2], c[2])), np.searchsorted(grid, max(a[2], b[2], c[2]), 'right')
        d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
        if i0 >= i1 or j0 >= j1 or abs(d) < 1e-12:
            continue
        x, z = np.meshgrid(grid[i0:i1], grid[j0:j1], indexing='ij')
        l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d
        l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        cell = top[i0:i1, j0:j1]
        np.maximum(cell, np.where(inside, l1 * a[1] + l2 * b[1] + l3 * c[1], -np.inf), out=cell)
    return grid, top


def simplified(obj_path, faces, out_path):
    """The model simplified to `faces` triangles, its normals found afresh, written to out_path."""
    import pymeshlab

    ms = pymeshlab.MeshSet()
    ms.load_new_mesh(obj_path)
    ms.meshing_decimation_quadric_edge_collapse_with_texture(targetfacenum=faces, qualitythr=0.6, preserveboundary=True,
                                                             optimalplacement=True, preservenormal=True, planarquadric=True)
    ms.compute_normal_per_vertex(weightmode='By Angle')
    ms.save_current_mesh(out_path, save_vertex_normal=True, save_wedge_texcoord=True, save_vertex_color=False, save_textures=False)


def main(obj_path, tex_path, out_dir, name='base', faces=None):
    if faces:
        with tempfile.TemporaryDirectory() as tmp:
            simpler = os.path.join(tmp, 'simplified.obj')
            simplified(obj_path, int(faces), simpler)
            pos, uv, nrm, corners = load_obj(simpler)
    else:
        pos, uv, nrm, corners = load_obj(obj_path)

    # Sit the basin on y = 0, centred on the vertical axis.
    lo, hi = pos.min(0), pos.max(0)
    pos = pos - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])

    # Unweld: one vertex per distinct (position, uv, normal) corner.
    index_of, verts, indices = {}, [], []
    for c in corners:
        if c not in index_of:
            index_of[c] = len(verts)
            verts.append(c)
        indices.append(index_of[c])
    assert len(verts) < 65536, 'too many vertices for uint16 indices'

    p = np.array([pos[v[0]] for v in verts])
    t = np.array([uv[v[1]] for v in verts])
    n = np.array([nrm[v[2]] for v in verts])
    n /= np.linalg.norm(n, axis=1, keepdims=True)

    extent = np.abs(p).max(0)
    qp = np.round(p / extent * 32767).astype('<i2')
    qn = np.round(n * 127).astype('i1')
    qn4 = np.zeros((len(qn), 4), 'i1')
    qn4[:, :3] = qn
    qt = np.round(np.clip(t, 0, 1) * 65535).astype('<u2')
    idx = np.array(indices, '<u2')

    with open(f'{out_dir}/{name}.bin', 'wb') as f:
        f.write(b'KTB1')
        f.write(struct.pack('<II3f', len(verts), len(idx), *extent))
        f.write(qp.tobytes())
        f.write(qn4.tobytes())
        f.write(qt.tobytes())
        f.write(idx.tobytes())

    # Top surface height by distance from the axis: the highest of every corner within a step either
    # side, and of the surface itself over a fine grid (where a broad face has no corner, as the
    # altar's top has none near its middle), so that, interpolated, it never lies below the stone
    # (walls and the basin's lip too).
    r = np.hypot(p[:, 0], p[:, 2])
    step = 0.02
    bins = int(np.ceil(r.max() / step)) + 1
    grid, top = surface_heights(p, idx.reshape(-1, 3), r.max())
    gx, gz = np.meshgrid(grid, grid, indexing='ij')
    gr = np.hypot(gx, gz)
    profile = []
    for b in range(bins):
        m = (r >= b * step - step) & (r < b * step + step)
        g = (gr >= b * step - step) & (gr < b * step + step) & np.isfinite(top)
        highest = max(p[m, 1].max() if m.any() else 0.0, top[g].max() if g.any() else 0.0)
        profile.append(round(float(highest), 4))
    inner = r < 0.3
    # The foot: the largest circle about the axis within the face the base stands on, less the
    # margin the stone's carving keeps inside its own (0.8 in a foot of 0.824): the carving under it
    # takes that circle.
    from scipy.spatial import ConvexHull

    bottom = p[(p[:, 1] < 0.01) & (n[:, 1] < -0.8)]
    foot = np.abs(ConvexHull(bottom[:, [0, 2]]).equations[:, 2]).min() - 0.024
    meta = {
        'vertices': len(verts),
        'triangles': len(idx) // 3,
        'extent': [round(float(x), 5) for x in extent],
        'height': round(float(p[:, 1].max()), 4),
        'radius': round(float(r.max()), 4),
        'floor': round(float(p[inner & (n[:, 1] > 0.3), 1].max()), 4),
        'foot': round(float(foot), 4),
        'profileStep': step,
        'profile': profile,
    }
    with open(f'{out_dir}/{name}.json', 'w') as f:
        json.dump(meta, f)

    tex = Image.open(tex_path).convert('RGB')
    tex.resize((2048, 2048), Image.LANCZOS).save(f'{out_dir}/{name}.jpg', quality=86, optimize=True, progressive=False)
    if name == 'base':
        grey = ImageOps.grayscale(tex.resize((1024, 1024), Image.LANCZOS))
        relief = ImageOps.autocontrast(Image.blend(grey, grey.filter(ImageFilter.GaussianBlur(6)), -0.6), cutoff=1)
        relief.save(f'{out_dir}/{name}-bump.jpg', quality=88)

    print(json.dumps({k: v for k, v in meta.items() if k != 'profile'}))
    print('profile', meta['profile'])


if __name__ == '__main__':
    main(*sys.argv[1:6])
