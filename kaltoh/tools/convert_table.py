"""Convert the Meshy pedestal-table OBJ + texture into compact game assets.

Usage: python3 -I convert_table.py <model.obj> <texture.png> <out_dir>

Writes:
  table.bin   quantized mesh: int16 positions, int8 normals, uint16 uvs, uint32 indices (aligned)
  table.json  sizes: the top's half-widths and the depth of its groove, in model units
  table.jpg   2048px colour texture

The model is centred on the vertical axis with y = 0 at its top plates (where the stone stands).
"""
import json
import struct
import sys

import numpy as np
from PIL import Image

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

    # Centre on the vertical axis.
    lo, hi = pos.min(0), pos.max(0)
    pos = pos - np.array([(lo[0] + hi[0]) / 2, 0, (lo[2] + hi[2]) / 2])

    # The top plates' height: the area-weighted median of the upward faces in the top tenth, away
    # from the groove down the middle.
    tri = np.array([c[0] for c in corners]).reshape(-1, 3)
    a, b, c = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
    n = np.cross(b - a, c - a)
    area = np.linalg.norm(n, axis=1) / 2
    up = n[:, 1] / np.maximum(1e-12, 2 * area) > 0.95
    centre = (a + b + c) / 3
    top = up & (centre[:, 1] > lo[1] + 0.9 * (hi[1] - lo[1]))
    plates = top & (np.abs(centre[:, 0]) > 0.2)
    groove = top & (np.abs(centre[:, 0]) < 0.12)

    def median(mask):
        order = np.argsort(centre[mask, 1])
        weights = np.cumsum(area[mask][order])
        return centre[mask, 1][order][np.searchsorted(weights, weights[-1] / 2)]

    plate = median(plates)
    pos[:, 1] -= plate

    # Unweld: one vertex per distinct (position, uv, normal) corner.
    index_of, verts, indices = {}, [], []
    for c in corners:
        if c not in index_of:
            index_of[c] = len(verts)
            verts.append(c)
        indices.append(index_of[c])

    p = np.array([pos[v[0]] for v in verts])
    t = np.array([uv[v[1]] for v in verts])
    nn = np.array([nrm[v[2]] for v in verts])
    nn /= np.linalg.norm(nn, axis=1, keepdims=True)

    extent = np.abs(p).max(0)
    qp = np.round(p / extent * 32767).astype('<i2')
    qn = np.round(nn * 127).astype('i1')
    qn4 = np.zeros((len(qn), 4), 'i1')
    qn4[:, :3] = qn
    qt = np.round(np.clip(t, 0, 1) * 65535).astype('<u2')
    idx = np.array(indices, '<u4')

    with open(f'{out_dir}/table.bin', 'wb') as f:
        f.write(b'KTT1')
        f.write(struct.pack('<II3f', len(verts), len(idx), *extent))
        f.write(qp.tobytes())
        f.write(qn4.tobytes())
        f.write(qt.tobytes())
        f.write(b'\0' * (-f.tell() % 4))  # the indices start on a four-byte boundary
        f.write(idx.tobytes())

    meta = {
        'vertices': len(verts),
        'triangles': len(idx) // 3,
        # Half-widths of the top, across and along its groove (x and z in the model), and how far
        # the groove lies below the plates.
        'halfX': round(float(max(-p[:, 0].min(), p[:, 0].max())), 4),
        'halfZ': round(float(max(-p[:, 2].min(), p[:, 2].max())), 4),
        'groove': round(float(plate - median(groove)), 4),
        'grooveHalf': 0.16,
        'height': round(float(-p[:, 1].min()), 4),
    }
    with open(f'{out_dir}/table.json', 'w') as f:
        json.dump(meta, f)

    Image.open(tex_path).convert('RGB').resize((2048, 2048), Image.LANCZOS).save(
        f'{out_dir}/table.jpg', quality=88, optimize=True)
    print(meta)


if __name__ == '__main__':
    main(*sys.argv[1:4])
