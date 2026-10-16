/**
 * "+3 homes safe" (Section 13.2): a short line that rises from the tile just
 * built for about 1.5 s, with the model's number for what that build saved
 * against the storm coming. Still, not rising, with calm motion or the
 * system's reduce-motion setting (panjim.css). DOM over the canvas,
 * re-projected every frame so it stays on its tile while the camera glides.
 */
type Project = (x: number, y: number, z: number) => { x: number; y: number } | null;

const SHOW_MS = 1500;

export class BuildFloat {
  private readonly layer: HTMLElement;
  private live: { el: HTMLElement; x: number; y: number; z: number; until: number }[] = [];

  constructor(container: HTMLElement, private readonly project: Project) {
    this.layer = document.createElement("div");
    this.layer.className = "build-floats";
    // One polite live region for every float, so each build is read out once.
    this.layer.setAttribute("role", "status");
    this.layer.setAttribute("aria-live", "polite");
    container.appendChild(this.layer);
  }

  /** Shows `text` over the world point; `tone` colours it (homes saved, none, or put at risk). */
  show(text: string, tone: "good" | "zero" | "bad", at: { x: number; y: number; z: number }): void {
    const el = document.createElement("div");
    el.className = `build-float ${tone}`;
    el.textContent = text;
    this.layer.appendChild(el);
    this.live.push({ el, ...at, until: performance.now() + SHOW_MS });
    this.place(this.live[this.live.length - 1]);
  }

  /** The texts on screen now (for the QA tools). */
  get texts(): string[] {
    return this.live.map((item) => item.el.textContent ?? "");
  }

  /** Re-projects each float and drops the finished ones; call every frame. */
  update(nowMs: number): void {
    this.live = this.live.filter((item) => {
      if (nowMs <= item.until) return true;
      item.el.remove();
      return false;
    });
    for (const item of this.live) this.place(item);
  }

  private place(item: { el: HTMLElement; x: number; y: number; z: number }): void {
    const at = this.project(item.x, item.y, item.z);
    item.el.style.display = at ? "" : "none";
    if (at) item.el.style.left = `${Math.round(at.x)}px`;
    if (at) item.el.style.top = `${Math.round(at.y)}px`;
  }

  dispose(): void {
    this.layer.remove();
  }
}
