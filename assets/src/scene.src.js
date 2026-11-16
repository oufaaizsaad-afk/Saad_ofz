/* ==========================================================================
   CheckChiffreBet — scène 3D de la page d'accueil
   Un immeuble en 3D dont une moitié est en « façade normale » et l'autre en
   « vision thermique ». La séparation se règle en espace écran (uSplit).
   Toute la matière est dessinée par des shaders (aucune texture à charger).
   Ce fichier source est assemblé avec Three.js (seules les classes utilisées
   sont conservées) dans assets/scene.js.
   ========================================================================== */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Mesh, InstancedMesh, BoxGeometry,
  CylinderGeometry, PlaneGeometry, BufferGeometry, BufferAttribute,
  InstancedBufferAttribute, ShaderMaterial, Vector2, Vector3, Matrix4, Object3D, Color
} from 'three';

/* ---------- Dimensions de l'immeuble (unités arbitraires ≈ mètres) ---------- */
const BW = 9.0, BD = 7.0;            // largeur (x) et profondeur (z)
const FLOORS = 6, FH = 1.75, PLINTH = 0.9;
const H = PLINTH + FLOORS * FH;      // hauteur des murs
const ROOF_H = 2.3;
const TARGET_Y = (H + ROOF_H) / 2 - 0.4;

/* ---------- Générateur pseudo-aléatoire déterministe ---------- */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Code GLSL partagé ---------- */
const GLSL_COMMON = /* glsl */`
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/* Palette thermique : bleu nuit → violet → rouge → orange → jaune pâle */
const vec3 HM[7] = vec3[7](
  vec3(0.07, 0.09, 0.30), vec3(0.20, 0.14, 0.50), vec3(0.45, 0.16, 0.55), vec3(0.82, 0.22, 0.32),
  vec3(0.94, 0.45, 0.20), vec3(0.96, 0.72, 0.28), vec3(0.97, 0.92, 0.72));
vec3 heatMap(float t){
  t = clamp(t, 0.0, 0.9999) * 6.0;
  int i = int(t);
  return mix(HM[i], HM[i + 1], smoothstep(0.0, 1.0, fract(t)));
}
`;

/* ---------- Matière de l'immeuble et des bâtiments voisins ---------- */
const BUILDING_VERT = /* glsl */`
attribute float aLit;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vLit;
void main(){
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
    vN = normalize(mat3(modelMatrix) * n);
  #else
    vN = normalize(transpose(inverse(mat3(modelMatrix))) * n);
  #endif
  vec4 w = modelMatrix * p;
  vW = w.xyz; vUv = uv; vLit = aLit;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BUILDING_FRAG = /* glsl */`
${GLSL_COMMON}
uniform vec2 uRes; uniform float uSplit; uniform float uRetro; uniform float uTime;
uniform float uKind; uniform vec3 uBase; uniform float uBias; uniform vec3 uLight;
uniform vec3 uHorizon; uniform vec3 uHorizonT;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vLit;

