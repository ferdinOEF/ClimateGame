import { TERRAIN_BY_ID } from "@core/terrain";
import { PALETTE } from "@render/palette";

export interface HudCallbacks {
  onSelectHand: (index: number) => void;
}

/**
 * The only persistent UI: a corner tile counter and a bottom-center hand
 * strip. No full-width panel — Section 3's non-negotiable rule.
 */
export class Hud {
  private tileCountEl: HTMLElement;
  private coinEl: HTMLElement;
  private trustEl: HTMLElement;
  private handEl: HTMLElement;

  constructor(container: HTMLElement, private callbacks: HudCallbacks) {
    const tileCounter = document.createElement("div");
    tileCounter.className = "hud-corner top-right";
    tileCounter.innerHTML = `<div>Tiles placed</div><div class="tile-count-value">0</div>`;
    container.appendChild(tileCounter);
    this.tileCountEl = tileCounter.querySelector(".tile-count-value")!;

    const coin = document.createElement("div");
    coin.className = "hud-corner top-left";
    coin.innerHTML = `<div>Coin</div><div class="tile-count-value coin-value">0</div>`;
    container.appendChild(coin);
    this.coinEl = coin.querySelector(".coin-value")!;

    const trust = document.createElement("div");
    trust.className = "hud-corner top-left trust-corner";
    trust.innerHTML = `<div>Trust</div><div class="tile-count-value trust-value">0</div>`;
    container.appendChild(trust);
    this.trustEl = trust.querySelector(".trust-value")!;

    const hand = document.createElement("div");
    hand.className = "hud-corner bottom-center hand-strip";
    container.appendChild(hand);
    this.handEl = hand;
  }

  setTileCount(n: number): void {
    this.tileCountEl.textContent = String(n);
  }

  setCoin(n: number): void {
    this.coinEl.textContent = String(n);
  }

  setTrust(n: number): void {
    this.trustEl.textContent = String(Math.round(n));
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
