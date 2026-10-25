// Capture the wedding site as a flat "film page" plus liftable pieces.
// node capture.js <siteUrl> <outDir>
// - phone layout (390 CSS px wide) at device scale 3, reduced motion so every
//   section shows its settled, final state (no scroll animations, no pins)
// - website-only controls are hidden; the reel and blessing deck are laid flat
// - full page captured in tiles (<= 8192 px textures) with liftables hidden
// - each liftable captured alone on a transparent background with 28 px padding
// - layout.json records every tile and piece position in page CSS px
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs');
const path = require('path');

const W = 390, DPR = 3, PAD = 28, TILE = 2600;

const FILM_CSS = `
  html, body { background: #0d1440 !important; }
  .topbar, .skip, .loader, .lightbox, .shower-canvas,
  .story__bars, .story__head, .story__tap, .hero__ctas, .hero__dim,
  .hint, .duo__tap, .couple__panel,
  #countdownTiles, #countdownDone, .invite .btn,
  .night__photo, .moment__btns, .moment .btn, .venue .btn,
  #gallery, .deck__dots, .deity__names,
  #family, #closing, #break, .night .lead { display: none !important; }

  /* hero: the opening title block sits above the photo card */
  .hero { position: relative !important; height: auto !important; min-height: 0 !important;
          padding: 46px 14px 40px !important; justify-content: flex-start !important; gap: 22px !important; }
  .film-open { display: flex; flex-direction: column; align-items: center; text-align: center; color: #fff6ea; padding: 26px 0 18px; }
  .film-open svg { width: 112px; height: auto; overflow: visible; }
  .film-open circle { fill: none; stroke: #f5b544; stroke-width: 2.6; }
  .film-open circle + circle { stroke: #ffd581; }
  .film-open path { fill: #ffd581; }
  .film-open .n { margin: 16px 0 0; font-family: 'Instrument Serif', Georgia, serif; font-size: 50px; line-height: 1; }
  .film-open .n i { color: #f5b544; padding: 0 .06em; }
  .film-open .d { margin: 12px 0 0; font-size: 13px; font-weight: 800; letter-spacing: .34em; color: rgba(255,246,234,.78); }
  .story { aspect-ratio: 1 / 1 !important; max-height: none !important; flex: none !important; }
  .story::after { display: none !important; }

  /* save the date: no live countdown in a shared video */
  .invite { padding-bottom: 56px !important; }

  /* the couple: both portraits equal and bright */
  .duo { grid-template-columns: 1fr 0px 1fr !important; transition: none !important; }
  .duo__arch::after { opacity: 0 !important; }
  .duo__name, .duo__role { opacity: 1 !important; }
  .couple { padding-bottom: 60px !important; }


  /* events, simplified for the film: day, time, title and a short place line per event.
     The muhurtham sentence, the repeated date lines and the full addresses stay on the site. */
  .night { padding-bottom: 40px !important; }
  .moment { padding-bottom: 44px !important; }
  .moment__date, .moment__text, #venue { display: none !important; }
  .moment__day { font-size: 15px !important; }
  .moment__time { font-size: 50px !important; }
  .moment--main .moment__time { font-size: 60px !important; }
  .moment__title { font-size: 38px !important; }
  .film-place { margin-top: 12px; display: flex; align-items: center; gap: 8px; font-size: 21px; font-weight: 700; line-height: 1.2; color: #fff6ea; }
  .film-place svg { flex: none; width: 22px; height: 22px; color: #ffd581; }

  /* gallery laid flat as a collage */
  .film-gallery { position: relative; background: #0d1440; color: #fff6ea; padding: 64px 0 40px; }
  .film-gallery .head { padding: 0 20px; }
  .film-gallery .eyebrow { color: #ffd581; }
  .film-gallery .wall { position: relative; height: 438px; margin-top: 26px; }
  .film-gallery .ph { position: absolute; display: block; overflow: hidden; border-radius: 16px; background: #1b2356;
                      box-shadow: 0 0 0 1px rgba(255,246,234,.1); }
  .film-gallery .ph img { width: 100%; height: 100%; object-fit: cover; }

  /* blessings: the four divine couples in a 2 x 2 grid */
  .divine { padding-bottom: 70px; }
  .divine__pin { padding: 70px 20px 10px !important; }
  .divine .deck { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; width: 100% !important; grid-auto-flow: row !important;
                  grid-auto-columns: auto !important; gap: 20px 16px !important; overflow: visible !important; margin-top: 30px !important; }
  .divine .deity { display: flex !important; flex-direction: column; }
  .divine .deity__arch { aspect-ratio: 2 / 3; height: auto !important; box-shadow: 0 0 0 2px rgba(245,181,68,.75), 0 0 0 7px rgba(245,181,68,.14) !important; }
  .divine .deity__label { display: block !important; margin-top: 10px; text-align: center; font-family: 'Instrument Serif', Georgia, serif; font-size: 21px; color: #ffd581; }
`;

