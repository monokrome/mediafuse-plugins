/**
 * mediafuse-p5 overlay plugin
 *
 * Loads p5.js and a user sketch module, creates a p5 instance
 * inside the overlay container. Messages from mediafuse are
 * forwarded to the sketch via p.messageReceived(msg).
 *
 * Sketch callbacks (all optional):
 *   p.messageReceived(msg)     - mediafuse message received
 *   p.commandReceived(cmd)     - custom command ({ name, data })
 *
 * Config:
 *   sketch  - URL to the sketch module (required)
 *   p5Cdn   - URL to p5.js (optional, defaults to jsdelivr)
 *   width   - canvas width (optional, defaults to container width)
 *   height  - canvas height (optional, defaults to container height)
 */

import type {
  DefinePluginFn,
  PluginContext,
  CreateContext,
  StoredMessage,
} from "mediafuse";

declare global {
  interface Window {
    p5: new (sketch: (p: P5Instance) => void) => P5Instance;
  }
}

interface P5Instance {
  setup?: () => void;
  createCanvas: (w: number, h: number) => { parent: (el: HTMLElement) => void };
  clear: () => void;
  remove: () => void;
  [key: string]: unknown;
}

const DEFAULT_P5_CDN = "https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js";

function setup({ register: reg }: PluginContext): void {
  let container: HTMLDivElement | null = null;
  let p5Instance: P5Instance | null = null;
  let isDev = false;
  let messageActioned: ((durationMs: number | null) => void) | null = null;
  let pendingMessage: StoredMessage | null | undefined = undefined;
  let pendingCommand: { name: string; data: unknown } | undefined = undefined;

  const registered = reg("overlay", {
    onCreate(ctx: CreateContext) {
      container = ctx.container;
      isDev = ctx.dev ?? false;
      messageActioned = ctx.messageActioned;
      if (!container) return;

      const sketchUrl = ctx.config.sketch as string | undefined;
      if (!sketchUrl) {
        console.warn("[mediafuse-p5] No sketch URL provided in config");
        return;
      }

      init(ctx.config);
    },
    onMessage(msg) {
      if (!p5Instance) {
        pendingMessage = msg;
        return;
      }
      forward("messageReceived", msg);
    },
    onCommand(cmd) {
      if (!p5Instance) {
        pendingCommand = cmd;
        return;
      }
      forward("commandReceived", cmd);
    },
    onDestroy() {
      p5Instance?.remove();
      p5Instance = null;
    },
  });

  if (!registered) return;

  function forward(method: string, data: unknown): void {
    if (p5Instance && typeof p5Instance[method] === "function") {
      (p5Instance[method] as (d: unknown) => void)(data);
    }
  }

  function flushPending(): void {
    if (pendingMessage !== undefined) {
      forward("messageReceived", pendingMessage);
      pendingMessage = undefined;
    }
    if (pendingCommand !== undefined) {
      forward("commandReceived", pendingCommand);
      pendingCommand = undefined;
    }
  }

  async function init(config: Record<string, unknown>): Promise<void> {
    const p5Cdn = (config.p5Cdn as string) || DEFAULT_P5_CDN;

    if (!window.p5) {
      await loadScript(p5Cdn);
    }

    const sketch = config.sketch as string;
    const sketchUrl = isDev
      ? sketch + (sketch.includes("?") ? "&" : "?") + "t=" + Date.now()
      : sketch;
    const sketchModule = await import(/* webpackIgnore: true */ sketchUrl);
    const sketchFn = sketchModule.default ?? sketchModule;

    if (typeof sketchFn !== "function") {
      console.error("[mediafuse-p5] Sketch module must export a function");
      return;
    }

    container!.style.pointerEvents = "auto";

    p5Instance = new window.p5((p: P5Instance) => {
      sketchFn(p);

      p.messageDisplayed = (durationMs: number | null) => {
        if (messageActioned) messageActioned(durationMs);
      };

      const userSetup = p.setup;
      p.setup = () => {
        const w = (config.width as number) || container!.clientWidth || window.innerWidth;
        const h = (config.height as number) || container!.clientHeight || window.innerHeight;
        const canvas = p.createCanvas(w, h);
        canvas.parent(container!);
        p.clear();

        if (userSetup) userSetup();
      };
    });

    flushPending();
  }

  function loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${url}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${url}`));
      document.head.appendChild(script);
    });
  }
}

export default (definePlugin: DefinePluginFn) => definePlugin("mediafuse-p5", setup);
