
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* =====================================================================
   Painel 3D do hero (Gipper)
   - CSS 3D não bastou: precisamos de luz direcional coerente entre
     camadas, cantos arredondados reais e sombra "de chão" suave —
     three.js resolve com custo pequeno e só nesta rota.
   - Zoneless-friendly: tudo via listeners explícitos + rAF com
     cancelamento; nada de setInterval/Zone.js.
   - Decorativo: o wrapper tem aria-hidden="true".
   ===================================================================== */

const container = document.getElementById('hero3d');
const reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = reduceMotionMQ.matches;

/* ---------- tokens consumidos pela cena (nunca hardcoded solto) ------ */
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const TOK = {
  primary:       cssVar('--color-primary')       || '#2f5548',
  primaryHover:  cssVar('--color-primary-hover') || '#234136',
  primarySoft:   cssVar('--color-primary-soft')  || '#e3ebe6',
  surface:       cssVar('--color-surface')       || '#ffffff',
  accent:        cssVar('--color-accent')        || '#e4573d',
  highlight:     cssVar('--color-highlight')     || '#f2c14e',
  text:          cssVar('--color-text')          || '#182420',
};

/* =====================================================================
   Texturas procedurais (canvas 2D → CanvasTexture)
   Conteúdo abstrato: skeleton bars + chips com vocabulário real do
   produto (Em análise / Entrevista / Contratado). Nenhum dado inventado.
   ===================================================================== */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* Chip: pill com texto — vocabulário do produto, não dado. */
function drawChip(ctx, x, y, label, bg, fg, font) {
  ctx.font = font;
  const pad = 26;
  const w = ctx.measureText(label).width + pad * 2;
  const h = 52;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + pad, y + h / 2 + 2);
  return w;
}

/* ---- Camada 1: card principal verde-profundo (dashboard) ---- */
const texMain = makeTexture(768, 960, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h); // luz do topo esquerdo
  g.addColorStop(0, TOK.primary);
  g.addColorStop(1, TOK.primaryHover);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // brilho sutil no canto superior esquerdo (coerente com a key light)
  const glow = ctx.createRadialGradient(w * 0.08, h * 0.04, 0, w * 0.08, h * 0.04, w * 0.9);
  glow.addColorStop(0, 'rgba(255,255,255,0.10)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

  // barra de "janela" — 3 bolinhas
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.arc(56 + i * 40, 62, 11, 0, Math.PI * 2); ctx.fill();
  }

  // barras skeleton brancas translúcidas
  const bar = (x, y, bw, bh, alpha) => {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    roundRect(ctx, x, y, bw, bh, bh / 2); ctx.fill();
  };
  const mx = 56;
  bar(mx, 150, w * 0.62, 34, 0.38);          // título
  bar(mx, 216, w - mx * 2, 22, 0.22);
  bar(mx, 262, w * 0.45, 22, 0.22);

  // fileira de chips — mesmo vocabulário do mock original
  ctx.textBaseline = 'middle';
  let cx = mx;
  const chipFont = '600 25px Inter, system-ui, sans-serif';
  cx += drawChip(ctx, cx, 340, 'Em análise', 'rgba(255,255,255,0.16)', '#ffffff', chipFont) + 18;
  cx += drawChip(ctx, cx, 340, 'Entrevista', TOK.highlight, TOK.text, chipFont) + 18;
  drawChip(ctx, cx, 340, 'Contratado', TOK.highlight, TOK.text, chipFont);

  // mais skeleton
  bar(mx, 470, w - mx * 2, 22, 0.22);
  bar(mx, 516, w * 0.55, 22, 0.22);
  bar(mx, 600, w - mx * 2, 22, 0.16);
  bar(mx, 646, w * 0.7, 22, 0.16);
  bar(mx, 692, w * 0.4, 22, 0.16);
  bar(mx, 776, w - mx * 2, 22, 0.12);
  bar(mx, 822, w * 0.5, 22, 0.12);
});

/* ---- Camada 2: mini-card branco ("notificação de candidatura") ---- */
const texMini = makeTexture(512, 384, (ctx, w, h) => {
  ctx.fillStyle = TOK.surface; ctx.fillRect(0, 0, w, h);
  const mx = 44;
  ctx.fillStyle = TOK.primarySoft;
  roundRect(ctx, mx, 52, w * 0.55, 26, 13); ctx.fill();
  roundRect(ctx, mx, 102, w - mx * 2, 18, 9); ctx.fill();
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  drawChip(ctx, mx, 170, 'Candidatura', TOK.accent, '#ffffff', '600 22px Inter, system-ui, sans-serif');
  ctx.fillStyle = TOK.primarySoft;
  roundRect(ctx, mx, 262, w - mx * 2, 18, 9); ctx.fill();
});

