// 测 Overpass API 在保定的数据
const https = require("https");

const queries = [
  // 保定 (38.8739, 115.4646)
  { name: "保定", lat: 38.8739, lon: 115.4646 },
  // 北京王府井 (39.9147, 116.4104)
  { name: "北京王府井", lat: 39.9147, lon: 116.4104 },
];

function testQuery(lat, lon) {
  return new Promise((resolve) => {
    const q = `[out:json][timeout:25];(
      node["tourism"="attraction"](around:1500,${lat},${lon});
      node["tourism"="museum"](around:1500,${lat},${lon});
      node["amenity"="restaurant"](around:800,${lat},${lon});
      node["amenity"="cafe"](around:800,${lat},${lon});
      node["tourism"="hotel"](around:1500,${lat},${lon});
    );out body 20;`;

    const req = https.request(
      {
        hostname: "overpass-api.de",
        path: "/api/interpreter",
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "MyDiary/1.0 (test)",
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(d);
            const names = j.elements
              .filter((e) => e.tags?.name)
              .map((e) => `${e.tags.name}(${e.tags.amenity || e.tags.tourism || "?"})`);
            resolve({ ok: true, total: j.elements.length, names });
          } catch (e) {
            resolve({ ok: false, error: d.slice(0, 200) });
          }
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.write(q);
    req.end();
  });
}

(async () => {
  for (const q of queries) {
    console.log(`\n=== ${q.name} (${q.lat}, ${q.lon}) ===`);
    const r = await testQuery(q.lat, q.lon);
    if (r.ok) {
      console.log(`✅ 找到 ${r.total} 个 POI`);
      if (r.names.length) {
        console.log("   " + r.names.slice(0, 10).join(", "));
      } else {
        console.log("   ⚠️ 但没有带名字的（OSM 标注不全）");
      }
    } else {
      console.log(`❌ 失败: ${r.error}`);
    }
  }
})();
