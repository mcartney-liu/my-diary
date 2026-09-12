import type { WeatherInfo } from "./types";
import { weatherIcon } from "./data";

/** Open-Meteo 免费天气 API（无需 key） */
export async function fetchWeather(lat?: number, lon?: number): Promise<WeatherInfo | null> {
  try {
    const latitude = lat ?? 39.9042;
    const longitude = lon ?? 116.4074;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&language=zh`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    const cur = json.current;
    if (!cur) return null;

    const desc = openMeteoDesc(cur.weather_code);
    return {
      temp: Math.round(cur.temperature_2m),
      description: desc,
      icon: weatherIcon(desc),
    };
  } catch {
    return null;
  }
}

function openMeteoDesc(code: number): string {
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if (code === 45 || code === 48) return "雾";
  if ([51, 53, 55].includes(code)) return "小雨";
  if ([56, 57].includes(code)) return "冻雨";
  if ([61, 63, 65].includes(code)) return ["小雨", "中雨", "大雨"][[61, 63, 65].indexOf(code)];
  if ([66, 67].includes(code)) return "冻雨";
  if ([71, 73, 75].includes(code)) return ["小雪", "中雪", "大雪"][[71, 73, 75].indexOf(code)];
  if (code === 77) return "雪粒";
  if ([80, 81, 82].includes(code)) return "阵雨";
  if ([85, 86].includes(code)) return "阵雪";
  if (code === 95) return "雷阵雨";
  if ([96, 99].includes(code)) return "雷暴雨";
  return "晴";
}

/** Nominatim 反向地理编码：坐标 → "北京市 · 中国" */
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh&zoom=14`,
      { headers: { "Accept": "application/json" } }
    );
    if (!r.ok) return "";
    const json = await r.json();
    const addr = json.address ?? {};

    // 规则：优先 state_district > state > city（处理北京直辖市坑）
    const topRegion =
      (addr.state_district && addr.city !== addr.state_district) ? addr.state_district
      : addr.state ?? addr.province ?? addr.region
      ?? addr.city ?? addr.town ?? addr.village
      ?? "";
    const country = addr.country ?? "";

    const parts = [topRegion, country].filter((x) => x && x.trim());
    let name = parts.join(" · ");

    // fallback: display_name 截断
    if (!name && json.display_name) {
      name = json.display_name.split(",").slice(0, 2).join("").trim();
    }
    return name;
  } catch {
    return "";
  }
}

/** 默认坐标 — 当浏览器 geolocation 不可用时用这个反查地名 */
const DEFAULT_COORDS = { lat: 39.9042, lon: 116.4074, name: "北京市 · 中国" };

/** 获取位置：优先浏览器 GPS，失败 fallback 默认坐标但**一定反查地名** */
export async function fetchLocation(): Promise<{ lat: number; lon: number; name: string } | null> {
  let lat: number | undefined;
  let lon: number | undefined;
  let gpsOk = false;

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
    });
    lat = pos.coords.latitude;
    lon = pos.coords.longitude;
    gpsOk = true;
  } catch (e) {
    // GPS 不可用 — 平板没开、HTTP 环境被 Chrome 限制、或用户拒绝
    console.info("[mydiary] geolocation 不可用，用默认坐标反查:", (e as any)?.message ?? e);
  }

  // 不管坐标哪来的，都 reverse geocoding
  const useLat = lat ?? DEFAULT_COORDS.lat;
  const useLon = lon ?? DEFAULT_COORDS.lon;
  const name = await reverseGeocode(useLat, useLon);

  if (!name) return null; // 反查也失败了

  return {
    lat: useLat,
    lon: useLon,
    name: gpsOk ? name : `${name}（默认）`,
  };
}
