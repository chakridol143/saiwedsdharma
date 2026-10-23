/* ==========================================================================
   సాయిలక్ష్మి ❖ ధర్మవీర్ — పెండ్లి పిలుపు
   Plain JavaScript + GSAP (ScrollTrigger, SplitText) from js/vendor.
   Each feature starts on its own, so if one fails the rest of the page (and
   all of its content) still works. Without GSAP, or with reduced motion,
   every section falls back to a calm, static layout.
   ========================================================================== */
(function () {
  'use strict';

  window.__pelli = true; // tells the loader failsafe in <head> that we started

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LANG_SWITCH = false; // keep in step with the flag in index.html <head>
  const WEDDING = Date.UTC(2026, 9, 28, 17, 4, 0); // 28-10-2026, 22:34 IST
  const MAP_URL = 'https://maps.app.goo.gl/zeCjRQWN1eaNN1hv5';
  const MUSIC_SRC = 'assets/music.mp3';
  const OPENED_KEY = 'pelli-opened';

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const SplitText = window.SplitText;
  const motion = !!(gsap && ScrollTrigger) && !reducedMotion;
  if (gsap && ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    if (SplitText) gsap.registerPlugin(SplitText);
    ScrollTrigger.config({ ignoreMobileResize: true });
    root.classList.add('has-gsap');
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  const store = {
    get(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch (e) { /* private mode */ } }
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const lang = () => (root.dataset.lang === 'te' ? 'te' : 'en');
  // the visible-language span inside an element (for text splitting)
  const langSpan = (el) => $(':scope > .t-' + lang(), el) || el;

  function safe(name, fn) {
    try { return fn(); } catch (err) { console.error('[pelli] ' + name + ' failed', err); return undefined; }
  }

  const split = (el, type, opts = {}) => {
    if (!SplitText || !el) return null;
    return SplitText.create(el, Object.assign({ type, charsClass: 'char', wordsClass: 'word', linesClass: 'line' }, opts));
  };

  /* ---------- background music (assets/music.mp3, only if it exists) ---------- */

  const music = (function () {
    const btn = $('#musicBtn');
    const audio = $('#bgm');
    let available = null; // null = still checking
    let resumeOnShow = false;

    const setUI = (on) => {
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Pause music' : 'Play music');
    };
    const fade = (to, done) => {
      if (gsap) gsap.to(audio, { volume: to, duration: to ? 2.2 : .6, ease: 'none', onComplete: done });
      else { audio.volume = to; if (done) done(); }
    };
    const play = () => {
      if (!audio || available === false) return;
      if (!audio.getAttribute('src')) audio.src = MUSIC_SRC;
      audio.volume = 0;
      const p = audio.play();
      if (p && p.then) p.then(() => { setUI(true); fade(.6); }).catch(() => setUI(false));
    };
    const pause = () => {
      if (!audio) return;
      setUI(false);
      fade(0, () => audio.pause());
    };
    const playing = () => audio && !audio.paused;

    if (audio && btn) {
      fetch(MUSIC_SRC, { method: 'HEAD' }).then((res) => {
        const type = res.headers.get('content-type') || '';
        available = res.ok && /audio|mpeg|mp4|octet-stream/.test(type);
        btn.hidden = !available;
      }).catch(() => { available = false; });
      audio.addEventListener('error', () => { available = false; btn.hidden = true; setUI(false); });
      btn.addEventListener('click', () => (playing() ? pause() : play()));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && playing()) { resumeOnShow = true; audio.pause(); }
        else if (!document.hidden && resumeOnShow) { resumeOnShow = false; audio.play().catch(() => setUI(false)); }
      });
    }
    return { play };
  })();

  /* ---------- hero story: tap through, auto-advance, pause ---------- */

  const story = (function () {
    const el = $('#story');
    if (!el) return { intro() {}, setOffscreen() {} };
    const frames = $$('.story__frame', el);
    const bars = $$('.story__bar', el);
    const pauseBtn = $('#storyPause');
    const hero = $('.hero');
    const dur = Number(el.dataset.interval) || 5200;
    el.style.setProperty('--story-dur', dur + 'ms');

    let index = 0;
    let started = false;
    let userPaused = reducedMotion;
    let holdPaused = false;
    let offscreen = false;
    let drift = null;

    const load = (frame) => {
      if (!frame || frame.dataset.loaded) return;
      frame.dataset.loaded = '1';
      $$('[data-srcset]', frame).forEach((s) => { s.srcset = s.dataset.srcset; s.removeAttribute('data-srcset'); });
      $$('img[data-src]', frame).forEach((i) => { i.src = i.dataset.src; i.removeAttribute('data-src'); });
    };
    load(frames[0]);

    const paused = () => !started || userPaused || holdPaused || offscreen || document.hidden;
    const syncPause = () => {
      el.classList.toggle('is-paused', paused());
      if (drift) drift[paused() ? 'pause' : 'resume']();
      if (pauseBtn) {
        pauseBtn.setAttribute('aria-pressed', String(userPaused));
        pauseBtn.setAttribute('aria-label', userPaused ? 'Play the slideshow' : 'Pause the slideshow');
      }
    };

    const restartBar = () => {
      bars.forEach((b, i) => { b.classList.remove('is-active'); b.classList.toggle('is-done', i < index); });
      const bar = bars[index];
      if (bar) { void bar.offsetWidth; bar.classList.add('is-active'); }
    };

    const kenBurns = (img) => {
      if (!motion) return;
      if (drift) drift.kill();
      drift = gsap.to(img, { scale: 1, duration: dur / 1000 + 1.5, ease: 'none' });
      if (paused()) drift.pause();
    };

    const popSticker = (frame, delay) => {
      const sticker = $('.sticker', frame);
      if (!motion || !sticker) return;
      const rot = parseFloat(getComputedStyle(sticker).getPropertyValue('--rot')) || 0;
      gsap.fromTo(sticker, { scale: 0, rotation: rot - 28, autoAlpha: 0 },
        { scale: 1, rotation: rot, autoAlpha: 1, duration: .9, delay, ease: 'back.out(2.2)' });
    };

    // origin: [x%, y%] where the new photo opens from (the tap point)
    const show = (next, origin) => {
      const from = index;
      index = (next + frames.length) % frames.length;
      const target = frames[index];
      load(target);
      load(frames[(index + 1) % frames.length]);
      restartBar();
      if (!motion) {
        frames.forEach((f, i) => f.classList.toggle('is-active', i === index));
        return;
      }
      const prev = frames[from];
      const img = $('img', target);
      frames.forEach((f) => {
        if (f !== prev && f !== target) { f.classList.remove('is-active', 'is-under'); gsap.set(f, { clearProps: 'clipPath' }); }
      });
      prev.classList.remove('is-active');
      prev.classList.add('is-under');
      target.classList.remove('is-under');
      target.classList.add('is-active');
      const [ox, oy] = origin || [86, 52];
      gsap.killTweensOf([target, img]);
      gsap.fromTo(target, { clipPath: `circle(0% at ${ox}% ${oy}%)` }, {
        clipPath: `circle(150% at ${ox}% ${oy}%)`, duration: 1.05, ease: 'power3.inOut',
        onComplete: () => { prev.classList.remove('is-under'); gsap.set(target, { clearProps: 'clipPath' }); }
      });
      gsap.fromTo(img, { scale: 1.3 }, { scale: 1.07, duration: 1.4, ease: 'power3.out', onComplete: () => kenBurns(img) });
      popSticker(target, .4);
    };

    bars.forEach((bar, i) => {
      bar.firstElementChild.addEventListener('animationend', () => {
        if (i === index && !reducedMotion) show(index + 1);
      });
    });

    const originOf = (e) => {
      const r = el.getBoundingClientRect();
      if (!e || !e.clientX) return null;
      return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
    };
    $('.story__tap--next', el).addEventListener('click', (e) => show(index + 1, originOf(e)));
    $('.story__tap--prev', el).addEventListener('click', (e) => show(index - 1, originOf(e)));

    // press and hold to pause, like a story
    let holdTimer = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button:not(.story__tap)')) return;
      holdTimer = setTimeout(() => { holdPaused = true; syncPause(); }, 240);
    });
    const release = () => { clearTimeout(holdTimer); if (holdPaused) { holdPaused = false; syncPause(); } };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, release));
    el.addEventListener('contextmenu', (e) => { if (holdPaused) e.preventDefault(); });

    if (pauseBtn) pauseBtn.addEventListener('click', () => { userPaused = !userPaused; syncPause(); });
    document.addEventListener('visibilitychange', syncPause);
    window.addEventListener('load', () => frames.forEach(load), { once: true });
    syncPause();

    return {
      // called when the loader opens
      intro() {
        started = true;
        restartBar();
        syncPause();
        if (motion) {
          const img = $('img', frames[0]);
          gsap.fromTo(img, { scale: 1.35 }, { scale: 1.07, duration: 2, ease: 'power3.out', onComplete: () => kenBurns(img) });
          popSticker(frames[0], 1.1);
        }
      },
      setOffscreen(v) {
        if (v === offscreen) return;
        offscreen = v;
        if (hero) hero.classList.toggle('is-off', v);
        syncPause();
      }
    };
  })();

  /* ---------- hero entrance (after the loader) ---------- */

  const heroIntro = (function () {
    if (!motion) return () => {};
    const content = $('.hero__content');
    const names = $$('.hero__name').map((n) => split(langSpan(n), 'chars'));
    const chars = names.filter(Boolean).flatMap((s) => s.chars);
    const pieces = ['.hero__kicker', '.hero__when', '.hero__ctas', '.story__head', '.story__bars'].map((s) => $(s)).filter(Boolean);
    const amp = $('.hero__amp');
    const badge = $('.badge');
    gsap.set(chars, { yPercent: 115, rotate: 8, autoAlpha: 0 });
    gsap.set(pieces, { y: 24, autoAlpha: 0 });
    gsap.set(amp, { scale: 0, rotate: -40, autoAlpha: 0 });
    gsap.set(badge, { scale: 0, rotate: -120, autoAlpha: 0 });
    if (content) content.style.visibility = 'visible';
    return () => {
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      tl.to('.story__bars, .story__head', { y: 0, autoAlpha: 1, duration: .8, stagger: .08 }, .1)
        .to('.hero__kicker', { y: 0, autoAlpha: 1, duration: .8 }, .35)
        .to(chars, { yPercent: 0, rotate: 0, autoAlpha: 1, duration: 1.1, stagger: .035 }, .45)
        .to(amp, { scale: 1, rotate: 0, autoAlpha: 1, duration: 1, ease: 'back.out(2)' }, .8)
        .to(['.hero__when', '.hero__ctas'], { y: 0, autoAlpha: 1, duration: .9, stagger: .1 }, 1)
        .to(badge, { scale: 1, rotate: 0, autoAlpha: 1, duration: 1.2, ease: 'back.out(1.6)' }, 1.1);
    };
  })();

  /* ---------- loader: rings draw, count to 100, then "open the invitation" ---------- */

  function initLoader() {
    const loader = $('#loader');
    const finish = () => {
      root.classList.remove('is-loading');
      if (loader) loader.remove();
      story.intro();
      heroIntro();
      if (ScrollTrigger) ScrollTrigger.refresh();
    };
    if (!loader) { finish(); return; }

    const bar = $('#loaderBar');
    const pct = $('#loaderPct');
    const btn = $('#loaderOpen');
    const returning = !!store.get(OPENED_KEY);
    const heroImg = $('.story__frame img');

    const imgReady = (img) => new Promise((res) => {
      if (!img || (img.complete && img.naturalWidth)) return res();
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    });
    const ready = Promise.race([
      Promise.all([imgReady(heroImg), document.fonts ? document.fonts.ready : null, wait(returning ? 400 : 1900)]),
      wait(6000)
    ]);

    const counter = { v: 0 };
    const paint = () => {
      const v = Math.round(counter.v);
      if (pct) pct.textContent = v;
      if (bar) bar.style.transform = 'scaleX(' + (v / 100) + ')';
    };
    let crawl = null;
    if (gsap) crawl = gsap.to(counter, { v: 88, duration: returning ? .5 : 1.8, ease: 'power1.out', onUpdate: paint });

    let opened = false;
    const open = (withMusic) => {
      if (opened) return;
      opened = true;
      store.set(OPENED_KEY, '1');
      if (withMusic) music.play(); // inside the tap, so phones allow the sound
      if (!motion) { finish(); return; }
      const tl = gsap.timeline({ onComplete: finish });
      tl.to('.loader__center', { y: -30, autoAlpha: 0, duration: .55, ease: 'power2.in' })
        .to('.loader__panel--top', { yPercent: -100, duration: 1.1, ease: 'power4.inOut' }, .3)
        .to('.loader__panel--bot', { yPercent: 100, duration: 1.1, ease: 'power4.inOut' }, .3);
      // start the hero a touch early so it is already moving as the panels part
      tl.call(() => { story.intro(); heroIntro(); story.intro = () => {}; }, null, .75);
      tl.eventCallback('onComplete', () => {
        root.classList.remove('is-loading');
        loader.remove();
        ScrollTrigger.refresh();
      });
    };

    ready.then(() => {
      if (crawl) crawl.kill();
      const done = () => {
        if (returning || !btn) { open(false); return; }
        btn.hidden = false;
        if (gsap) gsap.fromTo(btn, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .7, ease: 'back.out(1.8)' });
        btn.focus({ preventScroll: true });
      };
      if (gsap) gsap.to(counter, { v: 100, duration: .45, ease: 'power2.out', onUpdate: paint, onComplete: done });
      else { counter.v = 100; paint(); done(); }
    });
    if (btn) btn.addEventListener('click', () => open(true));
  }

  /* ---------- top bar, dock, and pausing the story once it is covered ---------- */

  function initChrome() {
    const topbar = $('#topbar');
    const dock = $('#dock');
    const invite = $('#invite');
    let atEnd = false;
    let ticking = false;
    const sync = () => {
      ticking = false;
      const top = invite ? invite.getBoundingClientRect().top : 0;
      const past = top < 72;
      if (topbar) topbar.classList.toggle('is-solid', past);
      if (dock) dock.classList.toggle('is-shown', past && !atEnd);
      story.setOffscreen(top <= 0);
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } }, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    const end = $('.closing__row');
    if (end && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { atEnd = entry.isIntersecting; sync(); }).observe(end);
    }
    sync();
  }

  /* ---------- small fade-ups ---------- */

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

  /* ---------- scroll choreography (GSAP + ScrollTrigger) ---------- */

  function initScenes() {
    if (!motion) return;

    // the invite slides up over the hero, which sinks back and dims
    const invite = $('#invite');
    const coverST = { trigger: invite, start: 'top bottom', end: 'top top', scrub: true };
    gsap.to('.hero', { scale: .9, borderRadius: 28, ease: 'none', scrollTrigger: coverST });
    gsap.to('.hero__dim', { opacity: .72, ease: 'none', scrollTrigger: coverST });
    gsap.to('.hero__content', { y: -70, ease: 'none', scrollTrigger: coverST });

    // section titles: words rise out of their lines
    $$('[data-split]').forEach((title) => {
      const s = split(langSpan(title), 'lines,words', { mask: 'lines' });
      if (!s) return;
      gsap.from(s.words, {
        yPercent: 110, duration: 1.1, stagger: .07, ease: 'power4.out',
        scrollTrigger: { trigger: title, start: 'top 86%' }
      });
    });

    // long sentences light up word by word as you scroll
    $$('[data-words]').forEach((p) => {
      const s = split(langSpan(p), 'words');
      if (!s) return;
      gsap.fromTo(s.words, { opacity: .16 }, {
        opacity: 1, stagger: .12, ease: 'none',
        scrollTrigger: { trigger: p, start: 'top 82%', end: 'bottom 52%', scrub: true }
      });
    });

    // 01 · the big date
    const bigdate = $('#bigdate');
    if (bigdate) {
      const tl = gsap.timeline({ scrollTrigger: { trigger: bigdate, start: 'top 80%' } });
      tl.from('.bigdate__line', { scaleX: 0, duration: 1.2, ease: 'power3.inOut', stagger: .1 }, 0)
        .from('.bigdate__top, .bigdate__bot', { y: 14, autoAlpha: 0, duration: .7, stagger: .08 }, .4);
      const dm = split($('.bigdate__dm', bigdate), 'chars');
      const yr = split($('.bigdate__yr', bigdate), 'chars');
      if (dm) tl.from(dm.chars, { yPercent: 105, rotate: 12, autoAlpha: 0, duration: 1.1, ease: 'power4.out', stagger: .06 }, .15);
      if (yr) tl.from(yr.chars, { yPercent: 105, rotate: -10, autoAlpha: 0, duration: 1.1, ease: 'power4.out', stagger: .07 }, .45);
      gsap.from('.timer__cell', {
        y: 34, scale: .9, autoAlpha: 0, duration: .8, ease: 'back.out(1.8)', stagger: .08,
        scrollTrigger: { trigger: '.timer__row', start: 'top 88%' }
      });
    }

    // 02 · the couple photo opens up like a palace window
    const photo = $('#couplePhoto');
    if (photo) {
      const st = { trigger: photo, start: 'top 92%', end: 'top 30%', scrub: .6 };
      gsap.fromTo(photo, { clipPath: 'inset(16% 12% 16% 12% round 120px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: st });
      gsap.fromTo($('img', photo), { scale: 1.35 }, { scale: 1, ease: 'none', scrollTrigger: st });
      gsap.from('.spot', { scale: 0, autoAlpha: 0, duration: .8, ease: 'back.out(2.4)', stagger: .15, scrollTrigger: { trigger: photo, start: 'top 45%' } });
      gsap.from('.couple__panel', { y: 40, autoAlpha: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: '.couple__panel', start: 'top 90%' } });
    }

    // photo break: the sunset zooms out and 10:34 rises
    const brk = $('#break');
    if (brk) {
      gsap.fromTo('.break__img', { scale: 1.28 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: brk, start: 'top bottom', end: 'bottom top', scrub: true } });
      const digits = split($('.break__digits', brk), 'chars');
      const tl = gsap.timeline({ scrollTrigger: { trigger: brk, start: 'top 75%', end: 'top 15%', scrub: .6 } });
      if (digits) tl.from(digits.chars, { yPercent: 120, autoAlpha: 0, stagger: .12, ease: 'power3.out' }, 0);
      tl.from('.break__time small', { autoAlpha: 0, x: -10 }, .3)
        .from('.break__date', { letterSpacing: '.9em', autoAlpha: 0, ease: 'power2.out' }, 0);
    }

    // 03 · the night: the moon rises, the timeline draws itself
    const night = $('#events');
    if (night) {
      gsap.fromTo('.moon', { y: 160, rotate: -30, autoAlpha: 0 }, { y: 0, rotate: 0, autoAlpha: .9, ease: 'none', scrollTrigger: { trigger: night, start: 'top bottom', end: 'top 20%', scrub: true } });
      gsap.to('.timeline__line i', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '#timeline', start: 'top 70%', end: 'bottom 70%', scrub: true } });
      $$('.moment', night).forEach((m) => {
        gsap.from(m, { x: 50, autoAlpha: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: m, start: 'top 85%' } });
        ScrollTrigger.create({ trigger: m, start: 'top 70%', onEnter: () => m.classList.add('is-lit'), onLeaveBack: () => m.classList.remove('is-lit') });
      });
      gsap.from('#venue', { y: 60, scale: .95, autoAlpha: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '#venue', start: 'top 88%' } });
    }
  }

  /* ---------- 04 · gallery: a film reel that rolls sideways ---------- */

  function initReel(lightboxItems) {
    const reel = $('#gallery');
    const track = $('#reelTrack');
    if (!reel || !track) return;
    const frames = $$('.frame', track);
    const total = $('#reelTotal');
    const now = $('#reelNow');
    const chapter = $('#reelChapter');
    const progress = $('#reelProgress');
    if (total) total.textContent = String(frames.length).padStart(2, '0');

    let current = '';
    const setChapter = (name) => {
      if (!chapter || name === current) return;
      current = name;
      if (motion) {
        gsap.to(chapter, {
          yPercent: -60, autoAlpha: 0, duration: .2, ease: 'power2.in',
          onComplete: () => { chapter.textContent = name; gsap.fromTo(chapter, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: .35, ease: 'power3.out' }); }
        });
      } else chapter.textContent = name;
    };
    const setFrame = (i) => { if (now) now.textContent = String(i + 1).padStart(2, '0'); };

    if (!motion) {
      // plain swipeable strip; keep the counter honest as it scrolls
      const viewport = $('.reel__viewport', reel);
      if (viewport && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = frames.indexOf(e.target);
          setFrame(i);
          setChapter(e.target.dataset.chapter);
        }), { root: viewport, threshold: .6 });
        frames.forEach((f) => io.observe(f));
      }
      return;
    }

    reel.classList.add('is-pinned');
    const viewport = $('.reel__viewport', reel);
    const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
    const roll = gsap.to(track, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: {
        trigger: reel, start: 'top top', end: () => '+=' + distance(),
        pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: (self) => { if (progress) progress.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')'; }
      }
    });

    // depth: each photo drifts inside its frame; chapter numbers move faster
    frames.forEach((f, i) => {
      const img = $('img', f);
      gsap.fromTo(img, { xPercent: -6 }, { xPercent: 6, ease: 'none', scrollTrigger: { trigger: f, containerAnimation: roll, start: 'left right', end: 'right left', scrub: true } });
      ScrollTrigger.create({
        trigger: f, containerAnimation: roll, start: 'left 62%', end: 'right 38%',
        onToggle: (self) => { if (self.isActive) { setFrame(i); setChapter(f.dataset.chapter); } }
      });
      // keyboard users: bring a focused photo into view
      f.addEventListener('focus', () => {
        const st = roll.scrollTrigger;
        const x = Math.min(distance(), Math.max(0, f.offsetLeft - viewport.clientWidth / 2 + f.offsetWidth / 2));
        window.scrollTo(0, st.start + x);
      });
    });
    $$('.chapcard', track).forEach((c) => {
      gsap.fromTo($('.chapcard__n', c), { x: 90 }, { x: -90, ease: 'none', scrollTrigger: { trigger: c, containerAnimation: roll, start: 'left right', end: 'right left', scrub: true } });
      gsap.from($('.chapcard__t', c), { y: 40, autoAlpha: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: c, containerAnimation: roll, start: 'left 85%' } });
    });
    gsap.from('.reel__head > *', { y: 30, autoAlpha: 0, duration: .9, stagger: .08, ease: 'power3.out', scrollTrigger: { trigger: reel, start: 'top 75%' } });
  }

  /* ---------- 05 · blessings: the divine couples rise one after another ---------- */

  function initDivine() {
    const divine = $('#divine');
    if (!divine || !motion) return;
    divine.classList.add('is-deck');
    const cards = $$('.deity', divine);
    const shades = cards.map((c) => $('.deity__shade', c));
    const names = $$('.deity__name', divine);
    const dots = $$('.deck__dots i', divine);
    const mandala = $('.mandala', divine);
    const steps = cards.length - 1;

    gsap.set(mandala, { xPercent: -50, yPercent: -50, x: 0, y: 0, transformOrigin: '50% 50%' });
    cards.forEach((c, i) => { if (i) gsap.set(c, { yPercent: 135, rotation: i % 2 ? 9 : -9 }); });

    let active = 0;
    const setActive = (k) => {
      if (k === active) return;
      active = k;
      names.forEach((n, i) => n.classList.toggle('is-on', i === k));
      dots.forEach((d, i) => d.classList.toggle('is-on', i === k));
    };

    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      scrollTrigger: {
        trigger: divine, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * .85 * steps),
        pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: (self) => setActive(Math.min(steps, Math.max(0, Math.floor(self.progress * steps + .5))))
      }
    });
    for (let i = 1; i <= steps; i++) {
      const at = i - 1;
      tl.to(cards[i], { yPercent: 0, rotation: 0, duration: 1 }, at);
      for (let j = 0; j < i; j++) {
        const depth = i - j;
        tl.to(cards[j], { scale: 1 - .07 * depth, yPercent: -7 * depth, rotation: (j % 2 ? 3 : -3) * depth, duration: 1 }, at);
        tl.to(shades[j], { opacity: Math.min(.7, .28 * depth), duration: 1 }, at);
      }
    }
    tl.to(mandala, { rotation: 140, ease: 'none', duration: steps }, 0);
    gsap.from('.divine__head > *', { y: 30, autoAlpha: 0, duration: .9, stagger: .08, ease: 'power3.out', scrollTrigger: { trigger: divine, start: 'top 75%' } });
    gsap.from('#godDeck', { y: 120, scale: .88, autoAlpha: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: divine, start: 'top 60%' } });
  }

  /* ---------- 06 · family + closing ---------- */

  function initFamilyAndClosing() {
    if (!motion) return;
    $$('.names').forEach((block) => {
      gsap.from($$('.pair', block), { y: 16, autoAlpha: 0, duration: .6, stagger: .07, ease: 'power2.out', scrollTrigger: { trigger: block, start: 'top 82%' } });
    });
    gsap.from('.host__calls .btn', { y: 20, autoAlpha: 0, duration: .7, stagger: .12, ease: 'back.out(1.8)', scrollTrigger: { trigger: '.host__calls', start: 'top 92%' } });
    gsap.from('#note', { y: -60, rotation: -14, autoAlpha: 0, duration: 1.1, ease: 'back.out(1.6)', scrollTrigger: { trigger: '#note', start: 'top 88%' } });

    const ganesha = $('#closingGanesha');
    if (ganesha) {
      gsap.fromTo(ganesha, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: { trigger: ganesha, start: 'top 95%', end: 'top 45%', scrub: .6 } });
      gsap.fromTo($('img', ganesha), { scale: 1.3 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: ganesha, start: 'top 95%', end: 'top 45%', scrub: .6 } });
    }
    const mangalam = $('#mangalam');
    if (mangalam) {
      gsap.from(mangalam, { y: 40, scale: .92, autoAlpha: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: mangalam, start: 'top 88%' } });
      ScrollTrigger.create({ trigger: mangalam, start: 'top bottom', end: 'bottom top', toggleClass: 'is-shimmer' });
    }
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
      const card = people[who];
      if (motion && card) gsap.fromTo(card, { y: 18, autoAlpha: 0, rotateX: -12 }, { y: 0, autoAlpha: 1, rotateX: 0, duration: .55, ease: 'power3.out' });
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

  /* ---------- akshintalu shower: rice grains and petals ---------- */

  function shower(originEl, amount) {
    if (reducedMotion) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'shower-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const r = originEl ? originEl.getBoundingClientRect() : null;
    const ox = r ? r.left + r.width / 2 : W / 2, oy = r ? r.top + r.height / 2 : -20;
    const colors = ['#f6d36b', '#f2c14e', '#ffe7a3', '#e8a11f', '#f6d36b', '#d9452b', '#ff8a3d'];
    const N = amount || (W < 600 ? 90 : 140);
    const bits = [];
    for (let i = 0; i < N; i++) {
      const fromSky = !r || i % 3 === 0;
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
    const frame = (nowT) => {
      const t = nowT - start;
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
      else canvas.remove();
    };
    requestAnimationFrame(frame);
  }

  function initShower() {
    const btn = $('#showerBtn');
    if (!btn) return;
    let busy = false;
    btn.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      setTimeout(() => { busy = false; }, 1200);
      shower(btn);
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
    });
    // a gentle sprinkle the first time the closing blessing comes into view
    if (motion) ScrollTrigger.create({ trigger: '#mangalam', start: 'top 70%', once: true, onEnter: () => shower(null, 50) });
  }

  /* ---------- WhatsApp share ---------- */

  const SHARE_TEXT = {
    en: [
      "You're invited — Sailakshmi & Dharmaveer are getting married",
      'Wednesday, 28 October 2026 · 10:34 PM',
      'Dr. Metla Satyanarayana Kapu Kalyana Mandapam, Gandu Veedhi, Amalapuram',
      'Location: ' + MAP_URL,
      'Please join us and bless the newlyweds.'
    ],
    te: [
      'సాయిలక్ష్మి ❖ ధర్మవీర్ పెండ్లి పిలుపు',
      'బుధవారము, 28 అక్టోబర్ 2026 · రాత్రి 10:34 గంటలకు సుముహూర్తం',
      'డా॥ మెట్ల సత్యనారాయణ కాపు కళ్యాణ మండపము, గండు వీధి, అమలాపురం',
      MAP_URL,
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

  /* ---------- language (switch hidden for now: always English) ---------- */

  function applyLang(next) {
    next = LANG_SWITCH && next === 'te' ? 'te' : 'en';
    root.setAttribute('data-lang', next);
    root.lang = next;
    if (LANG_SWITCH) { try { localStorage.setItem('pelli-lang', next); } catch (e) {} }
    $$('[data-aria-en]').forEach((el) => {
      const label = el.dataset['aria' + (next === 'te' ? 'Te' : 'En')];
      if (label) el.setAttribute('aria-label', label);
    });
    $$('[data-lang-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langSet === next)));
    updateShare();
  }

  function initLang() {
    applyLang(lang());
    if (!LANG_SWITCH) return;
    $$('[data-lang-set]').forEach((btn) => btn.addEventListener('click', () => {
      applyLang(btn.dataset.langSet);
      if (ScrollTrigger) ScrollTrigger.refresh();
    }));
  }

  /* ---------- start (scroll scenes in page order, so pins measure right) ---------- */

  safe('lang', initLang);
  safe('chrome', initChrome);
  safe('reveal', initReveal);
  safe('countdown', initCountdown);
  safe('couple', initCouple);
  safe('scenes', initScenes);
  safe('reel', initReel);
  safe('divine', initDivine);
  safe('family', initFamilyAndClosing);
  safe('shower', initShower);
  safe('lightbox', () => {
    const lightbox = createLightbox();
    bindLightbox(lightbox, '#reelTrack .frame', (a) => {
      const im = $('img', a);
      return im ? { en: im.alt, te: '' } : null;
    });
    bindLightbox(lightbox, '#godDeck .deity', (a) => ({ en: a.dataset.en, te: a.dataset.te }));
  });
  safe('loader', initLoader);
  if (document.fonts && ScrollTrigger) document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
