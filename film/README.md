# Sai & Dharma — invitation film

A 20-second vertical film (1080 × 1920, 60 fps, H.264) made from the wedding site itself.
The site's phone layout lies flat on an ivory studio floor. One continuous camera glides
down it while photos and cards lift toward the lens, then rises and lands on the
invitation end card. It is WebGL2, and every frame is computed from time inside `seek(t)`.

The film only reads the site. It does not change any site file. The `film/` folder is
kept out of website deployments by `.vercelignore`.

## Source

- Captured from branch `claude/wedding-new-photos` at commit `4813b92`. The live site
  could not be reached from the build sandbox, and it did not yet have these changes.
- Hero and end-card photo: `img/shoot/hero-swing.jpg`, the uyyala photo
  (WhatsApp 2026-10-21 00.06.10, square crop).
- Events on the site (unchanged):
  - Ceremony: Wednesday 28 Oct 2026, 10:34 PM, at Dr. Metla Satyanarayana Kapu Kalyana
    Mandapam, Gandu Veedhi, Amalapuram.
  - Reception & dinner: Friday 30 Oct 2026, from 7 PM, at Manu Gardens, Laxmipuram,
    Tiruvuru, NTR District.

## Events in the film

At 360 × 640, the full event cards (muhurtham sentence and both full addresses) could not be read
without pausing. So the film keeps the site's timeline and cards but shows less on each card.
The ceremony card keeps the wedding venue's name, because the video may be forwarded without
the website:

- Ceremony: "Wednesday · 28 Oct", "10:34 PM", then on the card "The ceremony",
  "28 October 2026 · 10:34 PM", "Dr. Metla Satyanarayana", "Kapu Kalyana Mandapam", "Amalapuram".
- Reception: "Friday · 30 Oct", "7 PM", then on the card "Reception & dinner",
  "Manu Gardens, Tiruvuru".
- Left out of the film (all still on the site):
  - the muhurtham sentence "Wednesday at 10:34 PM. During the auspicious Rohini nakshatra,
    Mithuna lagna, Pushkaramsha muhurtham."
  - the street address "Gandu Veedhi" and the "Wedding venue" label
  - the date lines as the site writes them, "28 · 10 · 2026 · 10:34 PM" and "30 · 10 · 2026"
    (the ceremony card shows "28 October 2026 · 10:34 PM" instead)
  - "From … onwards at" (the reception time shows as "7 PM")
  - "Laxmipuram" and "NTR District" from the reception address

So the venue name has time to be read, the camera eases down to 115 px/s over the ceremony card
and leans 12° further over it, then picks up again. On a 360 × 640 screen the venue name stays at
16 px or larger from 8.85 to 11.40 s (2.55 s), and at 12 px or larger for 2.90 s. At the previous
pacing it would have stayed at 16 px or larger for only 1.0 s. `capture.js` checks that the venue
and place names it shows appear on the site, spelled the same.

## Files

| File | What it does |
| --- | --- |
| `capture.js` | Captures the site in "film mode": the phone layout at 390 px wide and scale 3, with reduced motion so each section shows its settled state. It hides website-only controls, simplifies the event cards and adds the venue name to the ceremony card (see above), and lays the gallery and blessings flat. Saves page tiles, each liftable piece on a transparent background, and `layout.json`. |
| `film.html`, `film.js` | The WebGL2 film. URL params are `w`, `h` (output size), `mb` (motion-blur subframes) and `fps`. `window.seek(t)` draws a frame; `window.frame(t)` returns it as a JPEG. Timing, camera, depth of field, lifts, shadows and the end card are all in `film.js`. |
| `render.js` | Drives the film page in headless Chromium to save stills or a frame sequence. |
| `fit-timing.py` | Prints which part of the page is at frame centre for each checkpoint, and checks that the glide never slows down. |
| `cap/` | The captured textures. They are not in Git: run `capture.js`, or use the project archive. |
| `previews/` | Exported stills and preview video. Not in Git. |

## Running it

```
# from the repo root
python3 -m http.server 8765 --bind 127.0.0.1 &
cd film
node capture.js http://127.0.0.1:8765/ cap     # only if cap/ is missing
node render.js stills out 1080 1920 1 0.6,2.92,5.14,7.09,10.0,12.76,14.09,15.0,17.0,19.98
node render.js seq frames 540 960 1 30 0 20    # low-res preview frames
ffmpeg -framerate 30 -i frames/f%05d.jpg -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart preview-540x960-30fps.mp4

# final, only after the preview is approved: 1,200 frames, then H.264
node render.js seq final 1080 1920 4 60 0 20
ffmpeg -framerate 60 -i final/f%05d.jpg -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart sai-dharma-invite-1080x1920-60fps.mp4
```

`render.js` opens `http://127.0.0.1:8765/film/film.html` by default. Set `FILM_URL` to
use another address. In the build sandbox WebGL2 ran on the CPU (SwiftShader, 4 cores):
a full-size frame took about 1–1.5 s, or about 7 s with 4 motion-blur subframes.

Motion blur: with `mb=4`, 4 subframes are averaged over a short shutter (0.35 of a frame), only
on the rise (14.94–15.94 s). There the view sweeps fastest and the page is fading out. A 0.7 shutter
from the gallery onward visibly smeared the faces and the "Divine blessings" heading, so every
other frame is one crisp render. The low-res preview is rendered without motion blur.

## Timing

| Time (s) | Scene |
| --- | --- |
| 0.0–2.65 | Opening: "Sai & Dharma · 28 · 10 · 2026"; the save-the-date badge and the uyyala photo card lift |
| 2.65–3.45 | "We're getting married" and the names (centred at 2.92 s) |
| 3.45–5.95 | Save the date: the blessings line, 28.10.2026 (5.14 s), Wednesday, 10:34 PM, Amalapuram |
| 5.95–8.0 | The bride and groom portraits float above the page (7.09 s) |
| 8.0–12.0 | The events heading, then the ceremony card: the camera eases down to 115 px/s and leans over it; the venue name reads large from 8.85 to 11.40 s |
| 12.0–13.2 | The reception & dinner card (12.76 s) |
| 13.2–14.65 | Gallery wall: four photos lift toward the lens (14.09 s) |
| 14.65–15.99 | Divine blessings; the camera rises from 14.94 s and the page fades into the ivory haze |
| 15.49–16.34 | The end card emerges and lands |
| 16.24–16.97 | The five end-card lines reveal word by word |
| 16.97–20.0 | The end card holds, fully revealed |

Compared with the previous version (`1cdef61`), the names, the save the date and the portraits
pass about 25% faster, the gallery is about 0.3 s shorter, and the rise, landing and reveal
start 0.24 s later. The text reveal now begins during the last 0.1 s of the landing. The
reception keeps its reading time (1.41 s, was 1.37 s). Every speed change is eased; the
steepest are the slowdown into the ceremony card (270 px/s²) and the speed-up into the gallery
(292 px/s²).

End card: "Sailakshmi & Dharmaveer", "28 October 2026 · 10:34 PM", "Amalapuram",
"With love, we invite you", "ఆత్మీయ ఆహ్వానం", under the uyyala photo. Nothing else is on the
card: the round save-the-date badge appears only in the opening. `fit-timing.py` prints what is
at the frame centre at each checkpoint, how sharply the speed changes, and how long the venue
name stays large on a 360 × 640 screen.

There is no soundtrack yet. The preview is silent until music is approved.
