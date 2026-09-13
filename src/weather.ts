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

/** 反向地理编码：用 BigDataCloud（Nominatim 国内不稳定）
 * 免费、无 key、CORS 友好、不需要 User-Agent、中文支持好
 * 返回："北京市 · 中华人民共和国" / "上海市 · 中华人民共和国"
 */
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
    console.info("[mydiary] reverseGeocode → BigDataCloud:", url);
    const r = await fetch(url);
    console.info("[mydiary] reverseGeocode status:", r.status);
    if (!r.ok) return "";
    const j = await r.json();

    // BigDataCloud 结构清晰：principalSubdivision="北京市", countryName="中华人民共和国"
    const region = j.principalSubdivision ?? j.city ?? j.locality ?? "";
    const country = j.countryName ?? "";
    console.info("[mydiary] reverseGeocode parsed:", { region, country });

    const parts = [region, country].filter((x) => x && x.trim());
    return parts.join(" · ");
  } catch (err) {
    console.warn("[mydiary] reverseGeocode 网络异常:", err);
    return "";
  }
}

/** 硬编码 fallback — 双保险 */
const FALLBACK_NAME = "北京市";

/** IP 定位 fallback（GPS 不可用时用）
 * 用 ipwho.is — 免费、无 key、CORS 友好
 */
async function fetchIpLocation(): Promise<{ lat: number; lon: number } | null> {
  try {
    const r = await fetch("https://ipwho.is/");
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.success) return null;
    console.info("[mydiary] IP 定位:", j.city, j.region, j.latitude, j.longitude);
    return { lat: Number(j.latitude), lon: Number(j.longitude) };
  } catch (e) {
    console.warn("[mydiary] IP 定位失败:", e);
    return null;
  }
}

/** 获取位置结果 */
export interface LocationResult {
  lat: number;
  lon: number;
  name: string;
  /** gps = 真实 GPS；ip = IP 定位；default = 硬编码北京 */
  source: "gps" | "ip" | "default";
  /** GPS 失败原因（仅 source=default 时有值） */
  gpsError?: "timeout" | "denied" | "unavailable" | "unknown";
}

/** 获取位置：永远返回 { lat, lon, name }，调用方不用判空 */
export async function fetchLocation(): Promise<LocationResult> {
  let lat = 39.9042;
  let lon = 116.4074;
  let source: LocationResult["source"] = "default";
  let gpsError: LocationResult["gpsError"] = undefined;

  // 1) 先试浏览器 GPS（最精确）
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 15000,
        enableHighAccuracy: true,
        maximumAge: 60000,
      });
    });
    lat = pos.coords.latitude;
    lon = pos.coords.longitude;
    source = "gps";
    console.info("[mydiary] GPS 成功:", lat.toFixed(4), lon.toFixed(4));
  } catch (e: any) {
    const code = e?.code;
    if (code === 1) gpsError = "denied";
    else if (code === 2) gpsError = "unavailable";
    else if (code === 3) gpsError = "timeout";
    else gpsError = "unknown";
    console.info("[mydiary] GPS 不可用:", gpsError, e?.message ?? "");

    // 2) GPS 失败 → 试 IP 定位
    const ipLoc = await fetchIpLocation();
    if (ipLoc) {
      lat = ipLoc.lat;
      lon = ipLoc.lon;
      source = "ip";
    }
  }

  // 3) reverse geocoding（无论哪种方式拿到的坐标都要转地名）
  let name = await reverseGeocode(lat, lon);
  if (!name) {
    console.warn("[mydiary] reverseGeocode 失败，用硬编码 fallback:", FALLBACK_NAME);
    name = FALLBACK_NAME;
    if (source === "default") {
      // 已经是 fallback 了
    }
  }

  const result: LocationResult = { lat, lon, name, source, gpsError };
  console.info("[mydiary] fetchLocation 最终:", result);
  return result;
}
