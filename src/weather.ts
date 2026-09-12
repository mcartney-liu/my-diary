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

/** 默认 fallback — 用硬编码坐标名，确保永远有值 */
const FALLBACK_NAME = "北京市 · 中国";

/** Nominatim 反向地理编码，带详细日志 */
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh&zoom=14`;
    console.info("[mydiary] reverseGeocode 请求:", url);
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    console.info("[mydiary] reverseGeocode 响应状态:", r.status);
    if (!r.ok) {
      console.warn("[mydiary] Nominatim HTTP error:", r.status);
      return "";
    }
    const json = await r.json();
    const addr = json.address ?? {};
    console.info("[mydiary] Nominatim address:", addr);
    console.info("[mydiary] Nominatim display_name:", json.display_name);

    // 1) 优先从结构化 address 取
    const topRegion =
      addr.state_district
      ?? addr.state ?? addr.province ?? addr.region
      ?? addr.city ?? addr.town ?? addr.village
      ?? "";
    const country = addr.country ?? "";
    const structured = [topRegion, country].filter((x) => x && x.trim()).join(" · ");

    if (structured && structured.length >= 4) {
      console.info("[mydiary] reverseGeocode 命中 structured:", structured);
      return structured;
    }

    // 2) fallback: display_name 跳过纯数字邮编，取最后 2 段
    if (json.display_name) {
      const parts = json.display_name
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !/^\d{4,}$/.test(s));
      const tail = parts.slice(-2).join(" · ");
      console.info("[mydiary] reverseGeocode 命中 display_name tail:", tail);
      if (tail.length >= 3) return tail;
    }

    return "";
  } catch (err) {
    console.warn("[mydiary] reverseGeocode 网络异常:", err);
    return "";
  }
}

/** 获取位置：永远返回带 name 的对象，绝不让调用方拿到 null */
export async function fetchLocation(): Promise<{ lat: number; lon: number; name: string }> {
  let lat = 39.9042;
  let lon = 116.4074;
  let gpsOk = false;

  // 1) 先试浏览器 GPS
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
    });
    lat = pos.coords.latitude;
    lon = pos.coords.longitude;
    gpsOk = true;
    console.info("[mydiary] GPS 成功:", lat.toFixed(4), lon.toFixed(4));
  } catch (e) {
    console.info("[mydiary] GPS 不可用（使用默认坐标）:", (e as any)?.message ?? "err=" + e);
  }

  // 2) reverse geocoding（无论 GPS 是否成功）
  let name = await reverseGeocode(lat, lon);
  if (!name) {
    console.warn("[mydiary] reverseGeocode 也失败，用硬编码 fallback:", FALLBACK_NAME);
    name = FALLBACK_NAME;
  }

  const result = {
    lat,
    lon,
    name: gpsOk ? name : `${name}（默认）`,
  };
  console.info("[mydiary] fetchLocation 最终结果:", result);
  return result;
}
