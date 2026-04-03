// src/index.ts
var DEFAULT_P5_CDN = "https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js";
function setup({ register: reg, load }) {
  let container = null;
  let p5Instance = null;
  let isDev = false;
  let messageActioned = null;
  let pendingMessage = void 0;
  let pendingCommand = void 0;
  const registered = reg("overlay", {
    onCreate(ctx) {
      container = ctx.container;
      isDev = ctx.dev ?? false;
      messageActioned = ctx.messageActioned;
      if (!container) return;
      const sketchUrl = ctx.config.sketch;
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
    }
  });
  if (!registered) return;
  function forward(method, data) {
    if (p5Instance && typeof p5Instance[method] === "function") {
      p5Instance[method](data);
    }
  }
  function flushPending() {
    if (pendingMessage !== void 0) {
      forward("messageReceived", pendingMessage);
      pendingMessage = void 0;
    }
    if (pendingCommand !== void 0) {
      forward("commandReceived", pendingCommand);
      pendingCommand = void 0;
    }
  }
  async function init(config) {
    const p5Cdn = config.p5Cdn || DEFAULT_P5_CDN;
    if (!window.p5) {
      await loadScript(p5Cdn);
    }
    const sketch = config.sketch;
    const sketchModule = await load(sketch, "source");
    const sketchFn = sketchModule.default ?? sketchModule;
    if (typeof sketchFn !== "function") {
      console.error("[mediafuse-p5] Sketch module must export a function");
      return;
    }
    container.style.pointerEvents = "auto";
    p5Instance = new window.p5((p) => {
      sketchFn(p);
      p.messageDisplayed = (duration) => {
        if (messageActioned) messageActioned(duration);
      };
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
    flushPending();
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
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${url}`));
      document.head.appendChild(script);
    });
  }
}
var index_default = (definePlugin) => definePlugin("mediafuse-p5", setup);
export {
  index_default as default
};
