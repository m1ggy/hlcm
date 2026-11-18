// No-input auto clock-out (scope v2, docs/activity-monitoring-plan.md): fed
// every tick with the OS idle time — only how long since the last input,
// never the input itself. Once there has been no keyboard or mouse input
// for the limit (2 hours, from the server), it fires once with the moment
// input stopped, so the session can be closed back then. Unit-tested in
// idle.test.ts.

export class NoInputWatch {
  private fired = false;

  /** Returns when input stopped the first time the limit is reached; null otherwise. */
  update(now: number, systemIdleSec: number, limitSec: number): number | null {
    if (systemIdleSec < limitSec) {
      this.fired = false;
      return null;
    }
    if (this.fired) return null;
    this.fired = true;
    return now - systemIdleSec * 1000;
  }

  reset() {
    this.fired = false;
  }
}
