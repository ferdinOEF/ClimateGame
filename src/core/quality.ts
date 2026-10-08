/**
 * Graphics quality: Low, Medium or High, picked automatically from the frame
 * rate unless the player chooses one.
 *
 * Auto starts at High and steps down when a stretch of play runs slowly; it
 * never steps back up on its own (so it does not flap between levels while a
 * storm plays). A choice the player makes is remembered and used as is.
 *
 * Pure: the session measures frames and applies the result.
 */
export type Quality = "low" | "medium" | "high";
export type QualityChoice = Quality | "auto";

export const QUALITY_ORDER: Quality[] = ["low", "medium", "high"];

/** Frames per second below which Auto steps down: High needs about 40, Medium about 26. */
export const STEP_DOWN_FPS: Record<Quality, number> = { high: 40, medium: 26, low: 0 };

/** How many seconds of frames Auto averages before it decides. */
export const SAMPLE_SECONDS = 4;

export function nextChoice(choice: QualityChoice): QualityChoice {
  const cycle: QualityChoice[] = ["auto", "low", "medium", "high"];
  return cycle[(cycle.indexOf(choice) + 1) % cycle.length];
}

/**
 * Auto's verdict for one sample: the quality to run at after averaging
 * `fps` at `current`. Steps down one level at a time, never up.
 */
export function autoStep(current: Quality, fps: number): Quality {
  if (fps >= STEP_DOWN_FPS[current]) return current;
  const index = QUALITY_ORDER.indexOf(current);
  return QUALITY_ORDER[Math.max(0, index - 1)];
}

/** Rolling frame-rate sampler: feed it frame times, it reports an average every `SAMPLE_SECONDS`. */
export class FrameSampler {
  private frames = 0;
  private start: number | null = null;

  /** Returns the average fps when a sample completes, else null. Gaps over half a second (a hidden tab) restart the sample. */
  frame(nowMs: number, lastMs: number | null): number | null {
    if (this.start === null || (lastMs !== null && nowMs - lastMs > 500)) {
      this.start = nowMs;
      this.frames = 0;
      return null;
    }
    this.frames++;
    const elapsed = (nowMs - this.start) / 1000;
    if (elapsed < SAMPLE_SECONDS) return null;
    const fps = this.frames / elapsed;
    this.start = nowMs;
    this.frames = 0;
    return fps;
  }
}
