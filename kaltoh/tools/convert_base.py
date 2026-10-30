"""Convert a Meshy base OBJ + texture - the stone basin, or the obsidian altar - into compact game
assets.

Usage: python3 -I convert_base.py <model.obj> <texture.png> <out_dir> [name] [faces]

  name   what the files are called (base, the stone, by default; altar, the obsidian altar)
  faces  simplify the model to this many triangles first (pymeshlab, keeping its texture
         coordinates): the altar comes at 431,554, far more than a phone need draw. Simplified,
         what is meant to be flat is made flat: Meshy's flat faces are ever so slightly not, and
         polished, every ripple shows in what they mirror, drawn across them in the shape of their
         triangles. The faces lying within FLAT of one plane (and turned from it less than
         FLAT_TURN) are found and made one region, neighbouring regions that are one plane merged,
         and every corner of a broad region set on its plane - a corner of two or three of them on
         the line or point they meet at. Its normals are found afresh, a corner taking those of the
         faces about it turned less than CREASE from its own: a flat face reflects as one, its
         edges stay sharp.

Writes:
  <name>.bin   quantized mesh: int16 positions, int8 normals, uint16 uvs, uint16 indices
  <name>.json  bounds plus a radial height profile used for falling-rod collisions
  <name>.jpg   2048px colour texture
  <name>-bump.jpg  1024px greyscale relief derived from the texture (the stone's grain: the altar's
                   relief is in its mesh, and its texture's patches would only roughen its polish)
"""
import json
import struct
import sys

import numpy as np
from PIL import Image, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None

# Making flat what is meant to be (see above): how far from a region's plane every corner of a face
# joining it may lie, and how far turned from it the face may be; how small a region may be and
# still be set flat (smaller ones are the filigree's curves, left as they are); how alike two
# neighbouring regions' planes must be to be tried as one; how far a corner may be moved at most;
# and the angle beyond which two faces about a corner do not share their normals.
FLAT = 0.009
FLAT_TURN = 25
FLAT_AREA = 0.001
FLAT_MERGE = 5
FLAT_MOVE = 0.02
CREASE = 25


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


def face_frames(V, F):
    """Each face's unit normal and area."""
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    cross = np.cross(b - a, c - a)
    area = np.linalg.norm(cross, axis=1) / 2
    return cross / np.maximum(2 * area[:, None], 1e-20), area


def neighbours(F):
    """The faces about each edge, and each face's neighbours across its edges."""
    edges = {}
    for f, (i, j, k) in enumerate(F):
        for e in ((i, j), (j, k), (k, i)):
            edges.setdefault((min(e), max(e)), []).append(f)
    near = [[] for _ in range(len(F))]
    for fs in edges.values():
        for x in fs:
            near[x].extend(y for y in fs if y != x)
    return edges, near


