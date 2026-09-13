// 预设信纸
// 分两类：
//  - 极简款：内联 SVG（零资源、瞬时加载），full 可以是 "" 让 CSS 接管
//  - 图片款：full = /papers/xxx.jpg（public 目录的真实图片），thumbnail = 色块 SVG（轻量）

function svgToDataURL(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeSolidThumb(bg: string): string {
  return svgToDataURL(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
      <rect width="120" height="160" fill="${bg}"/>
    </svg>`
  );
}

// 图片预设的缩略图 — 主色 + 底部小装饰条（代替真实图，节省下载）
function makeImageThumb(mainBg: string, accent: string): string {
  return svgToDataURL(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
      <rect width="120" height="160" fill="${mainBg}"/>
      <!-- 底部装饰区（暗示"底部有插画"）-->
      <path d="M0,120 Q30,110 60,118 T120,115 L120,160 L0,160 Z" fill="${accent}" opacity="0.35"/>
      <path d="M0,130 Q30,122 60,128 T120,125 L120,160 L0,160 Z" fill="${accent}" opacity="0.5"/>
    </svg>`
  );
}

function makeGridFull(bg: string, gridColor: string, size = 24): string {
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

function makeDotFull(bg: string, dotColor: string, size = 24): string {
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

export interface PresetPaper {
  id: string;
  name: string;
  thumbnail: string;    // Drawer 里显示的小缩略图（dataURL，几 KB）
  full: string;         // 整页壁纸 URL — 空字符串 = 用 CSS 默认米白
  isPattern?: boolean;   // 纹理/方格纸 → 选中时自动关横线
}

export const PRESET_PAPERS: PresetPaper[] = [
  // ——— 极简款（CSS / 内联 SVG，零资源） ———
  {
    id: "default",
    name: "默认米白",
    thumbnail: makeSolidThumb("#faf6ef"),
    full: "",
  },
  {
    id: "pure-white",
    name: "素纸白",
    thumbnail: makeSolidThumb("#ffffff"),
    full: makeSolidThumb("#ffffff"),
  },
  {
    id: "grid",
    name: "方格纸",
    thumbnail: makeGridFull("#faf6ef", "rgba(180,170,150,0.55)"),
    full: makeGridFull("#faf6ef", "rgba(180,170,150,0.55)"),
    isPattern: true,
  },
  {
    id: "dot-grid",
    name: "点状纸",
    thumbnail: makeDotFull("#faf6ef", "rgba(180,170,150,0.6)"),
    full: makeDotFull("#faf6ef", "rgba(180,170,150,0.6)"),
    isPattern: true,
  },

  // ——— 图片款（public/papers/*.jpg） ———
  {
    id: "mist-mountain",
    name: "水墨远山",
    thumbnail: makeImageThumb("#fdfdfc", "#8ea7b8"),
    full: "/papers/mist-mountain.jpg",
  },
  {
    id: "sage-journal",
    name: "薄荷日记",
    thumbnail: makeImageThumb("#f7f3ea", "#a8c4a0"),
    full: "/papers/sage-journal.jpg",
  },
  {
    id: "vintage-rose",
    name: "玫瑰水彩",
    thumbnail: makeImageThumb("#f5ece0", "#d89090"),
    full: "/papers/vintage-rose.jpg",
  },
  {
    id: "sunrise-dream",
    name: "日出云朵",
    thumbnail: makeImageThumb("#f0e2c4", "#f0b080"),
    full: "/papers/sunrise-dream.jpg",
  },
];

export function matchPreset(wallpaper?: string): PresetPaper | null {
  if (!wallpaper) return PRESET_PAPERS[0];
  return PRESET_PAPERS.find((p) => p.full && p.full === wallpaper) ?? null;
}
