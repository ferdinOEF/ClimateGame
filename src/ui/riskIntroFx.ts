import { RISK_INTRO, componentsFor, frameAt, timeline, type RiskIntroMode } from "@core/riskIntro";

/**
 * The first-warning risk sequence, drawn (timing and rules: core/riskIntro.ts).
 *
 * A 2D canvas laid over the board, under the labels and the HUD, never taking
 * a pointer: the projected risk tiles are filled red, a breaking wave crosses
 * them, the crest bursts into droplets, the sheet rests at 20%, folds into a
 * ball, and the ball flies on a curve to the Show Risk button, which ripples
 * and pulses once.
 *
 * Pieces by mode (`componentsFor`): only the full sequence creates the
 * droplet particle system and the WebGL ball shader. Reduced motion and Low
 * quality never construct either; `created` counts what was built, for the
 * tests.
 *
 * Flash safety: nothing here oscillates in brightness. Opacities move once,
 * smoothly; the button pulses once.
 */
export type ScreenPolygon = [number, number][];

export interface RiskIntroHost {
  /** The risk area's tiles, each as its projected hexagon in container pixels (re-read every frame: the camera can move). */
  polygons: () => ScreenPolygon[];
  /** The Show Risk button. */
  button: () => HTMLElement | null;
}

/** Droplets bursting off the crest: a small particle system on the 2D canvas. */
export class DropletSystem {
  private readonly drops: { x: number; y: number; vx: number; vy: number; r: number; life: number }[] = [];

  constructor(private readonly count: number) {}

  /** Bursts `count` droplets from points along the right edge. */
  burst(points: [number, number][], random: () => number): void {
    this.drops.length = 0;
    if (points.length === 0) return;
    for (let i = 0; i < this.count; i++) {
      const [x, y] = points[Math.floor(random() * points.length)];
      this.drops.push({ x, y, vx: 40 + random() * 110, vy: -(90 + random() * 150), r: 2.5 + random() * 4.5, life: 0.6 + random() * 0.5 });
    }
  }

