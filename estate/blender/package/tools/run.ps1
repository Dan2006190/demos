# Арден v2 — рендер на ПК с видеокартой NVIDIA. Запускается из START.bat.
# Проверки → Blender 4.5 LTS (скачать, если нет) → ассеты Poly Haven → рендер по приоритетам.
# Безопасно перезапускать: готовые кадры не пересчитываются. Ход работы — renders\status.txt.
param([string]$Mode = 'night')
$ErrorActionPreference = 'Stop'
trap {
  $m = 'ОШИБКА: ' + $_.Exception.Message + ' (строка ' + $_.InvocationInfo.ScriptLineNumber + ')'
  Write-Host $m -ForegroundColor Red
  try { Add-Content -Path (Join-Path (Split-Path -Parent $PSScriptRoot) 'log.txt') -Value $m -Encoding UTF8 } catch {}
  Write-Host 'Сфотографируйте это окно и пришлите вместе с файлом log.txt.' -ForegroundColor Yellow
  Read-Host 'Нажмите Enter, чтобы закрыть окно'; exit 3
}
$ProgressPreference = 'SilentlyContinue'
# Windows PowerShell 5.1 по умолчанию может ходить по TLS 1.0 — blender.org его не принимает
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Root = Split-Path -Parent $PSScriptRoot
$Log = Join-Path $Root 'log.txt'
function Say($m, $c = 'Gray') { $l = (Get-Date -Format 'dd.MM HH:mm:ss') + '  ' + $m; Write-Host $l -ForegroundColor $c; Add-Content -Path $Log -Value $l -Encoding UTF8 }
function Fail($m) { Say $m 'Red'; Say 'Сфотографируйте это окно и пришлите. Окно можно закрыть.' 'Yellow'; Read-Host 'Нажмите Enter'; exit 3 }

try { Add-Content -Path $Log -Value '' -Encoding UTF8 } catch { Write-Host "Нет прав на запись в папку $Root. Перенесите папку arden на диск D:\ и запустите START.bat оттуда." -ForegroundColor Red; Read-Host 'Нажмите Enter'; exit 3 }
Say '=== Арден v2: подготовка ===' 'Cyan'
# не даём компьютеру уснуть, пока работает рендер (без прав администратора)
$awake = $true
try {
  Add-Type -Namespace W -Name P -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
  [W.P]::SetThreadExecutionState([uint32]2147483651) | Out-Null   # 0x80000003 = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED; hex-литерал в PowerShell 5.1 — отрицательный Int32
} catch { $awake = $false; Say 'Не удалось запретить сон компьютера — отключите сон в настройках питания.' 'Yellow' }

# 1. видеокарта и драйвер
$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if (-not $smi) { $p = 'C:\Windows\System32\nvidia-smi.exe'; if (Test-Path $p) { $smi = $p } }
if (-not $smi) { Fail 'Не найден драйвер NVIDIA (nvidia-smi). Установите свежий драйвер с nvidia.com и запустите снова.' }
$q = & $smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits | Select-Object -First 1
$name, $mem, $drv = $q.Split(',') | ForEach-Object { $_.Trim() }
Say "Видеокарта: $name, $mem МБ, драйвер $drv"
if ([int]$mem -lt 7500) { Fail "Мало видеопамяти ($mem МБ): нужна карта от 8 ГБ." }
if ([double]($drv.Split('.')[0]) -lt 550) { Fail "Драйвер $drv устарел: нужен 550 или новее (nvidia.com → Драйверы)." }
# оперативная память: сборка сцены занимает ~8 ГБ
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
Say "Оперативная память: $ramGB ГБ"
if ($ramGB -lt 15) { Fail "Мало оперативной памяти ($ramGB ГБ): нужно 16 ГБ или больше." }
# 2. место на диске
$drive = (Get-Item $Root).PSDrive
$freeGB = [math]::Round($drive.Free / 1GB)
Say "Свободно на диске ${drive}: $freeGB ГБ"
if ($freeGB -lt 25) { Fail "Мало места на диске ${drive}: нужно хотя бы 25 ГБ свободных (лучше 40)." }

