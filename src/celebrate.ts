// 保存日记后：几粒麦穗轻轻飘下（1.4 秒后自动清理）
export function wheatShower(count = 10) {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const icons = ["🌾", "✨", "🌾", "🍂"];
    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = "wheat-fall";
      el.textContent = icons[i % icons.length];
      el.style.left = `${8 + Math.random() * 84}vw`;
      el.style.animationDelay = `${Math.random() * 0.35}s`;
      el.style.setProperty("--r", `${(Math.random() * 2 - 1) * 240}deg`);
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    }
  } catch { /* 动效失败不影响任何功能 */ }
}