void main(){
  vec3 N = normalize(vN);
  float diff = max(dot(N, normalize(uLight)), 0.0);
  float ao = mix(0.70, 1.0, smoothstep(0.0, 4.5, vW.y));
  float lightK = (0.40 + 0.22 * N.y + diff * 0.72) * ao;
  vec3 warm = mix(vec3(1.0), vec3(1.0, 0.86, 0.70), diff);
  vec3 col; float heat;
  float n1 = vnoise(vW.xy * 1.6 + vW.zz * 1.1) * 0.14 + vnoise(vW.xy * 5.0 + vW.z) * 0.05;
  float fl = fract(vW.y / ${FH.toFixed(2)});
  float bridge = smoothstep(0.16, 0.0, fl) * 0.20 + smoothstep(0.84, 1.0, fl) * 0.10;
  float retroK = 1.0 - uRetro;
  int kind = int(uKind + 0.5);

  if (kind == 0) {                                   // mur
    vec3 base = mix(vec3(0.72, 0.66, 0.56), vec3(0.90, 0.85, 0.76), clamp(vW.y / 12.0, 0.0, 1.0));
    base = mix(base, vec3(0.94, 0.91, 0.85), uRetro * 0.75) * uBase;
    float j = abs(fract(vW.y * 2.2) - 0.5);
    base *= 1.0 - 0.07 * smoothstep(0.46, 0.5, j);
    col = base * lightK * warm;
    heat = 0.30 + 0.20 * clamp(vW.y / 11.0, 0.0, 1.0) + bridge * retroK + n1;
    heat = mix(heat, heat * 0.40 + 0.03, uRetro) + uBias;
  } else if (kind == 1) {                            // fenêtre
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float frame = 1.0 - smoothstep(0.07, 0.09, edge);
    float mull = 1.0 - smoothstep(0.012, 0.024, abs(vUv.x - 0.5));
    vec3 glass = vec3(0.09, 0.16, 0.22) + vec3(0.10, 0.17, 0.22) * vUv.y;
    glass = mix(glass, vec3(0.17, 0.30, 0.38) + vec3(0.12, 0.16, 0.18) * vUv.y, uRetro * 0.7);
    float pulse = 0.88 + 0.12 * sin(uTime * 0.7 + vLit * 40.0);
    vec3 lamp = mix(vec3(1.0, 0.72, 0.36), vec3(1.0, 0.90, 0.62), vUv.y) * pulse;
    float lit = step(0.05, vLit) * vLit;
    vec3 pane = mix(glass, lamp, lit);
    vec3 frameCol = vec3(0.88, 0.84, 0.76) * (0.55 + diff * 0.45);
    col = mix(pane, frameCol, max(frame, mull * 0.85));
    float paneHeat = (0.74 + 0.20 * lit + 0.06 * vUv.y) * mix(1.0, 0.64, uRetro);
    float frameHeat = 0.58 * mix(1.0, 0.45, uRetro);
    heat = mix(paneHeat, frameHeat, max(frame, mull * 0.8));
  } else if (kind == 2) {                            // toiture
    float lines = 0.92 + 0.08 * smoothstep(0.35, 0.5, abs(fract(vW.y * 3.0) - 0.5));
    vec3 slate = mix(vec3(0.20, 0.25, 0.30), vec3(0.27, 0.34, 0.40), uRetro);
    col = slate * lightK * lines * mix(vec3(1.0), vec3(1.0, 0.9, 0.8), diff);
    heat = (0.70 + n1 * 0.8) * mix(1.0, 0.50, uRetro);
  } else if (kind == 3) {                            // corniches, balcons, souches
    col = vec3(0.84, 0.79, 0.70) * lightK * warm;
    heat = 0.62 * mix(1.0, 0.40, uRetro) + uBias;
  } else if (kind == 7) {                            // porte
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float frame = 1.0 - smoothstep(0.05, 0.07, edge);
    col = mix(vec3(0.13, 0.22, 0.28) + vec3(0.30, 0.22, 0.10) * smoothstep(0.55, 0.9, vUv.y) * 0.25, vec3(0.88, 0.84, 0.76) * 0.7, frame);
    heat = 0.46 * mix(1.0, 0.6, uRetro);
  } else {                                           // bâtiments voisins
    vec3 base = uBase * (0.50 + 0.50 * diff);
    float horiz = abs(N.x) > abs(N.z) ? vW.z : vW.x;
    vec2 cell = floor(vec2(horiz * 0.85, vW.y * 0.62));
    vec2 loc = fract(vec2(horiz * 0.85, vW.y * 0.62));
    float mask = step(0.22, loc.x) * step(loc.x, 0.78) * step(0.28, loc.y) * step(loc.y, 0.74) * step(abs(N.y), 0.5);
    float lit = step(0.64, hash21(cell + uBase.r * 17.0));
    col = base + vec3(0.04, 0.07, 0.10) * mask + vec3(1.0, 0.76, 0.42) * 0.85 * mask * lit;
    float fogK = clamp((length(vW.xz) - 22.0) / 55.0, 0.0, 0.7);
    col = mix(col, uHorizon * 0.55, fogK);
    heat = 0.08 + mask * (0.10 + lit * 0.42) + n1 * 0.2;
    float fogT = fogK;
    heat = mix(heat, 0.05, fogT * 0.8);
  }

  heat += 0.012 * sin(vW.y * 6.0 - uTime * 1.8);
  vec3 thermal = heatMap(heat);
  float sx = gl_FragCoord.x / uRes.x;
  float k = smoothstep(uSplit - 0.0015, uSplit + 0.0015, sx);
  vec3 outc = mix(col, thermal, k);
  outc += vec3(0.85, 0.93, 1.0) * exp(-abs(sx - uSplit) * 90.0) * 0.30;
  gl_FragColor = vec4(outc, 1.0);
}`;

/* ---------- Ciel et horizon (plan plein écran, direction du regard) ---------- */
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vec4 far = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
  vDir = (inverse(viewMatrix) * vec4(far.xyz / far.w, 0.0)).xyz;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const SKY_FRAG = /* glsl */`
