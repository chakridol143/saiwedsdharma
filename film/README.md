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
- Events as captured:
  - Ceremony: Wednesday 28 Oct 2026, 10:34 PM, at Dr. Metla Satyanarayana Kapu Kalyana
    Mandapam, Gandu Veedhi, Amalapuram.
  - Reception & dinner: Friday 30 Oct 2026, from 7 PM, at Manu Gardens, Laxmipuram,
    Tiruvuru, NTR District.

## Files

| File | What it does |
| --- | --- |
| `capture.js` | Captures the site in "film mode": the phone layout at 390 px wide and scale 3, with reduced motion so each section shows its settled state. It hides website-only controls and lays the gallery and blessings flat. Saves page tiles, each liftable piece on a transparent background, and `layout.json`. |
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
node render.js stills out 1080 1920 1 0.8,3.5,6.2,9.5,12.5,15.8,19.2
node render.js seq frames 540 960 1 30 0 20    # low-res preview frames
ffmpeg -framerate 30 -i frames/f%05d.jpg -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart preview-540x960-30fps.mp4
```

`render.js` opens `http://127.0.0.1:8765/film/film.html` by default. Set `FILM_URL` to
use another address. In the build sandbox WebGL2 ran on the CPU (SwiftShader, 4 cores):
a full-size frame took about 1–1.5 s, or about 7 s with 4 motion-blur subframes.

## Timing (previewed version)

| Time | Scene |
| --- | --- |
| 0.0–2.5 | Close on "Sai & Dharma · 28 · 10 · 2026"; the uyyala card lifts |
| 2.5–5.0 | "We're getting married" and the names |
| 5.0–8.0 | Save the date: 28.10.2026, Wednesday, 10:34 PM, Amalapuram |
| 8.0–11.0 | The bride and groom portraits float above the page |
| 11.0–14.0 | Ceremony, reception and dinner, wedding venue |
| 14.0–17.2 | Gallery wall: six photos lift toward the lens |
| 17.2–18.5 | Divine blessings; the camera rises and the page fades into the ivory haze |
| 18.5–20.0 | End card lands; title lines reveal word by word |

There is no soundtrack yet. The preview is silent until music is approved.
