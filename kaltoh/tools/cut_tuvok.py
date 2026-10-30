"""Cut the waiting t'an's own strip of the old panorama: Tuvok at his table in the mess hall
(assets/tuvok.jpg), wide enough to fill the t'an's domed broad face from end to end. scene.js sets
it into the light behind the player, at the same scale (a panorama's pixels: 2048 to the full turn).

Usage: python3 -I cut_tuvok.py <old panorama.jpg> <out dir>
(The old panorama is no longer among the game's assets: git show 170f064:kaltoh/android/app/src/main/assets/www/assets/env.jpg)
"""
import sys

from PIL import Image

# Pixels of the 2048 x 1024 panorama: 158 degrees across and 53 high, his face in the middle.
TUVOK_BOX = (240, 384, 1140, 684)


def main(panorama_path, out):
    Image.open(panorama_path).convert('RGB').crop(TUVOK_BOX).save(f'{out}/tuvok.jpg', quality=88, optimize=True, progressive=True)


if __name__ == '__main__':
    main(*sys.argv[1:3])
