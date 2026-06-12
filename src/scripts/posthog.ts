import posthog from "posthog-js";

let ready = false;

export function initAnalytics() {
  const key = import.meta.env.PUBLIC_POSTHOG_KEY;
  const host = import.meta.env.PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!key || ready) {
    return false;
  }

  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    autocapture: true,
    person_profiles: "identified_only",
    persistence: "localStorage+cookie"
  });

  posthog.capture("$pageview", {
    path: window.location.pathname,
    title: document.title
  });

  ready = true;
  return true;
}

export function captureEvent(name: string, properties?: Record<string, unknown>) {
  if (!ready) {
    return;
  }

  posthog.capture(name, properties);
}
