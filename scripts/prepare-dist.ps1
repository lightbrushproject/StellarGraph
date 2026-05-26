$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $repo "manifest.json") -Raw | ConvertFrom-Json
$dist = Join-Path $repo "dist\stellar-graph"
$zip = Join-Path $repo ("dist\stellar-graph-{0}.zip" -f $manifest.version)

Remove-Item -LiteralPath $dist -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $dist | Out-Null
Copy-Item -LiteralPath (Join-Path $repo "main.js") -Destination (Join-Path $dist "main.js") -Force
Copy-Item -LiteralPath (Join-Path $repo "manifest.json") -Destination (Join-Path $dist "manifest.json") -Force
Copy-Item -LiteralPath (Join-Path $repo "styles.css") -Destination (Join-Path $dist "styles.css") -Force
Compress-Archive -LiteralPath (Join-Path $dist "main.js"), (Join-Path $dist "manifest.json"), (Join-Path $dist "styles.css") -DestinationPath $zip -Force

Write-Host "Prepared release assets in $dist"
Write-Host "Prepared release zip at $zip"
