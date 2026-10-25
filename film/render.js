// Drive the WebGL film page frame by frame.
// node render.js stills <outDir> <w> <h> <mb> <t1,t2,...>
// node render.js seq    <outDir> <w> <h> <mb> <fps> [from] [to]
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs');
const path = require('path');

(async () => {
  const [mode, out, w, h, mb, a, b, c] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const fps = mode === 'seq' ? +a : 60;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
  const base = process.env.FILM_URL || 'http://127.0.0.1:8765/film/film.html';
  await page.goto(`${base}?w=${w}&h=${h}&mb=${mb}&fps=${fps}`);
  await page.waitForFunction(() => window.filmReady || window.filmError, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.filmError);
  if (err) { console.error(err); process.exit(1); }
  const save = async (t, file) => {
    const url = await page.evaluate((tt) => window.frame(tt, 'image/jpeg', 0.97), t);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  };
  const t0 = Date.now();
  if (mode === 'stills') {
    for (const t of a.split(',').map(Number)) {
      await save(t, path.join(out, `still-${t.toFixed(2)}s.jpg`));
      console.log('still', t, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  } else {
    const from = +(b || 0), to = +(c || 20);
    const n0 = Math.round(from * fps), n1 = Math.round(to * fps);
    for (let i = n0; i < n1; i++) {
      await save(i / fps, path.join(out, `f${String(i).padStart(5, '0')}.jpg`));
      if (i % 30 === 0) console.log('frame', i, '/', n1, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
  }
  console.log('done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await browser.close();
})();
