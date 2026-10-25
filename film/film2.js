/* Sai & Dharma — invitation film, second direction (5-second test).
   The website's own sections become front-on, screen-filling scenes. The film opens on the
   hero (the uyyala photo and the couple's names), pulls back once to show the whole page lying
   on the ivory floor, then comes down onto the couple section while the two portraits rise
   off the page. Same capture and shaders as film.js; every frame is computed from time in seek(t).

   URL params: w, h (output size), fps. */
'use strict';
(async function () {
  const Q = new URLSearchParams(location.search);
  const W = +Q.get('w') || 1080, H = +Q.get('h') || 1920;
  const FPS = +Q.get('fps') || 60;
  const K = W / 1080;                       // designed at 1080 x 1920
  const DUR = 5;
  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

  /* ---------------- design constants ---------------- */
  const PAGE_W = 390;                       // world units = page CSS px
  const F = 1240 * K;                       // focal length, output px
  const DOF = { front: 10 * K, back: 3 * K, cap: 24 * K };   // a light touch: no heavy depth blur
  const FLOOR_MID = [0xfb / 255, 0xf6 / 255, 0xec / 255];
  const FLOOR_EDGE = [0xee / 255, 0xe2 / 255, 0xcd / 255];
  const HAZE = [0xf8 / 255, 0xf1 / 255, 0xe5 / 255];
  const FOG = [1400, 5200, 0.6];            // depth near, far, max mix
  const SHADOW_TINT = [0x1a / 255, 0x21 / 255, 0x33 / 255, 1];
  // camera distance at which the page width just fills the frame (a few px of page edge cropped)
  const D_FILL = PAGE_W * 1240 / 1080 * 0.985;

  /* ---------------- shots ---------------- */
  const HERO_Y = 585;                       // frame centre: the uyyala photo, the names and the date line
  const COUPLE_Y = 2076;                    // the couple section, edge to edge
  const T_OUT = 1.9, T_APEX = 2.9, T_IN = 4.0;   // pull back to the page view, then swoop down to the couple
  const APEX_D = +(Q.get('apexd') || 900), APEX_TILT = +(Q.get('apext') || 32), APEX_ROLL = +(Q.get('apexr') || 4);   // the page view
  const APEX_Y = 900, APEX_V = 450;         // frame centre at the page view, and how fast it still moves down the page (px/s)

  /* ---------------- helpers ---------------- */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const smoother = (u) => { u = clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
  const lerp = (a, b, u) => a + (b - a) * u;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

  /* ---------------- camera ---------------- */
  // front-on (straight down) on a section; between shots the camera pulls back to a tilted view of the page,
  // then swoops down the page onto the next section. Position along the page is a cubic Hermite curve, so the
  // speed is continuous through the page view; distance, tilt and roll ease in and out of it.
  const hermite = (p0, m0, p1, m1, u, dt) => {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 * dt + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1 * dt;
  };
  function cameraAt(t) {
    let Ly, D, tilt = 0, roll = 0;
    if (t <= T_OUT) {
      Ly = HERO_Y; D = D_FILL * lerp(1, 0.975, smoother(t / T_OUT));            // a slow push; the photo card stays whole
    } else if (t <= T_APEX) {
      const u = (t - T_OUT) / (T_APEX - T_OUT), e = smoother(u);
      Ly = hermite(HERO_Y, 0, APEX_Y, APEX_V, u, T_APEX - T_OUT);
      D = Math.exp(lerp(Math.log(D_FILL * 0.975), Math.log(APEX_D), e));
      tilt = APEX_TILT * e; roll = APEX_ROLL * e;
    } else if (t < T_IN) {
      const u = (t - T_APEX) / (T_IN - T_APEX), e = smoother(u);
      Ly = hermite(APEX_Y, APEX_V, COUPLE_Y, 0, u, T_IN - T_APEX);
      D = Math.exp(lerp(Math.log(APEX_D), Math.log(D_FILL), e));
      tilt = APEX_TILT * (1 - e); roll = APEX_ROLL * (1 - e);
    } else {
      Ly = COUPLE_Y; D = D_FILL * lerp(1, 0.97, smoother((t - T_IN) / (DUR - T_IN)));
    }
    const th = tilt * Math.PI / 180;
    const target = [0, -Ly, 0];
    const pos = add(target, [0, -Math.sin(th) * D, Math.cos(th) * D]);
    // a slight roll turns the page view into a diagonal
    const z = norm(sub(pos, target)), x0 = norm(cross([0, 1, 0], z)), y0 = cross(z, x0), r = roll * Math.PI / 180;
    const up = add(mul(y0, Math.cos(r)), mul(x0, Math.sin(r)));
    return { pos, target, up, D, tilt, Ly };
  }
  // lift per piece over time: height above the page (world px)
  function liftOf(id, t) {
    if (id === 'heroCard') return 4;
    if (id === 'badge') return 6;
    if (id === 'bride' || id === 'groom') return 14 * smoother((t - (T_IN - 0.6)) / 0.8);    // the portraits rise as the camera lands
    if (id === 'amp') return 24 * smoother((t - (T_IN - 0.5)) / 0.8);
    return 0;
  }

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

  /* ---------------- drawing ---------------- */
  let VPs, focusDepth = 500;
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
    gl.uniform1f(u.uExtraBlur, 0);
    gl.uniform1f(u.uOpacity, o.opacity != null ? o.opacity : 1);
    gl.uniform1f(u.uHazeMix, 0);
    gl.uniform3fv(u.uHaze, HAZE);
    gl.uniform3fv(u.uFog, FOG);
    gl.uniform1i(u.uMode, o.shadow ? 1 : 0);
    gl.uniform4fv(u.uTint, SHADOW_TINT);
    gl.uniform1f(u.uShadowBlur, o.shadowBlur || 0);
    gl.uniform2fv(u.uQuadPx, o.quadPx || [1, 1]);
    gl.uniform4fv(u.uCorners, o.corners || [0, 0, 0, 0]);
    gl.uniform4fv(u.uUv, o.uv || [0, 0, 1, 1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const rectCorners = (x0, y0, w, h, z = 0) => [[x0 - PAGE_W / 2, -y0, z], [x0 + w - PAGE_W / 2, -y0, z], [x0 - PAGE_W / 2, -(y0 + h), z], [x0 + w - PAGE_W / 2, -(y0 + h), z]];

  function drawScene(t) {
    const cam = cameraAt(t);
    VPs = matrices(cam);
    const viewDepth = (p) => -(VPs.V[2] * p[0] + VPs.V[6] * p[1] + VPs.V[10] * p[2] + VPs.V[14]);
    focusDepth = viewDepth(cam.target);

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
      const f = (y1 - y) / h;
      const c = o.corners ? [o.corners[0], o.corners[1], f < 1 ? 0.0001 : o.corners[2], f < 1 ? 0.0001 : o.corners[3]] : null;
      drawQuad(tex, rectCorners(x, y, w, y1 - y, z), { ...o, uv: [0, 0, 1, f], quadPx: [w, y1 - y], corners: c || o.corners });
    };
    tiles.forEach((tl, i) => {
      const first = i === 0, last = i === tiles.length - 1;
      drawClipped(tl, 0, tl.y, PAGE_W, tl.h, 0, { corners: [first ? 16 : 0.0001, first ? 16 : 0.0001, last ? 16 : 0.0001, last ? 16 : 0.0001] });
    });
    // pieces: shadows first, then the pieces, far to near
    const live = Object.values(pieces).map((p) => ({ p, z: liftOf(p.id, t) }));
    live.sort((a, b) => viewDepth([0, -(b.p.y + b.p.h / 2), b.z]) - viewDepth([0, -(a.p.y + a.p.h / 2), a.z]));
    for (const l of live) {
      if (l.z > 0.5) drawClipped(l.p, l.p.x + 0.10 * l.z, l.p.y + 4 + 0.36 * l.z, l.p.w, l.p.h, 0.15, { shadow: true, shadowBlur: (6 + 0.45 * l.z) * DPR, opacity: Math.min(0.26, 0.02 * l.z) });
    }
    for (const l of live) drawClipped(l.p, l.p.x, l.p.y, l.p.w, l.p.h, l.z);
  }

  function seek(t) {
    gl.viewport(0, 0, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    drawScene(clamp(t, 0, DUR));
  }
  window.seek = seek;
  window.frame = async (t, type = 'image/jpeg', q = 0.94) => { seek(t); gl.finish(); return canvas.toDataURL(type, q); };
  window.filmInfo = { W, H, FPS, DUR, cameraAt };
  window.filmReady = true;
})().catch((e) => { window.filmError = String(e && e.stack || e); });
