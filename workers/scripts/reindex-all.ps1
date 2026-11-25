# 全量重建日记向量（PowerShell）
#
# 为什么要跑：旧版 extractDiaryText 只读到日记标题，正文从没进过检索（2026-11-25 修复）。
# 修复只对之后保存的日记生效，已有日记要重建一次向量。
#
# 用法（先部署后端，再在仓库根目录运行）：
#   $env:ADMIN_KEY = "<你的 ADMIN_KEY，Cloudflare Worker 后台 → Settings → Variables 里查看>"
#   .\workers\scripts\reindex-all.ps1 -Env dev      # 测试环境
#   .\workers\scripts\reindex-all.ps1 -Env prod     # 正式环境（dev 验证通过后再跑）
#
# ⚠️ 不要把 ADMIN_KEY 写进这个文件或提交到仓库。

param(
  [ValidateSet("dev", "prod")] [string]$Env = "dev",
  [int]$Limit = 40
)

if (-not $env:ADMIN_KEY) { Write-Error "请先设置环境变量 ADMIN_KEY"; exit 1 }

$base = if ($Env -eq "prod") { "https://mydiary-api.mcartneyliu.workers.dev" } else { "https://mydiary-api-dev.mcartneyliu.workers.dev" }
$cursor = ""
$total = 0; $done = 0; $skipped = 0; $failed = 0

while ($true) {
  $url = "$base/api/admin/reindex-all?limit=$Limit&cursor=$([uri]::EscapeDataString($cursor))"
  try {
    $r = Invoke-RestMethod -Method Post -Uri $url -Headers @{ "X-Admin-Key" = $env:ADMIN_KEY }
  } catch {
    Write-Warning "请求失败，3 秒后重试：$($_.Exception.Message)"
    Start-Sleep -Seconds 3
    continue
  }
  $total += $r.processed; $done += $r.done; $skipped += $r.skipped; $failed += $r.failed
  if ($r.orphans_removed) { Write-Host "清理残留向量：$($r.orphans_removed) 条" }
  Write-Host ("已处理 {0} 篇（成功 {1}，跳过 {2}，失败 {3}）" -f $total, $done, $skipped, $failed)
  if ($r.finished) { break }
  $cursor = $r.next_cursor
  Start-Sleep -Milliseconds 300
}

Write-Host "✅ 完成：共 $total 篇，成功 $done，跳过 $skipped（没有文字内容），失败 $failed"
