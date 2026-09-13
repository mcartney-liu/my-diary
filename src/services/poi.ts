/**
 * POI 服务 — 基于 Overpass API（OpenStreetMap）
 * 免费、无 API Key、全球覆盖
 *
 * ⚠️ 2026-09-14 实测：
 *   - overpass-api.de → Apache 升级后彻底 406，不可用
 *   - overpass.kumi.systems → GET 浏览器自动带 UA 可通 ✅
 *   - 简化 query 缩短 URL，避免被网关 414/400
 */

export type PoiCategory = "attraction" | "food" | "cafe" | "hotel";

export interface Poi {
  id: string;
  name: string;
  category: PoiCategory;
  categoryLabel: string;
  lat: number;
  lon: number;
  address?: string;
  phone?: string;
  website?: string;
  tags?: string[];
}

/** 用 regex filter 合并同类标签，大幅缩短 URL */
const CATEGORY_CONFIG: Record<PoiCategory, { label: string; radius: number; filter: string }> = {
  attraction: {
    label: "景点",
    radius: 1500,
    filter: '["tourism"~"attraction|museum|park|zoo|gallery|monument|viewpoint"]',
  },
  food: {
    label: "美食",
    radius: 800,
    filter: '["amenity"~"restaurant|fast_food|food_court|bar|pub"]',
  },
  cafe: {
    label: "咖啡",
    radius: 800,
    filter: '["amenity"~"cafe|bakery|ice_cream"]',
  },
  hotel: {
    label: "酒店",
    radius: 2000,
    filter: '["tourism"~"hotel|hostel|guesthouse|apartment|resort"]',
  },
};

// 只用 kumi.systems（api.de 死了）
const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";

/** 简易限流：Overpass 公共实例要求 ~1 req/sec */
let lastRequestAt = 0;

function throttledWait() {
  const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
  lastRequestAt = Date.now();
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}

/** 生成精简 Overpass QL — 单次请求所有分类 */
function buildQuery(lat: number, lon: number): string {
  const parts: string[] = [];
  for (const cfg of Object.values(CATEGORY_CONFIG)) {
    parts.push(`node${cfg.filter}(around:${cfg.radius},${lat},${lon});`);
  }
  return `[out:json][timeout:30];(${parts.join("")});out body 40;`;
}

function classifyPoi(tags: Record<string, string>): PoiCategory | null {
  const t = tags.tourism || "";
  const a = tags.amenity || "";
  if (/^(attraction|museum|park|zoo|gallery|monument|viewpoint)$/.test(t)) return "attraction";
  if (/^(restaurant|fast_food|food_court|bar|pub)$/.test(a)) return "food";
  if (/^(cafe|bakery|ice_cream)$/.test(a)) return "cafe";
  if (/^(hotel|hostel|guesthouse|apartment|resort)$/.test(t)) return "hotel";
  return null;
}

export async function fetchNearbyPois(
  lat: number,
  lon: number,
  categories: PoiCategory[] = ["attraction", "food", "cafe", "hotel"],
  signal?: AbortSignal
): Promise<Poi[]> {
  const query = buildQuery(lat, lon);
  await throttledWait();

  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;
  console.info("[mydiary] 🗺️ POI query size:", query.length, "chars, URL:", url.length, "bytes");

  const res = await fetch(url, { method: "GET", signal });
  console.info("[mydiary] 📡 Overpass:", res.status, res.headers.get("content-type"));

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Overpass ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const pois: Poi[] = [];
  for (const el of data.elements || []) {
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
  // 去重 + 排序
  const seen = new Set<string>();
  return pois
    .filter((p) => {
      const k = `${p.name}|${p.category}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}

export const POI_CATEGORY_CONFIG = CATEGORY_CONFIG;
