/* Completes the GitHub login handshake for the Course Shelf pages.
   GitHub refuses to swap a login code for a token in a browser, because that
   step needs the app secret. This service holds the secret and does nothing
   else: it takes a code, returns a token, and keeps no records. */

const http = require("http");

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const ALLOWED = (process.env.ALLOWED_ORIGINS || "https://yakubuyinusat.github.io").split(",").map(s => s.trim());

const cors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = req => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", chunk => {
    data += chunk;
    if (data.length > 10_000) { req.destroy(); reject(new Error("too large")); }
  });
  req.on("end", () => resolve(data));
  req.on("error", reject);
});

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/health") {
    return json(res, 200, { ok: true, configured: !!(CLIENT_ID && CLIENT_SECRET), clientId: CLIENT_ID });
  }

  if (url.pathname === "/exchange" && req.method === "POST") {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json(res, 500, { error: "This service has no GitHub app configured yet." });
    }
    const origin = req.headers.origin;
    if (origin && !ALLOWED.includes(origin)) return json(res, 403, { error: "Origin not allowed" });

    let code, redirect_uri;
    try {
      ({ code, redirect_uri } = JSON.parse(await readBody(req) || "{}"));
    } catch (e) {
      return json(res, 400, { error: "Bad request body" });
    }
    if (!code) return json(res, 400, { error: "Missing code" });

    try {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri })
      });
      const data = await r.json();
      if (data.error) return json(res, 400, { error: data.error_description || data.error });
      // only the token travels back; nothing is stored here
      return json(res, 200, { access_token: data.access_token, scope: data.scope, token_type: data.token_type });
    } catch (e) {
      return json(res, 502, { error: "GitHub did not answer: " + e.message });
    }
  }

  json(res, 404, { error: "Not found" });
});

server.listen(process.env.PORT || 3000, () => console.log("auth service listening"));
