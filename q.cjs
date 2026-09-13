// 验证修复：加回 around:
const https = require("https");
const lat = 38.858, lon = 115.491;

const q = `[out:json][timeout:30];
(
node["tourism"~"attraction|museum|park"](around:1500,${lat},${lon});
node["amenity"~"restaurant|fast_food|cafe"](around:800,${lat},${lon});
node["tourism"~"hotel|hostel"](around:2000,${lat},${lon});
);
out body 40;`;

const url = `/api/interpreter?data=${encodeURIComponent(q)}`;
console.log("Query:", q.length, "chars");

(async () => {
  for (const host of ["overpass.kumi.systems", "overpass-api.de"]) {
    await new Promise(r => setTimeout(r, 1300));
    const r = await new Promise((resolve) => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0";
      const req = https.request({ hostname: host, path: url, method: "GET", headers: { "User-Agent": ua } }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => resolve({ status: res.statusCode, ct: res.headers["content-type"], body: d }));
      });
      req.on("error", e => resolve({ status: "ERR", body: e.message }));
      req.end();
    });
    console.log(`\n${host}: ${r.status}`);
    if (r.status === 200 && r.body.startsWith("{")) {
      try {
        const j = JSON.parse(r.body);
        const names = j.elements.filter(e => e.tags?.name).map(e => e.tags.name);
        console.log(`  ✅ ${j.elements.length} elements | ${names.slice(0, 8).join(", ")}`);
      } catch { console.log("  parse fail:", r.body.slice(0, 200)); }
    } else {
      console.log("  Body:", r.body.slice(0, 300));
    }
  }
})();
