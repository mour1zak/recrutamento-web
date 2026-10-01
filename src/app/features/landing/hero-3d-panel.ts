import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import type {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Group,
  Mesh,
  Clock,
  Texture,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';

type ThreeModule = typeof import('three');
type RoundedBoxCtor = typeof import('three/addons/geometries/RoundedBoxGeometry.js').RoundedBoxGeometry;

/**
 * Painel 3D imersivo do hero da landing (pré-login).
 *
 * Modelo gerado pelo Kimi a partir do briefing (`docs/kimi-hero3d-referencia.js`
 * guarda a referência original) e portado para componente Angular com as
 * restrições do projeto:
 *
 * - **three.js via dynamic import**: o peso entra só no chunk lazy da landing;
 *   nenhuma outra rota paga por isso e o initial bundle não muda;
 * - **zoneless-friendly**: listeners explícitos + `requestAnimationFrame` com
 *   cancelamento; nada de `setInterval`/Zone.js;
 * - **cleanup total no `ngOnDestroy`**: listeners, rAF, ResizeObserver,
 *   geometrias, materiais, texturas e renderer — obrigatório numa SPA onde a
 *   landing é visitada e abandonada sem reload;
 * - **`prefers-reduced-motion`**: um único render estático, sem loop/tilt;
 * - **aba oculta pausa** (`visibilitychange`): nenhum rAF com `document.hidden`;
 * - **fallback sem WebGL/import** (bots, jsdom, GPUs bloqueadas, chunk ausente):
 *   o painel vira o mock estático anterior dentro do mesmo hero — a landing
 *   nunca mostra um buraco vazio e os testes não quebram;
 * - **custo sob controle**: DPR limitado a 1.75 e loop de render ativo apenas
 *   enquanto o painel está na viewport (IntersectionObserver) e a aba visível;
 * - decorativo: `aria-hidden="true"` no host do canvas.
 *
 * A cena usa SÓ os tokens de cor do design system (lidos via
 * `getComputedStyle`), então qualquer re-tematização dos `--color-*`
 * reposiciona o 3D junto.
 */
@Component({
  selector: 'app-hero-3d-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hero3d" #host aria-hidden="true">
      @if (fallback()) {
        <!--
          Degradação honesta: sem WebGL (ou sem o chunk do three), o hero
          mostra o mock estático anterior — nunca um buraco vazio.
        -->
        <div class="mock">
          <div class="mock__bar"><span></span><span></span><span></span></div>
          <div class="mock__row mock__row--title"></div>
          <div class="mock__row"></div>
          <div class="mock__row mock__row--short"></div>
          <div class="mock__chips">
            <span class="chip">Em análise</span>
            <span class="chip chip--ok">Entrevista</span>
            <span class="chip chip--ok">Contratado</span>
          </div>
          <div class="mock__row"></div>
          <div class="mock__row mock__row--short"></div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .hero3d {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 520px;
        /* o halo abaixo usa inset negativo; clip evita scrollbar horizontal */
        overflow: clip;
      }

      /* halo decorativo atrás da cena (mesma linguagem do hero) */
      .hero3d::before {
        content: '';
        position: absolute;
        inset: -8% -12%;
        background:
          radial-gradient(58% 52% at 42% 38%, rgb(227 235 230 / 95%), rgb(227 235 230 / 0%) 70%),
          radial-gradient(40% 36% at 66% 64%, rgb(242 193 78 / 16%), rgb(242 193 78 / 0%) 72%);
        pointer-events: none;
      }

      .hero3d canvas {
        display: block;
        width: 100%;
        height: 100%;
        touch-action: pan-y;
      }

      .mock {
        width: 100%;
        max-width: 380px;
        background: var(--color-primary);
        border: 1px solid var(--color-primary-hover);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        padding: var(--space-5);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        position: relative;
        z-index: 1;
      }

      .mock__bar {
        display: flex;
        gap: 6px;
      }

      .mock__bar span {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: rgb(255 255 255 / 35%);
      }

      .mock__row {
        height: 12px;
        border-radius: var(--radius-pill);
        background: rgb(255 255 255 / 22%);
      }

      .mock__row--title {
        height: 18px;
        width: 70%;
        background: rgb(255 255 255 / 38%);
      }

      .mock__row--short {
        width: 45%;
      }

      .mock__chips {
        display: flex;
        gap: var(--space-2);
      }

      .mock .chip {
        background: rgb(255 255 255 / 16%);
        color: #fff;
      }

      .mock .chip--ok {
        background: var(--color-highlight);
        color: #182420;
      }
    `,
  ],
})
export class Hero3dPanelComponent implements OnDestroy {
  @ViewChild('host', { static: true }) private readonly host!: ElementRef<HTMLDivElement>;

  private THREE!: ThreeModule;
  private RoundedBox!: RoundedBoxCtor;

  private container!: HTMLDivElement;
  private renderer: WebGLRenderer | null = null;
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private rig!: Group;
  private mainCard!: Mesh;
  private miniCard!: Mesh;
  private funnelCard!: Mesh;
  private blob!: Mesh;
  private clock!: Clock;

  /**
   * Mock estático visível IMEDIATAMENTE; o 3D é upgrade progressivo.
   *
   * Lição do incidente: esperar o three (chunk grande, otimização de deps no
   * dev-server) antes de pintar deixava a landing em branco/"travada" em
   * máquina lenta. Agora o first paint nunca depende do 3D: o mock entra na
   * hora e, se/de quando a cena ficar pronta, trocamos sem buraco no meio.
   */
  protected readonly fallback = signal(true);

  private rafId = 0;
  private io: IntersectionObserver | null = null;
  private inViewport = true;
  private ro: ResizeObserver | null = null;
  private mq!: MediaQueryList;
  private reduceMotion = false;
  private disposed = false;

  private readonly state = {
    tX: 0,
    tY: 0,
    cX: 0,
    cY: 0,
    dragging: false,
    dX: 0,
    dY: 0,
    vX: 0,
    vY: 0,
    lastPX: 0,
    lastPY: 0,
    lastMoveT: 0,
    holdUntil: 0,
    hovering: false,
  };

  constructor() {
    // afterNextRender: o container só existe depois do primeiro render do host.
    afterNextRender(() => {
      this.container = this.host.nativeElement;
      void this.boot();
    });
  }

  // -------------------------------------------------------------------------
  // Boot: dynamic import + cena (falha silenciosa viram halo decorativo)
  // -------------------------------------------------------------------------

  /** Probe barato: se o browser não tem WebGL, nem baixamos o chunk do three. */
  private webglAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }

  private async boot(): Promise<void> {
    if (this.disposed) return;
    if (!this.webglAvailable()) {
      this.fallback.set(true);
      return;
    }
    try {
      const [three, addons] = await Promise.all([
        import('three'),
        import('three/addons/geometries/RoundedBoxGeometry.js'),
      ]);
      if (this.disposed) return;
      this.THREE = three;
      this.RoundedBox = addons.RoundedBoxGeometry;
      this.initScene();
    } catch {
      // Sem three/WebGL (jsdom de teste, GPU bloqueada): painel decorativo.
      this.renderer = null;
    }
  }

  private cssVar(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  private initScene(): void {
    const THREE = this.THREE;

    const TOK = {
      primary: this.cssVar('--color-primary', '#2f5548'),
      primaryHover: this.cssVar('--color-primary-hover', '#234136'),
      primarySoft: this.cssVar('--color-primary-soft', '#e3ebe6'),
      surface: this.cssVar('--color-surface', '#ffffff'),
      accent: this.cssVar('--color-accent', '#e4573d'),
      highlight: this.cssVar('--color-highlight', '#f2c14e'),
      text: this.cssVar('--color-text', '#182420'),
    };

    // ---- texturas desenhadas em canvas 2D (arte fosca dos cards) ----
    const roundRect = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ): void => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x + h, y, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const makeTexture = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('canvas 2d indisponível');
      draw(ctx, w, h);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    };

    const drawChip = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      label: string,
      bg: string,
      fg: string,
      font: string,
    ): number => {
      ctx.font = font;
      const pad = 26;
      const w = ctx.measureText(label).width + pad * 2;
      const h = 52;
      ctx.fillStyle = bg;
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + pad, y + h / 2 + 2);
      return w;
    };

    // Camada 1: card principal verde-profundo (dashboard abstrato)
    const texMain = makeTexture(768, 960, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, TOK.primary);
      g.addColorStop(1, TOK.primaryHover);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w * 0.08, h * 0.04, 0, w * 0.08, h * 0.04, w * 0.9);
      glow.addColorStop(0, 'rgba(255,255,255,0.10)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(56 + i * 40, 62, 11, 0, Math.PI * 2);
        ctx.fill();
      }

      const bar = (x: number, y: number, bw: number, bh: number, alpha: number): void => {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        roundRect(ctx, x, y, bw, bh, bh / 2);
        ctx.fill();
      };
      const mx = 56;
      bar(mx, 150, w * 0.62, 34, 0.38);
      bar(mx, 216, w - mx * 2, 22, 0.22);
      bar(mx, 262, w * 0.45, 22, 0.22);

      ctx.textBaseline = 'middle';
      let cx = mx;
      const chipFont = '600 25px Inter, system-ui, sans-serif';
      cx += drawChip(ctx, cx, 340, 'Em análise', 'rgba(255,255,255,0.16)', '#ffffff', chipFont) + 18;
      cx += drawChip(ctx, cx, 340, 'Entrevista', TOK.highlight, TOK.text, chipFont) + 18;
      drawChip(ctx, cx, 340, 'Contratado', TOK.highlight, TOK.text, chipFont);

      bar(mx, 470, w - mx * 2, 22, 0.22);
      bar(mx, 516, w * 0.55, 22, 0.22);
      bar(mx, 600, w - mx * 2, 22, 0.16);
      bar(mx, 646, w * 0.7, 22, 0.16);
      bar(mx, 692, w * 0.4, 22, 0.16);
      bar(mx, 776, w - mx * 2, 22, 0.12);
      bar(mx, 822, w * 0.5, 22, 0.12);
    });

    // Camada 2: mini-card branco ("notificação de candidatura")
    const texMini = makeTexture(512, 384, (ctx, w) => {
      ctx.fillStyle = TOK.surface;
      ctx.fillRect(0, 0, w, 384);
      const mx = 44;
      ctx.fillStyle = TOK.primarySoft;
      roundRect(ctx, mx, 52, w * 0.55, 26, 13);
      ctx.fill();
      roundRect(ctx, mx, 102, w - mx * 2, 18, 9);
      ctx.fill();
      drawChip(ctx, mx, 170, 'Candidatura', TOK.accent, '#ffffff', '600 22px Inter, system-ui, sans-serif');
      ctx.fillStyle = TOK.primarySoft;
      roundRect(ctx, mx, 262, w - mx * 2, 18, 9);
      ctx.fill();
    });

    // Camada 3: funil abstrato (barras decrescentes)
    const texFunnel = makeTexture(512, 448, (ctx, w) => {
      ctx.fillStyle = TOK.primarySoft;
      ctx.fillRect(0, 0, w, 448);
      const widths = [0.82, 0.58, 0.34];
      const alphas = [0.85, 0.6, 0.4];
      widths.forEach((fw, i) => {
        const bw = w * fw;
        const x = (w - bw) / 2;
        const y = 84 + i * 108;
        ctx.fillStyle = `rgba(47,85,72,${alphas[i]})`;
        roundRect(ctx, x, y, bw, 44, 22);
        ctx.fill();
      });
    });

    // Sombra elíptica "no chão"
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

    // ---- renderer/cena ----
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    // DPR limitado: telas 2x/3x não precisam de mais pixels para ganhar
    // qualidade perceptível, e o custo de fill-rate é o que derruba GPUs
    // integradas (a sensação de "site lento").
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 15);
    this.scene = scene;
    this.camera = camera;

    const key = new THREE.DirectionalLight(0xfff6e8, 2.6);
    key.position.set(-5, 7, 8);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xf1efe9, 0x9fb3a8, 1.15));
    const rim = new THREE.DirectionalLight(0xe3ebe6, 0.7);
    rim.position.set(4, -2, -6);
    scene.add(rim);

    const rig = new THREE.Group();
    scene.add(rig);
    this.rig = rig;

    const matteCard = (w: number, h: number, tex: Texture): Mesh => {
      const geo = new this.RoundedBox(w, h, 0.09, 4, 0.12);
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.04 });
      return new THREE.Mesh(geo, face);
    };

    const mainCard = matteCard(3.35, 4.2, texMain);
    mainCard.rotation.set(THREE.MathUtils.degToRad(4), THREE.MathUtils.degToRad(-8), 0);
    rig.add(mainCard);
    this.mainCard = mainCard;

    const miniCard = matteCard(1.85, 1.38, texMini);
    miniCard.position.set(2.05, -0.85, 1.35);
    miniCard.rotation.set(THREE.MathUtils.degToRad(3), THREE.MathUtils.degToRad(-16), 0);
    rig.add(miniCard);
    this.miniCard = miniCard;

    const funnelCard = matteCard(1.8, 1.55, texFunnel);
    funnelCard.position.set(-2.35, 1.2, -1.35);
    funnelCard.rotation.set(THREE.MathUtils.degToRad(-2), THREE.MathUtils.degToRad(-4), 0);
    rig.add(funnelCard);
    this.funnelCard = funnelCard;

    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 3.7),
      new THREE.MeshBasicMaterial({ map: texBlob, transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0.35, -3.05, -0.2);
    scene.add(blob);
    this.blob = blob;

    // ---- motion/preferências ----
    this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduceMotion = this.mq.matches;
    this.mq.addEventListener('change', this.onMotionPrefChange);

    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('pointercancel', this.onPointerUp);
    this.container.addEventListener('pointerleave', this.onPointerLeave);
    document.addEventListener('visibilitychange', this.onVisibility);

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.container);
    }
    // Loop só enquanto o painel está na viewport: rolar a página não deixa a
    // GPU trabalhando à toa.
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        (entries) => {
          this.inViewport = entries[0]?.isIntersecting ?? true;
          if (this.inViewport) this.startLoop();
          else cancelAnimationFrame(this.rafId);
        },
        { threshold: 0.05 },
      );
      this.io.observe(this.container);
    }
    this.resize();

    this.clock = new THREE.Clock();
    this.startLoop();
  }

  // -------------------------------------------------------------------------
  // Handlers (arrow fields: remoção simétrica no destroy)
  // -------------------------------------------------------------------------

  private readonly onPointerMove = (e: PointerEvent): void => {
    const THREE = this.THREE;
    const s = this.state;
    if (s.dragging) {
      const now = performance.now();
      const dx = e.clientX - s.lastPX;
      const dy = e.clientY - s.lastPY;
      s.lastPX = e.clientX;
      s.lastPY = e.clientY;
      s.dY = THREE.MathUtils.clamp(s.dY + dx * 0.0035, -this.maxDrag, this.maxDrag);
      s.dX = THREE.MathUtils.clamp(s.dX + dy * 0.0035, -this.maxDrag, this.maxDrag);
      const dt = Math.max(now - s.lastMoveT, 1);
      s.vY = ((dx * 0.0035) / dt) * 16;
      s.vX = ((dy * 0.0035) / dt) * 16;
      s.lastMoveT = now;
      return;
    }
    const r = this.container.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    s.tY = THREE.MathUtils.clamp(nx, -1, 1) * this.maxTilt;
    s.tX = THREE.MathUtils.clamp(ny, -1, 1) * this.maxTilt;
    s.hovering = true;
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.reduceMotion) return;
    const s = this.state;
    s.dragging = true;
    s.lastPX = e.clientX;
    s.lastPY = e.clientY;
    s.lastMoveT = performance.now();
    s.vX = 0;
    s.vY = 0;
    this.container.setPointerCapture?.(e.pointerId);
  };

  private readonly onPointerUp = (): void => {
    const s = this.state;
    if (!s.dragging) return;
    s.dragging = false;
    s.holdUntil = performance.now() + this.HOLD_MS;
  };

  private readonly onPointerLeave = (): void => {
    const s = this.state;
    s.hovering = false;
    s.tX = 0;
    s.tY = 0;
    this.onPointerUp();
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) cancelAnimationFrame(this.rafId);
    else this.startLoop();
  };

  private readonly onMotionPrefChange = (e: MediaQueryListEvent): void => {
    this.reduceMotion = e.matches;
    this.startLoop();
  };

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  /** Amplitudes em radianos: hover sutil (4°), drag expressivo (24°). */
  private readonly maxTilt = (4 * Math.PI) / 180;
  private readonly maxDrag = (24 * Math.PI) / 180;
  private readonly HOLD_MS = 1100;

  private resize(): void {
    if (!this.renderer) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private startLoop(): void {
    cancelAnimationFrame(this.rafId);
    if (!this.renderer || !this.inViewport) return;
    if (this.reduceMotion) {
      this.rig.rotation.set(0, 0, 0);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.clock.start();
    this.rafId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (): void => {
    if (!this.inViewport || document.hidden) return;
    const THREE = this.THREE;
    const t = this.clock.getElapsedTime();
    const s = this.state;
    const D2R = THREE.MathUtils.degToRad;

    // flutuação lenta com fases distintas por camada
    this.rig.position.y = Math.sin(t * 0.8) * 0.07;
    this.mainCard.position.y = Math.sin(t * 0.9 + 0.6) * 0.05;
    this.miniCard.position.y = -0.85 + Math.sin(t * 1.05 + 2.1) * 0.09;
    this.funnelCard.position.y = 1.0 + Math.sin(t * 0.7 + 4.0) * 0.07;
    this.rig.rotation.z = Math.sin(t * 0.55) * D2R(1.1);

    // drag: inércia após soltar, segura a pose e retorna ao neutro
    if (!s.dragging) {
      if (Math.abs(s.vX) > 0.0004 || Math.abs(s.vY) > 0.0004) {
        s.dX = THREE.MathUtils.clamp(s.dX + s.vX, -this.maxDrag, this.maxDrag);
        s.dY = THREE.MathUtils.clamp(s.dY + s.vY, -this.maxDrag, this.maxDrag);
        s.vX *= 0.94;
        s.vY *= 0.94;
        s.holdUntil = performance.now() + this.HOLD_MS;
      } else if (performance.now() > s.holdUntil) {
        s.dX *= 0.94;
        s.dY *= 0.94;
      }
    }

    // tilt de hover com easing
    s.cX += (s.tX - s.cX) * 0.06;
    s.cY += (s.tY - s.cY) * 0.06;
    this.rig.rotation.x = s.cX + s.dX;
    this.rig.rotation.y = s.cY + s.dY;

    // sombra acompanha a flutuação
    const lift = (this.rig.position.y + 0.07) / 0.14;
    const scale = 1 - lift * 0.05;
    this.blob.scale.set(scale, scale, 1);
    (this.blob.material as MeshBasicMaterial).opacity = 1 - lift * 0.18;

    this.renderer?.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.frame);
  };

  // -------------------------------------------------------------------------
  // Cleanup completo (SPA: a landing é abandonada sem reload)
  // -------------------------------------------------------------------------

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.mq?.removeEventListener('change', this.onMotionPrefChange);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.container) {
      this.container.removeEventListener('pointermove', this.onPointerMove);
      this.container.removeEventListener('pointerdown', this.onPointerDown);
      this.container.removeEventListener('pointerup', this.onPointerUp);
      this.container.removeEventListener('pointercancel', this.onPointerUp);
      this.container.removeEventListener('pointerleave', this.onPointerLeave);
    }
    if (this.scene && this.THREE) {
      this.scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((material) => {
            const textured = material as MeshStandardMaterial;
            textured.map?.dispose();
            material.dispose();
          });
        }
      });
    }
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }
}
