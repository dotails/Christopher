"""Render the Kal-toh launcher icons: the completed icosidodecahedron in silver and Vulcan blue.

Usage: python3 -I make_icon.py <android res dir>
"""
import math
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

PHI = (1 + 5 ** 0.5) / 2
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
BACKGROUND = (10, 11, 15)
BLUE = (76, 198, 255)
SILVER = (232, 236, 242)


def normalize(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def lattice():
    ico = []
    for a in (-1, 1):
        for b in (-1, 1):
            ico += [(0, a, b * PHI), (a, b * PHI, 0), (b * PHI, 0, a)]
    edge = min(math.dist(ico[0], p) for p in ico[1:])
    near = lambda i, j: abs(math.dist(ico[i], ico[j]) - edge) < 1e-6
    ico_edges = [(i, j) for i in range(12) for j in range(i + 1, 12) if near(i, j)]
    faces = [(i, j, k) for i in range(12) for j in range(i + 1, 12) for k in range(j + 1, 12)
             if near(i, j) and near(j, k) and near(i, k)]
    index = {e: n for n, e in enumerate(ico_edges)}
    mid = lambda i, j: index[(min(i, j), max(i, j))]
    verts = [normalize(tuple((ico[i][c] + ico[j][c]) / 2 for c in range(3))) for i, j in ico_edges]
    edges = set()
    for i, j, k in faces:
        t = [mid(i, j), mid(j, k), mid(k, i)]
        for n in range(3):
            edges.add(tuple(sorted((t[n], t[(n + 1) % 3]))))
    return verts, sorted(edges)


def rotate(p, ax, ay):
    x, y, z = p
    y, z = y * math.cos(ax) - z * math.sin(ax), y * math.sin(ax) + z * math.cos(ax)
    x, z = x * math.cos(ay) + z * math.sin(ay), -x * math.sin(ay) + z * math.cos(ay)
    return x, y, z


def wireframe(size, radius, mono=False):
    """The sphere drawn at 4x and reduced, with depth-dimmed rods and a blue glow."""
    s = size * 4
    verts, edges = lattice()
    pts = [rotate(v, 0.55, 0.35) for v in verts]
    proj = [(s / 2 + p[0] * radius * s, s / 2 - p[1] * radius * s, p[2]) for p in pts]
    order = sorted(edges, key=lambda e: proj[e[0]][2] + proj[e[1]][2])
    lines = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(lines)
    width = max(2, int(s * 0.018))
    for a, b in order:
        depth = (proj[a][2] + proj[b][2]) / 2  # -1 (back) .. 1 (front)
        shade = 0.42 + 0.58 * (depth + 1) / 2
        colour = (255, 255, 255) if mono else tuple(int(c * shade) for c in SILVER)
        alpha = 255 if mono else int(110 + 145 * (depth + 1) / 2)
        draw.line([proj[a][:2], proj[b][:2]], fill=colour + (alpha,), width=width)
    if mono:
        return lines.resize((size, size), Image.LANCZOS)
    glow = Image.new('RGBA', (s, s), BLUE + (0,))
    glow.putalpha(lines.getchannel('A').filter(ImageFilter.GaussianBlur(s * 0.03)).point(lambda a: min(255, a * 2)))
    out = Image.alpha_composite(glow, lines)
    return out.resize((size, size), Image.LANCZOS)


def backdrop(size):
    img = Image.new('RGBA', (size, size), BACKGROUND + (255,))
    halo = Image.new('L', (size, size), 0)
    ImageDraw.Draw(halo).ellipse([size * 0.18, size * 0.18, size * 0.82, size * 0.82], fill=60)
    halo = halo.filter(ImageFilter.GaussianBlur(size * 0.12))
    tint = Image.new('RGBA', (size, size), (20, 40, 60, 255))
    img.paste(tint, (0, 0), halo)
    return img


def mask(size, round_):
    m = Image.new('L', (size * 4, size * 4), 0)
    d = ImageDraw.Draw(m)
    if round_:
        d.ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=size * 4 * 0.2, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def main(res):
    for name, scale in DENSITIES.items():
        folder = f'{res}/mipmap-{name}'
        import os
        os.makedirs(folder, exist_ok=True)
        # Adaptive layers: 108dp canvas, art kept inside the central 66dp.
        fg = int(108 * scale)
        wireframe(fg, 0.27).save(f'{folder}/ic_launcher_foreground.png')
        wireframe(fg, 0.27, mono=True).save(f'{folder}/ic_launcher_monochrome.png')
        # Legacy icons (Android 7.x): the art on its own backdrop.
        legacy = int(48 * scale)
        for round_, file in ((False, 'ic_launcher.png'), (True, 'ic_launcher_round.png')):
            icon = Image.alpha_composite(backdrop(legacy), wireframe(legacy, 0.36))
            shaped = Image.new('RGBA', (legacy, legacy), (0, 0, 0, 0))
            shaped.paste(icon, (0, 0), mask(legacy, round_))
            shaped.save(f'{folder}/{file}')
    # A large preview for the README.
    preview = Image.alpha_composite(backdrop(512), wireframe(512, 0.36))
    preview.save(f'{res}/../../../../../docs/icon.png')


if __name__ == '__main__':
    main(sys.argv[1])
