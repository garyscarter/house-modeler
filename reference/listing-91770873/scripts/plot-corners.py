import sys
import numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(int)
x0, y0, x1, y1 = 440, 240, 1400, 1120
c = im[y0:y1, x0:x1]
R, G, B = c[..., 0], c[..., 1], c[..., 2]
black = (R < 70) & (G < 70) & (B < 70)
ys, xs = np.nonzero(black)
pts = np.stack([xs, ys], 1).astype(float)
approx = np.array([[142, 236], [459, 108], [627, 662], [295, 768]], float)  # RL, RR, FR, FL (eyeballed)
def seg_dist(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
lines = []
for i in range(4):
    a, b = approx[i], approx[(i + 1) % 4]
    dd = seg_dist(pts, a, b)
    sel = pts[dd < 12]
    # trim near corners to avoid bleed
    ab = b - a; tt = ((sel - a) @ ab) / (ab @ ab)
    sel = sel[(tt > 0.08) & (tt < 0.92)]
    m = sel.mean(0); u, s, vt = np.linalg.svd(sel - m); dirv = vt[0]
    lines.append((m, dirv, len(sel)))
def intersect(l1, l2):
    (p, r), (q, s) = (l1[0], l1[1]), (l2[0], l2[1])
    A = np.array([r, -s]).T; t = np.linalg.solve(A, q - p); return p + t[0] * r
corners = [intersect(lines[(i - 1) % 4], lines[i]) for i in range(4)]
names = ["rear-left", "rear-right", "front-right", "front-left"]
for nme, cc in zip(names, corners): print(nme, np.round(cc, 1))
for i, l in enumerate(lines): print("edge", i, "n px", l[2], "angle", round(float(np.degrees(np.arctan2(l[1][1], l[1][0]))), 2))
np.save(sys.argv[2] + "/corners.npy", np.array(corners))
