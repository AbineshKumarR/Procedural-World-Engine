// src/utils/perf.js
// Robust PerfMeter: stores last N frame deltas and computes FPS (moving average + EMA smoothing)

export default class PerfMeter {
  /**
   * sampleWindow: number of recent frames to average (e.g. 60)
   * emaAlpha: smoothing factor for exponential moving average (0..1). 0.12 is gentle smoothing.
   */
  constructor({ sampleWindow = 60, emaAlpha = 0.12 } = {}) {
    this.sampleWindow = sampleWindow;
    this.emaAlpha = emaAlpha;
    this.deltas = []; // last frame times in ms
    this.emaFps = null;
    this.lastFrameTime = null;
    this._frames = 0;
    this._lastNow = performance.now();
  }

  recordFrame(frameTimeMs) {
    // frameTimeMs is the delta between frames in ms (as number)
    if (typeof frameTimeMs !== 'number' || !isFinite(frameTimeMs) || frameTimeMs <= 0) {
      // guard: compute from now()
      const now = performance.now();
      frameTimeMs = Math.max(0.1, now - this._lastNow);
      this._lastNow = now;
    }
    this.deltas.push(frameTimeMs);
    if (this.deltas.length > this.sampleWindow) this.deltas.shift();

    const avgDelta = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
    const instantFps = avgDelta > 0 ? 1000 / avgDelta : 0;

    // EMA smoothing
    if (this.emaFps === null) this.emaFps = instantFps;
    else this.emaFps = this.emaFps * (1 - this.emaAlpha) + instantFps * this.emaAlpha;

    this._frames++;
    return this.emaFps;
  }

  getFPS() {
    if (this.emaFps === null) return 0;
    return Number(this.emaFps.toFixed(1));
  }

  getInstantFPS() {
    if (!this.deltas.length) return 0;
    const avgDelta = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
    return Number((1000 / avgDelta).toFixed(1));
  }

  reset() {
    this.deltas.length = 0;
    this.emaFps = null;
    this._frames = 0;
  }
}
