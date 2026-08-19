/**
 * The only persistent UI (v2.1): a corner tile counter, one compact meter
 * strip (Coin + Section 7's four meters), a small "next hex to claim"
 * prompt, and a brief non-blocking era banner. No full-width panel, and no
 * hand strip anymore — Section 2/3: there's no longer a choice of *what* to
 * place, only *where* to claim next, so there's nothing to hand-pick from.
 */
export class Hud {
  private tileCountEl: HTMLElement;
  private coinEl: HTMLElement;
  private trustEl: HTMLElement;
  private resilienceEl: HTMLElement;
  private biodiversityEl: HTMLElement;
  private carbonEl: HTMLElement;
  private claimPromptEl: HTMLElement;
  private bannerEl: HTMLElement;

  constructor(container: HTMLElement) {
    const tileCounter = document.createElement("div");
    tileCounter.className = "hud-corner top-right";
    tileCounter.innerHTML = `<div>Tiles claimed</div><div class="tile-count-value">0</div>`;
    container.appendChild(tileCounter);
    this.tileCountEl = tileCounter.querySelector(".tile-count-value")!;

    const meters = document.createElement("div");
    meters.className = "hud-corner top-left meters-panel";
    meters.innerHTML = `
      <div class="coin-row"><span>Coin</span><span class="coin-value">0</span></div>
      <div class="meter-row">
        <span class="meter-chip" title="Trust">T <b class="trust-value">0</b></span>
        <span class="meter-chip" title="Resilience">R <b class="resilience-value">0</b></span>
        <span class="meter-chip" title="Biodiversity">B <b class="biodiversity-value">0</b></span>
        <span class="meter-chip" title="Carbon">C <b class="carbon-value">0</b></span>
      </div>`;
    container.appendChild(meters);
    this.coinEl = meters.querySelector(".coin-value")!;
    this.trustEl = meters.querySelector(".trust-value")!;
    this.resilienceEl = meters.querySelector(".resilience-value")!;
    this.biodiversityEl = meters.querySelector(".biodiversity-value")!;
    this.carbonEl = meters.querySelector(".carbon-value")!;

    const claimPrompt = document.createElement("div");
    claimPrompt.className = "hud-corner bottom-center claim-prompt";
    container.appendChild(claimPrompt);
    this.claimPromptEl = claimPrompt;

    const banner = document.createElement("div");
    banner.className = "hud-corner top-center era-banner";
    banner.hidden = true;
    container.appendChild(banner);
    this.bannerEl = banner;
  }

  /** A brief, non-blocking announcement (era retired/soft-lost) — never a modal. */
  showBanner(text: string, durationMs = 3500): void {
    this.bannerEl.textContent = text;
    this.bannerEl.hidden = false;
    window.setTimeout(() => {
      this.bannerEl.hidden = true;
    }, durationMs);
  }

  setTileCount(n: number): void {
    this.tileCountEl.textContent = String(n);
  }

  setCoin(n: number): void {
    this.coinEl.textContent = String(n);
  }

  setMeters(meters: { trust: number; resilience: number; biodiversity: number; carbon: number }): void {
    this.trustEl.textContent = String(Math.round(meters.trust));
    this.resilienceEl.textContent = String(Math.round(meters.resilience));
    this.biodiversityEl.textContent = String(Math.round(meters.biodiversity));
    this.carbonEl.textContent = String(Math.round(meters.carbon));
  }

  /** Section 3's "next hex to claim" prompt — a glowing ring count, not a form. */
  setClaimable(count: number, claimCost: number): void {
    this.claimPromptEl.textContent =
      count > 0 ? `${count} hex${count === 1 ? "" : "es"} to claim — ${claimCost}c each` : "Nothing left to claim";
  }
}