// liftable pieces: selector, label, lift style
const LIFTS = [
  { sel: '.hero .badge', id: 'badge', kind: 'tile' },
  { sel: '.hero .story', id: 'heroCard', kind: 'photo' },
  { sel: '.invite__emblem', id: 'emblem', kind: 'chip' },
  { sel: '.duo__card--bride .duo__arch', id: 'bride', kind: 'portrait' },
  { sel: '.duo__card--groom .duo__arch', id: 'groom', kind: 'portrait' },
  { sel: '.duo__amp', id: 'amp', kind: 'chip' },
  { sel: '.moment--main .moment__card', id: 'ceremony', kind: 'card' },
  { sel: '.moment:not(.moment--main) .moment__card', id: 'reception', kind: 'card' },
  { sel: '.film-gallery .ph:nth-of-type(1)', id: 'g1', kind: 'gallery' },
  { sel: '.film-gallery .ph:nth-of-type(2)', id: 'g2', kind: 'gallery' },
  { sel: '.film-gallery .ph:nth-of-type(3)', id: 'g3', kind: 'gallery' },
  { sel: '.film-gallery .ph:nth-of-type(4)', id: 'g4', kind: 'gallery' },
  { sel: '.deity:nth-of-type(1)', id: 'd1', kind: 'deity' },
  { sel: '.deity:nth-of-type(2)', id: 'd2', kind: 'deity' },
  { sel: '.deity:nth-of-type(3)', id: 'd3', kind: 'deity' },
  { sel: '.deity:nth-of-type(4)', id: 'd4', kind: 'deity' },
];

