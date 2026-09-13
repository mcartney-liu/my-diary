// 测保定 POI（VPN 关了后的真实数据）
const https = require("https");

const lat = 38.858;
const lon = 115.491;

const queries = [
  { name: "500m cafe", tags: `node["amenity"="cafe"]`, radius: 500 },
  { name: "1km cafe", tags: `node["amenity"="cafe"]`, radius: 1000 },
  { name: "1.5km restaurant", tags: `node["amenity"="restaurant"]`, radius: 1500 },
  { name: "2km hotel", tags: `node["tourism"="hotel"]`, radius: 2000 },
  { name: "2km park", tags: `node["tourism"="park"]`, radius: 2000 },
  { name: "2km attraction", tags: `node["tourism"="attraction"]`, radius: 2000 },
];

function test(tags, radius) {
  const q = `[out:json][timeout:25];${tags}(around:${radius},${lat},${lon});out body 15;`;
  return new Promise((resolve) => {
    setTimeout(() => {
      const req = https.request(
        {
          hostname: "overpass-api.de",
          path: `/api/interpreter?data=${encodeURIComponent(q)}`,
          method: "GET",
        },
        (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => {
            try {
              const j = JSON.parse(d);
              const names = j.elements
                .filter((e) => e.tags?.name)
                .map((e) => e.tags.name);
              resolve({
                count: j.elements.length,
                named: names.length,
                names: names.slice(0, 5),
              });
            } catch (e) {
              resolve({ count: -1, named: 0, names: [d.slice(0, 100)] });
            }
          });
        }
      );
      req.on("error", (e) => resolve({ count: -2, named: 0, names: [e.message] }));
      req.end();
    }, 1200);
  });
}

(async () => {
  console.log(`保定坐标: (${lat}, ${lon})\n`);
  for (const t of queries) {
    const r = await test(t.tags, t.radius);
    console.log(
      `${t.name.padEnd(20)} ${r.count >= 0 ? r.count + " 个元素" : "ERR"}${
        r.named ? " | 有名字: " + r.names.join(", ") : ""
      }`
    );
  }
})();
