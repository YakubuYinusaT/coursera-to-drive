/* Streams Drive files to a plain <video> element.
   A video tag cannot send an Authorization header, and Google ignores tokens
   passed in the URL, so this worker sits in between: it catches requests for
   media/<fileId>, adds the header and forwards the byte range Drive returns.

   The browser stops and restarts this worker whenever it likes, which wipes
   anything held in memory, so it asks the page for a token instead of
   assuming it still has one. */

let TOKEN = "";
let waiting = null;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("message", e => {
  const msg = e.data || {};
  if (msg.type === "token") {
    TOKEN = msg.token || "";
    if (waiting) { waiting.resolve(TOKEN); waiting = null; }
  }
});

// ask every open page for a fresh token, and give them a moment to answer
async function askPagesForToken() {
  const pages = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  if (!pages.length) return "";
  const answer = new Promise(resolve => {
    waiting = { resolve };
    setTimeout(() => { if (waiting) { waiting.resolve(""); waiting = null; } }, 2500);
  });
  for (const p of pages) p.postMessage({ type: "need-token" });
  return answer;
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const match = url.pathname.match(/\/media\/([A-Za-z0-9_-]+)$/);
  if (!match) return;
  event.respondWith(stream(match[1], event.request));
});

async function stream(fileId, request) {
  let token = TOKEN || await askPagesForToken();
  if (!token) return new Response("No Google session", { status: 401 });

  const send = async t => {
    const headers = { Authorization: "Bearer " + t };
    const range = request.headers.get("Range");
    if (range) headers.Range = range;
    return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
      headers,
      cache: "no-store"   // the player asks for ranges constantly while seeking
    });
  };

  let upstream;
  try {
    upstream = await send(token);
    if (upstream.status === 401) {
      // the hour-long token expired; the page may already hold a newer one
      const fresh = await askPagesForToken();
      if (fresh && fresh !== token) upstream = await send(fresh);
    }
  } catch (e) {
    return new Response("Drive unreachable: " + e.message, { status: 502 });
  }

  // pass through what the player needs for seeking
  const out = new Headers();
  for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has("Accept-Ranges")) out.set("Accept-Ranges", "bytes");
  out.set("Cache-Control", "no-store");

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
