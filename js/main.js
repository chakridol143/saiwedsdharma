/* ==========================================================================
   సాయిలక్ష్మి ❖ ధర్మవీర్ — పెండ్లి పిలుపు
   Plain JavaScript, no dependencies. Each feature starts on its own, so if one
   fails the rest of the page (and all of its content) still works.
   ========================================================================== */
(function () {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const WEDDING = Date.UTC(2026, 9, 28, 17, 4, 0); // 28-10-2026, 22:34 IST
  const INTRO_KEY = 'pelli-intro-seen';
  const INTRO_MIN_MS = 2500;
  const INTRO_MAX_MS = 8000;

  const store = {
    get(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch (e) { /* private mode */ } }
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const debounce = (fn, ms) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };

  function safe(name, fn) {
    try { return fn(); } catch (err) { console.error('[pelli] ' + name + ' failed', err); return undefined; }
  }

  /* ---------- falling petals: marigold, rose, jasmine ---------- */

  function initPetals() {
    const box = $('#petals');
    if (!box || reducedMotion) return;
    const colors = [
      'radial-gradient(circle at 30% 30%, #ffd36b, #f39c1f 60%, #c25b0a)',
      'radial-gradient(circle at 30% 30%, #ff9fb0, #d6304f 60%, #8a1020)',
      'radial-gradient(circle at 30% 30%, #fffdf3, #f5e6c4 70%)',
      'radial-gradient(circle at 30% 30%, #ffe9a3, #ffb627 60%, #d9840a)',
      'radial-gradient(circle at 30% 30%, #ffc2cc, #e04a5f 65%)'
    ];
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const n = window.innerWidth < 640 ? 12 : 18;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const size = 9 + Math.round(rnd() * 12);
      const petal = document.createElement('span');
      petal.className = 'petal';
      petal.style.cssText =
        `left:${(rnd() * 100).toFixed(1)}%;width:${size}px;height:${Math.round(size * 0.78)}px;` +
        `background:${colors[i % colors.length]};border-radius:${i % 3 === 2 ? '50%' : '70% 0 70% 0'};` +
        `animation-duration:${(12 + rnd() * 10).toFixed(1)}s;animation-delay:-${(rnd() * 20).toFixed(1)}s`;
      frag.appendChild(petal);
    }
    box.appendChild(frag);
  }

  /* ---------- preloader → temple doors → staged hero reveal ---------- */

  function decodeImage(img) {
    if (!img) return Promise.resolve();
    const done = img.decode
      ? img.decode()
      : new Promise((resolve) => { if (img.complete) resolve(); else img.onload = img.onerror = resolve; });
    return done.catch(() => {});
  }

  function preloadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = src;
    });
  }

  function loadFont(spec, sample) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return document.fonts.load(spec, sample).catch(() => {});
  }

  function initIntro() {
    const intro = $('#intro');
    const skip = $('#introSkip');
    const hero = $('#top');
    if (!intro || !hero) return;

    if (root.classList.contains('intro-seen')) {
      intro.remove();
      if (skip) skip.remove();
      return;
    }

    intro.classList.add('is-live');
    if (skip) skip.classList.add('is-live');
    root.classList.add('intro-active');
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    if (!reducedMotion) hero.classList.add('is-pre');

    const bar = $('#introBar');
    const pct = $('#introPct');
    const started = performance.now();
    const timers = [];
    let target = 0;
    let shown = 0;
    let speed = 0.0007; // progress per ms (the ring needs ~1.4 s to fill)
    let opened = false;
    let finished = false;

    // Real loading: the hero photo, the emblem, the first god image and the fonts.
    const tasks = [
      decodeImage($('#heroPhoto')),
      decodeImage($('.intro__ganesha')),
      // Only the fonts of the language being shown; the other loads if a guest switches.
      ...(root.dataset.lang === 'te'
        ? [loadFont('400 48px Ramaraja', 'సాయిలక్ష్మి'), loadFont('400 16px "Anek Telugu"', 'సాయిలక్ష్మి')]
        : [loadFont('400 64px Fraunces', 'Sailakshmi'), loadFont('500 16px Inter', 'Sailakshmi')])
    ];
    let loaded = 0;
    tasks.forEach((task) => task.then(() => { loaded += 1; target = Math.max(target, loaded / tasks.length); }));

    let last = started;
    const paint = (now) => {
      if (finished) return;
      shown = Math.min(target, shown + (now - last) * speed);
      last = now;
      if (pct) pct.textContent = Math.round(shown * 100);
      if (bar) bar.style.strokeDashoffset = String(100 - shown * 100);
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);

    const later = (fn, ms) => timers.push(setTimeout(() => { if (!finished) fn(); }, ms));

    const finish = (instant) => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      store.set(INTRO_KEY, '1');
      intro.remove();
      if (skip) skip.remove();
      root.classList.remove('intro-active');
      if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
      if (instant) hero.classList.remove('is-pre', 'is-revealing');
      else setTimeout(() => hero.classList.remove('is-revealing'), 2400); // after the last stage
    };

    const open = () => {
      if (opened || finished) return;
      opened = true;
      target = 1;
      speed = 0.004;
      later(() => {
        if (reducedMotion) {
          intro.classList.add('is-fading');
          later(() => finish(true), 450);
          return;
        }
        intro.classList.add('is-opening');
        later(() => {
          hero.classList.remove('is-pre');
          hero.classList.add('is-revealing');
        }, 300);
        later(() => finish(false), 2900);
      }, 450);
    };

    const ready = Promise.all(tasks).then(() => wait(Math.max(0, INTRO_MIN_MS - (performance.now() - started))));
    Promise.race([ready, wait(INTRO_MAX_MS)]).then(open);
    if (skip) skip.addEventListener('click', () => finish(true));
  }

  /* ---------- headings: split into words that rise one by one ---------- */

  function initSplit() {
    // Split one block of text into masked words. A heading may hold one
    // .t-en and one .t-te child; each language is split on its own so the
    // language switch keeps working.
    const splitInto = (box, gold) => {
      const text = box.textContent.trim().replace(/\s+/g, ' ');
      box.textContent = '';
      const label = document.createElement('span');
      label.className = 'sr-only';
      label.textContent = text;
      box.appendChild(label);
      text.split(' ').forEach((word, i) => {
        if (i) box.appendChild(document.createTextNode(' '));
        const mask = document.createElement('span');
        mask.className = 'w';
        mask.setAttribute('aria-hidden', 'true');
        const inner = document.createElement('span');
        if (gold) inner.className = 'gold-text';
        inner.style.setProperty('--i', i);
        inner.textContent = word;
        mask.appendChild(inner);
        box.appendChild(mask);
      });
    };
    $$('[data-split]').forEach((el) => {
      const gold = el.classList.contains('gold-text');
      el.classList.remove('gold-text');
      const parts = $$(':scope > .t-en, :scope > .t-te', el);
      if (parts.length) parts.forEach((part) => splitInto(part, gold));
      else splitInto(el, gold);
    });
  }

  /* ---------- scroll reveal: staggered, runs once ---------- */

  function initReveal() {
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    const els = $$('[data-reveal], [data-split], .g-item');
    const io = new IntersectionObserver((entries) => {
      let k = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.style.setProperty('--d', (k++ * 0.09).toFixed(2) + 's');
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    root.classList.add('motion');
  }

  /* ---------- one scroll loop: progress bar, hero depth, parallax, top bar, marquee ---------- */

  function initScroll() {
    const progress = $('#progress');
    const hero = $('#top');
    const topbar = $('#topbar');
    const track = $('#marquee');
    const layers = $$('[data-parallax]').map((el) => ({ el, f: parseFloat(el.dataset.parallax) || 0, mid: 0 }));

    // Measure each parallax layer's resting centre (without its own offset).
    const measure = () => {
      layers.forEach((l) => {
        l.el.style.translate = '';
        const r = l.el.getBoundingClientRect();
        l.mid = r.top + window.scrollY + r.height / 2;
      });
    };

    let lastY = window.scrollY;
    let lastHs = '';
    let velocity = 0;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const max = document.documentElement.scrollHeight - vh;
      if (progress) progress.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : '0');
      if (hero) {
        const h = hero.offsetHeight || vh;
        // Only touch the hero while it is on screen; restyling it on every scroll
        // frame further down the page was wasted work.
        const hs = clamp(y / h, 0, 1).toFixed(3);
        if (!reducedMotion && hs !== lastHs) { hero.style.setProperty('--hs', hs); lastHs = hs; }
        if (topbar) topbar.classList.toggle('is-on', y > h * 0.75);
        root.classList.toggle('fabs-on', y > h * 0.5);
      }
      if (!reducedMotion) {
        layers.forEach((l) => {
          const offset = (l.mid - (y + vh / 2)) * l.f;
          if (Math.abs(l.mid - (y + vh / 2)) < vh * 1.5) l.el.style.translate = `0 ${offset.toFixed(1)}px`;
        });
      }
      velocity = y - lastY;
      lastY = y;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', debounce(() => { measure(); update(); }, 150));
    window.addEventListener('load', () => { measure(); update(); });
    measure();
    update();

    // Marquee: drifts on its own, speeds up with scrolling and follows the scroll direction.
    if (!track || reducedMotion) return;
    track.classList.add('is-js');
    let x = 0;
    let half = track.scrollWidth / 2;
    let dir = 1;
    let boost = 0;
    let visible = false;
    let raf = 0;
    let lastT = 0;
    const remeasure = () => { half = track.scrollWidth / 2; };
    window.addEventListener('resize', debounce(remeasure, 150));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    const loop = (t) => {
      const dt = lastT ? Math.min(64, t - lastT) / 1000 : 0;
      lastT = t;
      if (velocity) dir = velocity > 0 ? 1 : -1;
      boost += (Math.min(Math.abs(velocity), 60) - boost) * 0.08;
      velocity *= 0.85;
      x -= dir * (45 + boost * 9) * dt;
      if (half) {
        if (x <= -half) x += half;
        if (x > 0) x -= half;
      }
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) { lastT = 0; raf = requestAnimationFrame(loop); }
    }).observe(track);
  }

  /* ---------- pause decorative animations in sections that are off screen ---------- */

  function initPauseOffscreen() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target.classList.toggle('is-paused', !e.isIntersecting));
    }, { rootMargin: '100px 0px' });
    $$('.hero, #countdown, #closing').forEach((el) => io.observe(el));
  }

  /* ---------- hero depth: pointer, device tilt, or the slow photo drift ---------- */

  function initHeroParallax() {
    const hero = $('#top');
    if (!hero || reducedMotion) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const loop = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      hero.style.setProperty('--px', cx.toFixed(3));
      hero.style.setProperty('--py', cy.toFixed(3));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(loop) : 0;
    };
    const aim = (x, y) => {
      tx = clamp(x, -1, 1);
      ty = clamp(y, -1, 1);
      if (!raf) raf = requestAnimationFrame(loop);
    };

    if (finePointer) {
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        aim(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
      });
      hero.addEventListener('pointerleave', () => aim(0, 0));
      return;
    }

    // Phones: follow the device tilt when allowed; the photo's slow drift (CSS) runs anyway.
    let base = null;
    const onOrientation = (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (!base) base = { beta: e.beta, gamma: e.gamma };
      aim((e.gamma - base.gamma) / 22, (e.beta - base.beta) / 22);
    };
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      // iOS only asks after a tap.
      hero.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        DOE.requestPermission().then((state) => {
          if (state === 'granted') window.addEventListener('deviceorientation', onOrientation);
        }).catch(() => {});
      }, { once: true });
    } else if (DOE) {
      window.addEventListener('deviceorientation', onOrientation);
    }
  }

  /* ---------- hover: cursor spotlight on cards, magnetic buttons ---------- */

  function initPointerFx() {
    if (!finePointer || reducedMotion) return;
    $$('.card').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.translate = `${(x * 0.2).toFixed(1)}px ${(y * 0.3).toFixed(1)}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });
  }

  /* ---------- bride & groom flip cards ---------- */

  function initFlipCards() {
    $$('.flip').forEach((card) => {
      const front = $('.flip__front', card);
      const back = $('.flip__back', card);
      const set = (flipped, moveFocus) => {
        card.classList.toggle('is-flipped', flipped);
        front.inert = flipped;
        back.inert = !flipped;
        front.setAttribute('aria-hidden', String(flipped));
        back.setAttribute('aria-hidden', String(!flipped));
        if (moveFocus) $('[data-flip]', flipped ? back : front).focus({ preventScroll: true });
      };
      set(false, false);
      card.addEventListener('click', (e) => {
        const button = e.target.closest('[data-flip]');
        if (!button && e.target.closest('a')) return;
        set(!card.classList.contains('is-flipped'), Boolean(button));
      });
    });
  }

  /* ---------- countdown to the muhurtham ---------- */

  function initCountdown() {
    const tiles = $('#countdownTiles');
    const doneMsg = $('#countdownDone');
    if (!tiles) return;
    const unit = (name) => $(`[data-unit="${name}"]`, tiles);
    const el = { days: unit('days'), hours: unit('hours'), minutes: unit('minutes'), seconds: unit('seconds') };
    const pad = (n) => String(n).padStart(2, '0');
    const put = (node, value) => {
      if (node.textContent === value) return;
      node.textContent = value;
      if (reducedMotion) return;
      node.classList.remove('is-tick');
      void node.offsetWidth; // restart the roll-in animation
      node.classList.add('is-tick');
    };
    const tick = () => {
      const diff = WEDDING - Date.now();
      if (diff <= 0) {
        tiles.hidden = true;
        if (doneMsg) doneMsg.hidden = false;
        return;
      }
      const s = Math.floor(diff / 1000);
      put(el.days, String(Math.floor(s / 86400)));
      put(el.hours, pad(Math.floor(s / 3600) % 24));
      put(el.minutes, pad(Math.floor(s / 60) % 60));
      put(el.seconds, pad(s % 60));
      setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
    };
    tick();
  }

  /* ---------- lightbox (gallery, gods, coverflow) ---------- */

  function createLightbox() {
    const box = $('#lightbox');
    if (!box) return { open() {} };
    const img = $('#lbImg');
    const caption = $('#lbCaption');
    const counter = $('#lbCount');
    const prev = $('#lbPrev');
    const next = $('#lbNext');
    const close = $('#lbClose');
    let items = [];
    let index = 0;
    let returnFocus = null;
    let hideTimer = 0;

    const captionFor = (item) => {
      const lang = root.dataset.lang || 'en';
      return item[lang] || item.alt || '';
    };
    const show = () => {
      const item = items[index];
      img.classList.remove('is-loaded');
      img.onload = () => img.classList.add('is-loaded');
      img.onerror = () => {
        if (item.fallback && !img.src.endsWith(item.fallback)) img.src = item.fallback;
      };
      img.width = item.w;
      img.height = item.h;
      img.alt = captionFor(item);
      img.src = item.src;
      if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
      caption.textContent = captionFor(item);
      const many = items.length > 1;
      prev.hidden = next.hidden = counter.hidden = !many;
      counter.textContent = `${index + 1} / ${items.length}`;
      if (many) {
        [index - 1, index + 1].forEach((j) => { new Image().src = items[(j + items.length) % items.length].src; });
      }
    };
    const step = (d) => { index = (index + d + items.length) % items.length; show(); };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); hide(); }
      else if (e.key === 'ArrowLeft' && items.length > 1) { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight' && items.length > 1) { e.preventDefault(); step(1); }
      else if (e.key === 'Tab') {
        const focusable = [close, prev, next].filter((b) => !b.hidden);
        const i = focusable.indexOf(document.activeElement);
        e.preventDefault();
        focusable[(i + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
      }
    };

    function open(list, start, from) {
      items = list;
      index = start;
      returnFocus = from || document.activeElement;
      clearTimeout(hideTimer);
      box.hidden = false;
      root.classList.add('no-scroll');
      show();
      requestAnimationFrame(() => box.classList.add('is-open'));
      document.addEventListener('keydown', onKey);
      close.focus({ preventScroll: true });
    }

    function hide() {
      box.classList.remove('is-open');
      root.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
      hideTimer = setTimeout(() => { box.hidden = true; img.removeAttribute('src'); }, 400);
      if (returnFocus) returnFocus.focus({ preventScroll: true });
    }

    close.addEventListener('click', hide);
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));

    // Swipe left/right to browse, swipe down to close, tap the dark area to close.
    let sx = 0, sy = 0, tracking = false, swiped = false;
    box.addEventListener('pointerdown', (e) => { tracking = true; swiped = false; sx = e.clientX; sy = e.clientY; });
    box.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && items.length > 1) { swiped = true; step(dx < 0 ? 1 : -1); }
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { swiped = true; hide(); }
    });
    box.addEventListener('pointercancel', () => { tracking = false; });
    box.addEventListener('click', (e) => {
      if (swiped) { swiped = false; return; }
      if (e.target === box || e.target.classList.contains('lightbox__stage')) hide();
    });

    return { open };
  }

  /* ---------- rotating 3D carousel of the divine couples ---------- */

  function initGodCarousel(lightbox) {
    const wrap = $('#godCarousel');
    const ring = $('#godRing');
    if (!wrap || !ring) return;
    const viewport = $('.carousel__viewport', wrap);
    const items = $$('#godData li').map((li) => ({
      src: li.dataset.src, fallback: li.dataset.fallback, w: +li.dataset.w, h: +li.dataset.h,
      en: li.dataset.en, te: li.dataset.te, alt: li.dataset.en
    }));

    const STEP = 60;
    const SPEED = 360 / 48; // degrees per second
    let angle = 0;
    let anim = null;
    let hover = false;
    let focusInside = false;
    let dragging = false;
    let holdUntil = 0;
    let visible = false;
    let raf = 0;
    let last = 0;

    const render = () => ring.style.setProperty('--angle', angle.toFixed(3) + 'deg');
    const loop = (now) => {
      const dt = last ? Math.min(64, now - last) / 1000 : 0;
      last = now;
      if (anim) {
        const t = Math.min(1, (now - anim.start) / anim.dur);
        angle = anim.from + (anim.to - anim.from) * (1 - Math.pow(1 - t, 3));
        if (t >= 1) anim = null;
      } else if (!reducedMotion && !hover && !focusInside && !dragging && now > holdUntil) {
        angle -= SPEED * dt;
      }
      render();
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } };
    const animateTo = (to, dur) => {
      anim = { from: angle, to, start: performance.now(), dur };
      holdUntil = performance.now() + dur + 3500;
      run();
    };
    const go = (dir) => animateTo(Math.round(angle / STEP) * STEP - dir * STEP, 900);

    $('#godPrev').addEventListener('click', () => go(-1));
    $('#godNext').addEventListener('click', () => go(1));

    // Drag / swipe to spin.
    let startX = 0;
    let startAngle = 0;
    let moved = 0;
    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = 0;
      startX = e.clientX;
      startAngle = angle;
      anim = null;
      viewport.classList.add('is-dragging');
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      angle = startAngle + dx * 0.3;
      render();
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('is-dragging');
      animateTo(Math.round(angle / STEP) * STEP, 600);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    // Tap a panel to see it large.
    ring.addEventListener('click', (e) => {
      const panel = e.target.closest('.god-panel');
      if (!panel) return;
      if (moved > 8) { moved = 0; return; }
      lightbox.open(items, Number(panel.dataset.index), panel);
    });

    // Keyboard focus brings that panel to the front.
    ring.addEventListener('focusin', (e) => {
      const panel = e.target.closest('.god-panel');
      if (!panel || !panel.matches(':focus-visible')) return;
      const to = -Number(panel.dataset.index) * STEP;
      animateTo(to + Math.round((angle - to) / 360) * 360, 700);
    });

    viewport.addEventListener('mouseenter', () => { hover = true; });
    viewport.addEventListener('mouseleave', () => { hover = false; });
    wrap.addEventListener('focusin', () => { focusInside = true; });
    wrap.addEventListener('focusout', () => { focusInside = false; });
    viewport.addEventListener('touchstart', () => { holdUntil = performance.now() + 5000; }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) run(); }).observe(wrap);
    } else {
      visible = true;
      run();
    }
    render();
  }

  /* ---------- pre-wedding coverflow: infinite loop + auto-slide ---------- */

  function initCoverflow(lightbox) {
    const wrap = $('#coverflow');
    if (!wrap) return;
    const stage = $('.coverflow__stage', wrap);
    const cards = $$('.cf-item', wrap);
    const N = cards.length;
    if (!N) return;
    const items = cards.map((c) => ({
      src: c.dataset.src, fallback: c.dataset.fallback, w: +c.dataset.w, h: +c.dataset.h, alt: $('img', c).alt
    }));
    let current = Math.min(2, N - 1);

    // Shortest signed distance in a ring of N items, e.g. in a ring of 10
    // card 1 is one step forward from card 9 (not nine steps back).
    const loopOff = (i, c) => {
      const d = ((i - c) % N + N) % N;
      return d > N / 2 ? d - N : d;
    };

    const layout = () => {
      cards.forEach((card, i) => {
        const off = loopOff(i, current);
        const abs = Math.abs(off);
        card.style.setProperty('--off', off);
        card.style.setProperty('--abs', abs);
        card.style.setProperty('--dir', Math.sign(off));
        card.style.setProperty('--o', abs > 2 ? 0 : 1 - abs * 0.12);
        card.style.pointerEvents = abs > 2 ? 'none' : '';
        card.tabIndex = abs > 2 ? -1 : 0;
        card.setAttribute('aria-current', String(off === 0));
        card.setAttribute('aria-label', off === 0
          ? `ఫోటో ${i + 1} / ${N} — పెద్దగా చూడండి`
          : `ఫోటో ${i + 1} — ముందుకు తీసుకురండి`);
      });
    };

    // Auto-advance every ~4.5 s. Paused while a mouse hovers it, while a card
    // is focused, while touching/dragging, while the tab is hidden, and when
    // the section is scrolled offscreen. Respects prefers-reduced-motion.
    const AUTO_MS = 4500;
    const RESUME_MS = 2500;
    let timer = 0;
    let inView = false;
    const paused = { hover: false, touch: false, focus: false };
    const anyPaused = () => paused.hover || paused.touch || paused.focus;
    const schedule = () => {
      clearTimeout(timer);
      if (reducedMotion || !inView || anyPaused() || document.hidden) return;
      timer = setTimeout(() => { current = (current + 1) % N; layout(); schedule(); }, AUTO_MS);
    };
    const go = (i) => { current = ((i % N) + N) % N; layout(); schedule(); };

    wrap.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') { paused.hover = true; schedule(); }
    });
    wrap.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') { paused.hover = false; schedule(); }
    });
    wrap.addEventListener('focusin', () => { paused.focus = true; schedule(); });
    wrap.addEventListener('focusout', () => { paused.focus = false; schedule(); });
    document.addEventListener('visibilitychange', schedule);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting; schedule();
      }, { threshold: 0.1 }).observe(wrap);
    } else {
      inView = true; schedule();
    }

    // Swipe + drag.
    let sx = null;
    let swiped = false;
    let touchResume = 0;
    stage.addEventListener('pointerdown', (e) => {
      sx = e.clientX; swiped = false;
      clearTimeout(touchResume);
      paused.touch = true; schedule();
    });
    stage.addEventListener('pointerup', (e) => {
      if (sx !== null) {
        const dx = e.clientX - sx;
        sx = null;
        if (Math.abs(dx) > 40) { swiped = true; go(current + (dx < 0 ? 1 : -1)); }
      }
      touchResume = setTimeout(() => { paused.touch = false; schedule(); }, RESUME_MS);
    });
    stage.addEventListener('pointercancel', () => {
      sx = null; paused.touch = false; schedule();
    });

    cards.forEach((card, i) => card.addEventListener('click', () => {
      if (swiped) { swiped = false; return; }
      if (loopOff(i, current) === 0) lightbox.open(items, i, card);
      else go(i);
    }));
    $('#cfPrev').addEventListener('click', () => go(current - 1));
    $('#cfNext').addEventListener('click', () => go(current + 1));
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
    });
    layout();
  }

  /* ---------- photo gallery → lightbox ---------- */

  function initGallery(lightbox) {
    const grid = $('#galleryGrid');
    if (!grid) return;
    const links = $$('.g-item', grid);
    const items = links.map((a) => ({
      src: a.dataset.src, fallback: a.getAttribute('href'), w: +a.dataset.w, h: +a.dataset.h, alt: $('img', a).alt
    }));
    links.forEach((a, i) => a.addEventListener('click', (e) => {
      e.preventDefault();
      lightbox.open(items, i, a);
    }));
  }

  /* ---------- WhatsApp share (follows the current language) ---------- */

  const SHARE_TEXT = {
    en: [
      "You're invited — Sailakshmi & Dharmaveer are getting married",
      'Wednesday, 28 October 2026 · 10:34 PM',
      'Dr. Metla Satyanarayana Kapu Kalyana Mandapam, Gandu Veedhi, Amalapuram',
      'Please join us and bless the newlyweds.'
    ],
    te: [
      'సాయిలక్ష్మి ❖ ధర్మవీర్ పెండ్లి పిలుపు',
      'బుధవారము, 28 అక్టోబర్ 2026 · రాత్రి 10:34 గంటలకు సుముహూర్తం',
      'డా॥ మెట్ల సత్యనారాయణ కాపు కళ్యాణ మండపము, గండు వీధి, అమలాపురం',
      'తప్పక విచ్చేసి నూతన వధూవరులను ఆశీర్వదించగలరు.'
    ]
  };

  function updateShare() {
    const btn = $('#shareBtn');
    if (!btn) return;
    const url = /^https?:$/.test(location.protocol) ? location.href.split('#')[0] : '';
    const lang = root.dataset.lang === 'te' ? 'te' : 'en';
    const text = SHARE_TEXT[lang].concat(url ? [url] : []).join('\n');
    btn.href = 'https://wa.me/?text=' + encodeURIComponent(text);
  }

  /* ---------- language toggle: footer buttons, remembers choice ---------- */

  function applyLang(lang) {
    lang = lang === 'te' ? 'te' : 'en';
    root.setAttribute('data-lang', lang);
    root.lang = lang;
    try { localStorage.setItem('pelli-lang', lang); } catch (e) {}
    // aria-labels: elements can carry a per-lang label via data-aria-en/te
    $$('[data-aria-en]').forEach((el) => {
      const label = el.dataset['aria' + (lang === 'te' ? 'Te' : 'En')];
      if (label) el.setAttribute('aria-label', label);
    });
    $$('.lang-switch__btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.langSet === lang));
    });
    updateShare();
  }

  function initLang() {
    const start = root.dataset.lang === 'te' ? 'te' : 'en';
    applyLang(start);
    $$('.lang-switch__btn').forEach((btn) => {
      btn.addEventListener('click', () => applyLang(btn.dataset.langSet));
    });
  }

  /* ---------- optional background music (assets/music.mp3) ---------- */

  function initMusic() {
    const btn = $('#musicBtn');
    if (!btn || !/^https?:$/.test(location.protocol)) return;
    fetch('assets/music.mp3', { method: 'HEAD' }).then((res) => {
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !/audio|mpeg|octet-stream/.test(type)) return;
      btn.hidden = false;
      let audio = null;
      btn.addEventListener('click', () => {
        if (!audio) {
          audio = new Audio('assets/music.mp3');
          audio.loop = true;
          audio.volume = 0.55;
        }
        if (audio.paused) {
          audio.play().then(() => btn.setAttribute('aria-pressed', 'true')).catch(() => {});
        } else {
          audio.pause();
          btn.setAttribute('aria-pressed', 'false');
        }
      });
    }).catch(() => {});
  }

  /* ---------- start ---------- */

  safe('intro', () => {
    try {
      initIntro();
    } catch (err) {
      // Never leave the doors closed over the page.
      ['#intro', '#introSkip'].forEach((sel) => { const el = $(sel); if (el) el.remove(); });
      root.classList.remove('intro-active');
      const hero = $('#top');
      if (hero) hero.classList.remove('is-pre', 'is-revealing');
      throw err;
    }
  });
  safe('petals', initPetals);
  safe('pause offscreen', initPauseOffscreen);
  safe('split', initSplit);
  safe('reveal', initReveal);
  safe('scroll', initScroll);
  safe('hero parallax', initHeroParallax);
  safe('pointer fx', initPointerFx);
  safe('flip cards', initFlipCards);
  safe('countdown', initCountdown);
  const lightbox = safe('lightbox', createLightbox) || { open() {} };
  safe('god carousel', () => initGodCarousel(lightbox));
  safe('coverflow', () => initCoverflow(lightbox));
  safe('gallery', () => initGallery(lightbox));
  safe('lang', initLang);
  safe('music', initMusic);
})();
