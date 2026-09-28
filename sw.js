/* Streams Drive files to a plain <video> element.
   A video tag cannot send an Authorization header, and Google ignores tokens
   passed in the URL, so this worker sits in between: it catches requests for
   media/<fileId>, adds the header and forwards the byte range Drive returns. */

let TOKEN = "";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("message", e => {
  const msg = e.data || {};
  if (msg.type === "token") {
    TOKEN = msg.token || "";
    e.source?.postMessage({ type: "token-ok", hasToken: !!TOKEN });
  }
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const match = url.pathname.match(/\/media\/([A-Za-z0-9_-]+)$/);
  if (!match) return;
  event.respondWith(stream(match[1], event.request));
});

async function stream(fileId, request) {
  if (!TOKEN) return new Response("Not signed in", { status: 401 });

  const headers = { Authorization: "Bearer " + TOKEN };
  const range = request.headers.get("Range");
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
      headers,
      // the player asks for ranges constantly while seeking, so never cache
      cache: "no-store"
    });
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
