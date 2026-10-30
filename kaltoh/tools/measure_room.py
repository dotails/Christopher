"""Measure a photograph of a room by its straight lines, for scene.js's GALLEY: where the lines of
the room's three directions meet (its vanishing points: across, along its length, and upright), and
from them the lens (the focal length, in pixels) and how the camera was held - the room's directions
in the camera's frame - and then where the counters stand, in heights of the camera above the floor.

Usage: python3 -I measure_room.py <photograph> [<u0> <v0> <u1> <v1> ...]
The optional points (pixels) are where things meet the floor: each is placed in the room.

Needs OpenCV (opencv-python-headless) and NumPy.
"""
import sys

import cv2
import numpy as np


def segments(path):
    img = cv2.imread(path)
    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (3, 3), 0)
    found = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD).detect(gray)[0].reshape(-1, 4)
    return img.shape[:2], [s for s in found if np.hypot(s[2] - s[0], s[3] - s[1]) > 90]


def line_of(s):
    l = np.cross([s[0], s[1], 1.0], [s[2], s[3], 1.0])
    return l / np.hypot(l[0], l[1])


def meeting(group):
    """The point nearest all the lines, longer lines counting more; then again without the lines
    that pass furthest from it (a stray line along another direction, say)."""
    def solve(g):
        a = np.array([line_of(s) for s in g]) * np.array([np.hypot(s[2] - s[0], s[3] - s[1]) for s in g])[:, None]
        v = np.linalg.svd(a)[2][-1]
        return v / v[2]
    v = solve(group)
    for _ in range(2):
        far = [abs(line_of(s) @ v) / np.hypot(s[2] - s[0], s[3] - s[1]) for s in group]
        group = [group[i] for i in np.argsort(far)[: max(3, int(0.7 * len(group)))]]
        v = solve(group)
    return v[:2], len(group)


def main(path, points):
    (height, width), segs = segments(path)
    c = np.array([width / 2, height / 2])
    slope = lambda s: np.degrees(np.arctan2(s[3] - s[1], s[2] - s[0])) % 180
    across, n_a = meeting([s for s in segs if slope(s) < 12 or slope(s) > 168])
    along, n_l = meeting([s for s in segs if 140 < slope(s) < 168 or 15 < slope(s) < 60])
    upright, n_u = meeting([s for s in segs if 80 < slope(s) < 100])
    print(f'vanishing points: across {across.round(1)} ({n_a} lines), along {along.round(1)} ({n_l}), upright {upright.round(1)} ({n_u})')
    # Each pair of the three directions is square: (v1 - c).(v2 - c) = -f^2.
    fs = [np.sqrt(-(p - c) @ (q - c)) for p, q in ((across, along), (along, upright), (across, upright))]
    f = float(np.median(fs))
    print('focal length (px):', [round(x, 1) for x in fs], '-> median', round(f, 1))
    # The floor's own two directions set the frame (it is the floor the table must stand on); the
    # upright lines only check it.
    f = float(np.sqrt(-(across - c) @ (along - c)))
    k_inv = np.linalg.inv(np.array([[f, 0, c[0]], [0, f, c[1]], [0, 0, 1]]))
    ax = k_inv @ [across[0], across[1], 1.0]
    ax /= np.linalg.norm(ax)
    lengthwise = k_inv @ [along[0], along[1], 1.0]
    lengthwise /= np.linalg.norm(lengthwise)
    down = np.cross(lengthwise, ax)
    down /= np.linalg.norm(down)
    ahead = np.cross(ax, down)
    ahead /= np.linalg.norm(ahead)
    up = np.cross(ax, ahead)  # x right, y down, z ahead: x cross z is up
    check = k_inv @ [upright[0], upright[1], 1.0]
    print('upright lines agree to', round(np.degrees(np.arccos(abs(check @ down) / np.linalg.norm(check))), 2), 'deg; focal used', round(f, 1))
    print('across', ax.round(5), 'up', up.round(5), 'ahead', ahead.round(5))
    print('looking down', round(np.degrees(np.arcsin(-up[2])), 2), 'deg; the room\'s length', round(np.degrees(np.arctan2(-ahead[0], ahead[2])), 2), 'deg to its left')

    def floor(u, v):
        r = np.array([(u - c[0]) / f, (v - c[1]) / f, 1.0])
        r = np.array([r @ ax, r @ up, r @ ahead])
        return r * (-1.0 / r[1])

    for u, v in zip(points[0::2], points[1::2]):
        p = floor(u, v)
        print(f'floor at ({u:.0f}, {v:.0f}): across {p[0]:.2f}, ahead {p[2]:.2f} camera heights')


if __name__ == '__main__':
    main(sys.argv[1], [float(x) for x in sys.argv[2:]])
