import { TERRAIN_BY_ID } from "@core/terrain";
import { PALETTE } from "@render/palette";

export interface HudCallbacks {
  onSelectHand: (index: number) => void;
}

/**
 * The only persistent UI: a corner tile counter, one compact meter strip
 * (Coin + Section 7's four meters), and a bottom-center hand strip. No
 * full-width panel — Section 3's non-negotiable rule. The four meters share
 * a single small block rather than stacking separate corner elements, so
 * the corner stays one unobtrusive strip, not a growing pile of them.
 */
export class Hud {
  private tileCountEl: HTMLElement;
  private coinEl: HTMLElement;
  private trustEl: HTMLElement;
  private resilienceEl: HTMLElement;
  private biodiversityEl: HTMLElement;
  private carbonEl: HTMLElement;
  private handEl: HTMLElement;
  private bannerEl: HTMLElement;

  constructor(container: HTMLElement, private callbacks: HudCallbacks) {
    const tileCounter = document.createElement("div");
    tileCounter.className = "hud-corner top-right";
    tileCounter.innerHTML = `<div>Tiles placed</div><div class="tile-count-value">0</div>`;
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

    const hand = document.createElement("div");
    hand.className = "hud-corner bottom-center hand-strip";
    container.appendChild(hand);
    this.handEl = hand;

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

  renderHand(hand: string[], selectedIndex: number): void {
    this.handEl.innerHTML = "";
    hand.forEach((terrainId, i) => {
      const def = TERRAIN_BY_ID.get(terrainId);
      const color = def ? PALETTE[def.colorKey] : undefined;
      const slot = document.createElement("button");
      slot.className = "hand-slot" + (i === selectedIndex ? " selected" : "");
      slot.style.setProperty("--slot-color", color ? `#${color.getHexString()}` : "#888");
      slot.title = def?.name ?? terrainId;
      slot.textContent = def?.name ?? terrainId;
      slot.addEventListener("click", () => this.callbacks.onSelectHand(i));
      this.handEl.appendChild(slot);
    });
  }
}
