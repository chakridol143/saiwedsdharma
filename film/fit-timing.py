# Timing check for the film: integrates the glide speed keys (the same smoothstep
# curve as film.js) and prints which page position sits under the frame centre at
# each checkpoint, how smooth the speed changes are, and how long the ceremony
# card's venue lines stay readable.
#   python3 film/fit-timing.py            (reads film/cap/layout.json if present)
import json, math, os

# keep in step with SPEED, P0 and T_END in film.js
SPEED = [(0, 0), (0.9, 195), (2.0, 265), (3.0, 298), (6.5, 338), (8.0, 340), (9.25, 115), (10.85, 115),
         (11.55, 215), (12.3, 226), (13.45, 450), (14.84, 455)]
P0 = 175
T_END = 14.84
CHECKS = [0.6, 2.93, 5.17, 7.17, 8.5, 10.0, 11.25, 12.25, 13.45, 14.11, 14.84]


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


# page y under the frame centre, every millisecond of the glide
DT = 0.001
PTAB = [P0]
for i in range(round(T_END / DT)):
    PTAB.append(PTAB[-1] + speed((i + 0.5) * DT) * DT)


def page_y(t):
    return PTAB[min(round(t / DT), len(PTAB) - 1)]


def when(y):
    return next((i * DT for i, p in enumerate(PTAB) if p >= y), None)


here = os.path.dirname(os.path.abspath(__file__))
# block centres: page sections (marks) and the liftable pieces
centres = {}
layout = {}
try:
    layout = json.load(open(os.path.join(here, 'cap', 'layout.json')))
    centres.update({k: m['y'] + m['h'] / 2 for k, m in layout['marks'].items()})
    centres.update({p['id']: p['y'] + p['h'] / 2 for p in layout['pieces'] if p['id'] != 'badge'})
except OSError:
    pass


def nearest(y):
    best = None
    for k, c in centres.items():
        d = abs(c - y)
        if best is None or d < best[0]:
            best = (d, k)
    return '' if best is None else f'(nearest: {best[1]}, {best[0]:.0f} px away)'


for t in CHECKS:
    y = page_y(t)
    print(f't={t:5.2f}s  frame centre at page y={y:6.0f}  speed={speed(t):4.0f} px/s  {nearest(y)}')
v = [speed(i * DT) for i in range(len(PTAB))]
acc = [(b - a) / DT for a, b in zip(v, v[1:])]
print(f'slowest after 3 s: {min(v[3000:]):.0f} px/s; steepest speed change: {max(abs(x) for x in acc):.0f} px/s^2')


# On-screen size of the venue name at 360 x 640: its first line ("Dr. Metla Satyanarayana", a 27 px
# em box at page y 2949-2976) on the ceremony card (centre 2907, lift [18, 5]), seen through the
# film's camera. Keep LEAN, the lean range and the camera numbers in step with cameraAt() in film.js.
LEAN, LEAN_AT, RISE = 12, (2572, 2732, 2912, 3092), T_END + 0.1
SW, SH = 360, 640
FOCAL = 1240 * SW / 1080


def bump(a, b, c, d, x):
    return sstep(a, b, x) * (1 - sstep(c, d, x))


def screen_y(t, py, card_c=2907, lift=(18, 5)):
    ly = page_y(t)
    u = sstep(-560, -40, ly - card_c)                     # the card's lift, as in film.js
    th, zl = math.radians(lift[1] * u), lift[0] * u
    ry = card_c - py
    p = (0, -card_c + ry * math.cos(th), zl + ry * math.sin(th))
    tilt = math.radians((22 + 28 * sstep(0.3, 4.6, t) - LEAN * bump(*LEAN_AT, ly)) * (1 - sstep(RISE, RISE + 1.15, t)))
    dist = 300 + 220 * sstep(0, 4.5, t) + 40 * min(1, max(0, (t - 4.5) / (T_END - 4.5)))
    cam = (0, -ly - math.sin(tilt) * dist, math.cos(tilt) * dist)
    fwd = (0, math.sin(tilt), -math.cos(tilt))           # view direction
    up = (0, math.cos(tilt), math.sin(tilt))             # camera up
    d = [p[i] - cam[i] for i in range(3)]
    depth = sum(d[i] * fwd[i] for i in range(3))
    return SH / 2 - FOCAL * sum(d[i] * up[i] for i in range(3)) / depth


sizes = []
for i in range(int(8 / 0.05)):
    t = 7.0 + i * 0.05
    top, bot = screen_y(t, 2949), screen_y(t, 2976)
    if 0 <= (top + bot) / 2 <= SH - 20:
        sizes.append((t, bot - top))
for px in (16, 12):
    ok = [t for t, sz in sizes if sz >= px]
    print(f'venue name at {px} px or larger on a 360 x 640 screen: {min(ok):.2f}-{max(ok):.2f} s ({max(ok) - min(ok):.2f} s)')
