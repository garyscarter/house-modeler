import sys
import numpy as np
ts = np.load(sys.argv[1] + "/orange_ts.npy")
t, s = ts[:, 0], ts[:, 1]
k = 33.0
X = lambda tt: -4.589 + (tt - 58.3) / k
Z = lambda ss: -5.589 + (ss - 455) / k
def profile(sel, label, step=10):
    print("==", label)
    tt, ss = t[sel], s[sel]
    if not len(tt): return
    for b0 in np.arange(np.floor(tt.min()/step)*step, tt.max() + step, step):
        m = (tt >= b0) & (tt < b0 + step)
        if m.sum() < 15: continue
        # find contiguous runs in s
        sv = np.unique(np.round(ss[m]).astype(int))
        runs = []; start = sv[0]; prev = sv[0]
        for v in sv[1:]:
            if v - prev > 3: runs.append((start, prev)); start = v
            prev = v
        runs.append((start, prev))
        rs = "; ".join(f"z {Z(a):6.2f}..{Z(b):6.2f}" for a, b in runs if b - a > 4)
        print(f"x {X(b0):6.2f}..{X(b0+step):6.2f}: {rs}")
profile(t > 402, "east of party wall (attached neighbour)", 15)
profile(t < 45, "west of plot (west neighbour)", 15)
profile((s < 260) & (t > 40) & (t < 420), "behind plot", 15)
