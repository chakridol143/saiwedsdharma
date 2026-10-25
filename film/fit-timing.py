# Timing check for the film: integrates the glide speed keys (the same smoothstep
# curve as film.js) and prints which page position sits under the frame centre at
# each checkpoint, plus the motion checks from the brief.
#   python3 film/fit-timing.py            (reads film/cap/layout.json if present)
import json, math, os

# keep in step with SPEED, P0 and T_END in film.js
SPEED = [(0, 0), (1.0, 140), (2.0, 215), (3.0, 228), (8.4, 238), (11.4, 345), (17.0, 360)]
P0 = 165
T_END = 17.0
CHECKS = [0.8, 3.5, 6.2, 9.5, 12.5, 15.8]


def sstep(a, b, x):
    u = min(1, max(0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)


def speed(t):
    if t <= 0:
        return 0
    for (t0, v0), (t1, v1) in zip(SPEED, SPEED[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * sstep(t0, t1, t)
    return SPEED[-1][1]


def page_y(t, dt=0.001):
    s, x = P0, 0.0
    while x < min(t, T_END):
        s += speed(x + dt / 2) * dt
        x += dt
    return s


here = os.path.dirname(os.path.abspath(__file__))
marks = {}
try:
    marks = json.load(open(os.path.join(here, 'cap', 'layout.json')))['marks']
except OSError:
    pass


def nearest(y):
    best = None
    for k, m in marks.items():
        d = abs(m['y'] + m['h'] / 2 - y)
        if best is None or d < best[0]:
            best = (d, k)
    return '' if best is None else f'(nearest: {best[1]}, {best[0]:.0f} px away)'


for t in CHECKS:
    y = page_y(t)
    print(f't={t:5.2f}s  frame centre at page y={y:6.0f}  speed={speed(t):4.0f} px/s  {nearest(y)}')
ts = [i / 1000 for i in range(int(T_END * 1000) + 1)]
dips = sum(1 for a, b in zip(ts, ts[1:]) if b > 1.0 and speed(b) < speed(a) - 1e-9)
print('speed dips during the glide:', dips)
