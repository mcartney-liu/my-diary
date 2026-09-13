// 测 Overpass 400 的根因
const https = require("https");

const queries = [
  {
    name: "简单 cafe 查询（跟之前成功的一样）",
    q: `[out:json][timeout:25];node["amenity"="cafe"](around:500,38.858,115.491);out body 5;`,
  },
  {
    name: "buildQuery 实际生成的（模拟代码逻辑）",
    q: `[out:json][timeout:25];
(
node["tourism"="attraction"](around:1200,38.858,115.491);
node["tourism"="museum"](around:1200,38.858,115.491);
node["tourism"="park"](around:1200,38.858,115.491);
node["tourism"="zoo"](around:1200,38.858,115.491);
node["tourism"="gallery"](around:1200,38.858,115.491);
node["amenity"="restaurant"](around:500,38.858,115.491);
node["amenity"="fast_food"](around:500,38.858,115.491);
node["amenity"="food_court"](around:500,38.858,115.491);
node["amenity"="bar"](around:500,38.858,115.491);
node["amenity"="pub"](around:500,38.858,115.491);
node["amenity"="cafe"](around:500,38.858,115.491);
node["amenity"="bakery"](around:500,38.858,115.491);
node["amenity"="ice_cream"](around:500,38.858,115.491);
node["tourism"="hotel"](around:1500,38.858,115.491);
node["tourism"="hostel"](around:1500,38.858,115.491);
node["tourism"="guesthouse"](around:1500,38.858,115.491);
node["tourism"="apartment"](around:1500,38.858,115.491);
);
out body 30;`,
  },
];

function test(q, name) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "overpass-api.de",
        path: "/api/interpreter",
        method: "POST",
        headers: { "Content-Type": "text/plain" },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          resolve({ name, status: res.statusCode, body: d.slice(0, 300) });
        });
      }
    );
    req.on("error", (e) => resolve({ name, status: "ERR", body: e.message }));
    req.write(q);
    req.end();
  });
}

(async () => {
  for (const { name, q } of queries) {
    console.log(`\n=== ${name} ===`);
    const r = await test(q, name);
    console.log(`Status: ${r.status}`);
    console.log(`Body: ${r.body}`);
  }
})();
