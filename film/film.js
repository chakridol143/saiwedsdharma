/* Sai & Dharma — 20 s invitation film, WebGL2.
   The captured site lies flat on an ivory studio floor; one continuous camera
   glides down it, lifted pieces rise toward the lens, and the camera rises and
   lands on the invitation end card. Every frame is computed from time inside
   seek(t): no timers, no CSS transitions.

   URL params: w, h (output size), mb (motion-blur subframes), fps. */
'use strict';
(async function () {
  const Q = new URLSearchParams(location.search);
  const W = +Q.get('w') || 1080, H = +Q.get('h') || 1920;
  const SUB = Math.max(1, +Q.get('mb') || 1);
  const FPS = +Q.get('fps') || 60;
  const K = W / 1080;                       // the film is designed at 1080 x 1920
  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  gl.getExtension('EXT_color_buffer_float');

  /* ---------------- design constants ---------------- */
  const PAGE_W = 390;                       // world units = page CSS px
  const F = 1240 * K;                       // focal length, output px
  const DOF = { front: 40 * K, back: 4.5 * K, cap: 90 * K };
  const bump = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));
  // text-heavy stretches get a deeper focus so everything stays readable
  const frontK = (t) => K * (40 - 12 * bump(2.4, 3.0, 4.4, 5.0, t) - 10 * bump(5.4, 6.0, 7.6, 8.2, t) - 8 * bump(9.4, 10.0, 10.8, 11.2, t) - 20 * bump(10.8, 11.4, 14.0, 14.6, t));
  const FLOOR_MID = [0xfb / 255, 0xf6 / 255, 0xec / 255];
  const FLOOR_EDGE = [0xee / 255, 0xe2 / 255, 0xcd / 255];
  const HAZE = [0xf8 / 255, 0xf1 / 255, 0xe5 / 255];
  const FOG = [950, 4300, 0.82];            // depth near, far, max mix
  const SHADOW_TINT = [0x1a / 255, 0x21 / 255, 0x33 / 255, 1];

  // glide speed (page px / s), smoothstep between keys; never dips during the flight
  const SPEED = [[0, 0], [1.0, 140], [2.0, 215], [3.0, 228], [8.4, 238], [11.4, 345], [17.0, 360]];
  const P0 = 165;                           // page y under the frame centre at t = 0
  const T_END = 17.0;                       // glide hands over to the rise here
  const DECEL = 1.6;                        // seconds to ease the glide to a stop

  /* ---------------- helpers ---------------- */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const easeOut = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
  const lerp = (a, b, u) => a + (b - a) * u;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

  function speedAt(t) {
    if (t <= 0) return 0;
    for (let i = 1; i < SPEED.length; i++) {
      const [t0, v0] = SPEED[i - 1], [t1, v1] = SPEED[i];
      if (t <= t1) return lerp(v0, v1, sstep(t0, t1, t));
    }
    return SPEED[SPEED.length - 1][1];
  }
  // integrate once (1 ms steps) so page position is exact and repeatable
  const DT = 0.001, NSTEP = Math.ceil(T_END / DT) + 1;
  const PTAB = new Float64Array(NSTEP + 1);
  for (let i = 1; i <= NSTEP; i++) PTAB[i] = PTAB[i - 1] + speedAt((i - 0.5) * DT) * DT;
  const glideP = (t) => { const x = clamp(t, 0, T_END) / DT; const i = Math.floor(x); return P0 + PTAB[i] + (PTAB[Math.min(i + 1, NSTEP)] - PTAB[i]) * (x - i); };
  const V_END = speedAt(T_END), P_END = glideP(T_END);
  // after T_END the glide eases to rest: v = v0 (1 - smoothstep), integrated
  const pageY = (t) => {
    if (t <= T_END) return glideP(t);
    const u = clamp((t - T_END) / DECEL, 0, 1);
    return P_END + V_END * DECEL * (u - u * u * u + u * u * u * u / 2);
  };
  const P_LAND = P_END + V_END * DECEL * 0.5;   // page y of the end-card centre

  /* ---------------- camera ---------------- */
  function cameraAt(t) {
    const Ly = pageY(t);
    // tilt from straight down: 50 deg through the glide, flattening to overhead for the landing
    const tilt = ((22 + 28 * sstep(0.3, 5.0, t)) * (1 - sstep(17.1, 18.3, t))) * Math.PI / 180;
    // distance: starts close and intimate, eases outward through the glide (never back in),
    // then a log-scale rise and a quadratic log-scale dive onto the end card, then a 2% creep
    let D = 300 + 220 * sstep(0, 4.5, t) + 40 * clamp((t - 4.5) / 12.5, 0, 1);
    if (t > 17.1) {
      const up = Math.log(560) + (Math.log(820) - Math.log(560)) * sstep(17.1, 17.95, t);
      const down = (Math.log(820) - Math.log(560)) * sstep(17.95, 18.55, t);
      D = Math.exp(up - down) * (1 - 0.02 * sstep(18.55, 20.0, t));
    }
    const target = [0, -Ly, 0];
    const pos = add(target, [0, -Math.sin(tilt) * D, Math.cos(tilt) * D]);
    return { pos, target, up: [0, 1, 0], D, tilt, Ly };
  }

  function matrices(cam) {
    const z = norm(sub(cam.pos, cam.target));
    const x = norm(cross(cam.up, z));
    const y = cross(z, x);
    const V = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, cam.pos), -dot(y, cam.pos), -dot(z, cam.pos), 1];
    const n = 4, fa = 20000;
    const P = [2 * F / W, 0, 0, 0, 0, 2 * F / H, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
    const VP = mat4mul(P, V);
    return { V, P, VP, inv: mat4inv(VP), fwd: mul(z, -1) };
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
  const project = (VP, p) => {
    const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12];
    const y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13];
    const w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
    return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H, w];
  };

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
  uniform mat4 uVP; uniform mat4 uV; uniform vec3 uC[4];
  out vec2 vUv; out float vDepth;
  void main() {
    int i = gl_VertexID;
    vec2 uv = vec2(float(i & 1), float(i >> 1));
    vec3 p = uC[i];
    vUv = uv;
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
  in vec2 vUv; in float vDepth;
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
      vec2 p = vUv * uQuadPx;
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

  /* ---------------- assets ---------------- */
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
  const endPhoto = texture(await loadImg('../img/shoot/hero-swing.jpg'));

  // lift style per piece: height (world px), stand-up angle (deg), small in-plane roll (deg)
  const LIFT = {
    heroCard: [24, 6, 0], emblem: [12, 10, 0],
    bride: [58, 10, -1.2], groom: [66, 10, 1.2], amp: [88, 0, 0],
    ceremony: [18, 5, 0], reception: [18, 5, 0], venue: [20, 5, 0],
    g1: [34, 16, -2.0], g2: [54, 18, 1.8], g3: [42, 16, -1.5], g4: [58, 15, 1.4], g5: [48, 18, -1.8], g6: [60, 14, 1.5],
    d1: [36, 10, 0], d2: [40, 10, 0], d3: [36, 10, 0], d4: [40, 10, 0],
  };

  /* ---------------- end card (designed in 1080 x 1920 screen px) ---------------- */
  await document.fonts.load('92px "Instrument Serif"');
  await document.fonts.load('italic 76px "Instrument Serif"');
  await document.fonts.load('700 34px "Bricolage Grotesque"');
  await document.fonts.load('600 30px "Bricolage Grotesque"');
  await document.fonts.load('500 36px "Anek Telugu"', 'సాయి & ధర్మ ఆత్మీయ ఆహ్వానం');
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
  const INK = '#141a3f', GOLD = '#9a7430', BROWN = '#7d6343', SOFT = '#5d5247';
  const TL = 18.62;                                                // the card has landed; text follows
  const END_WORDS = [
    ...line(['Sailakshmi', '&', 'Dharmaveer'], '92px "Instrument Serif"', INK, 1228, TL + 0.10, 0.06),
    ...line(['28', 'OCTOBER', '2026', '·', 'AMALAPURAM'], '700 30px "Bricolage Grotesque"', BROWN, 1330, TL + 0.22, 0.045, 5.5),
    ...line(['With', 'love,', 'we', 'invite', 'you'], 'italic 78px "Instrument Serif"', GOLD, 1462, TL + 0.34, 0.05),
    ...line(['ఆత్మీయ', 'ఆహ్వానం'], '500 36px "Anek Telugu"', BROWN, 1560, TL + 0.56, 0.06),
    ...line(['Please', 'come', 'and', 'bless', 'us'], '600 30px "Bricolage Grotesque"', SOFT, 1646, TL + 0.64, 0.045),
  ];
  // badge pill: gold rings, Sai & Dharma, సాయి & ధర్మ
  const pill = (() => {
    const c = document.createElement('canvas'); const x = c.getContext('2d');
    const text = 'Sai & Dharma', te = 'సాయి & ధర్మ';
    x.font = '600 30px "Bricolage Grotesque"'; const w1 = x.measureText(text).width;
    x.font = '500 30px "Anek Telugu"'; const w2 = x.measureText(te).width;
    const pw = 64 + 52 + w1 + 34 + w2 + 40, ph = 76, pad = 40;
    c.width = Math.ceil((pw + pad * 2) * SS); c.height = Math.ceil((ph + pad * 2) * SS);
    x.scale(SS, SS);
    x.shadowColor = 'rgba(80, 58, 30, .18)'; x.shadowBlur = 26; x.shadowOffsetY = 8;
    x.fillStyle = '#fffaf2';
    x.beginPath(); x.roundRect(pad, pad, pw, ph, ph / 2); x.fill();
    x.shadowColor = 'transparent';
    x.strokeStyle = 'rgba(176, 138, 62, .35)'; x.lineWidth = 1.5; x.stroke();
    // rings
    x.lineWidth = 2.6; x.strokeStyle = '#c99a3c';
    x.beginPath(); x.arc(pad + 46, pad + 40, 13, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#e0b456';
    x.beginPath(); x.arc(pad + 62, pad + 40, 13, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#e0b456'; x.beginPath(); x.moveTo(pad + 62, pad + 18); x.lineTo(pad + 66, pad + 23); x.lineTo(pad + 62, pad + 28); x.lineTo(pad + 58, pad + 23); x.fill();
    x.fillStyle = INK; x.font = '600 30px "Bricolage Grotesque"'; x.textBaseline = 'middle';
    x.fillText(text, pad + 96, pad + ph / 2 + 1);
    x.fillStyle = 'rgba(154, 116, 48, .9)'; x.fillText('·', pad + 96 + w1 + 10, pad + ph / 2);
    x.fillStyle = BROWN; x.font = '500 30px "Anek Telugu"';
    x.fillText(te, pad + 96 + w1 + 34, pad + ph / 2 + 3);
    return { ...texture(c), sw: c.width / SS, sh: c.height / SS };
  })();
  const END = { photo: { x: 110, y: 262, w: 860, h: 860, r: 40 }, pillY: 150 };

  /* ---------------- drawing ---------------- */
  let VPs, focusDepth = 500, frontNow = DOF.front;
  function setCommon(prog) {
    gl.uniformMatrix4fv(prog.u.uVP, false, VPs.VP);
    gl.uniformMatrix4fv(prog.u.uV, false, VPs.V);
  }
  function drawQuad(tex, corners, o = {}) {
    const u = quadProg.u;
    gl.uniform3fv(u.uC, corners.flat());
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.tex); gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uTexSize, tex.tw, tex.th);
    gl.uniform1f(u.uFocus, o.focus != null ? o.focus : focusDepth);
    gl.uniform1f(u.uFrontK, o.front != null ? o.front : frontNow); gl.uniform1f(u.uBackK, DOF.back); gl.uniform1f(u.uCap, DOF.cap);
    gl.uniform1f(u.uExtraBlur, (o.blur || 0) * K);
    gl.uniform1f(u.uOpacity, o.opacity != null ? o.opacity : 1);
    gl.uniform1f(u.uHazeMix, o.haze || 0);
    gl.uniform3fv(u.uHaze, HAZE);
    gl.uniform3fv(u.uFog, o.noFog ? [1e6, 2e6, 0] : FOG);
    gl.uniform1i(u.uMode, o.shadow ? 1 : 0);
    gl.uniform4fv(u.uTint, SHADOW_TINT);
    gl.uniform1f(u.uShadowBlur, o.shadowBlur || 0);
    gl.uniform2fv(u.uQuadPx, o.quadPx || [1, 1]);
    gl.uniform4fv(u.uCorners, o.corners || [0, 0, 0, 0]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const rectCorners = (x0, y0, w, h, z = 0) => [[x0 - PAGE_W / 2, -y0, z], [x0 + w - PAGE_W / 2, -y0, z], [x0 - PAGE_W / 2, -(y0 + h), z], [x0 + w - PAGE_W / 2, -(y0 + h), z]];
  // a piece standing up: rotated about its own horizontal midline, top edge rising toward the lens
  function liftedCorners(p, z, thetaDeg, rollDeg) {
    const th = thetaDeg * Math.PI / 180, ro = rollDeg * Math.PI / 180;
    const cx = p.x + p.w / 2 - PAGE_W / 2, cy = -(p.y + p.h / 2);
    const pts = [[-p.w / 2, p.h / 2], [p.w / 2, p.h / 2], [-p.w / 2, -p.h / 2], [p.w / 2, -p.h / 2]];
    return pts.map(([lx, ly]) => {
      const rx = lx * Math.cos(ro) - ly * Math.sin(ro), ry = lx * Math.sin(ro) + ly * Math.cos(ro);
      return [cx + rx, cy + ry * Math.cos(th), z + ry * Math.sin(th)];
    });
  }
  function shadowCorners(p, z, thetaDeg, rollDeg) {
    return liftedCorners(p, z, thetaDeg, rollDeg).map(([x, y]) => [x + 0.10 * z, y - (4 + 0.36 * z), 0.15]);
  }
  // screen-px rectangle on the end card -> world corners on the floor (camera overhead at landing)
  const S_LAND = 560 / F * K;                                     // world units per 1080-px design px
  function endCorners(x, y, w, h, z) {
    const X = (sx) => (sx - 540) * S_LAND, Y = (sy) => -P_LAND - (sy - 960) * S_LAND;
    return [[X(x), Y(y), z], [X(x + w), Y(y), z], [X(x), Y(y + h), z], [X(x + w), Y(y + h), z]];
  }

  function drawScene(t) {
    const cam = cameraAt(t);
    VPs = matrices(cam);
    frontNow = frontK(t);
    const viewDepth = (p) => -(VPs.V[2] * p[0] + VPs.V[6] * p[1] + VPs.V[10] * p[2] + VPs.V[14]);

    const pageHaze = sstep(17.5, 18.0, t);
    const pageAlpha = 1 - sstep(17.85, 18.25, t);
    const pageOn = pageAlpha > 0;
    const endOn = t > 17.8;
    const endIn = sstep(17.82, 18.42, t);

    // lifts: each piece rises as it approaches the frame centre and stays up as it recedes
    const live = [];
    for (const id in pieces) {
      if (id === 'badge') continue;
      const p = pieces[id];
      const [zMax, thMax, roll] = LIFT[id] || [16, 6, 0];
      const a = cam.Ly - (p.y + p.h / 2);
      const u = sstep(-560, -40, a);
      const th = thMax * u;
      const z = Math.max(zMax * u, (p.h / 2) * Math.sin(th * Math.PI / 180) + 2 * u);
      live.push({ id, p, z, th, roll: roll * u, u });
    }
    // focus on whatever crosses the middle of the frame
    let wsum = 1, dsum = viewDepth(cam.target);
    for (const l of live) {
      if (l.u < 0.05) continue;
      const c = [l.p.x + l.p.w / 2 - PAGE_W / 2, -(l.p.y + l.p.h / 2), l.z];
      const s = project(VPs.VP, c);
      if (s[2] <= 0) continue;
      const ds = Math.hypot(s[0] - W / 2, s[1] - H / 2) / K;
      const w = 2.2 * l.u * Math.exp(-(ds / 240) * (ds / 240));
      wsum += w; dsum += w * viewDepth(c);
    }
    focusDepth = dsum / wsum;
    if (endOn) focusDepth = lerp(focusDepth, viewDepth([0, -P_LAND, 10]), endIn);

    // floor + soft shadows (page, end photo)
    gl.disable(gl.BLEND);
    gl.useProgram(floorProg.p);
    gl.uniformMatrix4fv(floorProg.u.uInv, false, VPs.inv);
    gl.uniform3fv(floorProg.u.uCam, cam.pos);
    gl.uniform3fv(floorProg.u.uMid, FLOOR_MID); gl.uniform3fv(floorProg.u.uEdge, FLOOR_EDGE);
    gl.uniform2f(floorProg.u.uAspect, 1, H / W * 0.62);
    gl.uniform4f(floorProg.u.uS1, 0, -PAGE_H / 2, PAGE_W / 2, PAGE_H / 2);
    gl.uniform4f(floorProg.u.uS1p, 16, 70, pageOn ? 0.2 * (1 - pageHaze) * pageAlpha : 0, 14);
    const ph = END.photo;
    gl.uniform4f(floorProg.u.uS2, (ph.x + ph.w / 2 - 540) * S_LAND, -P_LAND - (ph.y + ph.h / 2 - 960) * S_LAND, ph.w / 2 * S_LAND, ph.h / 2 * S_LAND);
    gl.uniform4f(floorProg.u.uS2p, ph.r * S_LAND, 40 * S_LAND, endOn ? 0.3 * endIn : 0, 8 * S_LAND * endIn);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(quadProg.p);
    setCommon(quadProg);

    if (pageOn) {
      // the page, tile by tile, with rounded outer corners
      tiles.forEach((tl, i) => {
        const first = i === 0, last = i === tiles.length - 1;
        drawQuad(tl, rectCorners(0, tl.y, PAGE_W, tl.h), {
          haze: pageHaze, opacity: pageAlpha, quadPx: [PAGE_W, tl.h], corners: [first ? 16 : 0.0001, first ? 16 : 0.0001, last ? 16 : 0.0001, last ? 16 : 0.0001],
        });
      });
      // shadows, then pieces, far to near
      const sorted = live.slice().sort((a, b) => viewDepth([0, -(b.p.y + b.p.h / 2), b.z]) - viewDepth([0, -(a.p.y + a.p.h / 2), a.z]));
      for (const l of sorted) {
        if (l.z < 0.5) continue;
        drawQuad(l.p, shadowCorners(l.p, l.z, l.th, l.roll), { shadow: true, shadowBlur: (7 + 0.5 * l.z) * DPR, opacity: 0.26 * l.u * pageAlpha, haze: pageHaze });
      }
      for (const l of sorted) drawQuad(l.p, liftedCorners(l.p, l.z, l.th, l.roll), { haze: pageHaze, opacity: pageAlpha });
      // the save-the-date badge lifts off the hero, trails the camera a little, then drifts out of the top
      const b = pieces.badge;
      const k = sstep(0.9, 2.3, t);
      // it trails the camera ~260 px down the page, then drifts up and out of the top of the frame
      const trail = 260 * sstep(1.2, 2.6, t) - 520 * sstep(2.8, 5.4, t);
      const bz = 150 * k + 90 * sstep(2.8, 5.4, t), grow = 1 + 0.35 * k;
      const bw = b.w * grow, bh = b.h * grow;
      const bx = b.x + b.w / 2 + 40 * k - PAGE_W / 2, by = -(b.y + b.h / 2 + trail);
      const bo = 1 - sstep(4.4, 5.6, t);
      if (bo > 0) {
        drawQuad(b, [[bx - bw / 2, by + bh / 2 * 0.6, bz + bh / 2 * 0.8], [bx + bw / 2, by + bh / 2 * 0.6, bz + bh / 2 * 0.8],
          [bx - bw / 2, by - bh / 2 * 0.6, bz - bh / 2 * 0.8], [bx + bw / 2, by - bh / 2 * 0.6, bz - bh / 2 * 0.8]], { haze: pageHaze, opacity: bo });
      }
    }

    if (endOn) {
      // the invitation card emerges from the haze and settles
      const lift = 3 + 11 * endIn;
      drawQuad(endPhoto, endCorners(ph.x, ph.y, ph.w, ph.h, lift), { opacity: endIn, haze: 0.55 * (1 - endIn), blur: 14 * (1 - endIn), quadPx: [ph.w, ph.h], corners: [ph.r, ph.r, ph.r, ph.r], noFog: true });
      // the badge, crisp on the card's top-right corner
      const bd = pieces.badge, bs = 150 / Math.max(bd.w, bd.h) * 1.32;
      drawQuad(bd, endCorners(ph.x + ph.w - 112, ph.y - 52, bd.w * bs, bd.h * bs, lift + 6), { opacity: sstep(18.1, 18.5, t), noFog: true });
      // badge pill
      const pk = easeOut((t - (TL + 0.02)) / 0.4);
      if (pk > 0) drawQuad(pill, endCorners(540 - pill.sw / 2, END.pillY - pill.sh / 2 + 10 * (1 - pk), pill.sw, pill.sh, 1), { opacity: pk, blur: 10 * (1 - pk), noFog: true });
      // words rise 16 px out of a 12 px blur
      for (const wd of END_WORDS) {
        const kk = easeOut((t - wd.t0) / 0.34);
        if (kk <= 0) continue;
        const k2 = wd.k;
        drawQuad(k2, endCorners(wd.x, wd.cy - k2.sh / 2 + 16 * (1 - kk), k2.sw, k2.sh, 1), { opacity: kk, blur: 12 * (1 - kk), noFog: true });
      }
      // two huge soft blurs drift in at the bottom corners
      const dk = sstep(18.5, 20.0, t);
      if (dk > 0) {
        const camRight = [VPs.V[0], VPs.V[4], VPs.V[8]], camUp = [VPs.V[1], VPs.V[5], VPs.V[9]], fwd = VPs.fwd;
        [[-1, 1], [1, 1.25]].forEach(([side, sc]) => {
          const depth = 150;
          const sx = side * (0.98 - 0.06 * dk), sy = -0.96 + 0.04 * dk;      // view-space offsets as a fraction of the frame
          const halfW = depth * (W / 2) / F, halfH = depth * (H / 2) / F;
          const c = add(add(add(cam.pos, mul(fwd, depth)), mul(camRight, sx * halfW)), mul(camUp, sy * halfH));
          const s = 0.75 * halfW * sc;
          const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([a, bb]) => add(add(c, mul(camRight, a * s)), mul(camUp, bb * s)));
          drawQuad(pieces.badge, corners, { opacity: 0.22 * dk, noFog: true });
        });
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
  // motion blur only where things move fast (the gallery lifts, the rise and the landing);
  // the shutter opens and closes gradually so the switch never shows, and text glides stay crisp
  const shutter = (t) => 0.7 * sstep(13.6, 14.0, t) * (1 - sstep(18.6, 19.0, t));
  function seek(t) {
    gl.viewport(0, 0, W, H);
    const span = shutter(t);
    if (SUB === 1 || span < 0.01) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); drawScene(t); return; }
    // subframes spread across the open shutter (up to 0.7 of a frame), averaged
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    for (let i = 0; i < SUB; i++) {
      const ts = clamp(t + ((i + 0.5) / SUB - 0.5) * span / FPS, 0, 20);
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
  window.filmInfo = { W, H, SUB, FPS, P_LAND, P_END, pageY: (t) => pageY(t) };
  window.filmReady = true;
})().catch((e) => { window.filmError = String(e && e.stack || e); });
