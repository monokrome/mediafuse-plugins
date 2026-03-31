/**
 * mediafuse-sentry overlay plugin
 *
 * Initializes Sentry error tracking in the overlay context.
 * Only runs in the overlay environment — skips initialization
 * when loaded in the dashboard.
 *
 * Config:
 *   dsn          - Sentry DSN (required)
 *   environment  - Environment name (optional, defaults to "production")
 *   tracesSampleRate - Performance trace sample rate (optional, defaults to 0)
 *   tags         - Additional tags to attach to events (optional, object)
 */

import * as Sentry from "@sentry/browser";

function setup({ register: reg }) {
  let initialized = false;

  reg("overlay", {
    onCreate(ctx) {
      if (ctx.environment !== "overlay") return;

      const dsn = ctx.config.sentryDsn;
      if (!dsn) return;

      Sentry.init({
        dsn,
        environment: ctx.config.sentryEnvironment || "production",
        tracesSampleRate: ctx.config.sentryTracesSampleRate || 0,
        beforeSend(event) {
          event.tags = {
            ...event.tags,
            ...ctx.config.sentryTags,
            mediafuse: "overlay",
          };
          return event;
        },
      });

      initialized = true;
    },
    onDestroy() {
      if (initialized) {
        Sentry.close();
        initialized = false;
      }
    },
  });
}

export default (definePlugin) => definePlugin("sentry", setup);
