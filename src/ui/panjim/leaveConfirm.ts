/**
 * "Leave Panjim?" (Section 12): Esc with nothing open used to quit the level
 * at once. Now a small confirm asks first. Stay is focused, so a second Esc,
 * Enter or Stay keeps playing; Leave goes. The run is saved every year, so
 * nothing is lost by leaving.
 */
export class LeaveConfirm {
  private readonly backdrop: HTMLElement;
  private readonly stayBtn: HTMLButtonElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly textEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private resolve: ((leave: boolean) => void) | null = null;
  /** Where focus was before the prompt, given back when it closes. */
  private returnFocus: HTMLElement | null = null;
  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close(false);
    } else if (event.key === "Tab") {
      // Focus stays on the two buttons.
      event.preventDefault();
      (document.activeElement === this.stayBtn ? this.leaveBtn : this.stayBtn).focus();
    }
  };

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "leave-confirm-backdrop";
    this.backdrop.hidden = true;
    this.backdrop.innerHTML = `
      <div class="leave-confirm" role="alertdialog" aria-modal="true" aria-labelledby="leave-confirm-title" aria-describedby="leave-confirm-text">
        <div class="leave-confirm-title" id="leave-confirm-title">Leave Panjim?</div>
        <p class="leave-confirm-text" id="leave-confirm-text">Your progress is saved.</p>
        <div class="leave-confirm-buttons">
          <button type="button" class="leave-confirm-stay">Stay</button>
          <button type="button" class="leave-confirm-leave">Leave</button>
        </div>
      </div>`;
    container.appendChild(this.backdrop);
    this.stayBtn = this.backdrop.querySelector(".leave-confirm-stay")!;
    this.leaveBtn = this.backdrop.querySelector(".leave-confirm-leave")!;
    this.textEl = this.backdrop.querySelector(".leave-confirm-text")!;
    this.titleEl = this.backdrop.querySelector(".leave-confirm-title")!;
    this.stayBtn.addEventListener("click", () => this.close(false));
    this.leaveBtn.addEventListener("click", () => this.close(true));
    this.backdrop.addEventListener("click", (event) => {
      if (event.target === this.backdrop) this.close(false);
    });
    // Capture, so the board's own Esc handler never sees the key that closes this.
    window.addEventListener("keydown", this.onKey, true);
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  /**
   * Asks; resolves true for Leave, false for Stay (or Esc). `text` is the line under the title. `options`
   * changes the title and the confirming button (☰'s "Start again?", Section 16 B3).
   */
  ask(text = "Your progress is saved.", options: { title?: string; confirm?: string; cancel?: string } = {}): Promise<boolean> {
    if (this.isOpen) return Promise.resolve(false);
    this.textEl.textContent = text;
    this.titleEl.textContent = options.title ?? "Leave Panjim?";
    this.leaveBtn.textContent = options.confirm ?? "Leave";
    this.stayBtn.textContent = options.cancel ?? "Stay";
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.backdrop.hidden = false;
    this.stayBtn.focus();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private close(leave: boolean): void {
    if (!this.isOpen) return;
    this.backdrop.hidden = true;
    const resolve = this.resolve;
    this.resolve = null;
    if (!leave && this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
    resolve?.(leave);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.backdrop.remove();
  }
}
