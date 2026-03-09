import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestHarness } from "mediafuse/testing";
import plugin from "../src/index.js";

describe("beefweb plugin", () => {
  let fetchSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn().mockResolvedValue({ ok: false });
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("registers as a data plugin named 'beefweb'", () => {
    const harness = createTestHarness(plugin, { type: "data" });
    expect(harness.name).toBe("beefweb");
    expect(harness.type).toBe("data");
    expect(harness.registered).toBe(true);
  });

  it("does not register as overlay", () => {
    const harness = createTestHarness(plugin, { type: "overlay" });
    expect(harness.registered).toBe(false);
  });

  it("constructs beefweb URL from config", () => {
    createTestHarness(plugin, {
      type: "data",
      config: {
        beefwebBase: "http://myhost:9999",
        beefwebColumns: ["%artist%", "%title%"],
      },
    });

    expect(fetchSpy).toHaveBeenCalled();
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain("http://myhost:9999/api/player");
    expect(url).toContain("%25artist%25");
    expect(url).toContain("%25title%25");
  });

  it("uses default beefweb URL when no config provided", () => {
    createTestHarness(plugin, { type: "data" });

    expect(fetchSpy).toHaveBeenCalled();
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain("http://localhost:8880/api/player");
  });

  it("posts a message when a track is playing", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            player: {
              playbackState: "playing",
              activeItem: { columns: ["Artist", "Title", "Album"] },
            },
          }),
      })
      .mockResolvedValueOnce({ ok: true });

    createTestHarness(plugin, { type: "data", config: { channel: "test-chan" } });

    // Let the initial poll() promise resolve
    await vi.advanceTimersByTimeAsync(0);

    const postCall = fetchSpy.mock.calls.find(
      (c) => c[1]?.method === "POST",
    );
    expect(postCall).toBeDefined();
    expect(postCall[0]).toContain("/api/messages");
    expect(postCall[0]).toContain("channel=test-chan");

    const body = JSON.parse(postCall[1].body);
    expect(body.type).toBe("music");
    expect(body.data.title).toContain("Title");
    expect(body.data.subtitle).toContain("Artist");
    expect(body.duration).toBe(15);
  });

  it("does not post when playback is not playing", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          player: { playbackState: "stopped", activeItem: null },
        }),
    });

    createTestHarness(plugin, { type: "data" });
    await vi.advanceTimersByTimeAsync(0);

    const postCalls = fetchSpy.mock.calls.filter(
      (c) => c[1]?.method === "POST",
    );
    expect(postCalls).toHaveLength(0);
  });

  it("does not post duplicate tracks", async () => {
    const trackResponse = () => ({
      ok: true,
      json: () =>
        Promise.resolve({
          player: {
            playbackState: "playing",
            activeItem: { columns: ["Artist", "Song", "Album"] },
          },
        }),
    });

    fetchSpy
      .mockResolvedValueOnce(trackResponse())
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(trackResponse())
      .mockResolvedValueOnce({ ok: true });

    createTestHarness(plugin, { type: "data" });

    // First poll
    await vi.advanceTimersByTimeAsync(0);

    const firstPostCount = fetchSpy.mock.calls.filter(
      (c) => c[1]?.method === "POST",
    ).length;
    expect(firstPostCount).toBe(1);

    // Second poll (same track)
    await vi.advanceTimersByTimeAsync(3000);

    const totalPostCount = fetchSpy.mock.calls.filter(
      (c) => c[1]?.method === "POST",
    ).length;
    expect(totalPostCount).toBe(1);
  });

  it("cleans up on destroy", () => {
    const harness = createTestHarness(plugin, { type: "data" });
    expect(() => harness.destroy()).not.toThrow();
  });

  it("uses custom display seconds from config", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            player: {
              playbackState: "playing",
              activeItem: { columns: ["A", "T", "Al"] },
            },
          }),
      })
      .mockResolvedValueOnce({ ok: true });

    createTestHarness(plugin, {
      type: "data",
      config: { beefwebDisplaySeconds: 30 },
    });
    await vi.advanceTimersByTimeAsync(0);

    const postCall = fetchSpy.mock.calls.find(
      (c) => c[1]?.method === "POST",
    );
    const body = JSON.parse(postCall[1].body);
    expect(body.duration).toBe(30);
  });
});
