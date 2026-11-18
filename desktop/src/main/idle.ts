// Pure idle state machine, fed every tick with the OS idle time. Unit-tested
// in idle.test.ts.
//
// An idle stretch starts once there has been no input for the threshold
// (15 min by default, longer while a rule grants idle grace). It starts at
// the last input, not when it was detected, so the whole quiet period
// counts. It ends at the first input after that.

export type IdleEvent = { type: "started"; start: number } | { type: "ended"; start: number; end: number };

export class IdleDetector {
  idleStart: number | null = null;

  update(now: number, systemIdleSec: number, thresholdSec: number): IdleEvent | null {
    const lastInputAt = now - systemIdleSec * 1000;
    if (this.idleStart === null) {
      if (systemIdleSec >= thresholdSec) {
        this.idleStart = lastInputAt;
        return { type: "started", start: lastInputAt };
      }
      return null;
    }
    // Any input after the stretch began ends it. The 1 s margin absorbs
    // rounding in the OS idle counter.
    if (lastInputAt > this.idleStart + 1000) {
      const event: IdleEvent = { type: "ended", start: this.idleStart, end: lastInputAt };
      this.idleStart = null;
      return event;
    }
    return null;
  }

  /**
   * The machine slept or locked: the OS idle counter may reset on wake, so
   * the stretch is opened explicitly at the moment it went to sleep.
   */
  forceStart(at: number): IdleEvent | null {
    if (this.idleStart !== null) return null;
    this.idleStart = at;
    return { type: "started", start: at };
  }

  reset() {
    this.idleStart = null;
  }
}
