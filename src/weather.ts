import type { WeatherInfo } from "./types";
import { weatherIcon } from "./data";

/** Open-Meteo 免费天气 API（无需 key） */
export async function fetchWeather(lat?: number, lon?: number): Promise<WeatherInfo | null> {
  try {
    // 没坐标就用默认（北京）
    const latitude = lat ?? 39.9042;
    const longitude = lon ?? 116.4074;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&language=zh`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    const cur = json.current;
    if (!cur) return null;

    // weather code → 中文描述
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
  // WMO weather interpretation codes
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

/** 获取浏览器定位 → 反向地理编码成人类可读地名 */
export async function fetchLocation(): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
    });
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    // Nominatim (OpenStreetMap) 免费反向地理编码
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh&zoom=14`,
      { headers: { "Accept": "application/json" } }
    );
    const json = await r.json();
    const addr = json.address ?? {};

    // 拼一个简洁好看的名字：优先 city/state/country，fallback 到 display_name
    const parts = [
      addr.city ?? addr.town ?? addr.county ?? addr.state_district ?? "",
      addr.state ?? addr.province ?? addr.region ?? "",
      addr.country ?? "",
    ].filter((x) => x && x.trim());

    let name = parts.join(" · ");
    if (!name && json.display_name) {
      // display_name 太长，取前两个逗号
      name = json.display_name.split(",").slice(0, 2).join("").trim();
    }
    if (!name) name = "当前位置";

    return { lat, lon, name };
  } catch {
    return null;
  }
}
