#!/usr/bin/env python3
# Chroma-key magenta -> alpha, autocrop, nearest-neighbour resize to native px,
# and (for the chair) emit 3 hue-shifted colorways. One-off art processing.
import sys
from PIL import Image
import colorsys

def key_and_crop(src):
    im = Image.open(src).convert('RGBA')
    px = im.load()
    w, h = im.size
    # pass 1: hard key the magenta field + the pink/purple AA halo around it.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # magenta-ish: R and B both clearly exceed G (the key colour and its
            # antialiased fringe both satisfy this). tolerant to catch the halo.
            if r > 110 and b > 110 and g < r - 35 and g < b - 35:
                px[x, y] = (0, 0, 0, 0)
            elif r > 150 and g < 120 and b > 150:
                px[x, y] = (0, 0, 0, 0)
    # pass 2: despill — any remaining edge pixel where G is much lower than both
    # R and B gets its magenta tint pulled out (clamp G up toward min(R,B)).
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r > g + 24 and b > g + 24:
                m = min(r, b)
                # pull red+blue down toward green to kill the purple cast
                r = (r + m) // 2 if r > m else r
                b = (b + m) // 2 if b > m else b
                px[x, y] = (min(r, 255), g, min(b, 255), a)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    return im

def resize_to(im, tw, th):
    return im.resize((tw, th), Image.NEAREST)

def hue_shift(im, target):
    # target: 'r','g','b' — remap the dominant red hue of the chair toward it.
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r/255, g/255, b/255)
            # only shift fabric (reddish, saturated); leave grey base/wheels alone
            if ss > 0.30 and (hh < 0.08 or hh > 0.92):
                if target == 'g':
                    hh = 0.33
                elif target == 'b':
                    hh = 0.58
                else:
                    hh = 0.0
                nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                px[x, y] = (int(nr*255), int(ng*255), int(nb*255), a)
    return out

jobs = [
    ('desknm_a.png', 'desk_topdown.png', 96, 72, None),
    ('mac15_a.png', 'mac_15.png', 36, 26, None),
    ('mac13_a.png', 'mac_13.png', 30, 22, None),
]
for src, dst, tw, th, _ in jobs:
    im = key_and_crop('art/_raw/topdown/' + src)
    im = resize_to(im, tw, th)
    im.save('art/' + dst)
    print('wrote art/' + dst, im.size)

# chair: 3 colorways
chair = key_and_crop('art/_raw/topdown/chair_a.png')
chair = resize_to(chair, 40, 40)
for tgt, dst in [('r', 'chair_r.png'), ('g', 'chair_g.png'), ('b', 'chair_b.png')]:
    hue_shift(chair, tgt).save('art/' + dst)
    print('wrote art/' + dst)
