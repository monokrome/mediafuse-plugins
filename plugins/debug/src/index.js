/**
 * mediafuse-debug overlay plugin
 *
 * Add ?debug to the overlay URL to show a debug panel in the top-right
 * corner with message state, durations, and timing info.
 */

function setup({ register: reg }) {
  if (!new URLSearchParams(window.location.search).has("debug")) return;

  let el = null;
  let messageCount = 0;
  let lastMessage = null;
  let lastMessageAt = null;
  let lastActionedAt = null;
  let lastActionedDuration = null;

  reg("overlay", {
    onCreate(ctx) {
      el = document.createElement("div");
      Object.assign(el.style, {
        position: "fixed",
        top: "8px",
        right: "8px",
        background: "rgba(0,0,0,0.85)",
        color: "#e8ddf5",
        fontFamily: "monospace",
        fontSize: "48px",
        lineHeight: "1.5",
        padding: "8px 10px",
        borderRadius: "4px",
        zIndex: "99999",
        maxWidth: "350px",
        wordBreak: "break-all",
        pointerEvents: "none",
      });
      document.body.appendChild(el);

      render();
      setInterval(render, 500);
    },
    onMessage(msg) {
      messageCount++;
      lastMessage = msg;
      lastMessageAt = msg ? Date.now() : lastMessageAt;
      render();
    },
    onMessageActioned(durationMs) {
      lastActionedAt = Date.now();
      lastActionedDuration = durationMs;
      render();
    },
    onDestroy() {
      if (el) el.remove();
    },
  }, { environment: "overlay" });

  function render() {
    if (!el) return;

    const now = Date.now();
    const msgAge = lastMessageAt ? Math.round((now - lastMessageAt) / 1000) : null;
    const actionAge = lastActionedAt ? Math.round((now - lastActionedAt) / 1000) : null;
    const actionExpiry = lastActionedAt && lastActionedDuration
      ? Math.round((lastActionedDuration / 1000) - (now - lastActionedAt) / 1000)
      : null;

    const lines = [
      `msgs: ${messageCount}`,
      `type: ${lastMessage?.type ?? "null"}`,
      `durationMs: ${lastMessage?.durationMs ?? "null"}`,
      `age: ${msgAge !== null ? msgAge + "s" : "-"}`,
      `actioned: ${lastActionedDuration !== null ? lastActionedDuration + "ms" : "-"}`,
      `actioned age: ${actionAge !== null ? actionAge + "s ago" : "-"}`,
      `expires in: ${actionExpiry !== null ? (actionExpiry > 0 ? actionExpiry + "s" : "expired") : "-"}`,
      `data: ${lastMessage?.data ? JSON.stringify(lastMessage.data).slice(0, 120) : "-"}`,
    ];

    el.textContent = lines.join("\n");
  }
}

export default (definePlugin) => definePlugin("debug", setup);