/* ---- Camada 3: funil abstrato (3 barras decrescentes) ---- */
const texFunnel = makeTexture(512, 448, (ctx, w, h) => {
  ctx.fillStyle = TOK.primarySoft; ctx.fillRect(0, 0, w, h);
  const widths = [0.82, 0.58, 0.34];
  const alphas = [0.85, 0.6, 0.4];
  widths.forEach((fw, i) => {
    const bw = w * fw;
    const x = (w - bw) / 2;
    const y = 84 + i * 108;
    ctx.fillStyle = `rgba(47,85,72,${alphas[i]})`;
    roundRect(ctx, x, y, bw, 44, 22); ctx.fill();
  });
});

/* ---- sombra elíptica desfocada "no chão" ---- */
const texBlob = makeTexture(512, 256, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(24,36,32,0.34)');
  g.addColorStop(0.55, 'rgba(24,36,32,0.16)');
  g.addColorStop(1, 'rgba(24,36,32,0)');
  ctx.save();
  ctx.scale(1, h / w);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
  ctx.restore();
});

/* =====================================================================
   Cena three.js
   ===================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 0, 15);

/* Luz principal do topo esquerdo + preenchimento neutro:
   todas as camadas respondem à mesma luz, mantendo a coerência. */
const key = new THREE.DirectionalLight(0xfff6e8, 2.6);
key.position.set(-5, 7, 8);
scene.add(key);
const fill = new THREE.HemisphereLight(0xf1efe9, 0x9fb3a8, 1.15);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xe3ebe6, 0.7);
rim.position.set(4, -2, -6);
scene.add(rim);

/* rig = conjunto que recebe o tilt do ponteiro como um todo
   (nunca por camada, para não quebrar a coerência da luz). */
const rig = new THREE.Group();
scene.add(rig);

function matteCard(w, h, tex) {
  const geo = new RoundedBoxGeometry(w, h, 0.09, 4, 0.12);
  // RoundedBoxGeometry não expõe grupos de material; um único material
  // fosco com a textura nas faces — as bordas finas herdam os pixels de
  // borda da arte, como uma borda de card impresso.
  const face = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.82, metalness: 0.04,
  });
  return new THREE.Mesh(geo, face);
}

const mainCard = matteCard(3.35, 4.2, texMain);
mainCard.rotation.set(THREE.MathUtils.degToRad(4), THREE.MathUtils.degToRad(-8), 0);
rig.add(mainCard);

const miniCard = matteCard(1.85, 1.38, texMini);
miniCard.position.set(2.05, -0.85, 1.35);              // frente, à direita
miniCard.rotation.set(THREE.MathUtils.degToRad(3), THREE.MathUtils.degToRad(-16), 0);
rig.add(miniCard);

const funnelCard = matteCard(1.8, 1.55, texFunnel);
funnelCard.position.set(-2.35, 1.2, -1.35);            // atrás, à esquerda
funnelCard.rotation.set(THREE.MathUtils.degToRad(-2), THREE.MathUtils.degToRad(-4), 0);
rig.add(funnelCard);

/* sombra de chão ancorando o conjunto */
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(7.4, 3.7),
  new THREE.MeshBasicMaterial({ map: texBlob, transparent: true, depthWrite: false })
);
blob.rotation.x = -Math.PI / 2;
blob.position.set(0.35, -3.05, -0.2); // levemente à direita: luz vem da esquerda
scene.add(blob);

/* =====================================================================
   Motion — vivo, não nervoso
   - flutuação contínua lenta (±px / ±°) por camada, fases diferentes
   - tilt do ponteiro (≤ ±4°) com easing e retorno ao repouso
   - drag com inércia: segura a pose do usuário ~1s e volta suave
   - prefers-reduced-motion: cena estática elegante
   ===================================================================== */
const state = {
  // tilt por hover (alvo e valor atual, em radianos)
  tX: 0, tY: 0, cX: 0, cY: 0,
  // drag com inércia
  dragging: false, dX: 0, dY: 0, vX: 0, vY: 0,
  lastPX: 0, lastPY: 0, lastMoveT: 0,
  holdUntil: 0, // após o drag, segura a orientação antes de voltar
  hovering: false,
};

const D2R = THREE.MathUtils.degToRad;
const MAX_TILT = D2R(4);      // tilt de hover: sutil
const MAX_DRAG = D2R(24);     // drag permite amplitude maior
const HOLD_MS = 1100;         // pausa pós-drag antes do retorno

