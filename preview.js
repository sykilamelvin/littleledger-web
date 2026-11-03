/* A plain file server, only so the phone build can be tried on this laptop
   before it is published. GitHub Pages does the same job once it is live.
   Opening index.html straight off the disk will not do: the lock needs a
   real http:// origin before the browser will let it store anything.

   Run it:   node preview.js      then open http://localhost:8788
*/
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8788;
const ROOT = __dirname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }
  if (rel === "/") rel = "/index.html";

  /* Never serve anything outside this folder, whatever the path claims. */
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("no");
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found: " + rel);
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      /* no caching, so a reload always shows the newest edit */
      "Cache-Control": "no-store",
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log("Phone build preview  ->  http://localhost:8788");
  console.log("This is the version that will go to your phone.");
  console.log("Press Ctrl+C to stop.");
});