  /** Draws the droplets `age` seconds after the burst: up, then falling, fading out. */
  draw(g: CanvasRenderingContext2D, age: number, color: string): void {
    g.save();
    g.fillStyle = color;
    for (const d of this.drops) {
      if (age > d.life) continue;
      const fade = 1 - age / d.life;
      g.globalAlpha = 0.8 * fade;
      g.beginPath();
      g.arc(d.x + d.vx * age, d.y + d.vy * age + 0.5 * 420 * age * age, d.r * (0.8 + 0.2 * fade), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

const BALL_VERTEX = `attribute vec2 p; varying vec2 uv; void main() { uv = p; gl_Position = vec4(p, 0.0, 1.0); }`;
const BALL_FRAGMENT = `
  precision mediump float;
  varying vec2 uv;
  uniform float uTime;
  uniform vec3 uRed;
  uniform vec3 uBlue;
  void main() {
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    vec3 n = vec3(uv, sqrt(1.0 - r2));
    // Turn the sphere so the swirl moves across it.
    float a = uTime * 2.2;
    vec3 m = vec3(n.x * cos(a) + n.z * sin(a), n.y, -n.x * sin(a) + n.z * cos(a));
    float swirl = sin(atan(m.y, m.x) * 3.0 + m.z * 7.0 + uTime * 3.0 + sin(m.x * 5.0 + uTime) * 1.5);
    vec3 col = mix(uRed, uBlue, smoothstep(-0.35, 0.35, swirl));
    float light = 0.45 + 0.55 * max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0);
    float rim = pow(1.0 - n.z, 2.0) * 0.35;
    float edge = 1.0 - smoothstep(0.92, 1.0, r2);
    gl_FragColor = vec4(col * light + rim, edge);
  }
`;

/** The shaded, swirling red-and-blue ball: a tiny WebGL canvas, moved with a CSS transform. */
export class BallShader {
  readonly el: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext | null;
  private timeLoc: WebGLUniformLocation | null = null;

  constructor(size: number, colors: [string, string]) {
    this.el = document.createElement("canvas");
    this.el.className = "risk-intro-ball";
    this.el.width = this.el.height = size * 2;
    this.el.style.width = this.el.style.height = `${size * 2}px`;
    this.gl = this.el.getContext("webgl", { premultipliedAlpha: false, alpha: true });
    const gl = this.gl;
    if (!gl) return;
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, BALL_VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, BALL_FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    gl.uniform3fv(gl.getUniformLocation(program, "uRed"), rgb(colors[0]));
    gl.uniform3fv(gl.getUniformLocation(program, "uBlue"), rgb(colors[1]));
    this.timeLoc = gl.getUniformLocation(program, "uTime");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  draw(seconds: number): void {
    const gl = this.gl;
    if (!gl) return;
    gl.viewport(0, 0, this.el.width, this.el.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.timeLoc, seconds);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.el.remove();
  }
}

function centroid(polys: ScreenPolygon[]): [number, number] {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const poly of polys) for (const [px, py] of poly) {
    x += px;
    y += py;
    n++;
  }
  return n ? [x / n, y / n] : [0, 0];
}

function bounds(polys: ScreenPolygon[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const poly of polys) for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * The shape's left and right boundary at each height: for every row `step`
 * pixels apart, the leftmost and rightmost point of any of its hexagons on
 * that row. The wave crosses each row from its own left edge to its own
 * right edge, so it sweeps the whole shape at once however it lies (the
 * coastal risk strip runs diagonally across the screen).
 */
function rowExtents(polys: ScreenPolygon[], minY: number, maxY: number, step: number): { y: number; left: number; right: number }[] {
  const rows: { y: number; left: number; right: number }[] = [];
  for (let y = minY; y <= maxY; y += step) {
    let left = Infinity;
    let right = -Infinity;
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    if (left < right) rows.push({ y, left, right });
  }
  return rows;
}

function tracePolys(g: CanvasRenderingContext2D, polys: ScreenPolygon[], transform?: (p: [number, number]) => [number, number]): void {
  g.beginPath();
  for (const poly of polys) {
    poly.forEach((p, i) => {
      const [x, y] = transform ? transform(p) : p;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
  }
}

/** A seeded random, so the droplets are the same in every contact sheet. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RiskIntroFx {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private mode: RiskIntroMode = "full";
  private startMs = 0;
  private running = false;
  /** Fixed time for the contact sheets (null: real time). */
  private heldAt: number | null = null;
  private droplets: DropletSystem | null = null;
  private burstDone = false;
  private ball: BallShader | null = null;
  private disc: HTMLElement | null = null;
  private landed = false;
  /** Where the fold ends: the ball's start, fixed once the fold begins so the flight does not drift with the camera. */
  private ballFrom: [number, number] | null = null;
  /** What has been built in this page, for the tests: reduced motion and Low must leave both at zero. */
  readonly created = { particles: 0, shader: 0 };
  /** How many times the sequence has started, for the tests. */
  plays = 0;
  /** Why the last run ended: "done", or what cancelled it. */
  lastEnd: string | null = null;

  constructor(private readonly container: HTMLElement, private readonly host: RiskIntroHost) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "risk-intro-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.hidden = true;
    container.appendChild(this.canvas);
    this.g = this.canvas.getContext("2d")!;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentMode(): RiskIntroMode {
    return this.mode;
  }

  start(mode: RiskIntroMode, nowMs: number): void {
    this.cancel("restarted");
    this.mode = mode;
    this.startMs = nowMs;
    this.running = true;
    this.plays++;
    this.lastEnd = null;
    this.burstDone = false;
    this.landed = false;
    this.ballFrom = null;
    const parts = componentsFor(mode);
    if (parts.particles) {
      this.droplets = new DropletSystem(RISK_INTRO.dropletCount);
      this.created.particles++;
    }
    if (parts.shader) {
      this.ball = new BallShader(RISK_INTRO.ballRadiusPx, RISK_INTRO.ballColors as [string, string]);
      this.ball.el.hidden = true;
      this.container.appendChild(this.ball.el);
      this.created.shader++;
    }
    this.canvas.hidden = false;
  }

  /** Stops at once and leaves nothing behind: no sheet, no ball, no pulsing button. */
  cancel(reason = "cancelled"): void {
    if (!this.running) return;
    this.running = false;
    this.lastEnd = reason;
    this.heldAt = null;
    this.canvas.hidden = true;
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.droplets = null;
    this.ball?.dispose();
    this.ball = null;
    this.disc?.remove();
    this.disc = null;
    const button = this.host.button();
    button?.classList.remove("risk-intro-landing", "risk-intro-pulse");
  }

  /** Holds the sequence at `seconds` (the contact sheet); null lets it run. */
  hold(seconds: number | null): void {
    this.heldAt = seconds;
  }

  private size(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.canvas.width = Math.round(w * ratio);
      this.canvas.height = Math.round(h * ratio);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.g.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /** Draws the current moment. Called every frame from the render loop. */
  frame(nowMs: number): void {
    if (!this.running) return;
    const t = this.heldAt ?? (nowMs - this.startMs) / 1000;
    const f = frameAt(t, this.mode);
    if (f.done) {
      this.cancel("done");
      return;
    }
    this.size();
    const g = this.g;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const polys = this.host.polygons();
    const color = RISK_INTRO.fillColor;

    if (f.fold === null && f.flight === null && (f.aheadOpacity > 0 || f.behindOpacity > 0) && polys.length) {
      const b = bounds(polys);
      g.save();
      tracePolys(g, polys);
      g.clip();
      if (f.crest === null) {
        g.globalAlpha = f.aheadOpacity;
        g.fillStyle = color;
        g.fillRect(b.minX - 2, b.minY - 2, b.maxX - b.minX + 4, b.maxY - b.minY + 4);
      } else {
        this.drawWave(g, b, f.crest, f.aheadOpacity, f.behindOpacity, t, rowExtents(polys, b.minY, b.maxY, 4));
      }
      g.restore();
      if (f.droplets !== null && this.droplets) {
        if (!this.burstDone) {
          // Points along the right boundary, where the crest broke.
          const edge = rowExtents(polys, b.minY, b.maxY, 6).map((row): [number, number] => [row.right, row.y]);
          this.droplets.burst(edge.length ? edge : [[b.maxX, (b.minY + b.maxY) / 2]], rng(7));
          this.burstDone = true;
        }
        this.droplets.draw(g, f.droplets, RISK_INTRO.foamColor);
      }
    }

    if (f.fold !== null && polys.length) {
      // The sheet curls in from its edges and gathers at the centre of the
      // part on screen (the risk area can run off the edge of the view), so the
      // ball forms where the player is looking.
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      const onScreen = polys.filter((poly) => poly.some(([x, y]) => x > 0 && x < w && y > 0 && y < h));
      const [cx, cy] = centroid(onScreen.length ? onScreen : polys);
      this.ballFrom = [cx, cy];
      let maxD = 1;
      for (const poly of polys) for (const [x, y] of poly) maxD = Math.max(maxD, Math.hypot(x - cx, y - cy));
      // Gathering to the centre, faster at the end; the outer edges swing round
      // further than the middle, so the sheet rolls up rather than shrinks.
      const fold = f.fold;
      const k = Math.pow(1 - fold, 1.6) * 0.98 + 0.02;
      g.save();
      g.globalAlpha = RISK_INTRO.restOpacity + (0.85 - RISK_INTRO.restOpacity) * f.fold;
      g.fillStyle = color;
      tracePolys(g, polys, ([x, y]) => {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const angle = fold * 1.4 * d;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const dx = (x - cx) * k;
        const dy = (y - cy) * k;
        return [cx + dx * c - dy * s, cy + dx * s + dy * c];
      });
      g.fill();
      g.restore();
      if (f.fold > 0.7) this.placeBall(cx, cy, RISK_INTRO.ballRadiusPx * ((f.fold - 0.7) / 0.3), t);
    }

    if (f.flight !== null) {
      const button = this.host.button();
      const from = this.ballFrom ?? (polys.length ? centroid(polys) : [this.container.clientWidth / 2, this.container.clientHeight / 2]);
      const box = this.container.getBoundingClientRect();
      const target = button?.getBoundingClientRect();
      const tx = target ? target.left - box.left + target.width / 2 : this.container.clientWidth - 60;
      const ty = target ? target.top - box.top + target.height / 2 : 150;
      const r = RISK_INTRO.ballRadiusPx + (RISK_INTRO.ballLandRadiusPx - RISK_INTRO.ballRadiusPx) * f.flight;
      if (this.mode === "flat") {
        // A straight, plain tween.
        this.placeDisc(from[0] + (tx - from[0]) * f.flight, from[1] + (ty - from[1]) * f.flight, r);
      } else {
        // A curve: a quadratic arc that swings up and out before coming in to the button.
        const mx = (from[0] + tx) / 2 - (ty - from[1]) * 0.35;
        const my = Math.min(from[1], ty) - 120;
        const u = f.flight;
        const x = (1 - u) * (1 - u) * from[0] + 2 * (1 - u) * u * mx + u * u * tx;
        const y = (1 - u) * (1 - u) * from[1] + 2 * (1 - u) * u * my + u * u * ty;
        this.placeBall(x, y, r, t);
      }
    }

    if (f.landing && !this.landed) {
      this.landed = true;
      this.ball && (this.ball.el.hidden = true);
      this.disc?.remove();
      this.disc = null;
      const button = this.host.button();
      if (button) {
        button.classList.remove("risk-intro-landing", "risk-intro-pulse");
        void button.offsetWidth;
        button.classList.add(this.mode === "reduced" ? "risk-intro-pulse" : "risk-intro-landing");
      }
    }
  }

  private drawWave(g: CanvasRenderingContext2D, b: { minX: number; maxX: number; minY: number; maxY: number }, crest: number, ahead: number, behind: number, t: number, rows: { y: number; left: number; right: number }[]): void {
    if (rows.length === 0) return;
    const width = b.maxX - b.minX;
    // Where the crest is on each row: that row's left edge plus `crest` of its
    // width, with a lean and a wobble so the face is never a ruler line.
    const crestX = (row: { y: number; left: number; right: number }): number =>
      row.left + (row.right - row.left) * crest + Math.sin(row.y * 0.045 + t * 5) * 5 + Math.sin(row.y * 0.013 - t * 2.2) * 8;
    const band = (row: { y: number; left: number; right: number }): number => Math.max(22, (row.right - row.left) * 0.42);
    const top = rows[0].y;
    const bottom = rows[rows.length - 1].y;
    // Ahead of the crest: the fresh fill.
    g.globalAlpha = ahead;
    g.fillStyle = RISK_INTRO.fillColor;
    g.fillRect(b.minX - 2, b.minY - 2, width + 4, b.maxY - b.minY + 4);
    // Behind it: cleared and refilled at the eased-down opacity.
    g.save();
    g.beginPath();
    g.moveTo(b.minX - 10, top - 10);
    for (const row of rows) g.lineTo(crestX(row), row.y);
    g.lineTo(b.minX - 10, bottom + 10);
    g.closePath();
    g.clip();
    g.clearRect(b.minX - 10, b.minY - 10, width + 20, b.maxY - b.minY + 20);
    g.globalAlpha = behind;
    g.fillRect(b.minX - 10, b.minY - 10, width + 20, b.maxY - b.minY + 20);
    g.restore();
    // The crest: a dark body trailing behind the face, darkest at the front.
    // Drawn as layered bands, each a little lighter and further back, which
    // reads as a gradient that follows the curve of the face.
    g.save();
    g.fillStyle = RISK_INTRO.crestColor;
    const layers = 12;
    for (let k = layers; k >= 1; k--) {
      const depth = k / layers;
      g.globalAlpha = 0.09 + 0.07 * (1 - depth);
      g.beginPath();
      for (const row of rows) g.lineTo(crestX(row), row.y);
      for (let i = rows.length - 1; i >= 0; i--) g.lineTo(crestX(rows[i]) - band(rows[i]) * depth, rows[i].y);
      g.closePath();
      g.fill();
    }
    // The lip: a curl of lighter water just behind the very front.
    g.globalAlpha = 0.5;
    g.strokeStyle = "#c2464a";
    g.lineWidth = 5;
    g.beginPath();
    for (const row of rows) g.lineTo(crestX(row) - 6, row.y);
    g.stroke();
    // The foam: a broken white edge out in front, and flecks riding it.
    g.globalAlpha = 0.9;
    g.strokeStyle = RISK_INTRO.foamColor;
    g.lineWidth = 4;
    g.setLineDash([12, 5, 5, 7]);
    g.lineDashOffset = -t * 50;
    g.beginPath();
    for (const row of rows) g.lineTo(crestX(row) + 3, row.y);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = RISK_INTRO.foamColor;
    rows.forEach((row, i) => {
      if (i % 3 !== 0) return;
      const wobble = Math.sin(i * 12.9898 + t * 6) * 0.5 + 0.5;
      g.globalAlpha = 0.45 + 0.4 * wobble;
      g.beginPath();
      g.arc(crestX(row) + 6 + wobble * 7, row.y, 1.6 + wobble * 2.2, 0, Math.PI * 2);
      g.fill();
    });
    g.restore();
  }

  private placeBall(x: number, y: number, r: number, t: number): void {
    if (this.mode === "flat") {
      this.placeDisc(x, y, r);
      return;
    }
    if (!this.ball) return;
    const el = this.ball.el;
    el.hidden = r < 1;
    const scale = r / RISK_INTRO.ballRadiusPx;
    el.style.transform = `translate(${(x - RISK_INTRO.ballRadiusPx).toFixed(1)}px, ${(y - RISK_INTRO.ballRadiusPx).toFixed(1)}px) scale(${scale.toFixed(3)})`;
    this.ball.draw(t);
  }

  private placeDisc(x: number, y: number, r: number): void {
    if (!this.disc) {
      this.disc = document.createElement("div");
      this.disc.className = "risk-intro-disc";
      this.container.appendChild(this.disc);
    }
    const size = RISK_INTRO.ballRadiusPx * 2;
    this.disc.style.width = this.disc.style.height = `${size}px`;
    this.disc.style.transform = `translate(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px) scale(${(r / RISK_INTRO.ballRadiusPx).toFixed(3)})`;
  }

  /** Total length in seconds for a mode (the tests run to it). */
  static length(mode: RiskIntroMode): number {
    return timeline(mode).end;
  }

  dispose(): void {
    this.cancel("disposed");
    this.canvas.remove();
  }
}
