// 说明类文字只在前几次显示（老用户每天看到同样的说明 = 噪音）
const PREFIX = "mydiary.hint.";
export function useHint(key: string, times = 3): boolean {
  try {
    const k = PREFIX + key;
    const n = Number(sessionStorage.getItem(k + ".s") ?? localStorage.getItem(k) ?? "0");
    // 同一次打开 App 内计数只加一次
    if (sessionStorage.getItem(k + ".s") === null) {
      localStorage.setItem(k, String(n + 1));
      sessionStorage.setItem(k + ".s", String(n));
    }
    return n < times;
  } catch {
    return true;
  }
}