function onPointerMove(e) {
  if (state.dragging) {
    const now = performance.now();
    const dx = e.clientX - state.lastPX;
    const dy = e.clientY - state.lastPY;
    state.lastPX = e.clientX; state.lastPY = e.clientY;
    state.dY = THREE.MathUtils.clamp(state.dY + dx * 0.0035, -MAX_DRAG, MAX_DRAG);
    state.dX = THREE.MathUtils.clamp(state.dX + dy * 0.0035, -MAX_DRAG, MAX_DRAG);
    // velocidade para inércia no release
    const dt = Math.max(now - state.lastMoveT, 1);
    state.vY = (dx * 0.0035) / dt * 16;
    state.vX = (dy * 0.0035) / dt * 16;
    state.lastMoveT = now;
    return;
  }
  const r = container.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;   // -1..1
  const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
  state.tY = THREE.MathUtils.clamp(nx, -1, 1) * MAX_TILT;
  state.tX = THREE.MathUtils.clamp(ny, -1, 1) * MAX_TILT;
  state.hovering = true;
}
function onPointerDown(e) {
  if (reduceMotion) return;
  state.dragging = true;
  state.lastPX = e.clientX; state.lastPY = e.clientY;
  state.lastMoveT = performance.now();
  state.vX = 0; state.vY = 0;
  container.setPointerCapture?.(e.pointerId);
}
function onPointerUp() {
  if (!state.dragging) return;
  state.dragging = false;
  state.holdUntil = performance.now() + HOLD_MS; // segura a pose do usuário
}
function onPointerLeave() {
  state.hovering = false;
  state.tX = 0; state.tY = 0; // volta ao repouso com easing
  onPointerUp();
}

container.addEventListener('pointermove', onPointerMove);
container.addEventListener('pointerdown', onPointerDown);
container.addEventListener('pointerup', onPointerUp);
container.addEventListener('pointercancel', onPointerUp);
container.addEventListener('pointerleave', onPointerLeave);

/* ---------- resize (container some <900px via CSS) ---------- */
function resize() {
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
const ro = new ResizeObserver(resize);
ro.observe(container);
resize();

/* ---------- loop com cleanup correto ---------- */
let rafId = 0;
const clock = new THREE.Clock();

function frame() {
  const t = clock.getElapsedTime();

  if (!reduceMotion) {
    // flutuação: ±~2-3px em escala de cena, ±1-2° — fases distintas por camada
    rig.position.y = Math.sin(t * 0.8) * 0.07;
    mainCard.position.y = Math.sin(t * 0.9 + 0.6) * 0.05;
    miniCard.position.y = -0.85 + Math.sin(t * 1.05 + 2.1) * 0.09;
    funnelCard.position.y = 1.0 + Math.sin(t * 0.7 + 4.0) * 0.07;
    rig.rotation.z = Math.sin(t * 0.55) * D2R(1.1);

    // drag: inércia após soltar, depois segura e retorna ao neutro
    if (!state.dragging) {
      if (Math.abs(state.vX) > 0.0004 || Math.abs(state.vY) > 0.0004) {
        state.dX = THREE.MathUtils.clamp(state.dX + state.vX, -MAX_DRAG, MAX_DRAG);
        state.dY = THREE.MathUtils.clamp(state.dY + state.vY, -MAX_DRAG, MAX_DRAG);
        state.vX *= 0.94; state.vY *= 0.94; // atrito da inércia
        state.holdUntil = performance.now() + HOLD_MS;
      } else if (performance.now() > state.holdUntil) {
        state.dX *= 0.94; state.dY *= 0.94; // retorno suave ao neutro
      }
    }

    // hover tilt com easing
    state.cX += (state.tX - state.cX) * 0.06;
    state.cY += (state.tY - state.cY) * 0.06;

    rig.rotation.x = state.cX + state.dX;
    rig.rotation.y = state.cY + state.dY;

    // sombra acompanha a flutuação (encolhe/desfoca quando o conjunto sobe)
    const lift = (rig.position.y + 0.07) / 0.14; // 0..1
    const s = 1 - lift * 0.05;
    blob.scale.set(s, s, 1);
    blob.material.opacity = 1 - lift * 0.18;
  }

  renderer.render(scene, camera);
  rafId = requestAnimationFrame(frame);
}

function startLoop() {
  cancelAnimationFrame(rafId);
  if (reduceMotion) {
    // cena estática elegante: um único render, sem loop
    rig.rotation.set(0, 0, 0);
    renderer.render(scene, camera);
    return;
  }
  clock.start();
  rafId = requestAnimationFrame(frame);
}

/* pausa quando a aba fica ociosa (nenhum rAF com document.hidden) */
function onVisibility() {
  if (document.hidden) cancelAnimationFrame(rafId);
  else startLoop();
}
document.addEventListener('visibilitychange', onVisibility);

function onMotionPrefChange(e) {
  reduceMotion = e.matches;
  startLoop();
}
reduceMotionMQ.addEventListener('change', onMotionPrefChange);

startLoop();

/* cleanup — espelha o ngOnDestroy do componente Angular:
   remove listeners, cancela rAF e faz dispose de geometrias/materiais. */
function dispose() {
  cancelAnimationFrame(rafId);
  ro.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
  reduceMotionMQ.removeEventListener('change', onMotionPrefChange);
  container.removeEventListener('pointermove', onPointerMove);
  container.removeEventListener('pointerdown', onPointerDown);
  container.removeEventListener('pointerup', onPointerUp);
  container.removeEventListener('pointercancel', onPointerUp);
  container.removeEventListener('pointerleave', onPointerLeave);
  scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
    }
  });
  renderer.dispose();
  renderer.domElement.remove();
}
window.addEventListener('pagehide', dispose, { once: true });
