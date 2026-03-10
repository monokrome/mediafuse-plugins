// src/index.ts
var DEFAULT_BASE = "http://localhost:8880";
var DEFAULT_COLUMNS = ["%artist%", "%title%", "%album%"];
var DEFAULT_POLL_MS = 3e3;
var DEFAULT_DISPLAY_SECONDS = 15;
var TRACK_KEY_STORAGE = "beefweb:lastTrackKey";
function readConfig(config) {
  return {
    channel: config.channel || "default",
    base: config.beefwebBase || DEFAULT_BASE,
    columns: config.beefwebColumns || DEFAULT_COLUMNS,
    pollMs: config.beefwebPollMs || DEFAULT_POLL_MS,
    displaySeconds: config.beefwebDisplaySeconds || DEFAULT_DISPLAY_SECONDS
  };
}
function setup({ register: reg }) {
  let dataStop = null;
  reg("data", {
    onCreate(ctx) {
      const cfg = readConfig(ctx.config);
      const columnsParam = cfg.columns.map(encodeURIComponent).join(",");
      const playerUrl = `${cfg.base}/api/player?columns=${columnsParam}`;
      let lastTrackKey = null;
      let controller = null;
      try {
        lastTrackKey = sessionStorage.getItem(TRACK_KEY_STORAGE);
      } catch {
      }
      async function poll() {
        controller?.abort();
        controller = new AbortController();
        try {
          const res = await fetch(playerUrl, {
            signal: controller.signal,
            cache: "no-store"
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
          const [artist, title] = activeItem.columns;
          const trackKey = `${artist}|${title}`;
          if (trackKey === lastTrackKey) return;
          lastTrackKey = trackKey;
          try {
            sessionStorage.setItem(TRACK_KEY_STORAGE, trackKey);
          } catch {
          }
          const msgUrl = `/api/messages?channel=${encodeURIComponent(cfg.channel)}`;
          await fetch(msgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "music",
              data: {
                title: `Now Playing: ${title || ""}`,
                subtitle: artist ? `by ${artist}` : ""
              },
              duration: cfg.displaySeconds
            })
          });
        } catch {
        }
      }
      poll();
      const intervalId = setInterval(poll, cfg.pollMs);
      dataStop = () => {
        clearInterval(intervalId);
        controller?.abort();
      };
    },
    onDestroy() {
      dataStop?.();
      dataStop = null;
    }
  }, { environment: "overlay" });
  reg("dashboard", {
    onCreate(ctx) {
      if (!ctx.container) return;
      const cfg = readConfig(ctx.config);
      setupDashboard(ctx.container, cfg.base, cfg.pollMs);
      return { label: "Music", icon: "music" };
    }
  });
}
function esc(s) {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}
function setupDashboard(container, base, pollMs) {
  const columnsParam = DEFAULT_COLUMNS.map(encodeURIComponent).join(",");
  const playerUrl = `${base}/api/player?columns=${columnsParam}`;
  let currentTrack = null;
  let playlistItems = [];
  let activePlaylistId = null;
  let activeIndex = -1;
  let intervalId = null;
  const style = document.createElement("style");
  style.textContent = `
    .bw-panel { font-family: inherit; padding: 1rem; color: #e0e0e0; }
    .bw-now-playing { margin-bottom: 1.5rem; }
    .bw-track-title { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.25rem; }
    .bw-track-artist { font-size: 0.9rem; color: #aaa; margin: 0 0 0.25rem; }
    .bw-track-album { font-size: 0.85rem; color: #888; margin: 0 0 0.75rem; }
    .bw-progress-wrap { display: flex; align-items: center; gap: 0.5rem; }
    .bw-progress-bar { flex: 1; height: 6px; background: #333; border-radius: 3px; overflow: hidden; cursor: pointer; }
    .bw-progress-fill { height: 100%; background: #7c5cbf; border-radius: 3px; transition: width 0.3s; }
    .bw-time { font-size: 0.75rem; color: #888; min-width: 3rem; }
    .bw-time-right { text-align: right; }
    .bw-state { font-size: 0.8rem; color: #666; margin-bottom: 0.5rem; text-transform: capitalize; }
    .bw-playlist { margin-top: 1rem; }
    .bw-playlist-header { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; }
    .bw-playlist-list { list-style: none; padding: 0; margin: 0; max-height: 300px; overflow-y: auto; }
    .bw-playlist-item {
      display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem;
      border-radius: 4px; cursor: pointer; font-size: 0.85rem;
    }
    .bw-playlist-item:hover { background: #2a2a2a; }
    .bw-playlist-item-active { background: #1a1a2e; color: #b89eff; }
    .bw-play-icon { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.5; }
    .bw-playlist-item:hover .bw-play-icon, .bw-playlist-item-active .bw-play-icon { opacity: 1; }
    .bw-no-data { color: #666; font-size: 0.9rem; }
  `;
  container.appendChild(style);
  const panel = document.createElement("div");
  panel.className = "bw-panel";
  container.appendChild(panel);
  const nowPlaying = document.createElement("div");
  nowPlaying.className = "bw-now-playing";
  panel.appendChild(nowPlaying);
  const playlistSection = document.createElement("div");
  playlistSection.className = "bw-playlist";
  panel.appendChild(playlistSection);
  const playSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  function renderNowPlaying() {
    if (!currentTrack || currentTrack.playbackState === "stopped") {
      nowPlaying.innerHTML = `<p class="bw-no-data">Not playing</p>`;
      return;
    }
    const pct = currentTrack.duration > 0 ? currentTrack.position / currentTrack.duration * 100 : 0;
    nowPlaying.innerHTML = `
      <div class="bw-state">${currentTrack.playbackState}</div>
      <p class="bw-track-title">${esc(currentTrack.title || "Unknown")}</p>
      <p class="bw-track-artist">${esc(currentTrack.artist || "Unknown Artist")}</p>
      ${currentTrack.album ? `<p class="bw-track-album">${esc(currentTrack.album)}</p>` : ""}
      <div class="bw-progress-wrap">
        <span class="bw-time">${formatTime(currentTrack.position)}</span>
        <div class="bw-progress-bar" data-action="seek">
          <div class="bw-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="bw-time bw-time-right">${formatTime(currentTrack.duration)}</span>
      </div>
    `;
    const bar = nowPlaying.querySelector("[data-action=seek]");
    if (bar) {
      bar.addEventListener("click", (e) => {
        if (!currentTrack || currentTrack.duration <= 0) return;
        const rect = bar.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const seekTo = ratio * currentTrack.duration;
        fetch(`${base}/api/player`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: seekTo })
        }).catch(() => {
        });
      });
    }
  }
  function renderPlaylist() {
    if (playlistItems.length === 0) {
      playlistSection.innerHTML = `<p class="bw-no-data">No playlist loaded</p>`;
      return;
    }
    const header = document.createElement("div");
    header.className = "bw-playlist-header";
    header.textContent = "Playlist";
    const list = document.createElement("ul");
    list.className = "bw-playlist-list";
    for (let i = 0; i < playlistItems.length; i++) {
      const item = playlistItems[i];
      const [artist, title] = item.columns;
      const li = document.createElement("li");
      li.className = "bw-playlist-item" + (i === activeIndex ? " bw-playlist-item-active" : "");
      const icon = document.createElement("span");
      icon.className = "bw-play-icon";
      icon.innerHTML = playSvg;
      const text = document.createElement("span");
      text.textContent = title ? `${artist} \u2014 ${title}` : artist || "Unknown";
      li.appendChild(icon);
      li.appendChild(text);
      li.addEventListener("click", () => {
        if (activePlaylistId === null) return;
        fetch(`${base}/api/player`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlistId: activePlaylistId, itemIndex: i })
        }).catch(() => {
        });
      });
      list.appendChild(li);
    }
    playlistSection.innerHTML = "";
    playlistSection.appendChild(header);
    playlistSection.appendChild(list);
  }
  async function loadPlaylist() {
    try {
      const res = await fetch(`${base}/api/playlists`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const active = data.playlists?.find((p) => p.isCurrent);
      if (!active) return;
      activePlaylistId = active.id;
      const cols = ["%artist%", "%title%"].map(encodeURIComponent).join(",");
      const itemsRes = await fetch(
        `${base}/api/playlists/${active.id}/items/0:${active.itemCount}?columns=${cols}`,
        { cache: "no-store" }
      );
      if (!itemsRes.ok) return;
      const itemsData = await itemsRes.json();
      playlistItems = itemsData.playlistItems?.items ?? [];
    } catch {
    }
  }
  async function poll() {
    try {
      const res = await fetch(playerUrl, { cache: "no-store" });
      if (!res.ok) {
        currentTrack = null;
        renderNowPlaying();
        return;
      }
      const data = await res.json();
      const { playbackState, activeItem } = data.player;
      currentTrack = {
        artist: activeItem?.columns?.[0] ?? "",
        title: activeItem?.columns?.[1] ?? "",
        album: activeItem?.columns?.[2] ?? "",
        position: data.player.activeItem?.position ?? 0,
        duration: data.player.activeItem?.duration ?? 0,
        playbackState
      };
      activeIndex = playlistItems.findIndex((item) => {
        const [artist, title] = item.columns;
        return artist === currentTrack.artist && title === currentTrack.title;
      });
      renderNowPlaying();
      renderPlaylist();
    } catch {
    }
  }
  loadPlaylist().then(() => {
    renderPlaylist();
    poll();
    intervalId = setInterval(poll, pollMs);
  });
}
var index_default = (definePlugin) => definePlugin("beefweb", setup);
export {
  index_default as default
};
