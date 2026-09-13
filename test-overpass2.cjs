// 测 Overpass 不同 endpoint + headers
const https = require("https");

const endpoints = [
  "overpass-api.de",
  "overpass.kumi.systems",
  "overpass.openstreetmap.ru",
];

const query = `[out:json][timeout:25];node["amenity"="cafe"](around:500,38.858,115.491);out body 5;`;

function test(hostname, extraHeaders = {}) {
  return new Promise((resolve) => {
    const headers = {
      "Content-Type": "text/plain",
      "Accept": "*/*",
      ...extraHeaders,
    };
    const req = https.request(
      { hostname, path: "/api/interpreter", method: "POST", headers },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          const ok = res.statusCode === 200;
          const preview = d.slice(0, 200);
          resolve({ hostname, status: res.statusCode, ok, preview });
        });
      }
    );
    req.on("error", (e) => resolve({ hostname, status: "ERR", ok: false, preview: e.message }));
    req.write(query);
    req.end();
  });
}

(async () => {
  for (const ep of endpoints) {
    console.log(`\n=== ${ep} ===`);
    const r = await test(ep);
    console.log(`Status: ${r.status}, OK: ${r.ok}`);
    console.log(`Body: ${r.preview}`);
  }

  // 试 overpass-api.de 加 User-Agent 和 Accept
  console.log("\n=== overpass-api.de + UA + Accept ===");
  const r2 = await test("overpass-api.de", {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) MyDiary/1.0",
    "Accept": "application/json, */*;q=0.8",
  });
  console.log(`Status: ${r2.status}, OK: ${r2.ok}`);
  console.log(`Body: ${r2.preview}`);
})();