def flat_regions(V, F):
    """The faces gathered into flat regions: grown from the broadest face not yet in one, a
    neighbour joining when its corners all lie within FLAT of the region's plane (refitted as it
    grows) and it is turned less than FLAT_TURN from it; then neighbouring regions that are one plane
    (turned less than FLAT_MERGE, every corner of both within FLAT of their joint plane) made one.
    Returns each face's region and each region's plane (normal, offset) and area."""
    fn, area = face_frames(V, F)
    edges, near = neighbours(F)

    def fit(fs):
        fs = np.asarray(fs)
        pts = V[F[fs]].reshape(-1, 3)
        w = np.repeat(area[fs] / 3, 3)
        centre = (pts * w[:, None]).sum(0) / w.sum()
        n = np.linalg.svd((pts - centre) * np.sqrt(w)[:, None], full_matrices=False)[2][2]
        if n @ (fn[fs] * area[fs, None]).sum(0) < 0:
            n = -n
        return n, float(n @ centre)

    def within(fs, plane):
        n, d = plane
        return np.abs(V[F[np.asarray(fs)]].reshape(-1, 3) @ n - d).max() <= FLAT

    turned = np.cos(np.radians(FLAT_TURN))
    region = np.full(len(F), -1)
    groups = []
    for seed in np.argsort(-area):
        if region[seed] >= 0:
            continue
        region[seed] = len(groups)
        members = [seed]
        n, d = fn[seed], float(fn[seed] @ V[F[seed, 0]])
        refit = 4
        frontier = [seed]
        while frontier:
            for g in near[frontier.pop()]:
                if region[g] >= 0 or fn[g] @ n < turned or np.abs(V[F[g]] @ n - d).max() > FLAT:
                    continue
                region[g] = len(groups)
                members.append(g)
                frontier.append(g)
                if len(members) >= refit:
                    n, d = fit(members)
                    refit *= 2
        groups.append(members)

    # Neighbours that are one plane, made one.
    parent = list(range(len(groups)))

    def root(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    alike = np.cos(np.radians(FLAT_MERGE))
    for _ in range(10):
        members_of = {}
        for gi, fs in enumerate(groups):
            members_of.setdefault(root(gi), []).extend(fs)
        planes = {r: fit(fs) for r, fs in members_of.items() if area[fs].sum() >= FLAT_AREA / 4}
        pairs = set()
        for fs in edges.values():
            if len(fs) == 2:
                r1, r2 = root(region[fs[0]]), root(region[fs[1]])
                if r1 != r2 and r1 in planes and r2 in planes:
                    pairs.add((min(r1, r2), max(r1, r2)))
        merged = False
        for r1, r2 in sorted(pairs, key=lambda pair: -(area[members_of[pair[0]]].sum() + area[members_of[pair[1]]].sum())):
            r1, r2 = root(r1), root(r2)
            if r1 == r2 or r1 not in planes or r2 not in planes or planes[r1][0] @ planes[r2][0] < alike:
                continue
            both = members_of[r1] + members_of[r2]
            plane = fit(both)
            if not within(both, plane):
                continue
            parent[r2] = r1
            members_of[r1] = both
            planes[r1] = plane
            merged = True
        if not merged:
            break

    final = {}
    for gi, fs in enumerate(groups):
        final.setdefault(root(gi), []).extend(fs)
    regions = []
    for fs in final.values():
        region[np.asarray(fs)] = len(regions)
        regions.append((*fit(fs), float(area[fs].sum())))
    return region, regions, area


def onto_planes(V, F, region, regions, area):
    """Every corner of a broad region set on its plane; a corner of two or three, at the nearest point
    on all their planes - those turned more than ten degrees from each other (two nearly alike meet far
    off; the broader stands for both), the third well out of the line the first two meet along - or,
    were that more than FLAT_MOVE off, on fewer."""
    broad = np.array([r[2] >= FLAT_AREA for r in regions])
    on = [set() for _ in range(len(V))]
    for f in np.flatnonzero(broad[region]):
        for v in F[f]:
            on[v].add(region[f])
    apart = np.cos(np.radians(10))
    out = np.sin(np.radians(10))
    moved = 0.0
    for v, rs in enumerate(on):
        picked = []
        for r in sorted(rs, key=lambda r: -regions[r][2]):
            n = regions[r][0]
            if any(abs(n @ regions[q][0]) >= apart for q in picked):
                continue
            if len(picked) == 2:
                axis = np.cross(regions[picked[0]][0], regions[picked[1]][0])
                if abs(n @ axis) / np.linalg.norm(axis) < out:
                    continue
            picked.append(r)
            if len(picked) == 3:
                break
        while picked:
            N = np.array([regions[r][0] for r in picked])
            D = np.array([regions[r][1] for r in picked])
            x = V[v] - N.T @ np.linalg.solve(N @ N.T, N @ V[v] - D)
            if np.linalg.norm(x - V[v]) <= FLAT_MOVE or len(picked) == 1:
                moved = max(moved, float(np.linalg.norm(x - V[v])))
                V[v] = x
                break
            picked.pop()
    covered = sum(r[2] for r, b in zip(regions, broad) if b) / area.sum()
    print(f'flat: {int(broad.sum())} regions, {covered:.0%} of the surface, corners moved {moved:.4f} at most', file=sys.stderr)
    return V


def creased_normals(V, F):
    """Each corner's normal: the angle-weighted normals of the faces about its vertex turned less than
    CREASE from its own face."""
    fn, _ = face_frames(V, F)

    def angle(p, q, r):
        u = (q - p) / np.maximum(np.linalg.norm(q - p, axis=1, keepdims=True), 1e-20)
        w = (r - p) / np.maximum(np.linalg.norm(r - p, axis=1, keepdims=True), 1e-20)
        return np.arccos(np.clip((u * w).sum(1), -1, 1))

    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    corner_angle = np.stack([angle(a, b, c), angle(b, c, a), angle(c, a, b)], 1)
    order = np.argsort(F.ravel(), kind='stable')
    at = F.ravel()[order]
    starts, ends = np.searchsorted(at, np.arange(len(V))), np.searchsorted(at, np.arange(len(V)), 'right')
    keep = np.cos(np.radians(CREASE))
    normals = np.zeros((len(F), 3, 3))
    for v in range(len(V)):
        corners = order[starts[v]:ends[v]]
        fs, ks = corners // 3, corners % 3
        n = fn[fs]
        summed = (n @ n.T >= keep).astype(float) @ (corner_angle[fs, ks][:, None] * n)
        normals[fs, ks] = summed / np.maximum(np.linalg.norm(summed, axis=1, keepdims=True), 1e-20)
    return normals


def flattened(obj_path, faces):
    """The model simplified to `faces` triangles, what is flat made flat, its normals found afresh -
    as load_obj gives a model (its texture coordinates and normals each once, every corner indexing
    them)."""
    import pymeshlab

    ms = pymeshlab.MeshSet()
    ms.load_new_mesh(obj_path)
    ms.meshing_decimation_quadric_edge_collapse_with_texture(targetfacenum=faces, qualitythr=0.6, preserveboundary=True,
                                                             optimalplacement=True, preservenormal=True, planarquadric=True)
    m = ms.current_mesh()
    V = m.vertex_matrix().copy()
    F = m.face_matrix()
    region, regions, area = flat_regions(V, F)
    V = onto_planes(V, F, region, regions, area)
    # Each texture coordinate and normal once (as they are stored), each corner indexing them.
    uv, uv_at = np.unique(np.round(np.clip(m.wedge_tex_coord_matrix(), 0, 1) * 65535).astype(int), axis=0, return_inverse=True)
    nrm, nrm_at = np.unique(np.round(creased_normals(V, F).reshape(-1, 3) * 127).astype(int), axis=0, return_inverse=True)
    corners = list(zip(F.ravel().tolist(), uv_at.ravel().tolist(), nrm_at.ravel().tolist()))
    return V, uv / 65535, nrm / 127, corners


def main(obj_path, tex_path, out_dir, name='base', faces=None):
    if faces:
        pos, uv, nrm, corners = flattened(obj_path, int(faces))
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
