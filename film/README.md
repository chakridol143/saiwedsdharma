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

## Events in the film (simplified)

Checked at 360 × 640: each event is on screen for about two seconds. In that time the full
cards, with both addresses, could not be read without pausing. The film keeps the site's
timeline and cards, but each card shows only the day, time, title and a short place line:

- Shown: "Wednesday · 28 Oct", "10:34 PM", "The ceremony", "Amalapuram"; then
  "Friday · 30 Oct", "7 PM", "Reception & dinner", "Manu Gardens, Tiruvuru".
- Left out of the film (all still on the site):
  - the muhurtham sentence "Wednesday at 10:34 PM. During the auspicious Rohini nakshatra,
    Mithuna lagna, Pushkaramsha muhurtham."
  - the date lines "28 · 10 · 2026 · 10:34 PM" and "30 · 10 · 2026"
  - "From … onwards at" (the reception time shows as "7 PM")
  - the wedding venue card: "Wedding venue", "Dr. Metla Satyanarayana Kapu Kalyana Mandapam",
    "Gandu Veedhi" (its town, "Amalapuram", is on the ceremony card)
  - "Laxmipuram" and "NTR District" from the reception address

`capture.js` checks that every place word it shows appears on the site. The earlier version,
with the full event cards and the six-photo gallery, is commit `5110b00`.

## Files

| File | What it does |
| --- | --- |
| `capture.js` | Captures the site in "film mode": the phone layout at 390 px wide and scale 3, with reduced motion so each section shows its settled state. It hides website-only controls, simplifies the event cards (see above), and lays the gallery and blessings flat. Saves page tiles, each liftable piece on a transparent background, and `layout.json`. |
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
node render.js stills out 1080 1920 1 0.6,2.8,5.6,8.4,10.9,12.0,13.7,15.0,17.0,19.98
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
on the rise (14.7–15.7 s). There the view sweeps fastest and the page is fading out. A 0.7 shutter
from the gallery onward visibly smeared the faces and the "Divine blessings" heading, so every
other frame is one crisp render. The low-res preview is rendered without motion blur.

## Timing

| Time (s) | Scene |
| --- | --- |
| 0.0–2.8 | Opening: "Sai & Dharma · 28 · 10 · 2026"; the save-the-date badge and the uyyala photo card lift |
| 2.8–3.7 | "We're getting married" and the names |
| 3.7–6.7 | Save the date: the blessings line, 28.10.2026, Wednesday, 10:34 PM, Amalapuram |
| 6.7–9.3 | The bride and groom portraits float above the page |
| 9.3–12.6 | The events: the ceremony card (centred at 10.9 s), then the reception & dinner card (12.0 s) |
| 12.6–14.5 | Gallery wall: four photos lift toward the lens |
| 14.5–15.75 | Divine blessings; the camera rises and the page fades into the ivory haze |
| 15.3–16.1 | The end card emerges and lands |
| 16.18–16.91 | The five end-card lines reveal word by word |
| 16.91–20.0 | The end card holds, fully revealed |

End card: "Sailakshmi & Dharmaveer", "28 October 2026 · 10:34 PM", "Amalapuram",
"With love, we invite you", "ఆత్మీయ ఆహ్వానం", under the uyyala photo. Nothing else is on the
card: the round save-the-date badge appears only in the opening. `fit-timing.py` prints what is at the frame
centre at each checkpoint, and checks that the glide never slows down.

There is no soundtrack yet. The preview is silent until music is approved.
