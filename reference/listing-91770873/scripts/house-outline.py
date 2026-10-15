import sys
import numpy as np
from PIL import Image


def pip(pts, poly):
    x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        cond = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        inside ^= cond
        j = i
    return inside

im = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(int)
x0, y0, x1, y1 = 440, 240, 1400, 1120
c = im[y0:y1, x0:x1]
R, G, B = c[..., 0], c[..., 1], c[..., 2]
orange = (R > 235) & (G > 190) & (G < 232) & (B > 150) & (B < 205)
oy, ox = np.nonzero(orange)
op = np.stack([ox, oy], 1).astype(float)
corners = np.load(sys.argv[2] + "/corners.npy")  
th = np.deg2rad(-17.6)
d = np.array([np.cos(th), np.sin(th)]); n = np.array([-d[1], d[0]])
T = lambda p: p @ d; S = lambda p: p @ n
print("corners t,s:")
for nm, cc in zip(["RL", "RR", "FR", "FL"], corners): print(" ", nm, round(T(cc), 1), round(S(cc), 1))
inside = pip(op, corners)
pin = op[inside]
t, s = T(pin), S(pin)
print("orange in plot: t range", round(t.min(), 1), round(t.max(), 1), " s range", round(s.min(), 1), round(s.max(), 1))
bins = np.arange(np.floor(t.min()), np.ceil(t.max()) + 10, 10)
for b0 in bins:
    m = (t >= b0) & (t < b0 + 10)
    if m.sum() < 20: continue
    print(f"t {b0:6.0f}-{b0+10:4.0f}: rear s {s[m].min():6.1f}  front s {s[m].max():6.1f}  n={m.sum()}")
# Whole-map orange (all buildings), report other buildings' extents in t,s
allt, alls = T(op), S(op)
np.save(sys.argv[2] + "/orange_ts.npy", np.stack([allt, alls], 1))
