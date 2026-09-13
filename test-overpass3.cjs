// 试 GET 请求 overpass-api.de
const https = require("https");

const query = `[out:json][timeout:25];node["amenity"="cafe"](around:500,38.858,115.491);out body 5;`;

// URL-encode query 作为 GET 参数
const encodedQuery = encodeURIComponent(query);

function testGet() {
  return new Promise((resolve) => {
    const url = `/api/interpreter?data=${encodedQuery}`;
    console.log("GET URL:", url.slice(0, 120) + "...");
    const req = https.request(
      {
        hostname: "overpass-api.de",
        path: url,
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          resolve({ status: res.statusCode, ok: res.statusCode === 200, body: d.slice(0, 300) });
        });
      }
    );
    req.on("error", (e) => resolve({ status: "ERR", ok: false, body: e.message }));
    req.end();
  });
}

// 试 overpass.kumi.systems 加 UA
function testKumi() {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "overpass.kumi.systems",
        path: "/api/interpreter",
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "MyDiary-WebApp/1.0 (iOS Safari)",
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          resolve({ status: res.statusCode, ok: res.statusCode === 200, body: d.slice(0, 300) });
        });
      }
    );
    req.on("error", (e) => resolve({ status: "ERR", ok: false, body: e.message }));
    req.write(query);
    req.end();
  });
}

(async () => {
  console.log("\n=== overpass-api.de GET ===");
  const r1 = await testGet();
  console.log(`Status: ${r1.status}, OK: ${r1.ok}`);
  console.log(`Body: ${r1.body}`);

  console.log("\n=== overpass.kumi.systems POST + UA ===");
  const r2 = await testKumi();
  console.log(`Status: ${r2.status}, OK: ${r2.ok}`);
  console.log(`Body: ${r2.body}`);
})();
