# Собирает renders (без _work) в один zip для отправки
$ErrorActionPreference = 'Stop'
trap {
  $m = 'ОШИБКА: ' + $_.Exception.Message + ' (строка ' + $_.InvocationInfo.ScriptLineNumber + ')'
  Write-Host $m -ForegroundColor Red
  try { Add-Content -Path (Join-Path (Split-Path -Parent $PSScriptRoot) 'log.txt') -Value $m -Encoding UTF8 } catch {}
  Write-Host 'Сфотографируйте это окно и пришлите вместе с файлом log.txt.' -ForegroundColor Yellow
  Read-Host 'Нажмите Enter, чтобы закрыть окно'; exit 3
}
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $Root 'renders'
if (-not (Test-Path $src)) { Write-Host 'Папки renders ещё нет — рендер не запускался.' -ForegroundColor Red; Read-Host 'Enter'; exit 3 }
$out = Join-Path $Root ('arden_renders_' + (Get-Date -Format 'yyyyMMdd_HHmm') + '.zip')
$tmp = Join-Path $env:TEMP ('arden_pack_' + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
Get-ChildItem $src -Force | Where-Object { $_.Name -ne '_work' } | ForEach-Object { Copy-Item $_.FullName -Destination $tmp -Recurse }
Copy-Item (Join-Path $Root 'log.txt') $tmp -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $out -CompressionLevel Optimal
Remove-Item $tmp -Recurse -Force
$mb = [math]::Round((Get-Item $out).Length / 1MB)
Write-Host ''
Write-Host "Готово: $out ($mb МБ)" -ForegroundColor Green
Write-Host 'Пришлите этот файл (Telegram, Яндекс Диск, Google Drive — как удобно).'
explorer.exe /select,"$out"
Read-Host 'Нажмите Enter, чтобы закрыть окно'
