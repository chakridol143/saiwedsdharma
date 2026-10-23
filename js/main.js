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

  const WEDDING = Date.UTC(2026, 9, 28, 17, 4, 0); // 28-10-2026, 22:34 IST

  function safe(name, fn) {
    try { return fn(); } catch (err) { console.error('[pelli] ' + name + ' failed', err); return undefined; }
  }

  const lang = () => (root.dataset.lang === 'te' ? 'te' : 'en');

  /* ---------- hero story: tap through, auto-advance, pause ---------- */

  function initStory() {
    const story = $('#story');
    if (!story) return;
    const frames = $$('.story__frame', story);
    const bars = $$('.story__bar', story);
    const pauseBtn = $('#storyPause');
    const hero = $('.hero');
    const dur = Number(story.dataset.interval) || 5200;
    story.style.setProperty('--story-dur', dur + 'ms');

    let index = 0;
    let userPaused = reducedMotion;
    let holdPaused = false;
    let offscreen = false;

    const load = (frame) => {
      if (!frame || frame.dataset.loaded) return;
      frame.dataset.loaded = '1';
      $$('[data-srcset]', frame).forEach((s) => { s.srcset = s.dataset.srcset; s.removeAttribute('data-srcset'); });
      $$('img[data-src]', frame).forEach((i) => { i.src = i.dataset.src; i.removeAttribute('data-src'); });
    };
    load(frames[0]);

    const paused = () => userPaused || holdPaused || offscreen || document.hidden;
    const syncPause = () => {
      story.classList.toggle('is-paused', paused());
      if (pauseBtn) {
        pauseBtn.setAttribute('aria-pressed', String(userPaused));
        const t = userPaused ? { en: 'Play the slideshow', te: 'స్లైడ్‌షో ప్రారంభించండి' } : { en: 'Pause the slideshow', te: 'స్లైడ్‌షో ఆపండి' };
        pauseBtn.dataset.ariaEn = t.en;
        pauseBtn.dataset.ariaTe = t.te;
        pauseBtn.setAttribute('aria-label', t[lang()]);
      }
    };

    const show = (next) => {
      index = (next + frames.length) % frames.length;
      load(frames[index]);
      load(frames[(index + 1) % frames.length]);
      frames.forEach((f, i) => f.classList.toggle('is-active', i === index));
      bars.forEach((b, i) => {
        b.classList.remove('is-active');
        b.classList.toggle('is-done', i < index);
      });
      const bar = bars[index];
      if (bar) {
        void bar.offsetWidth; // restart the fill animation
        bar.classList.add('is-active');
      }
    };

    bars.forEach((bar, i) => {
      bar.firstElementChild.addEventListener('animationend', () => {
        if (i === index && !reducedMotion) show(index + 1);
      });
    });

    $('.story__tap--next', story).addEventListener('click', () => show(index + 1));
    $('.story__tap--prev', story).addEventListener('click', () => show(index - 1));

    // press and hold to pause, like a story
    let holdTimer = 0;
    story.addEventListener('pointerdown', () => {
      holdTimer = setTimeout(() => { holdPaused = true; syncPause(); }, 220);
    });
    const release = () => {
      clearTimeout(holdTimer);
      if (holdPaused) { holdPaused = false; syncPause(); }
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((e) => story.addEventListener(e, release));
    story.addEventListener('contextmenu', (e) => { if (holdPaused) e.preventDefault(); });

    if (pauseBtn) pauseBtn.addEventListener('click', () => { userPaused = !userPaused; syncPause(); });
    document.addEventListener('visibilitychange', syncPause);

    if ('IntersectionObserver' in window && hero) {
      new IntersectionObserver(([entry]) => {
        offscreen = !entry.isIntersecting;
        hero.classList.toggle('is-off', offscreen);
        syncPause();
      }, { threshold: 0.15 }).observe(hero);
    }

    window.addEventListener('load', () => frames.forEach(load), { once: true });
    show(0);
    syncPause();
  }

  /* ---------- top bar + dock: appear once the hero is behind you ---------- */

  function initChrome() {
    const topbar = $('#topbar');
    const dock = $('#dock');
    const hero = $('.hero');
    if (!hero || !('IntersectionObserver' in window)) {
      if (topbar) topbar.classList.add('is-solid');
      if (dock) dock.classList.add('is-shown');
      return;
    }
    let pastHero = false;
    let atEnd = false;
    const sync = () => {
      if (topbar) topbar.classList.toggle('is-solid', pastHero);
      if (dock) dock.classList.toggle('is-shown', pastHero && !atEnd);
    };
    new IntersectionObserver(([entry]) => { pastHero = !entry.isIntersecting; sync(); },
      { rootMargin: '-70px 0px 0px 0px' }).observe(hero);
    const end = $('.closing__row');
    if (end) new IntersectionObserver(([entry]) => { atEnd = entry.isIntersecting; sync(); }).observe(end);
  }

  /* ---------- reveal on scroll ---------- */

  function initReveal() {
    const items = $$('[data-reveal]');
    if (reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
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
      put(el.days, pad(Math.floor(s / 86400)));
      put(el.hours, pad(Math.floor(s / 3600) % 24));
      put(el.minutes, pad(Math.floor(s / 60) % 60));
      put(el.seconds, pad(s % 60));
      setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
    };
    tick();
  }

  /* ---------- meet the couple: tap him or her ---------- */

  function initCouple() {
    const stage = $('#coupleStage');
    if (!stage) return;
    const people = { bride: $('#personBride'), groom: $('#personGroom') };
    const pick = (who) => {
      if (stage.dataset.pick === who) return;
      stage.dataset.pick = who;
      Object.keys(people).forEach((k) => { if (people[k]) people[k].hidden = k !== who; });
      $$('[data-pick]', stage).forEach((b) => {
        if (b !== stage) b.setAttribute('aria-pressed', String(b.dataset.pick === who));
      });
    };
    $$('button[data-pick]', stage).forEach((b) => b.addEventListener('click', () => pick(b.dataset.pick)));
  }

  /* ---------- lightbox (gallery and blessings) ---------- */

  function createLightbox() {
    const box = $('#lightbox');
    if (!box) return null;
    const img = $('#lbImg');
    const caption = $('#lbCaption');
    const count = $('#lbCount');
    let list = [];
    let at = 0;
    let opener = null;
    const webp = (() => { try { return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { return false; } })();

    const render = () => {
      const item = list[at];
      if (!item) return;
      img.classList.add('is-loading');
      const src = webp && item.src ? item.src : item.fallback;
      const pre = new Image();
      pre.onload = pre.onerror = () => {
        img.src = pre.src;
        img.width = item.w || pre.naturalWidth;
        img.height = item.h || pre.naturalHeight;
        img.classList.remove('is-loading');
      };
      pre.src = src;
      const text = item.label ? (item.label[lang()] || item.label.en) : '';
      img.alt = text;
      caption.textContent = text;
      count.textContent = (at + 1) + ' / ' + list.length;
      // warm the neighbours
      [list[at + 1], list[at - 1]].forEach((n) => { if (n) new Image().src = webp && n.src ? n.src : n.fallback; });
    };
    const go = (d) => { at = (at + d + list.length) % list.length; render(); };
    const close = () => {
      box.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(() => { box.hidden = true; img.removeAttribute('src'); }, 250);
      if (opener) opener.focus({ preventScroll: true });
    };
    const open = (items, start, from) => {
      list = items; at = start; opener = from || null;
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      render();
      requestAnimationFrame(() => box.classList.add('is-open'));
      $('#lbClose').focus({ preventScroll: true });
    };

    $('#lbClose').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', () => go(-1));
    $('#lbNext').addEventListener('click', () => go(1));
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Tab') { // keep focus inside the dialog
        const f = $$('button', box);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    // swipe left / right
    let sx = 0, sy = 0;
    box.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    box.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
    }, { passive: true });

    return { open };
  }

  function bindLightbox(lightbox, selector, labelOf) {
    const links = $$(selector);
    if (!lightbox || !links.length) return;
    const items = links.map((a) => ({
      src: a.dataset.src,
      fallback: a.getAttribute('href'),
      w: Number(a.dataset.w) || 0,
      h: Number(a.dataset.h) || 0,
      label: labelOf(a)
    }));
    links.forEach((a, i) => a.addEventListener('click', (e) => {
      e.preventDefault();
      lightbox.open(items, i, a);
    }));
  }

  /* ---------- akshintalu shower: rice grains and petals, on tap ---------- */

  function initShower() {
    const btn = $('#showerBtn');
    if (!btn) return;
    let running = false;
    btn.addEventListener('click', () => {
      if (running) return;
      if (reducedMotion) { btn.animate && btn.animate([{ transform: 'scale(1.06)' }, { transform: 'none' }], 300); return; }
      running = true;
      const canvas = document.createElement('canvas');
      canvas.className = 'shower-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth, H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      const r = btn.getBoundingClientRect();
      const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
      const colors = ['#f6d36b', '#f2c14e', '#ffe7a3', '#e8a11f', '#f6d36b', '#d9452b', '#ff8a3d'];
      const N = W < 600 ? 90 : 140;
      const bits = [];
      for (let i = 0; i < N; i++) {
        const fromSky = i % 3 === 0; // a third rain down from the top of the screen
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
        const v = 7 + Math.random() * 9;
        const c = colors[(Math.random() * colors.length) | 0];
        bits.push({
          x: fromSky ? Math.random() * W : ox,
          y: fromSky ? -20 - Math.random() * H * 0.4 : oy,
          vx: fromSky ? (Math.random() - 0.5) * 1.5 : Math.cos(a) * v,
          vy: fromSky ? 2 + Math.random() * 3 : Math.sin(a) * v,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
          petal: c === '#d9452b' || c === '#ff8a3d',
          s: 0.8 + Math.random() * 0.8,
          c
        });
      }
      const start = performance.now();
      const frame = (now) => {
        const t = now - start;
        ctx.clearRect(0, 0, W, H);
        ctx.globalAlpha = t > 2600 ? Math.max(0, 1 - (t - 2600) / 700) : 1;
        for (const b of bits) {
          b.vy += 0.22; b.vx *= 0.985; b.vy *= 0.985;
          b.x += b.vx + Math.sin((t + b.rot * 300) / 260) * 0.4;
          b.y += b.vy; b.rot += b.vr;
          ctx.save();
          ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.scale(b.s, b.s);
          ctx.fillStyle = b.c;
          ctx.beginPath();
          if (b.petal) ctx.ellipse(0, 0, 6, 3.6, 0, 0, 6.283);
          else ctx.ellipse(0, 0, 4.2, 1.8, 0, 0, 6.283);
          ctx.fill();
          ctx.restore();
        }
        if (t < 3300) requestAnimationFrame(frame);
        else { canvas.remove(); running = false; }
      };
      requestAnimationFrame(frame);
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
    });
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
    const text = SHARE_TEXT[lang()].concat(url ? [url] : []).join('\n');
    btn.href = 'https://wa.me/?text=' + encodeURIComponent(text);
  }

  /* ---------- language toggle: top bar + footer, remembers choice ---------- */

  function applyLang(next) {
    next = next === 'te' ? 'te' : 'en';
    root.setAttribute('data-lang', next);
    root.lang = next;
    try { localStorage.setItem('pelli-lang', next); } catch (e) {}
    // aria-labels: elements can carry a per-lang label via data-aria-en/te
    $$('[data-aria-en]').forEach((el) => {
      const label = el.dataset['aria' + (next === 'te' ? 'Te' : 'En')];
      if (label) el.setAttribute('aria-label', label);
    });
    $$('[data-lang-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langSet === next)));
    updateShare();
  }

  function initLang() {
    applyLang(lang());
    $$('[data-lang-set]').forEach((btn) => btn.addEventListener('click', () => applyLang(btn.dataset.langSet)));
  }

  /* ---------- start ---------- */

  safe('lang', initLang);
  safe('story', initStory);
  safe('chrome', initChrome);
  safe('reveal', initReveal);
  safe('countdown', initCountdown);
  safe('couple', initCouple);
  safe('shower', initShower);
  safe('lightbox', () => {
    const lightbox = createLightbox();
    bindLightbox(lightbox, '#galleryGrid .shot', (a) => {
      const alt = $('img', a);
      return alt ? { en: alt.alt, te: '' } : null;
    });
    bindLightbox(lightbox, '#godGrid .arch', (a) => ({ en: a.dataset.en, te: a.dataset.te }));
  });
})();