${GLSL_COMMON}
uniform vec2 uRes; uniform float uSplit; uniform float uTime; uniform float uRetro;
uniform vec3 uHorizon; uniform vec3 uHorizonT; uniform float uStars;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float e = d.y;
  vec3 zen = vec3(0.055, 0.13, 0.19), mid = vec3(0.105, 0.30, 0.39);
  vec3 sky = mix(uHorizon, mid, smoothstep(0.0, 0.20, e));
  sky = mix(sky, zen, smoothstep(0.15, 0.70, e));
  if (uStars > 0.5) {
    vec2 sp = floor(vec2(atan(d.z, d.x) * 90.0, e * 90.0));
    float st = step(0.9945, hash21(sp)) * smoothstep(0.18, 0.45, e);
    sky += vec3(0.9, 0.95, 1.0) * st * (0.55 + 0.45 * sin(uTime * 1.3 + hash21(sp) * 60.0));
  }
  float md = dot(d, normalize(vec3(0.35, 0.36, -0.86)));
  sky += vec3(0.95, 0.92, 0.82) * smoothstep(0.9987, 0.9992, md) * 0.55 + vec3(0.9, 0.85, 0.7) * pow(max(md, 0.0), 70.0) * 0.16;
  vec3 tz = vec3(0.04, 0.09, 0.14), tm = vec3(0.07, 0.17, 0.24);
  vec3 skyT = mix(uHorizonT, tm, smoothstep(0.0, 0.20, e));
  skyT = mix(skyT, tz, smoothstep(0.15, 0.70, e));
  vec2 g = step(0.88, fract(gl_FragCoord.xy / 4.0));
  skyT += vec3(0.10, 0.18, 0.28) * g.x * g.y * 0.55 * smoothstep(0.0, 0.2, e + 0.1);
  float sx = gl_FragCoord.x / uRes.x;
  float k = smoothstep(uSplit - 0.0015, uSplit + 0.0015, sx);
  vec3 outc = mix(sky, skyT, k);
  outc += vec3(0.85, 0.93, 1.0) * exp(-abs(sx - uSplit) * 90.0) * 0.22;
  gl_FragColor = vec4(outc, 1.0);
}`;

/* ---------- Sol (plan horizontal) ---------- */
const GROUND_VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const GROUND_FRAG = /* glsl */`
${GLSL_COMMON}
uniform vec2 uRes; uniform float uSplit; uniform float uRetro; uniform float uTime;
uniform vec3 uHorizon; uniform vec3 uHorizonT;
varying vec3 vW;
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main(){
  float r = length(vW.xz);
  float sd = sdBox(vW.xz, vec2(${(BW / 2).toFixed(2)}, ${(BD / 2).toFixed(2)}));
  float fog = smoothstep(10.0, 110.0, r);
  vec3 near = vec3(0.17, 0.15, 0.17);
  vec3 col = mix(near, uHorizon * 0.86, fog);
  col *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, 5.0, sd));
  col += 0.05 * smoothstep(0.5, 0.7, sd) * (1.0 - smoothstep(1.5, 1.7, sd));
  col += vec3(0.30, 0.20, 0.10) * 0.18 * exp(-sd * 0.55) * (0.6 + 0.4 * sin(uTime * 0.5));
  float heat = 0.05 + 0.20 * exp(-sd * 0.8) + vnoise(vW.xz * 0.8) * 0.03;
  heat = mix(heat, heat * 0.55, uRetro);
  vec3 thermal = mix(heatMap(heat), uHorizonT, fog);
  float sx = gl_FragCoord.x / uRes.x;
  float k = smoothstep(uSplit - 0.0015, uSplit + 0.0015, sx);
  vec3 outc = mix(col, thermal, k);
  outc += vec3(0.85, 0.93, 1.0) * exp(-abs(sx - uSplit) * 90.0) * 0.22;
  gl_FragColor = vec4(outc, 1.0);
}`;

/* ==========================================================================
   Construction de la scène
   ========================================================================== */
function buildScene(lite, U) {
  const scene = new Scene();
  const mk = (kind, base, bias) => new ShaderMaterial({
    vertexShader: BUILDING_VERT, fragmentShader: BUILDING_FRAG,
    uniforms: Object.assign({}, U, {
      uKind: { value: kind }, uBase: { value: base || new Vector3(1, 1, 1) }, uBias: { value: bias || 0 }
    })
  });
  const mWall = mk(0), mPlinth = mk(0, new Vector3(0.70, 0.66, 0.60), -0.08);
  const mWin = mk(1), mRoof = mk(2), mTrim = mk(3), mDoor = mk(7);
  const mNear = mk(4, new Vector3(0.075, 0.17, 0.235));

  /* Ciel (dessiné en premier, sans profondeur) */
  const skyGeo = new BufferGeometry();
  skyGeo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const sky = new Mesh(skyGeo, new ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false,
    uniforms: Object.assign({}, U, { uStars: { value: lite ? 0 : 1 } })
  }));
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  /* Sol */
  const ground = new Mesh(new PlaneGeometry(600, 600), new ShaderMaterial({
    vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: Object.assign({}, U)
  }));
  ground.rotation.x = -Math.PI / 2; ground.renderOrder = -5;
  scene.add(ground);

  const add = (geo, mat, x, y, z) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m; };

  /* Murs, soubassement */
  add(new BoxGeometry(BW, H, BD), mWall, 0, H / 2, 0);
  add(new BoxGeometry(BW + 0.14, PLINTH, BD + 0.14), mPlinth, 0, PLINTH / 2, 0);

  /* Corniches à chaque plancher + grande corniche de couronnement */
  const slabs = [];
  for (let i = 1; i <= FLOORS; i++) slabs.push([0, PLINTH + i * FH - 0.05, 0, BW + 0.14, 0.10, BD + 0.14]);
  slabs.push([0, H + 0.08, 0, BW + 0.55, 0.22, BD + 0.55]);
  /* Balcons filants sur la façade avant (2e et 4e étages) */
  [1, 3].forEach(f => {
    const y = PLINTH + f * FH + 0.36;
    slabs.push([0, y, BD / 2 + 0.38, 1.9, 0.09, 0.76]);
    slabs.push([0, y + 0.26, BD / 2 + 0.74, 1.9, 0.42, 0.04]);
  });
  slabs.push([0, 0.10, BD / 2 + 0.40, 2.2, 0.20, 0.8]);           // marche d'entrée
  const trimMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mTrim, slabs.length);
  const dummy = new Object3D();
  slabs.forEach((s, i) => { dummy.position.set(s[0], s[1], s[2]); dummy.scale.set(s[3], s[4], s[5]); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); trimMesh.setMatrixAt(i, dummy.matrix); });
  scene.add(trimMesh);

  /* Porte d'entrée */
  add(new BoxGeometry(1.3, 2.0, 0.12), mDoor, 0, 1.15, BD / 2 + 0.04);

  /* Fenêtres : 4 façades × 6 niveaux, éclairées au hasard */
  const rand = rng(20261116);
  const wins = [];                                   // [x, y, z, rotY]
  for (let f = 0; f < FLOORS; f++) {
    const y = PLINTH + f * FH + FH * 0.55;
    const cols = f === 0 ? [-3.0, 3.0] : [-3.0, 0, 3.0];
    cols.forEach(x => { wins.push([x, y, BD / 2 + 0.03, 0]); wins.push([x, y, -BD / 2 - 0.03, Math.PI]); });
    [-1.7, 1.7].forEach(z => { wins.push([BW / 2 + 0.03, y, z, Math.PI / 2]); wins.push([-BW / 2 - 0.03, y, z, -Math.PI / 2]); });
  }
  /* Lucarnes sur la toiture (façade avant) */
  const dormerZ = (BD / 2 + 0.25) * (1 - 0.36 * 0.41);
  [-2.3, 2.3].forEach(x => wins.push([x, H + 0.95, dormerZ + 0.47, 0, 0.8]));
  const winGeo = new BoxGeometry(1.05, 1.2, 0.10);
  const winMesh = new InstancedMesh(winGeo, mWin, wins.length);
  const lit = new Float32Array(wins.length);
  wins.forEach((w, i) => {
    dummy.position.set(w[0], w[1], w[2]); dummy.rotation.set(0, w[3], 0);
    dummy.scale.set(w[4] || 1, w[4] || 1, 1); dummy.updateMatrix();
    winMesh.setMatrixAt(i, dummy.matrix);
    lit[i] = rand() < 0.36 ? 0.55 + rand() * 0.45 : 0;
  });
  winGeo.setAttribute('aLit', new InstancedBufferAttribute(lit, 1));
  scene.add(winMesh);

  /* Toiture à pans (tronc de pyramide), lucarnes, souches de cheminée */
  const roofGeo = new CylinderGeometry(Math.SQRT2 * 0.64, Math.SQRT2, ROOF_H, 4, 1, false);
  roofGeo.rotateY(Math.PI / 4);
  const roof = add(roofGeo, mRoof, 0, H + 0.15 + ROOF_H / 2, 0);
  roof.scale.set(BW / 2 + 0.25, 1, BD / 2 + 0.25);
  [-2.3, 2.3].forEach(x => {
    add(new BoxGeometry(1.3, 1.1, 0.9), mRoof, x, H + 0.95, dormerZ);
    add(new BoxGeometry(1.55, 0.14, 1.15), mTrim, x, H + 1.55, dormerZ + 0.05);
  });
  add(new BoxGeometry(0.7, 1.6, 0.7), mTrim, -2.7, H + ROOF_H + 0.55, -0.6);
  add(new BoxGeometry(0.7, 1.4, 0.7), mTrim, 1.9, H + ROOF_H + 0.45, 0.4);

  /* Couronne de silhouettes d'immeubles lointains (une seule instance, un seul appel de rendu) */
  const ringN = lite ? 16 : 30;
  const ring = new InstancedMesh(new BoxGeometry(1, 1, 1), mNear, ringN);
  const rr = rng(77);
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2 + (rr() - 0.5) * 0.18;
    const rad = 34 + rr() * 26, w = 4 + rr() * 4.5, d = 4 + rr() * 4.5, h = 6 + rr() * 14 + (rr() < 0.18 ? 8 : 0);
    dummy.position.set(Math.cos(a) * rad, h / 2, Math.sin(a) * rad);
    dummy.rotation.set(0, rr() * Math.PI, 0); dummy.scale.set(w, h, d); dummy.updateMatrix();
    ring.setMatrixAt(i, dummy.matrix);
  }
  scene.add(ring);
  return scene;
}

/* ==========================================================================
   API publique
   ========================================================================== */
export function createScene(opts) {
  opts = opts || {};
  const lite = !!opts.lite;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y';
  const gl2 = canvas.getContext('webgl2', { antialias: !lite, powerPreference: 'high-performance' });
  if (!gl2) throw new Error('WebGL2 indisponible');
  const renderer = new WebGLRenderer({ canvas, context: gl2, antialias: !lite });
  renderer.setClearColor(0x0f2230, 1);
  let dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);
  renderer.setPixelRatio(dpr);

  const U = {
    uRes: { value: new Vector2(1, 1) }, uSplit: { value: 0.5 }, uRetro: { value: 0 }, uTime: { value: 0 },
    uLight: { value: new Vector3(-0.55, 0.62, 0.56) },
    uHorizon: { value: new Vector3(0.92, 0.64, 0.42) }, uHorizonT: { value: new Vector3(0.10, 0.15, 0.36) }
  };
  const scene = buildScene(lite, U);
  const camera = new PerspectiveCamera(28, 1, 0.5, 900);

  const api = {
    canvas: canvas, state: null, onFrame: null, running: false,
    setState: function (s) { api.state = s; },
    attach: function (slot) {
      if (canvas.parentNode !== slot) slot.appendChild(canvas);
      api.resize(); api.renderOnce();
    },
    resize: function () {
      const p = canvas.parentNode; if (!p) return;
      const w = Math.max(2, p.clientWidth), h = Math.max(2, p.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const v = new Vector2(); renderer.getDrawingBufferSize(v); U.uRes.value.copy(v);
    },
    renderOnce: function () { if (api.state) { place(); renderer.render(scene, camera); } },
    start: function () { if (api.running) return; api.running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop: function () { api.running = false; cancelAnimationFrame(raf); },
    dispose: function () { api.stop(); renderer.dispose(); }
  };

  /* Placement de la caméra à partir de l'état (angles en degrés) */
  function place() {
    const S = api.state, rad = Math.PI / 180;
    const vf = camera.fov * rad, tv = Math.tan(vf / 2), asp = camera.aspect;
    const distV = ((H + ROOF_H) / 2 + 1.6) / tv;
    const distH = (BW * 0.55 + 0.8) / (tv * asp);   // écrans étroits : l'immeuble remplit la largeur, les bords peuvent être légèrement rognés
    const dist = Math.max(distV, distH) * S.dist;
    const az = (S.az + (S.parX || 0)) * rad;
    const el = Math.max(1, Math.min(40, S.el + (S.parY || 0))) * rad;
    const ty = TARGET_Y + (S.ty || 0);
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, ty + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(0, ty, 0);
    U.uSplit.value = S.split; U.uRetro.value = S.retro;
  }

  let raf = 0, last = 0, frames = 0, acc = 0, tuned = false;
  function frame(now) {
    if (!api.running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const S = api.state; if (!S) return;
    S.az += (S.spin || 0) * dt;
    U.uTime.value += dt;
    place();
    renderer.render(scene, camera);
    if (api.onFrame) api.onFrame(S);
    /* Réglage dynamique de la résolution si la machine peine */
    if (!tuned) {
      frames++; acc += dt;
      if (frames === 90) {
        tuned = true;
        if (acc / frames > 0.026 && dpr > 1) { dpr = Math.max(1, dpr * 0.7); renderer.setPixelRatio(dpr); api.resize(); }
      }
    }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); } else if (api.running) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); api.stop(); if (opts.onLost) opts.onLost(); });
  window.addEventListener('resize', function () { api.resize(); });
  return api;
}
