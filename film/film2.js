/* Sai & Dharma — invitation film, second direction.
   The website's own sections become front-on, screen-filling scenes, in the site's order: the hero
   (the uyyala photo and the names), one brief angled view of the page, the couple, the ceremony card,
   the reception card and the gallery. The gallery ends on one photograph, which becomes the photo of
   the closing invitation card. Same capture and shaders as film.js; every frame is computed from time
   in seek(t).

   URL params: w, h (output size), mb (motion-blur subframes), fps. */
'use strict';
(async function () {
  const Q = new URLSearchParams(location.search);
  const W = +Q.get('w') || 1080, H = +Q.get('h') || 1920;
  const SUB = Math.max(1, +Q.get('mb') || 1);
  const FPS = +Q.get('fps') || 60;
  const K = W / 1080;                       // designed at 1080 x 1920
  const DUR = 20;
  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  gl.getExtension('EXT_color_buffer_float');

  /* ---------------- design constants ---------------- */
  const PAGE_W = 390;                       // world units = page CSS px
  const F = 1240 * K;                       // focal length, output px
  const DOF = { front: 10 * K, back: 3 * K, cap: 24 * K };   // a light touch: no heavy depth blur
  const FLOOR_MID = [0xfb / 255, 0xf6 / 255, 0xec / 255];
  const FLOOR_EDGE = [0xee / 255, 0xe2 / 255, 0xcd / 255];
  const HAZE = [0xf8 / 255, 0xf1 / 255, 0xe5 / 255];
  const FOG = [1400, 5200, 0.6];            // depth near, far, max mix
  const SHADOW_TINT = [0x1a / 255, 0x21 / 255, 0x33 / 255, 1];
  const GOLD = [0xf5 / 255, 0xb5 / 255, 0x44 / 255, 1];
  // camera distance at which the page width just fills the frame (a few px of page edge cropped)
  const D_FILL = PAGE_W * 1240 / 1080 * 0.985;

  /* ---------------- helpers ---------------- */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const smoother = (u) => { u = clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
  const easeOut = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
  const lerp = (a, b, u) => a + (b - a) * u;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

  /* ---------------- shots ----------------
     A hold frames a section front-on (y, x: page point at the frame centre; d: camera distance as a
     multiple of D_FILL) and drifts gently from `from` to `to`. A move joins two holds: position and
     distance ease across, while the camera lifts back (apex, so the page shows as a card on the floor for
     a moment and travels more slowly on screen), tilts and rolls a little and settles again. */
  const SHOTS = [
    { t: [0, 1.9], from: { y: 585, x: 0, d: 1 }, to: { y: 585, x: 0, d: 0.975 } },           // hero: uyyala photo, names
    { t: [1.9, 3.35], apex: 1.5, tilt: 22, roll: 3, peak: 0.4 },                               // a brief angled view, then down
    { t: [3.35, 5.5], from: { y: 2076, x: 0, d: 1 }, to: { y: 2076, x: 0, d: 0.96 } },         // the couple
    { t: [5.5, 6.5], apex: 1.3, tilt: 8, roll: 0, peak: 0.5 },
    { t: [6.5, 9.3], from: { y: 2765, x: 0, d: 0.98 }, to: { y: 2860, x: 0, d: 0.94 } },       // the ceremony card, venue
    { t: [9.3, 10.1], apex: 1.2, tilt: 6, roll: 0, peak: 0.5 },
    { t: [10.1, 11.8], from: { y: 3240, x: 0, d: 0.93 }, to: { y: 3252, x: 0, d: 0.91 } },     // the reception card
    { t: [11.8, 12.6], apex: 1.25, tilt: 6, roll: 0, peak: 0.5 },
    { t: [12.6, 13.5], from: { y: 3800, x: 0, d: 1 }, to: { y: 3812, x: 0, d: 0.97 } },        // the gallery wall
    { t: [13.5, 14.7], apex: 1, tilt: 0, roll: 0, peak: 0.5 },                                  // into the garden photo
    { t: [14.7, 20], from: { y: 3936, x: -90, d: 0.62 }, to: { y: 3936, x: -90, d: 0.62 } },  // on the garden photo (set from the capture)
  ];
  SHOTS.forEach((s, i) => { if (!s.from) { s.from = SHOTS[i - 1].to; s.to = SHOTS[i + 1].from; s.move = true; } });
  const T_CARD = 14.7;                       // the garden photo leaves the page for the invitation card

  function cameraAt(t) {
    const s = SHOTS.find((x) => t <= x.t[1]) || SHOTS[SHOTS.length - 1];
    const u = clamp((t - s.t[0]) / (s.t[1] - s.t[0]), 0, 1), e = smoother(u);
    const Ly = lerp(s.from.y, s.to.y, e);
    let Lx = lerp(s.from.x, s.to.x, e);
    let D = Math.exp(lerp(Math.log(s.from.d), Math.log(s.to.d), e)) * D_FILL, tilt = 0, roll = 0;
    if (s.move) {
      const b = Math.sin(Math.PI * Math.pow(u, Math.log(0.5) / Math.log(s.peak))) ** 2;   // 0 -> 1 -> 0, peak at s.peak
      D *= Math.pow(s.apex, b); tilt = s.tilt * b; roll = s.roll * b;
    }
    // front-on, the frame stays inside the page's width (no strip of floor at the sides)
    const halfW = D * 540 / 1240, maxX = Math.max(0, PAGE_W / 2 - halfW);
    Lx = clamp(Lx, -maxX, maxX);
    const th = tilt * Math.PI / 180;
    const target = [Lx, -Ly, 0];
    const pos = add(target, [0, -Math.sin(th) * D, Math.cos(th) * D]);
    const z = norm(sub(pos, target)), x0 = norm(cross([0, 1, 0], z)), y0 = cross(z, x0), r = roll * Math.PI / 180;
    const up = add(mul(y0, Math.cos(r)), mul(x0, Math.sin(r)));
    return { pos, target, up, D, tilt, Ly };
  }
  // motion blur only while the camera travels between holds
  const shutter = (t) => {
    const s = SHOTS.find((x) => t <= x.t[1]);
    if (!s || !s.move || s.apex === 1) return 0;
    const u = (t - s.t[0]) / (s.t[1] - s.t[0]);
    return 0.5 * sstep(0, 0.2, u) * (1 - sstep(0.8, 1, u));
  };
  // lift per piece over time: height above the page (world px)
  const rise = (t0, z, dur = 0.7) => (t) => z * smoother((t - t0) / dur);
  const LIFT = {
    heroCard: () => 4, badge: () => 6,
    bride: rise(2.95, 14, 0.8), groom: rise(2.95, 14, 0.8), amp: rise(3.05, 24, 0.8),
    ceremony: rise(6.1, 8), reception: rise(9.7, 8),
    g1: rise(12.2, 12, 0.6), g2: rise(12.3, 14, 0.6), g3: rise(12.35, 16, 0.6), g4: rise(12.45, 12, 0.6),
  };

  function matrices(cam) {
    const z = norm(sub(cam.pos, cam.target));
    const x = norm(cross(cam.up, z));
    const y = cross(z, x);
    const V = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, cam.pos), -dot(y, cam.pos), -dot(z, cam.pos), 1];
    const n = 4, fa = 20000;
    const P = [2 * F / W, 0, 0, 0, 0, 2 * F / H, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
    const VP = mat4mul(P, V);
    return { V, P, VP, inv: mat4inv(VP) };
  }

  function mat4mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  }
  function mat4inv(m) {
    const inv = new Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    return inv.map((v) => v / det);
  }
  /* ---------------- GL programs ---------------- */
  function program(vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  const QUAD_VS = `#version 300 es
  uniform mat4 uVP; uniform mat4 uV; uniform vec3 uC[4]; uniform vec4 uUv;
  out vec2 vUv; out vec2 vQ; out float vDepth;
  void main() {
    int i = gl_VertexID;
    vec2 uv = vec2(float(i & 1), float(i >> 1));
    vec3 p = uC[i];
    vQ = uv;
    vUv = uUv.xy + uv * uUv.zw;
    vDepth = -(uV * vec4(p, 1.0)).z;
    gl_Position = uVP * vec4(p, 1.0);
  }`;
  // textured quad with per-pixel depth of field, haze, shadow mode and rounded corners
  const QUAD_FS = `#version 300 es
  precision highp float;
  uniform sampler2D uTex; uniform vec2 uTexSize;
  uniform float uFocus, uFrontK, uBackK, uCap, uExtraBlur;
  uniform float uOpacity, uHazeMix; uniform vec3 uHaze; uniform vec3 uFog;
  uniform int uMode; uniform vec4 uTint; uniform float uShadowBlur;
  uniform vec2 uQuadPx; uniform vec4 uCorners;
  in vec2 vUv; in vec2 vQ; in float vDepth;
  out vec4 o;
  float rrect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    float z = max(vDepth, 1.0);
    float r = z < uFocus ? uFrontK * (uFocus - z) / z : uBackK * (z - uFocus) / z;
    r = min(r + uExtraBlur, uCap);
    vec2 tc = vUv * uTexSize;
    float rho = max(length(dFdx(tc)), length(dFdy(tc)));      // texels per output pixel
    float R = r * rho;
    if (uMode == 1) R = sqrt(R * R + uShadowBlur * uShadowBlur);
    vec4 c;
    if (R < 0.8) {
      c = texture(uTex, vUv);
    } else {
      float n = clamp(R * 0.55, 10.0, 28.0);
      int N = int(n);
      float lod = max(log2(max(1.0, 1.8 * R / sqrt(n))), log2(max(rho, 1.0)));
      c = vec4(0.0);
      for (int i = 0; i < 28; i++) {
        if (i >= N) break;
        float fi = float(i) + 0.5;
        float rr = sqrt(fi / n) * R;
        float a = fi * 2.39996323;                              // golden angle
        c += textureLod(uTex, vUv + vec2(cos(a), sin(a)) * rr / uTexSize, lod);
      }
      c /= float(N);
    }
    if (uMode == 1) c = uTint * c.a;
    if (uCorners != vec4(0.0)) {
      vec2 p = vQ * uQuadPx;
      bool top = p.y < uQuadPx.y * 0.5, left = p.x < uQuadPx.x * 0.5;
      float rad = top ? (left ? uCorners.x : uCorners.y) : (left ? uCorners.z : uCorners.w);
      float d = rrect(p - uQuadPx * 0.5, uQuadPx * 0.5, rad);
      float px = max(length(fwidth(p)), 1e-4);                  // quad units per output pixel
      float soft = max(1.0, r) * px;
      c *= 1.0 - smoothstep(-soft * 0.5, soft * 0.5, d);
    }
    float fog = max(smoothstep(uFog.x, uFog.y, z) * uFog.z, uHazeMix);
    c.rgb = mix(c.rgb, uHaze * c.a, fog);
    o = c * uOpacity;
  }`;
  // the studio floor: screen-space ivory gradient plus soft shadows found by casting each pixel's ray to z = 0
  const FLOOR_VS = `#version 300 es
  out vec2 vNdc;
  void main() { vec2 p = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0; vNdc = p; gl_Position = vec4(p, 0.0, 1.0); }`;
  const FLOOR_FS = `#version 300 es
  precision highp float;
  uniform mat4 uInv; uniform vec3 uCam; uniform vec3 uMid, uEdge; uniform vec2 uAspect;
  uniform vec4 uS1, uS1p, uS2, uS2p;   // rect (cx, cy, hw, hh) and (radius, blur, opacity, drop)
  in vec2 vNdc; out vec4 o;
  float rrect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float shade(vec2 w, vec4 s, vec4 sp) {
    if (sp.z <= 0.0) return 0.0;
    float d = rrect(w - (s.xy + vec2(0.0, -sp.w)), s.zw, sp.x);
    return sp.z * (1.0 - smoothstep(-sp.y * 0.35, sp.y, d));
  }
  void main() {
    float g = smoothstep(0.25, 1.25, length(vNdc * uAspect));
    vec3 col = mix(uMid, uEdge, g);
    vec4 a = uInv * vec4(vNdc, -1.0, 1.0); a /= a.w;
    vec4 b = uInv * vec4(vNdc, 1.0, 1.0); b /= b.w;
    vec3 d = normalize(b.xyz - a.xyz);
    if (d.z < 0.0) {
      vec3 w = uCam + d * (-uCam.z / d.z);
      float s = shade(w.xy, uS1, uS1p) + shade(w.xy, uS2, uS2p);
      col = mix(col, vec3(0.36, 0.29, 0.22), clamp(s, 0.0, 0.6));
    }
    o = vec4(col, 1.0);
  }`;
  const BLIT_FS = `#version 300 es
  precision highp float;
  uniform sampler2D uTex; uniform float uGain; in vec2 vNdc; out vec4 o;
  void main() { o = texture(uTex, vNdc * 0.5 + 0.5) * uGain; }`;

  const quadProg = program(QUAD_VS, QUAD_FS);
  const floorProg = program(FLOOR_VS, FLOOR_FS);
  const blitProg = program(FLOOR_VS, BLIT_FS);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);


  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + src)); i.src = src; });
  function texture(src) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 16);
    return { tex: t, tw: src.width, th: src.height };
  }


  const layout = await (await fetch('cap/layout.json')).json();
  const DPR = layout.dpr;
  const tiles = await Promise.all(layout.tiles.map(async (t) => ({ ...t, ...texture(await loadImg('cap/tiles/' + t.file)) })));
  const PAGE_H = layout.height;
  const pieces = {};
  for (const p of layout.pieces) {
    const img = await loadImg('cap/pieces/' + p.id + '.png');
    const x = Math.max(0, p.x), y = Math.max(0, p.y);            // clips were clamped to the page
    pieces[p.id] = { ...p, x, y, w: img.width / DPR, h: img.height / DPR, ...texture(img) };
  }
  // the gallery wall is drawn from the original photographs (sharp at any size), cropped like the site's
  // object-fit: cover, into each photo's place on the page
  const ORIGINALS = { g1: '../img/shoot/palace-walk.jpg', g2: '../img/shoot/swing-close.jpg', g3: '../img/shoot/garden-hug.jpg', g4: '../img/gallery/g-05.jpg' };
  for (const id in ORIGINALS) {
    const p = pieces[id], img = await loadImg(ORIGINALS[id]);
    const box = p.inner, ia = img.width / img.height, ba = box.w / box.h;
    const uv = ia > ba ? [(1 - ba / ia) / 2, 0, ba / ia, 1] : [0, (1 - ia / ba) / 2, 1, ia / ba];
    pieces[id] = { ...p, x: box.x, y: box.y, w: box.w, h: box.h, uv, photo: true, ...texture(img) };
  }
  // the last shot centres on the garden photo as captured
  const GP = pieces.g3, last = SHOTS[SHOTS.length - 1];
  Object.assign(last.from, { y: GP.y + GP.h / 2, x: GP.x + GP.w / 2 - PAGE_W / 2 }); Object.assign(last.to, { y: GP.y + GP.h / 2, x: GP.x + GP.w / 2 - PAGE_W / 2 });
  const white = (() => { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4); return texture(c); })();
  // the invitation card's navy, as on the site's hero
  const navy = (() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 512; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#1b2356'); g.addColorStop(0.55, '#111850'); g.addColorStop(1, '#0b1238');
    x.fillStyle = g; x.fillRect(0, 0, 8, 512); return texture(c);
  })();

  /* ---------------- the invitation card (designed in 1080 x 1920 screen px) ---------------- */
  await document.fonts.load('96px "Instrument Serif"');
  await document.fonts.load('italic 78px "Instrument Serif"');
  await document.fonts.load('600 40px "Bricolage Grotesque"');
  await document.fonts.load('500 46px "Anek Telugu"', 'ఆత్మీయ ఆహ్వానం');
  await document.fonts.ready;

  const SS = 1.5;                                                  // supersample text textures
  function textTex(str, font, color, spacing = 0) {
    const c = document.createElement('canvas'); const x = c.getContext('2d');
    x.font = font; if (spacing) x.letterSpacing = spacing + 'px';
    const m = x.measureText(str);
    const pad = 34;
    const asc = Math.ceil(m.fontBoundingBoxAscent || m.actualBoundingBoxAscent), desc = Math.ceil(m.fontBoundingBoxDescent || m.actualBoundingBoxDescent);
    c.width = Math.ceil((m.width + pad * 2) * SS); c.height = Math.ceil((asc + desc + pad * 2) * SS);
    const y = c.getContext('2d'); y.scale(SS, SS); y.font = font; if (spacing) y.letterSpacing = spacing + 'px';
    y.fillStyle = color; y.textBaseline = 'alphabetic'; y.fillText(str, pad, pad + asc);
    return { ...texture(c), sw: c.width / SS, sh: c.height / SS, adv: m.width, pad };
  }
  // one line of words, centred on cx; each word reveals on its own
  function line(words, font, color, cy, t0, step, spacing = 0, gap) {
    const toks = words.map((w) => textTex(w, font, color, spacing));
    const space = gap != null ? gap : textTex(' ', font, color, spacing).adv;
    const total = toks.reduce((s, k) => s + k.adv, 0) + space * (toks.length - 1);
    let x = 540 - total / 2;
    return toks.map((k, i) => { const it = { k, x: x - k.pad, cy, t0: t0 + i * step }; x += k.adv + space; return it; });
  }
  const IVORY = '#fff6ea', MARIGOLD = '#f5b544', MARIGOLD_HI = '#ffd581', IVORY_SOFT = 'rgba(255, 246, 234, 0.8)';
  const TL = 16.0;                                                 // the photo has settled; the lines follow
  const END_WORDS = [
    ...line(['Sailakshmi', '&', 'Dharmaveer'], '96px "Instrument Serif"', IVORY, 1398, TL, 0.04),
    ...line(['28', 'October', '2026', '·', '10:34', 'PM'], '600 40px "Bricolage Grotesque"', MARIGOLD, 1490, TL + 0.10, 0.035, 0.5),
    ...line(['Amalapuram'], '600 35px "Bricolage Grotesque"', IVORY_SOFT, 1550, TL + 0.20, 0, 3),
    ...line(['With', 'love,', 'we', 'invite', 'you'], 'italic 78px "Instrument Serif"', MARIGOLD_HI, 1670, TL + 0.26, 0.04),
    ...line(['ఆత్మీయ', 'ఆహ్వానం'], '500 46px "Anek Telugu"', IVORY_SOFT, 1764, TL + 0.38, 0.05),
  ];
  const CARD_PHOTO = { x: 170, y: 132, w: 740, h: 1110, r: 34 };   // the garden photo on the card (2:3)


  /* ---------------- drawing ---------------- */
  let VPs, focusDepth = 500, overlay = false;
  function setCommon(prog) {
    gl.uniformMatrix4fv(prog.u.uVP, false, VPs.VP);
    gl.uniformMatrix4fv(prog.u.uV, false, VPs.V);
  }
  function drawQuad(tex, corners, o = {}) {
    const u = quadProg.u;
    gl.uniform3fv(u.uC, corners.flat());
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.tex); gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uTexSize, tex.tw, tex.th);
    gl.uniform1f(u.uFocus, focusDepth);
    gl.uniform1f(u.uFrontK, DOF.front); gl.uniform1f(u.uBackK, DOF.back); gl.uniform1f(u.uCap, DOF.cap);
    gl.uniform1f(u.uExtraBlur, (o.blur || 0) * K);
    gl.uniform1f(u.uOpacity, o.opacity != null ? o.opacity : 1);
    gl.uniform1f(u.uHazeMix, 0);
    gl.uniform3fv(u.uHaze, HAZE);
    gl.uniform3fv(u.uFog, overlay ? [1e6, 2e6, 0] : FOG);
    gl.uniform1i(u.uMode, o.shadow || o.tint ? 1 : 0);
    gl.uniform4fv(u.uTint, o.tint || SHADOW_TINT);
    gl.uniform1f(u.uShadowBlur, o.shadowBlur || 0);
    gl.uniform2fv(u.uQuadPx, o.quadPx || [1, 1]);
    gl.uniform4fv(u.uCorners, o.corners || [0, 0, 0, 0]);
    gl.uniform4fv(u.uUv, o.uv || [0, 0, 1, 1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const rectCorners = (x0, y0, w, h, z = 0) => [[x0 - PAGE_W / 2, -y0, z], [x0 + w - PAGE_W / 2, -y0, z], [x0 - PAGE_W / 2, -(y0 + h), z], [x0 + w - PAGE_W / 2, -(y0 + h), z]];
  // screen space (design px, 1080 x 1920) for the invitation card
  const ORTHO = { VP: [2 / 1080, 0, 0, 0, 0, -2 / 1920, 0, 0, 0, 0, -1, 0, -1, 1, 0, 1], V: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -500, 1] };
  const screenRect = (x, y, w, h) => [[x, y, 0], [x + w, y, 0], [x, y + h, 0], [x + w, y + h, 0]];
  const project = (VP, p) => {
    const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12];
    const y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13];
    const w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
    return [(x / w * 0.5 + 0.5) * 1080, (1 - (y / w * 0.5 + 0.5)) * 1920];
  };
  // where the lifted garden photo sits on screen when it leaves the page (design px)
  const GARDEN_FROM = (() => {
    const cam = cameraAt(T_CARD), m = matrices(cam), p = pieces.g3, z = LIFT.g3(T_CARD);
    const a = project(m.VP, [p.x - PAGE_W / 2, -p.y, z]), b = project(m.VP, [p.x + p.w - PAGE_W / 2, -(p.y + p.h), z]);
    return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1], r: 16 * (b[0] - a[0]) / p.w };
  })();

  function drawScene(t) {
    const cam = cameraAt(t);
    VPs = matrices(cam); overlay = false;
    const viewDepth = (p) => -(VPs.V[2] * p[0] + VPs.V[6] * p[1] + VPs.V[10] * p[2] + VPs.V[14]);
    focusDepth = viewDepth(cam.target);
    const card = sstep(T_CARD + 0.05, T_CARD + 0.6, t);             // the page gives way to the card's navy

    if (card < 1) {
      // floor and the page's soft shadow
      gl.disable(gl.BLEND);
      gl.useProgram(floorProg.p);
      gl.uniformMatrix4fv(floorProg.u.uInv, false, VPs.inv);
      gl.uniform3fv(floorProg.u.uCam, cam.pos);
      gl.uniform3fv(floorProg.u.uMid, FLOOR_MID); gl.uniform3fv(floorProg.u.uEdge, FLOOR_EDGE);
      gl.uniform2f(floorProg.u.uAspect, 1, H / W * 0.62);
      gl.uniform4f(floorProg.u.uS1, 0, -PAGE_H / 2, PAGE_W / 2, PAGE_H / 2);
      gl.uniform4f(floorProg.u.uS1p, 16, 70, 0.2, 14);
      gl.uniform4f(floorProg.u.uS2, 0, 0, 1, 1);
      gl.uniform4f(floorProg.u.uS2p, 0, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(quadProg.p);
      setCommon(quadProg);
      // Only the part of the page in front of the camera is drawn. With the camera tilted, the floor crosses the
      // camera's own plane at page y = Ly + D / sin(tilt); a quad corner on that plane breaks the projection
      // (the page tears along the quad's diagonal), and nothing beyond it can be seen anyway.
      const sinT = Math.sin(cam.tilt * Math.PI / 180);
      const yCut = sinT > 1e-3 ? cam.Ly + cam.D / sinT - 30 : Infinity;
      const drawClipped = (tex, x, y, w, h, z, o = {}) => {
        const y1 = Math.min(y + h, yCut);
        if (y1 <= y + 0.5) return;
        const f = (y1 - y) / h, uv = o.uv || [0, 0, 1, 1];
        const c = o.corners ? [o.corners[0], o.corners[1], f < 1 ? 0.0001 : o.corners[2], f < 1 ? 0.0001 : o.corners[3]] : null;
        drawQuad(tex, rectCorners(x, y, w, y1 - y, z), { ...o, uv: [uv[0], uv[1], uv[2], uv[3] * f], quadPx: [w, y1 - y], corners: c || o.corners });
      };
      tiles.forEach((tl, i) => {
        const first = i === 0, last = i === tiles.length - 1;
        drawClipped(tl, 0, tl.y, PAGE_W, tl.h, 0, { corners: [first ? 16 : 0.0001, first ? 16 : 0.0001, last ? 16 : 0.0001, last ? 16 : 0.0001] });
      });
      // pieces: shadows first, then the pieces, far to near; from T_CARD the garden photo belongs to the card
      const live = Object.values(pieces).filter((p) => !(p.id === 'g3' && t >= T_CARD)).map((p) => ({ p, z: (LIFT[p.id] || (() => 0))(t) }));
      live.sort((a, b) => viewDepth([0, -(b.p.y + b.p.h / 2), b.z]) - viewDepth([0, -(a.p.y + a.p.h / 2), a.z]));
      const look = (p) => (p.photo ? { uv: p.uv, corners: [16, 16, 16, 16] } : {});
      for (const l of live) {
        if (l.z > 0.5) drawClipped(l.p, l.p.x + 0.10 * l.z, l.p.y + 4 + 0.36 * l.z, l.p.w, l.p.h, 0.15, { ...look(l.p), shadow: true, shadowBlur: (6 + 0.45 * l.z) * DPR, opacity: Math.min(0.26, 0.02 * l.z) });
      }
      for (const l of live) drawClipped(l.p, l.p.x, l.p.y, l.p.w, l.p.h, l.z, look(l.p));
    }

    if (t >= T_CARD) {
      // the invitation card, in screen space
      overlay = true; VPs = ORTHO; focusDepth = 500;
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(quadProg.p); setCommon(quadProg);
      const s = 1 + 0.02 * sstep(TL, 20, t);                        // a slow 2% push on the finished card
      const S = (x, y, w, h) => screenRect(540 + (x - 540) * s, 960 + (y - 960) * s, w * s, h * s);
      drawQuad(navy, screenRect(0, 0, 1080, 1920), { opacity: card });
      const m = smoother((t - T_CARD) / 0.85), P = CARD_PHOTO, A = GARDEN_FROM;
      const ph = { x: lerp(A.x, P.x, m), y: lerp(A.y, P.y, m), w: lerp(A.w, P.w, m), h: lerp(A.h, P.h, m), r: lerp(A.r, P.r, m) };
      const k = sstep(T_CARD + 0.4, T_CARD + 0.9, t);
      if (k > 0) drawQuad(white, S(ph.x - 3, ph.y - 3, ph.w + 6, ph.h + 6), { tint: [GOLD[0] * 0.75 * k, GOLD[1] * 0.75 * k, GOLD[2] * 0.75 * k, 0.75 * k], quadPx: [ph.w + 6, ph.h + 6], corners: [ph.r + 3, ph.r + 3, ph.r + 3, ph.r + 3] });
      const g = pieces.g3;
      drawQuad(g, S(ph.x, ph.y, ph.w, ph.h), { uv: g.uv, quadPx: [ph.w, ph.h], corners: [ph.r, ph.r, ph.r, ph.r] });
      // words rise 16 px into place
      for (const wd of END_WORDS) {
        const kk = easeOut((t - wd.t0) / 0.30);
        if (kk <= 0) continue;
        drawQuad(wd.k, S(wd.x, wd.cy - wd.k.sh / 2 + 16 * (1 - kk), wd.k.sw, wd.k.sh), { opacity: kk, blur: 6 * (1 - kk) });
      }
    }
  }

  /* ---------------- frames ---------------- */

  const mkTarget = (internal, fmt, type) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, W, H, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb };
  };
  const one = SUB > 1 ? mkTarget(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE) : null;
  const acc = SUB > 1 ? mkTarget(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT) : null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  function blit(src, gain) {
    gl.useProgram(blitProg.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(blitProg.u.uTex, 0);
    gl.uniform1f(blitProg.u.uGain, gain);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function seek(t) {
    t = clamp(t, 0, DUR);
    gl.viewport(0, 0, W, H);
    const span = shutter(t);
    if (SUB === 1 || span < 0.01) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); drawScene(t); return; }
    // subframes spread across the open shutter, averaged
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    for (let i = 0; i < SUB; i++) {
      const ts = clamp(t + ((i + 0.5) / SUB - 0.5) * span / FPS, 0, DUR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, one.fb); drawScene(ts);
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      blit(one.tex, 1 / SUB);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.BLEND);
    blit(acc.tex, 1);
  }
  window.seek = seek;
  window.frame = async (t, type = 'image/jpeg', q = 0.94) => { seek(t); gl.finish(); return canvas.toDataURL(type, q); };
  window.filmInfo = { W, H, FPS, DUR, SHOTS, cameraAt };
  window.filmReady = true;
})().catch((e) => { window.filmError = String(e && e.stack || e); });
