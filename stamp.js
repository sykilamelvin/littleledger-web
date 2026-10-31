/* Put a version on every local script and stylesheet, so a phone that already
   has the old files fetches the new ones instead of waiting out its cache.
   GitHub Pages serves these with max-age=600, which is ten minutes of people
   seeing yesterday's app.

   Run it before committing:   node stamp.js
*/
const fs = require("fs");
const v = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12); // YYYYMMDDHHMM
let h = fs.readFileSync("index.html", "utf8");

h = h.replace(/(src|href)="((?:[a-z0-9-]+)\.(?:js|css))(\?v=\d+)?"/g,
  (m, attr, file) => `${attr}="${file}?v=${v}"`);

fs.writeFileSync("index.html", h);
const n = (h.match(/\?v=/g) || []).length;
console.log(`stamped ${n} files with v=${v}`);
