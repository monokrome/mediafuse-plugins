/**
 * mediafuse-p5 overlay plugin
 *
 * Loads p5.js and a user sketch module, creates a p5 instance
 * inside the overlay container. Messages from mediafuse are
 * forwarded to the sketch via p.messageReceived(msg).
 *
 * Config:
 *   sketch  - URL to the sketch module (required)
 *   p5Cdn   - URL to p5.js (optional, defaults to jsdelivr)
 *   width   - canvas width (optional, defaults to container width)
 *   height  - canvas height (optional, defaults to container height)
 */

const DEFAULT_P5_CDN = "https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js";

function setup({ register: reg }) {
  let container = null;
  let p5Instance = null;

  const registered = reg("overlay", {
    onCreate(ctx) {
      container = ctx.container;
      if (!container) return;

      const sketchUrl = ctx.config.sketch;
      if (!sketchUrl) {
        console.warn("[mediafuse-p5] No sketch URL provided in config");
        return;
      }

      init(ctx.config);
    },
    onMessage(msg) {
      if (p5Instance && typeof p5Instance.messageReceived === "function") {
        p5Instance.messageReceived(msg);
      }
    },
    onResize({ width, height }) {
      if (p5Instance) {
        p5Instance.resizeCanvas(width, height);
      }
    },
    onDestroy() {
      p5Instance?.remove();
      p5Instance = null;
    },
  });

  if (!registered) return;

  async function init(config) {
    const p5Cdn = config.p5Cdn || DEFAULT_P5_CDN;

    if (!window.p5) {
      await loadScript(p5Cdn);
    }

    const sketchModule = await import(/* webpackIgnore: true */ config.sketch);
    const sketchFn = sketchModule.default ?? sketchModule;

    if (typeof sketchFn !== "function") {
      console.error("[mediafuse-p5] Sketch module must export a function");
      return;
    }

    container.style.pointerEvents = "auto";

    p5Instance = new window.p5((p) => {
      sketchFn(p);

      const userSetup = p.setup;
      p.setup = () => {
        const w = config.width || container.clientWidth || window.innerWidth;
        const h = config.height || container.clientHeight || window.innerHeight;
        const canvas = p.createCanvas(w, h);
        canvas.parent(container);
        p.clear();

        if (userSetup) userSetup();
      };
    });
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${url}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${url}`));
      document.head.appendChild(script);
    });
  }
}

export default (definePlugin) => definePlugin("mediafuse-p5", setup);
