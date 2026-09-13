export default {
  async fetch(request, env, ctx) {
    // Serve your existing static site (index.html, app.js, style.css, sw.js, etc.)
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runNotifyTick(env));
  }
};

async function runNotifyTick(env) {
  try {
    const res = await fetch(
      "https://yhwzlqgwamzvktzdkpbs.supabase.co/functions/v1/alliance",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": env.CRON_SECRET
        },
        body: JSON.stringify({ action: "notify_tick" })
      }
    );

    if (!res.ok) {
      console.error(`notify_tick failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("notify_tick fetch error:", err);
  }
}