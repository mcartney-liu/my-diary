// 测用户真实坐标 (39.453, 116.038) — 北京房山/河北涿州附近
const https = require("https");

// 模拟 poi.ts 当前 buildQuery 逻辑生成的完整 query
function buildQuery(lat, lon) {
  const CATEGORY_CONFIG = {
    attraction: {
      label: "景点",
      radius: 1200,
      overpass: `
        node["tourism"="attraction"];
        node["tourism"="museum"];
        node["tourism"="park"];
        node["tourism"="zoo"];
        node["tourism"="gallery"];
      `,
    },
    food: {
      label: "美食",
      radius: 500,
      overpass: `
        node["amenity"="restaurant"];
        node["amenity"="fast_food"];
        node["amenity"="food_court"];
        node["amenity"="bar"];
        node["amenity"="pub"];
      `,
    },
    cafe: {
      label: "咖啡",
      radius: 500,
      overpass: `
        node["amenity"="cafe"];
        node["amenity"="bakery"];
        node["amenity"="ice_cream"];
      `,
    },
    hotel: {
      label: "酒店",
      radius: 1500,
      overpass: `
        node["tourism"="hotel"];
        node["tourism"="hostel"];
        node["tourism"="guesthouse"];
        node["tourism"="apartment"];
      `,
    },
  };

  const parts = [];
  for (const cfg of Object.values(CATEGORY_CONFIG)) {
    const nodes = cfg.overpass
      .trim()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const n of nodes) {
      parts.push(`${n}(${cfg.radius},${lat},${lon});`);
    }
  }
  return `[out:json][timeout:25];\n(\n${parts.join("\n")}\n);\nout body 30;\n`;
}

const lat = 39.453;
const lon = 116.038;
const query = buildQuery(lat, lon);

console.log("=== buildQuery 生成的 query ===");
console.log(query.slice(0, 500));
console.log("...");

function testGetOverpass(hostname, q) {
  return new Promise((resolve) => {
    const url = `${hostname}?data=${encodeURIComponent(q)}`;
    console.log(`\n=== GET ${hostname} ===`);
    console.log(`URL: ${url.slice(0, 120)}...`);
    const req = https.get(url, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        resolve({ hostname, status: res.statusCode, ok: res.statusCode === 200, body: d.slice(0, 300) });
      });
    });
    req.on("error", (e) => resolve({ hostname, status: "ERR", ok: false, body: e.message }));
  });
}

(async () => {
  for (const ep of [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ]) {
    const r = await testGetOverpass(ep, query);
    console.log(`Status: ${r.status}, OK: ${r.ok}`);
    if (!r.ok) console.log(`Body: ${r.body}`);
  }
})();
