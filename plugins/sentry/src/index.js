/**
 * mediafuse-sentry overlay plugin
 *
 * Initializes Sentry error tracking in the overlay context.
 * Only registers in the overlay environment — never loads in the dashboard.
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
  }, { environment: "overlay" });
}

export default (definePlugin) => definePlugin("sentry", setup);
