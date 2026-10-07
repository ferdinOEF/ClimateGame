import type { VoiceDef } from "@core/voices";

/**
 * Voices of Panjim: the bottom-right panel, in the objectives panel's place.
 *
 * Each card is one person asking for one thing, with a progress hint and the
 * reward. Answering one pays out at once with a coin pop, a chime and their
 * thanks; then the card goes. When an era ends the unanswered cards quietly
 * go too, and the next era's people arrive.
 */
export interface VoiceCardView {
  voice: VoiceDef;
  progress: string;
  current: number;
  target: number;
}

export class VoicesPanel {
  readonly el: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly cards = new Map<string, HTMLElement>();

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "voices";
    this.el.innerHTML = `<div class="voices-title">Voices of Panjim</div><ul class="voices-list"></ul>`;
    this.listEl = this.el.querySelector(".voices-list")!;
  }

  render(cards: VoiceCardView[]): void {
    const live = new Set(cards.map((card) => card.voice.id));
    for (const [id, el] of this.cards) {
      if (live.has(id) || el.classList.contains("answered")) continue;
      el.remove();
      this.cards.delete(id);
    }
    for (const card of cards) {
      let el = this.cards.get(card.voice.id);
      if (!el) {
        el = document.createElement("li");
        el.className = "voice-card arriving";
        el.innerHTML = `
          <div class="voice-who"></div>
          <div class="voice-text"></div>
          <div class="voice-foot"><span class="voice-progress"></span><span class="voice-reward"></span></div>`;
        (el.querySelector(".voice-who") as HTMLElement).textContent = card.voice.who;
        (el.querySelector(".voice-text") as HTMLElement).textContent = `“${card.voice.text}”`;
        (el.querySelector(".voice-reward") as HTMLElement).textContent = `+${card.voice.reward} Coin`;
        this.listEl.appendChild(el);
        this.cards.set(card.voice.id, el);
        const fresh = el;
        window.setTimeout(() => fresh.classList.remove("arriving"), 600);
      }
      (el.querySelector(".voice-progress") as HTMLElement).textContent =
        card.target > 1 ? `${Math.min(card.current, card.target)}/${card.target} · ${card.progress}` : card.progress;
    }
    this.el.hidden = this.cards.size === 0;
  }

  /** Celebrates an answered request: thanks, a coin pop, then the card leaves. */
  answer(voice: VoiceDef): void {
    const el = this.cards.get(voice.id);
    if (!el) return;
    el.classList.add("answered");
    (el.querySelector(".voice-text") as HTMLElement).textContent = voice.thanks;
    const pop = document.createElement("span");
    pop.className = "voice-pop";
    pop.textContent = `+${voice.reward}`;
    el.appendChild(pop);
    window.setTimeout(() => {
      el.remove();
      this.cards.delete(voice.id);
      this.el.hidden = this.cards.size === 0;
    }, 3200);
  }
}
