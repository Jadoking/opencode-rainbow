import { isRainbowAnimationDisabled } from "./terminal.js";
import type { RainbowEngine } from "./engine.js";
import type { RainbowSettings } from "./settings.js";

/** One timer, stopped completely at idle. Input and session events wake it. */
export class AnimationPump {
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;
  fps = 0;
  suspended = false;
  constructor(private engine: RainbowEngine, private settings: () => RainbowSettings,
    private working: () => boolean, private render: () => void) {}

  targetFps() {
    const s = this.settings();
    if (this.disposed || this.suspended || !s.enabled || isRainbowAnimationDisabled(s)) return 0;
    if (s.speed === 0 && !Object.values(s.fx).some((n) => n > 0) && !s.presetCycle) return 0;
    if (this.working()) this.engine.pulse(0);
    const fps = this.engine.idleSeconds >= s.idleAfter ? s.alwaysAnimate ? s.idleFps : 0 : s.fps;
    return s.reducedMotion ? Math.min(12, fps) : fps;
  }

  refresh() {
    const fps = this.targetFps();
    if (fps === this.fps && this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.fps = fps;
    if (!fps) { this.engine.settlePalette(); return; }
    this.timer = setInterval(() => {
      if (this.targetFps() !== this.fps) this.refresh();
      if (this.fps) this.render();
    }, 1000 / fps);
    this.timer.unref?.();
  }

  activity(strength = 0) {
    if (this.disposed) return;
    this.engine.pulse(strength);
    this.refresh();
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    this.timer = undefined;
    this.fps = 0;
  }
}