# 3. Blender 4.5 LTS (portable, с blender.org, проверка SHA-256)
$bl = Join-Path $Root 'blender\blender.exe'
if (-not (Test-Path $bl)) {
  Say 'Скачиваю Blender 4.5 LTS (~400 МБ)…' 'Cyan'
  $base = 'https://download.blender.org/release/Blender4.5/'
  $list = (Invoke-WebRequest -UseBasicParsing $base).Content
  $ver = ([regex]::Matches($list, 'blender-4\.5\.(\d+)-windows-x64\.zip') | ForEach-Object { [int]$_.Groups[1].Value } | Sort-Object -Descending | Select-Object -First 1)
  if ($null -eq $ver) { Fail 'Не нашёл Blender 4.5 на blender.org. Проверьте интернет.' }
  $zipName = "blender-4.5.$ver-windows-x64.zip"; $zip = Join-Path $Root $zipName
  for ($i = 1; $i -le 5 -and -not (Test-Path $zip); $i++) {
    try { Start-BitsTransfer -Source ($base + $zipName) -Destination ($zip + '.part'); Move-Item ($zip + '.part') $zip }
    catch { Say "Скачивание прервалось ($i/5): $($_.Exception.Message)" 'Yellow'; try { Invoke-WebRequest -UseBasicParsing ($base + $zipName) -OutFile ($zip + '.part'); Move-Item ($zip + '.part') $zip } catch { Start-Sleep 10 } }
  }
  if (-not (Test-Path $zip)) { Fail 'Blender не скачался. Скачайте вручную: blender.org → Download → «Windows – Portable (.zip)» 4.5 LTS и положите zip в папку arden.' }
  $sha = $null
  try { $sha = (Invoke-WebRequest -UseBasicParsing ($base + "blender-4.5.$ver.sha256")).Content -split "`n" | Where-Object { $_ -match $zipName } | ForEach-Object { ($_ -split '\s+')[0] } } catch { Say 'Контрольной суммы на сайте нет — проверяю только распаковку.' 'Yellow' }
  $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if ($sha -and $got -ne $sha.ToLower()) { Remove-Item $zip; Fail 'Архив Blender повреждён (контрольная сумма не совпала). Запустите START.bat ещё раз.' }
  Say 'Распаковываю Blender…'
  # встроенный tar (Windows 10 1803+) распаковывает в разы быстрее Expand-Archive
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  $ok = $false
  if (Test-Path $tar) { & $tar -xf $zip -C $Root; $ok = ($LASTEXITCODE -eq 0) }
  if (-not $ok) { Expand-Archive -Path $zip -DestinationPath $Root -Force }
  Move-Item (Join-Path $Root "blender-4.5.$ver-windows-x64") (Join-Path $Root 'blender')
  Remove-Item $zip
}
Say ('Blender: ' + $bl)

# 4. рендер: ассеты докачиваются, потом облёт → облёты домов → подлёты → вступление
$args_ = @('-b', '--factory-startup', '--python-exit-code', '1', '-P', (Join-Path $Root 'arden_render.py'), '--', '--scene', (Join-Path $Root 'scene'),
           '--out', (Join-Path $Root 'renders'), '--what', 'all', '--mode', $Mode)
Say "=== Рендер ($Mode). Ход работы — renders\status.txt. Окно не закрывать. ===" 'Cyan'
$ErrorActionPreference = 'Continue'   # строки Blender в stderr — не ошибка PowerShell
for ($run = 1; $run -le 8; $run++) {
  & $bl @args_ 2>&1 | ForEach-Object { $s = "$_"; if ($s -match '^\[(arden|assets)\]') { Say $s } else { Add-Content -Path $Log -Value $s -Encoding UTF8 } }
  if ($LASTEXITCODE -eq 0) { break }
  Say "Blender завершился с ошибкой (код $LASTEXITCODE), перезапуск $run/8 через 30 с — готовые кадры сохранены." 'Yellow'
  Start-Sleep 30
}
$st = Join-Path $Root 'renders\status.txt'
if (Test-Path $st) { Get-Content $st -Encoding UTF8 | Write-Host }
Say '=== Работа окончена. Запустите pack.bat и пришлите получившийся zip. ===' 'Green'
if ($awake) { [W.P]::SetThreadExecutionState([uint32]2147483648) | Out-Null }
Read-Host 'Нажмите Enter, чтобы закрыть окно'
