import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestHarness } from "mediafuse/testing";
import plugin from "../src/index.js";

// Stub browser globals that p5 plugin uses in init()
beforeEach(() => {
  globalThis.window = { p5: null };
  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ src: "", onload: null, onerror: null }),
    head: { appendChild: (el) => { if (el.onload) el.onload(); } },
  };
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

describe("mediafuse-p5 plugin", () => {
  it("registers as an overlay plugin named 'mediafuse-p5'", () => {
    const harness = createTestHarness(plugin, { type: "overlay" });
    expect(harness.name).toBe("mediafuse-p5");
    expect(harness.type).toBe("overlay");
    expect(harness.registered).toBe(true);
  });

  it("does not register as data", () => {
    const harness = createTestHarness(plugin, { type: "data" });
    expect(harness.registered).toBe(false);
  });

  it("provides a container", () => {
    const harness = createTestHarness(plugin, { type: "overlay" });
    expect(harness.container).not.toBeNull();
  });

  it("warns when no sketch URL is provided", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createTestHarness(plugin, { type: "overlay" });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No sketch URL"),
    );
    warnSpy.mockRestore();
  });

  it("has onMessage handler", () => {
    const harness = createTestHarness(plugin, { type: "overlay" });
    expect(harness.handlers.onMessage).toBeTypeOf("function");
  });

  it("has onCommand handler", () => {
    const harness = createTestHarness(plugin, { type: "overlay" });
    expect(harness.handlers.onCommand).toBeTypeOf("function");
  });

  it("has onDestroy handler", () => {
    const harness = createTestHarness(plugin, { type: "overlay" });
    expect(harness.handlers.onDestroy).toBeTypeOf("function");
  });

  it("does not throw when firing events without p5 instance", () => {
    const harness = createTestHarness(plugin, { type: "overlay" });
    expect(() =>
      harness.message({ type: "test", data: {}, timestamp: 1, expiresAt: null }),
    ).not.toThrow();
    expect(() =>
      harness.command({ name: "test", data: null }),
    ).not.toThrow();
    expect(() => harness.destroy()).not.toThrow();
  });
});
