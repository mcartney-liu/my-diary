# Capacitor App 构建变量（vite build --mode app 时注入）
#
# App 是纯 WebView，没有 Cloudflare Pages Functions 代理，
# 必须显式指定生产 API 地址。
#
# 用法：
#   npm run build:app    →  vite build --mode app
#   或者手动：npx vite build --mode app
#
# 这个文件在 Git 里，Web 副本和 App 副本 pull 下来自动就有。

VITE_API_BASE=https://app.callmydiary.online
