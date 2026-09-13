/**
 * POI 服务 — 基于 Overpass API（OpenStreetMap）
 * 免费、无 API Key、全球覆盖
 * 注意：公共实例限制 1 req/sec，加了简易防抖
 */

export type PoiCategory = "attraction" | "food" | "cafe" | "hotel";

export interface Poi {
  id: string;              // OSM node id
  name: string;
  category: PoiCategory;
  categoryLabel: string;  // 中文 "景点" / "美食" / "咖啡" / "酒店"
  lat: number;
  lon: number;
  // 可选
  address?: string;
  phone?: string;
  website?: string;
  tags?: string[];         // 补充标签，比如 ["四川菜", "火锅"]
}

const CATEGORY_CONFIG: Record<
  PoiCategory,
  { label: string; overpass: string; radius: number }
> = {
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

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** 最后一次请求时间 — 简易限流（Overpass 要求 1 req/sec） */
let lastRequestAt = 0;

async function throttledFetch(url: string, body: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "MyDiary-Travel/1.0",
    },
    body,
  });
}

/** 构造 Overpass QL — 查指定经纬度附近所有分类 */
function buildQuery(lat: number, lon: number): string {
  const parts: string[] = [];
  for (const cfg of Object.values(CATEGORY_CONFIG)) {
    const nodes = cfg.overpass.trim().split("\n").map((s) => s.trim()).filter(Boolean);
    for (const n of nodes) {
      parts.push(`${n}(${cfg.radius},${lat},${lon});`);
    }
  }
  return `[out:json][timeout:25];\n(\n${parts.join("\n")}\n);\nout body 30;\n`;
}

function classifyPoi(tags: Record<string, string>): PoiCategory | null {
  const t = tags.tourism;
  const a = tags.amenity;
  if (t === "attraction" || t === "museum" || t === "park" || t === "zoo" || t === "gallery")
    return "attraction";
  if (a === "restaurant" || a === "fast_food" || a === "food_court" || a === "bar" || a === "pub")
    return "food";
  if (a === "cafe" || a === "bakery" || a === "ice_cream") return "cafe";
  if (t === "hotel" || t === "hostel" || t === "guesthouse" || t === "apartment") return "hotel";
  return null;
}

/**
 * 查附近 POI
 * @param lat 纬度
 * @param lon 经度
 * @param categories 要查的分类，默认全查
 * @param signal 可选 AbortSignal
 */
export async function fetchNearbyPois(
  lat: number,
  lon: number,
  categories: PoiCategory[] = ["attraction", "food", "cafe", "hotel"],
  signal?: AbortSignal
): Promise<Poi[]> {
  const query = buildQuery(lat, lon);

  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await throttledFetch(endpoint, query);
      if (!res.ok) {
        lastErr = new Error(`Overpass ${res.status}`);
        continue;
      }
      const data = await res.json();
      const pois: Poi[] = [];
      for (const el of data.elements) {
        if (el.type !== "node") continue;
        const tags = el.tags || {};
        if (!tags.name) continue;
        const cat = classifyPoi(tags);
        if (!cat || !categories.includes(cat)) continue;
        pois.push({
          id: String(el.id),
          name: tags.name,
          category: cat,
          categoryLabel: CATEGORY_CONFIG[cat].label,
          lat: el.lat,
          lon: el.lon,
          address:
            [tags["addr:city"], tags["addr:street"], tags["addr:housenumber"]]
              .filter(Boolean)
              .join(" ") || undefined,
          phone: tags.phone,
          website: tags.website || tags["contact:website"],
          tags: [tags.cuisine, tags.amenity].filter(Boolean) as string[],
        });
      }
      // 去重（按 name + category）
      const seen = new Set<string>();
      const deduped = pois.filter((p) => {
        const k = `${p.name}|${p.category}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return deduped.sort((a, b) => a.category.localeCompare(b.category));
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw e;
    }
  }
  throw lastErr ?? new Error("Overpass API all endpoints failed");
}

export const POI_CATEGORY_CONFIG = CATEGORY_CONFIG;
