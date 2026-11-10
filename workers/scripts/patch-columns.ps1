# Patch missing columns from migration 0026 onto existing D1 databases
# Reads PRAGMA table_info first, only generates ALTER TABLE for missing columns
# Dry-run by default (prints only); pass -Execute to run
# Usage:
#   .\patch-columns.ps1                     # dry-run, no data touched
#   .\patch-columns.ps1 -Execute            # actually run (prod)
#   .\patch-columns.ps1 -Execute -Env dev   # dev environment
param(
  [switch]$Execute,
  [string]$Env = ""   # "" = prod (top-level env), "dev" = dev env
)

$ErrorActionPreference = "Stop"

$db = "mydiary-db"
if ($Env -eq "dev") { $db = "mydiary-db-dev" }

$plan = @{
  users                = @{ identity="TEXT"; interests="TEXT"; onboarding_done="INTEGER DEFAULT 0" }
  wiki_knowledge_bases = @{ slug="TEXT"; description="TEXT DEFAULT ''"; is_official="INTEGER DEFAULT 0" }
  templates            = @{ keywords="TEXT"; is_public="INTEGER DEFAULT 0"; author_name="TEXT" }
  wiki_links           = @{ from_page_id="TEXT"; to_page_id="TEXT" }
}

$envFlag = ""
if ($Env -eq "dev") { $envFlag = " --env dev" }

Write-Host "==> Target DB: $db  Env: $(if($Env -eq ''){'prod'}else{$Env})  Execute: $($Execute.IsPresent)" -ForegroundColor Cyan
Write-Host ""

foreach ($t in $plan.Keys) {
  $raw = & npx.cmd wrangler d1 execute $db --remote --json --command "PRAGMA table_info($t)" 2>$null
  $cols = ($raw | ConvertFrom-Json)[0].results | ForEach-Object { $_.name }
  Write-Host "Table [$t] columns: $($cols -join ', ')"
  foreach ($c in $plan[$t].Keys) {
    if ($cols -notcontains $c) {
      $sql = "ALTER TABLE $t ADD COLUMN $c $($plan[$t][$c]);"
      if ($Execute) {
        Write-Host "  [EXECUTE] $sql" -ForegroundColor Yellow
        & npx.cmd wrangler d1 execute $db --remote --command $sql $envFlag 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "  OK" -ForegroundColor Green }
        else { Write-Host "  FAIL exit=$LASTEXITCODE" -ForegroundColor Red }
      } else {
        Write-Host "  [WOULD EXEC] $sql" -ForegroundColor DarkYellow
      }
    } else {
      Write-Host "  [SKIP exists] $t.$c" -ForegroundColor DarkGray
    }
  }
  Write-Host ""
}

if (-not $Execute) {
  Write-Host "==> dry-run done, no data modified. Re-run with -Execute to apply." -ForegroundColor Cyan
}
