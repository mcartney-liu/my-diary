// 预设信纸 — 全部用内联 SVG（无外部图片依赖）
// 设计原则：SVG 只画"纸张底 + 装饰纹理"，横线由 CSS .paper-editor 统一控制
// 这样切换预设时横线不变，保持一致性

// 把 SVG 字符串转成 dataURL
function svgToDataURL(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 纯色底（无装饰纹理）— 对应 CSS 默认的 repeating-linear-gradient 横线
function makeSolidSVG(bg: string): string {
  return svgToDataURL(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <rect width="400" height="600" fill="${bg}"/>
    </svg>`
  );
}

// 方格纹 — 小方格线（用于 bullet journal 风）
function makeGridSVG(bg: string, gridColor: string, size = 24): string {
  const lines: string[] = [];
  for (let x = 0; x <= 400; x += size) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="600" stroke="${gridColor}" stroke-width="0.5"/>`);
  for (let y = 0; y <= 600; y += size) lines.push(`<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="${gridColor}" stroke-width="0.5"/>`);
  return svgToDataURL(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <rect width="400" height="600" fill="${bg}"/>
      ${lines.join("")}
    </svg>`
  );
}

// 点状纹 — 每格交叉点一个小点
function makeDotGridSVG(bg: string, dotColor: string, size = 24): string {
  const dots: string[] = [];
  for (let x = 0; x <= 400; x += size) {
    for (let y = 0; y <= 600; y += size) {
      dots.push(`<circle cx="${x}" cy="${y}" r="0.8" fill="${dotColor}"/>`);
    }
  }
  return svgToDataURL(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <rect width="400" height="600" fill="${bg}"/>
      ${dots.join("")}
    </svg>`
  );
}

// 复古纸 — 米黄 + 暗角渐变
function makeVintageSVG(): string {
  return svgToDataURL(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <defs>
        <radialGradient id="v" cx="50%" cy="50%" r="75%">
          <stop offset="50%" stop-color="#f2e7cf"/>
          <stop offset="100%" stop-color="#d8c8a0"/>
        </radialGradient>
      </defs>
      <rect width="400" height="600" fill="url(#v)"/>
    </svg>`
  );
}

export interface PresetPaper {
  id: string;
  name: string;        // 显示名
  thumbnail: string;  // 缩略图 dataURL（跟 wallpaper 同格式）
  full: string;        // 整页 dataURL（设给 Diary.wallpaper）
  isPattern?: boolean; // true = 这是纹理/方格纸，横线关掉也能用
}

// 8 种预设
export const PRESET_PAPERS: PresetPaper[] = [
  {
    id: "default",
    name: "默认米白",
    // default 用 undefined 即可 — CSS 自己画米白 + 横线
    thumbnail: makeSolidSVG("#faf6ef"),
    full: "", // 特殊：空字符串表示"用 CSS 默认"
  },
  {
    id: "warm-beige",
    name: "暖米色",
    thumbnail: makeSolidSVG("#f5ede0"),
    full: makeSolidSVG("#f5ede0"),
  },
  {
    id: "pure-white",
    name: "素纸白",
    thumbnail: makeSolidSVG("#ffffff"),
    full: makeSolidSVG("#ffffff"),
  },
  {
    id: "grid",
    name: "方格纸",
    thumbnail: makeGridSVG("#faf6ef", "rgba(180,170,150,0.55)"),
    full: makeGridSVG("#faf6ef", "rgba(180,170,150,0.55)"),
    isPattern: true,
  },
  {
    id: "dot-grid",
    name: "点状纸",
    thumbnail: makeDotGridSVG("#faf6ef", "rgba(180,170,150,0.6)"),
    full: makeDotGridSVG("#faf6ef", "rgba(180,170,150,0.6)"),
    isPattern: true,
  },
  {
    id: "vintage",
    name: "复古纸",
    thumbnail: makeVintageSVG(),
    full: makeVintageSVG(),
  },
  {
    id: "forest",
    name: "森林绿",
    thumbnail: makeSolidSVG("#e8f0e4"),
    full: makeSolidSVG("#e8f0e4"),
  },
  {
    id: "sakura",
    name: "樱花粉",
    thumbnail: makeSolidSVG("#fae8ec"),
    full: makeSolidSVG("#fae8ec"),
  },
];

// 判断当前 wallpaper 是否匹配某个预设（或就是默认）
export function matchPreset(wallpaper?: string): PresetPaper | null {
  if (!wallpaper) return PRESET_PAPERS[0];
  return PRESET_PAPERS.find((p) => p.full && p.full === wallpaper) ?? null;
}
