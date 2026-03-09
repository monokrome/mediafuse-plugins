/**
 * beefweb data plugin
 *
 * Polls foobar2000's beefweb API for now-playing track info
 * and posts now-playing messages to the overlay.
 */

const DEFAULT_BASE = "http://localhost:8880";
const DEFAULT_COLUMNS = ["%artist%", "%title%", "%album%"];
const DEFAULT_POLL_MS = 3000;
const DEFAULT_DISPLAY_SECONDS = 15;

const TRACK_KEY_STORAGE = "beefweb:lastTrackKey";

function setup({ register: reg }) {
  let channel = "default";
  let intervalId = null;
  let controller = null;
  let lastTrackKey = null;
  let beefwebUrl = null;
  let displaySeconds = DEFAULT_DISPLAY_SECONDS;
  let pollMs = DEFAULT_POLL_MS;

  try { lastTrackKey = sessionStorage.getItem(TRACK_KEY_STORAGE); } catch {}

  const registered = reg("data", {
    onCreate(ctx) {
      channel = ctx.config.channel || "default";

      const base = ctx.config.beefwebBase || DEFAULT_BASE;
      const columns = ctx.config.beefwebColumns || DEFAULT_COLUMNS;
      pollMs = ctx.config.beefwebPollMs || DEFAULT_POLL_MS;
      displaySeconds = ctx.config.beefwebDisplaySeconds || DEFAULT_DISPLAY_SECONDS;

      const columnsParam = columns.map(encodeURIComponent).join(",");
      beefwebUrl = `${base}/api/player?columns=${columnsParam}`;

      start();
    },
    onDestroy: stop,
  });

  if (!registered) return;

  async function poll() {
    controller?.abort();
    controller = new AbortController();

    try {
      const res = await fetch(beefwebUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        lastTrackKey = null;
        return;
      }

      const data = await res.json();
      const { playbackState, activeItem } = data.player;

      if (playbackState !== "playing" || !activeItem?.columns) {
        lastTrackKey = null;
        return;
      }

      const [artist, title, album] = activeItem.columns;
      const trackKey = `${artist}|${title}`;
      if (trackKey === lastTrackKey) return;
      lastTrackKey = trackKey;
      try { sessionStorage.setItem(TRACK_KEY_STORAGE, trackKey); } catch {}

      const msgUrl = `/api/messages?channel=${encodeURIComponent(channel)}`;
      await fetch(msgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "music",
          data: {
            title: `Now Playing: ${title || ""}`,
            subtitle: artist ? `by ${artist}` : "",
          },
          duration: displaySeconds,
        }),
      });
    } catch {
      // beefweb unreachable
    }
  }

  function start() {
    poll();
    intervalId = setInterval(poll, pollMs);
  }

  function stop() {
    if (intervalId) clearInterval(intervalId);
    controller?.abort();
    intervalId = null;
    controller = null;
  }
}

export default (definePlugin) => definePlugin("beefweb", setup);