(async () => {
  const [url, out] = process.argv.slice(2);
  fs.mkdirSync(path.join(out, 'tiles'), { recursive: true });
  fs.mkdirSync(path.join(out, 'pieces'), { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('#loaderOpen').click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);

  // build film mode
  await page.addStyleTag({ content: FILM_CSS });
  await page.evaluate(() => {
    // opening block from the loader: rings, Sai & Dharma, the date
    const open = document.createElement('div');
    open.className = 'film-open';
    open.innerHTML = '<svg viewBox="0 0 120 84" aria-hidden="true"><circle cx="47" cy="48" r="24"/><circle cx="73" cy="48" r="24"/><path d="M73 10 l6 7 -6 7 -6 -7z"/></svg>'
      + '<p class="n">Sai <i>&amp;</i> Dharma</p><p class="d">28 · 10 · 2026</p>';
    const hero = document.querySelector('.hero');
    hero.insertBefore(open, hero.firstChild);
    // events: one short place line per card, using the site's own spellings
    const siteText = document.body.textContent;
    const pin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
    [['.moment--main .moment__card', ['Amalapuram']],
     ['.moment:not(.moment--main) .moment__card', ['Manu Gardens', 'Tiruvuru']]].forEach(([sel, parts]) => {
      parts.forEach((s) => { if (!siteText.includes(s)) throw new Error('place not on the site: ' + s); });
      const p = document.createElement('p');
      p.className = 'film-place';
      p.innerHTML = pin + '<span>' + parts.join(', ') + '</span>';
      document.querySelector(sel).appendChild(p);
    });
    // gallery collage (photos from the site's reel)
    const photos = [
      // a two-column wall, no overlaps: hand in hand, uyyala, garden, engagement
      ['img/shoot/palace-walk.jpg', 200, 0, 170, 255],     // hand in hand (the blue palace)
      ['img/shoot/swing-close.jpg', 20, 60, 170, 113],     // uyyala
      ['img/shoot/garden-hug.jpg', 20, 183, 170, 255],     // garden
      ['img/gallery/g-05.jpg', 200, 265, 170, 113],        // engagement rings
    ];
    const g = document.createElement('section');
    g.className = 'film-gallery';
    g.id = 'filmGallery';
    g.innerHTML = '<div class="head"><p class="eyebrow"><span class="eyebrow__n">04</span><span class="t-en">Gallery</span></p>'
      + '<h2 class="reel__title"><span class="t-en">Our story <i>in pictures</i></span></h2></div><div class="wall"></div>';
    const wall = g.querySelector('.wall');
    photos.forEach(([src, x, y, w, h]) => {
      const a = document.createElement('span');
      a.className = 'ph';
      a.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
      a.innerHTML = `<img src="${src}" alt="">`;
      wall.appendChild(a);
    });
    document.querySelector('#events').after(g);
    // nothing animated, nothing fixed
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in'));
  });
  // let every image (lazy ones included) load
  await page.evaluate(async () => {
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
    document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
    await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
    await document.fonts.ready;
  });
  await page.waitForTimeout(600);

  // positions
  const layout = await page.evaluate(({ LIFTS, PAD }) => {
    const abs = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
    const sections = ['.hero', '#invite', '#couple', '#events', '#filmGallery', '#divine'].map((s) => ({ id: s, ...abs(document.querySelector(s)) }));
    const marks = {
      openTitle: abs(document.querySelector('.film-open .n')),
      heroCard: abs(document.querySelector('.hero .story')),
      names: abs(document.querySelector('.hero__names')),
      when: abs(document.querySelector('.hero__when')),
      bigdate: abs(document.querySelector('#bigdate')),
      inviteWhen: abs(document.querySelector('.invite__when')),
      duo: abs(document.querySelector('#duo')),
      timeline: abs(document.querySelector('#timeline')),
      wall: abs(document.querySelector('.film-gallery .wall')),
      deck: abs(document.querySelector('#godDeck')),
    };
    const pieces = LIFTS.map((l) => {
      const el = document.querySelector(l.sel);
      if (!el) return { ...l, missing: true };
      const r = abs(el);
      return { ...l, x: r.x - PAD, y: r.y - PAD, w: r.w + PAD * 2, h: r.h + PAD * 2, inner: r };
    });
    return { width: document.documentElement.clientWidth, height: document.documentElement.scrollHeight, sections, marks, pieces };
  }, { LIFTS, PAD });
  console.log('page', layout.width, 'x', layout.height);
  layout.sections.forEach((s) => console.log('  section', s.id, Math.round(s.y), '+', Math.round(s.h)));
  layout.pieces.filter((p) => p.missing).forEach((p) => console.log('  MISSING', p.sel));

  // liftables captured alone, transparent background, no CSS shadow (WebGL draws its own)
  for (const p of layout.pieces) {
    if (p.missing) continue;
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      el.setAttribute('data-film-solo', '');
      const st = document.createElement('style');
      st.id = 'solo';
      st.textContent = `html, body { background: transparent !important; } * { visibility: hidden !important; }
        [data-film-solo], [data-film-solo] * { visibility: visible !important; }
        [data-film-solo] { box-shadow: none !important; }
        [data-film-solo] .deity__arch, [data-film-solo] .duo__arch { box-shadow: 0 0 0 2px rgba(245,181,68,.8) !important; }`;
      document.head.appendChild(st);
    }, p.sel);
    await page.screenshot({ path: path.join(out, 'pieces', p.id + '.png'), clip: { x: p.x, y: p.y, width: p.w, height: p.h }, fullPage: true, omitBackground: true });
    await page.evaluate((sel) => { document.querySelector(sel).removeAttribute('data-film-solo'); document.getElementById('solo').remove(); }, p.sel);
  }

  // the page itself, pieces hidden, in tiles
  await page.evaluate((sels) => { sels.forEach((s) => { const el = document.querySelector(s); if (el) el.style.visibility = 'hidden'; }); }, layout.pieces.map((p) => p.sel));
  const tiles = [];
  for (let y = 0, i = 0; y < layout.height; y += TILE, i++) {
    const h = Math.min(TILE, layout.height - y);
    const file = `tile-${i}.png`;
    await page.screenshot({ path: path.join(out, 'tiles', file), clip: { x: 0, y, width: W, height: h }, fullPage: true });
    tiles.push({ file, y, h });
  }
  layout.tiles = tiles;
  layout.dpr = DPR; layout.pad = PAD;
  fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify(layout, null, 1));
  // a reference full-page view (pieces visible) at 1x for the plan
  await page.evaluate((sels) => { sels.forEach((s) => { const el = document.querySelector(s); if (el) el.style.visibility = ''; }); }, layout.pieces.map((p) => p.sel));
  const ref = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 1 });
  await ref.close();
  await page.screenshot({ path: path.join(out, 'reference-full.png'), fullPage: true });
  console.log('tiles', tiles.length, 'pieces', layout.pieces.length);
  await browser.close();
})();
