// 测 overpass.kumi.systems 接受什么 UA
const https = require("https");
const query = `[out:json][timeout:25];node["amenity"="cafe"](around:500,38.858,115.491);out body 5;`;

function test(hostname, headers) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname, path: "/api/interpreter", method: "POST", headers },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, ok: res.statusCode === 200, body: d.slice(0, 150) }));
      }
    );
    req.on("error", (e) => resolve({ status: "ERR", ok: false, body: e.message }));
    req.write(query);
    req.end();
  });
}

(async () => {
  const tests = [
    ["无 UA（浏览器 fetch 默认情况）", { "Content-Type": "text/plain" }],
    ["Chrome 默认 UA", { "Content-Type": "text/plain", "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }],
    ["简单 MyDiary UA", { "Content-Type": "text/plain", "User-Agent": "MyDiary/1.0" }],
  ];

  for (const [label, headers] of tests) {
    console.log(`\n=== ${label} ===`);
    console.log(`Headers:`, JSON.stringify(headers));
    const r = await test("overpass.kumi.systems", headers);
    console.log(`Status: ${r.status}, OK: ${r.ok}`);
    if (!r.ok) console.log(`Body: ${r.body}`);
  }
})();
