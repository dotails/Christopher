"""Convert the Meshy stone-basin OBJ + texture into compact game assets.

Usage: python3 -I convert_base.py <model.obj> <texture.png> <out_dir>

Writes:
  base.bin   quantized mesh: int16 positions, int8 normals, uint16 uvs, uint16 indices
  base.json  bounds plus a radial height profile used for falling-rod collisions
  base.jpg   2048px colour texture
  base-bump.jpg  1024px greyscale relief derived from the texture
"""
import json
import struct
import sys

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


def main(obj_path, tex_path, out_dir):
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

    with open(f'{out_dir}/base.bin', 'wb') as f:
        f.write(b'KTB1')
        f.write(struct.pack('<II3f', len(verts), len(idx), *extent))
        f.write(qp.tobytes())
        f.write(qn4.tobytes())
        f.write(qt.tobytes())
        f.write(idx.tobytes())

    # Top surface height by distance from the axis: the highest of every corner within a step either
    # side, so that, interpolated, it never lies below the stone (walls and the basin's lip too).
    r = np.hypot(p[:, 0], p[:, 2])
    step = 0.02
    bins = int(np.ceil(r.max() / step)) + 1
    profile = []
    for b in range(bins):
        m = (r >= b * step - step) & (r < b * step + step)
        profile.append(round(float(p[m, 1].max()), 4) if m.any() else 0.0)
    inner = r < 0.3
    meta = {
        'vertices': len(verts),
        'triangles': len(idx) // 3,
        'extent': [round(float(x), 5) for x in extent],
        'height': round(float(p[:, 1].max()), 4),
        'radius': round(float(r.max()), 4),
        'floor': round(float(p[inner & (n[:, 1] > 0.3), 1].max()), 4),
        'profileStep': step,
        'profile': profile,
    }
    with open(f'{out_dir}/base.json', 'w') as f:
        json.dump(meta, f)

    tex = Image.open(tex_path).convert('RGB')
    tex.resize((2048, 2048), Image.LANCZOS).save(f'{out_dir}/base.jpg', quality=86, optimize=True, progressive=False)
    grey = ImageOps.grayscale(tex.resize((1024, 1024), Image.LANCZOS))
    relief = ImageOps.autocontrast(Image.blend(grey, grey.filter(ImageFilter.GaussianBlur(6)), -0.6), cutoff=1)
    relief.save(f'{out_dir}/base-bump.jpg', quality=88)

    print(json.dumps({k: v for k, v in meta.items() if k != 'profile'}))
    print('profile', meta['profile'])


if __name__ == '__main__':
    main(*sys.argv[1:4])
