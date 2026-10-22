import { Plugin } from "@opencode/plugin/tui";
import type { Renderable, OptimizedBuffer } from "@opentui/core";
import { createEffect, createSignal, on, onCleanup, Show, untrack } from "solid-js";
import { commands } from "./commands.js";
import { SettingsDialog, SplashDialog } from "./dialogs.js";
import { RainbowEngine } from "./engine.js";
import { collectRegions, FrameCache, processNativeFrame } from "./native-frame.js";
import { AnimationPump } from "./pump.js";
import { DEFAULT_SETTINGS, loadPiSettings, normalizeSettings, type RainbowSettings } from "./settings.js";

export default Plugin.define({
  id: "opencode.rainbow",
  async setup(ctx) {
    const initial = ctx.options.importPiSettings === false ? DEFAULT_SETTINGS : await loadPiSettings();
    const [saved, update] = ctx.storage.store("settings", { initial: { settings: initial } });
    const [settings, setSettings] = createSignal(normalizeSettings(saved.settings));
    const footers = new Set<Renderable>();
    function Footer() {
      let marker: Renderable | undefined;
      onCleanup(() => { if (marker) footers.delete(marker); });
      return <box ref={(node) => { marker = node; footers.add(node); }}>
        <Show when={settings().showStatus}>
          <text fg={ctx.theme.text.muted}> {settings().enabled ? "◆" : "◇"} rainbow {settings().preset} · {settings().scope} · {settings().mode}/{settings().motion} · {Object.keys(settings().fx).length}fx</text>
        </Show>
      </box>;
    }
    const sidebars = new Set<Renderable>();
    function SidebarMarker() {
      let marker: Renderable | undefined;
      onCleanup(() => { if (marker) sidebars.delete(marker); });
      // Absolute so it adds no gap row to the sidebar footer's column layout.
      return <box position="absolute" width={0} height={0} ref={(node) => { marker = node; sidebars.add(node); }} />;
    }
    const slots = [ctx.ui.slot({ append: "prompt.footer.status", render: Footer }), ctx.ui.slot({ append: "home.footer.status", render: Footer }),
      ctx.ui.slot({ append: "sidebar.footer", render: SidebarMarker })];
    const app = ctx.ui.slot({ append: "app", render: () => untrack(() => {
      const engine = new RainbowEngine(settings());
      let suspended = false;
      // Focus events only report changes, so start from OpenTUI's last known
      // state (a private field; null until reported). Terminals that never
      // report focus keep animating.
      let blurred = (ctx.renderer as unknown as { _terminalFocusState?: boolean | null })._terminalFocusState === false;
      let failed = false;
      let dialogOwned = false;
      const working = () => {
        const route = ctx.ui.router.current();
        return route.type === "session" && ctx.data.session.family(route.sessionID).some((id) => ctx.data.session.status(id) === "running");
      };
      // Only the pump's ticks move the animation. OpenCode redraws far more
      // often while a session works; those replay the last tick unchanged.
      let tickDue = true;
      // Redraws reuse the last output for every row OpenCode didn't change.
      const cache = new FrameCache();
      const pump = new AnimationPump(engine, settings, working, () => { tickDue = true; ctx.renderer.requestRender(); });
      pump.suspended = blurred;
      const activity = (strength = 0) => {
        pump.activity(strength);
        if (strength && settings().reactive) {
          const cursor = ctx.renderer.getCursorState();
          for (const kind of ["ripple", "shockwave", "flash", "burst"] as const)
            engine.emit({ kind, x: Math.max(0, cursor.x - 1), y: Math.max(0, cursor.y - 1), strength });
        }
      };
      const apply = (patch: Partial<RainbowSettings>, message?: string) => {
        void update((draft) => { draft.settings = normalizeSettings({ ...draft.settings, ...patch }); })
          .catch((error) => ctx.ui.toast.show({ title: "Rainbow", variant: "error", message: `Could not save settings: ${error}` }));
        if (message) ctx.ui.toast.show({ title: "Rainbow", message });
      };
      createEffect(on(() => JSON.stringify(saved.settings), (raw) => {
        const next = normalizeSettings(JSON.parse(raw));
        setSettings(next);
        engine.updateSettings(next);
        failed = false;
        pump.suspended = suspended || blurred;
        activity();
        tickDue = true;
        cache.invalidate();
        ctx.renderer.requestRender();
      }));
      const suspend = (value: boolean) => { suspended = value; pump.suspended = value || blurred; pump.refresh(); ctx.renderer.requestRender(); };
      // An unfocused pane keeps its last colours but stops animating; OpenCode's
      // own redraws there replay the frozen frame from the cache.
      const blur = () => { blurred = true; pump.suspended = true; pump.refresh(); };
      const focus = () => { blurred = false; pump.suspended = suspended || failed; activity(); ctx.renderer.requestRender(); };
      const showDialog = (splash: boolean) => {
        ctx.ui.dialog.clear();
        suspend(true);
        dialogOwned = true;
        ctx.ui.dialog.show(() => splash ? <SplashDialog ctx={ctx} settings={settings()} /> :
          <SettingsDialog ctx={ctx} settings={settings} apply={apply} working={working} />,
          () => { dialogOwned = false; suspend(false); });
        ctx.ui.dialog.set({ size: "large", centered: true });
      };
      const entries = commands(ctx, settings, apply, {
        settings: () => showDialog(false), splash: () => showDialog(true),
        status: () => {
          const stats = engine.getStats();
          return `enabled=${settings().enabled}, attached=${!failed}, fullscreen=${ctx.renderer.screenMode === "alternate-screen"}, input=${ctx.keymap.mode.current()}, focused=${!blurred}\n` +
            `${settings().preset} · ${settings().scope} · ${settings().mode}/${settings().motion}\n` +
            `${engine.activeFxIds().length} effects · ${pump.fps} fps · ${stats.frames} frames\n` +
            `${stats.lastMs.toFixed(1)}ms last / ${stats.avgMs.toFixed(1)}ms average · quality ${stats.quality.toFixed(2)} · ${stats.dropped} over-budget frames`;
        },
      });
      ctx.keymap.layer(() => ({ mode: "global", commands: entries, bindings: ["rainbow", "rainbow.next"] }));
      const process = (buffer: OptimizedBuffer) => {
        const s = settings();
        if (failed || suspended || !s.enabled) return;
        if (ctx.renderer.screenMode !== "alternate-screen" && s.regularMode === "off") return;
        try {
          if (!pump.fps && working()) activity();
          const bg = ctx.theme.background.base;
          const fg = ctx.theme.text.base;
          engine.setTheme({ r: Math.round(bg.r * 255), g: Math.round(bg.g * 255), b: Math.round(bg.b * 255) },
            { r: Math.round(fg.r * 255), g: Math.round(fg.g * 255), b: Math.round(fg.b * 255) });
          const cursor = ctx.renderer.getCursorState();
          processNativeFrame(buffer, engine, s, {
            inputMode: ctx.keymap.mode.current(), regions: collectRegions(ctx.renderer.root, footers, sidebars),
            cursor: cursor.visible ? { x: cursor.x - 1, y: cursor.y - 1 } : null, advance: tickDue, cache,
          });
          tickDue = false;
        } catch (error) {
          failed = true;
          pump.suspended = true;
          pump.refresh();
          ctx.ui.toast.show({ title: "Rainbow renderer", variant: "error", message: String(error) });
        }
      };
      ctx.renderer.addPostProcessFn(process);
      const key = () => activity(.15);
      const paste = () => activity(.3);
      const mouse = () => activity();
      ctx.renderer.keyInput.on("keypress", key);
      ctx.renderer.keyInput.on("paste", paste);
      ctx.renderer.on("mouse", mouse);
      ctx.renderer.on("blur", blur);
      ctx.renderer.on("focus", focus);
      const stop = ctx.data.listen(({ details }) => {
        const route = ctx.ui.router.current();
        if (route.type !== "session") return;
        const data = details.data as { sessionID?: string };
        if (data.sessionID && ctx.data.session.family(route.sessionID).includes(data.sessionID)) activity(.4);
      });
      pump.refresh();
      const splash = settings().enabled && settings().splashOnStart ? setTimeout(() => showDialog(true), 150) : undefined;
      onCleanup(() => {
        clearTimeout(splash);
        if (dialogOwned) ctx.ui.dialog.clear();
        pump.dispose();
        stop();
        ctx.renderer.keyInput.off("keypress", key);
        ctx.renderer.keyInput.off("paste", paste);
        ctx.renderer.off("mouse", mouse);
        ctx.renderer.off("blur", blur);
        ctx.renderer.off("focus", focus);
        ctx.renderer.removePostProcessFn(process);
        engine.resetState();
        if (!ctx.renderer.isDestroyed) ctx.renderer.requestRender();
      });
      return null;
    }) });
    return () => { app(); for (const slot of slots) slot(); };
  },
});
