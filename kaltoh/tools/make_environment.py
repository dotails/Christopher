"""Make the light the game is lit by, and its metal mirrors: an equirectangular panorama of the
mess hall about the table (assets/room-env.jpg), from two photographs - the dining room behind the
player (behind, +z) and the galley before them (ahead, -z, as scene.js's GALLEY measures it) - the
rest of the sphere filled from their edges, smoothly. And the waiting t'an's own patch of the old
panorama, Tuvok at his table (assets/tuvok.jpg), which scene.js sets into that light for it alone.

Usage: python3 -I make_environment.py <dining room.jpg> <galley.jpg> <old panorama.jpg> <out dir>
(The old panorama is no longer among the game's assets: git show 170f064:kaltoh/android/app/src/main/assets/www/assets/env.jpg)
"""
import sys

import numpy as np
from PIL import Image

W, H = 2048, 1024
# The galley's camera: the room's directions in its frame (x right, y down, z ahead), and its lens
# (scene.js GALLEY).
ACROSS = np.array([0.94262, -0.02969, 0.33255])
UP = np.array([-0.00255, -0.99665, -0.08177])
AHEAD = np.array([-0.33387, -0.07623, 0.93953])
GALLEY_FOCAL = 1906.3
# The dining room: seen looking straight back (+z), a little down, through a wide lens.
DINING_FOV = np.radians(100)
DINING_DOWN = np.radians(4)
# Tuvok in the old panorama: the patch kept (pixels of its 2048 x 1024).
TUVOK_BOX = (540, 390, 860, 690)


def directions():
    """The world direction of each pixel of the panorama, as three.js reads one (equirectUv)."""
    u = (np.arange(W) + 0.5) / W
    v = 1 - (np.arange(H) + 0.5) / H
    az = (u - 0.5) * 2 * np.pi
    el = (v - 0.5) * np.pi
    az, el = np.meshgrid(az, el)
    return np.stack([np.cos(el) * np.cos(az), np.sin(el), np.cos(el) * np.sin(az)], axis=-1)


def sample(img, px, py, ok, reach=1.0):
    """Bilinear samples of img at (px, py), where the direction faces it (ok): within its edges at
    full weight (feathered at them), and beyond them, for `reach` of its size, the photograph
    continued in mirror, fading."""
    h, w = img.shape[:2]

    def mirror(a, n):
        period = 2 * (n - 1)
        a = np.mod(a, period)
        return np.where(a > n - 1, period - a, a)

    x = np.clip(mirror(px, w), 0, w - 1.001)
    y = np.clip(mirror(py, h), 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    c = (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
         + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)
    # How far beyond the edges, as a fraction of the photograph's size (0 within it).
    beyond = np.maximum(np.maximum(-px, px - (w - 1)) / w, np.maximum(-py, py - (h - 1)) / h)
    beyond = np.maximum(beyond, 0)
    weight = np.clip(1 - beyond / reach, 0, 1) ** 1.5
    return c, np.where(ok, weight, 0)


def fill(color, weight):
    """Fill where nothing was seen, smoothly, from what was: normalised blurs from wide to narrow
    (wrapping round the panorama's sides), each kept where it has seen enough, the photographs
    themselves over all."""
    from scipy.ndimage import gaussian_filter

    def blur(a, sigma):
        return gaussian_filter(a, sigma=(sigma, sigma) + (0,) * (a.ndim - 2), mode=('nearest', 'wrap') + ('nearest',) * (a.ndim - 2))

    total = weight.sum()
    out = np.broadcast_to((color * weight[..., None]).sum(axis=(0, 1)) / total, color.shape).copy()
    for sigma in (256, 128, 64, 32, 16, 8, 4):
        w = blur(weight, sigma)
        est = blur(color * weight[..., None], sigma) / np.maximum(w, 1e-9)[..., None]
        trust = np.clip(w / 0.2, 0, 1)[..., None]
        out = est * trust + out * (1 - trust)
    # Where nothing was seen, the room is dimmer, and dimmer toward the floor than toward the
    # ceiling: the metal then mirrors a room, not a grey mist.
    rows = np.linspace(1, 0, color.shape[0])[:, None, None]
    out = out * (0.35 + 0.35 * rows)
    a = weight[..., None]
    return color * a + out * (1 - a)


def main(dining_path, galley_path, panorama_path, out):
    d = directions()
    # The galley, ahead.
    galley = np.asarray(Image.open(galley_path).convert('RGB'), dtype=np.float32) / 255
    gh, gw = galley.shape[:2]
    to_photo = np.stack([ACROSS, UP, -AHEAD], axis=1)
    c = d @ to_photo.T
    gx = gw / 2 + GALLEY_FOCAL * c[..., 0] / np.maximum(c[..., 2], 1e-6)
    gy = gh / 2 + GALLEY_FOCAL * c[..., 1] / np.maximum(c[..., 2], 1e-6)
    g_col, g_w = sample(galley, gx, gy, c[..., 2] > 0)
    # The dining room, behind.
    dining = np.asarray(Image.open(dining_path).convert('RGB'), dtype=np.float32) / 255
    dh, dw = dining.shape[:2]
    f = (dw / 2) / np.tan(DINING_FOV / 2)
    ahead = np.array([0, -np.sin(DINING_DOWN), np.cos(DINING_DOWN)])
    right = np.array([-1.0, 0, 0])  # facing +z, the right hand is toward -x
    down = np.cross(ahead, right)
    z = d @ ahead
    dx_ = dw / 2 + f * (d @ right) / np.maximum(z, 1e-6)
    dy_ = dh / 2 + f * (d @ down) / np.maximum(z, 1e-6)
    d_col, d_w = sample(dining, dx_, dy_, z > 0)
    weight = np.maximum(g_w, d_w)
    color = (g_col * g_w[..., None] + d_col * d_w[..., None]) / np.maximum(g_w + d_w, 1e-6)[..., None]
    env = fill(color, weight)
    Image.fromarray(np.clip(env * 255 + 0.5, 0, 255).astype(np.uint8)).save(f'{out}/room-env.jpg', quality=88, optimize=True, progressive=True)
    Image.open(panorama_path).crop(TUVOK_BOX).save(f'{out}/tuvok.jpg', quality=90, optimize=True)
    print('covered', round(float((weight > 0).mean()), 3), 'of the sphere by the photographs')


if __name__ == '__main__':
    main(*sys.argv[1:5])
