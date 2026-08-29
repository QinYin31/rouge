# ===== 《水墨江湖·幸存者》PWA 图标生成(🎨美术agent 名下 tools/gen-icons.ps1)=====
# 水墨风:宣纸米黄底(细纸纹杂点)+ 淡墨圆环剑气 + 浓墨侠客剪影(斗笠·背负长剑)+ 朱砂方印
# 输出:icons/icon-192.png、icons/icon-512.png、icons/maskable-512.png(maskable 版四周留约10%安全边距)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path     # tools/
$proj = Split-Path -Parent $root
$icons = Join-Path $proj 'icons'
New-Item -ItemType Directory -Force -Path $icons | Out-Null

# ---- 水墨调色板(与 js/sprites.js 同源) ----
$INK      = '2b2b2b'   # 浓墨
$INK_SOFT = '55554e'   # 重墨(笠沿·衣纹)
$SEAL     = 'b03a2e'   # 朱砂印
$PAPER    = 'ece5d3'   # 宣纸底
$PAPER_HI = 'f2ecdd'   # 纸光(印内白文)
$PAPER_DK = 'd9ceac'   # 纸影杂点
$WASH     = 'ddd3b6'   # 淡墨圆环(剑气晕)

function Convert-HexToColor([string]$hex) {
  return [System.Drawing.Color]::FromArgb(255,
    [Convert]::ToInt32($hex.Substring(0, 2), 16),
    [Convert]::ToInt32($hex.Substring(2, 2), 16),
    [Convert]::ToInt32($hex.Substring(4, 2), 16))
}

# ---- 32×32 逻辑网格:程序化拼装侠客剪影 ----
$G = 32
$script:grid = New-Object 'System.Collections.Generic.List[char[]]'
for ($y = 0; $y -lt $G; $y++) { $script:grid.Add(([char[]]('.' * $G))) }

function Set-Px([int]$x, [int]$y, [char]$c) {
  if ($x -ge 0 -and $x -lt $script:G -and $y -ge 0 -and $y -lt $script:G) { $script:grid[$y][$x] = $c }
}
function Fill-Rect([int]$x0, [int]$y0, [int]$x1, [int]$y1, [char]$c) {
  for ($y = $y0; $y -le $y1; $y++) { for ($x = $x0; $x -le $x1; $x++) { Set-Px $x $y $c } }
}
function Fill-Disc([double]$cx, [double]$cy, [double]$r, [char]$c) {
  for ($y = [int][Math]::Floor($cy - $r); $y -le [Math]::Ceiling($cy + $r); $y++) {
    for ($x = [int][Math]::Floor($cx - $r); $x -le [Math]::Ceiling($cx + $r); $x++) {
      $dx = ($x - $cx) / $r; $dy = ($y - $cy) / $r
      if ($dx * $dx + $dy * $dy -le 1.06) { Set-Px $x $y $c }
    }
  }
}

# 0) 淡墨圆环:身周剑气旋涡(一笔留缺口,如枯笔)
for ($y = 0; $y -lt $G; $y++) {
  for ($x = 0; $x -lt $G; $x++) {
    $dx = $x - 15.5; $dy = $y - 16.5
    $d = [Math]::Sqrt($dx * $dx + $dy * $dy)
    if ($d -ge 12.0 -and $d -le 13.6) {
      $ang = [Math]::Atan2($dy, $dx)
      if ($ang -lt -0.5 -or $ang -gt 1.1) { Set-Px $x $y 'd' }   # 右上方留缺口
    }
  }
}

# 1) 长剑:斜负于背后,锋出右上、柄出左下(先画,躯干覆盖中段)
for ($t = 0.0; $t -le 1.0; $t += 0.008) {
  Fill-Disc (27 - 23 * $t) (1 + 23 * $t) 1.1 'k'     # (27,1) -> (4,24)
}
Fill-Disc 3.2 24.4 1.8 'k'    # 剑柄首

# 2) 侠客剪影:斗笠 + 头颈 + 宽袍 + 双足
for ($y = 3; $y -le 8; $y++) {                       # 斗笠锥顶
  $halfW = 1.2 + ($y - 3) * 1.35
  Fill-Rect ([int][Math]::Round(14 - $halfW)) $y ([int][Math]::Round(14 + $halfW)) $y 'k'
}
Fill-Rect 5 9 23 9 'k'                               # 笠沿宽檐
Fill-Rect 6 10 22 10 'm'                             # 檐下重墨
Fill-Rect 12 11 17 13 'k'                            # 头颈(剪影)
Fill-Rect 9 14 19 15 'k'                             # 肩
for ($y = 14; $y -le 26; $y++) {                     # 袍身向下渐宽
  $halfW = 3.0 + ($y - 14) * 0.58
  Fill-Rect ([int][Math]::Round(14 - $halfW)) $y ([int][Math]::Round(14 + $halfW)) $y 'k'
}
Fill-Rect 14 17 14 23 'm'                            # 衣襟开线
Fill-Rect 8 27 11 29 'k'                             # 左足
Fill-Rect 17 27 20 29 'k'                            # 右足

# 3) 朱砂方印(右下,白文「田」格)
$sealRows = @(
  'rrrrrrr',
  'rwrrrwr',
  'rwrrrwr',
  'rrrrrrr',
  'rwrrrwr',
  'rwrrrwr',
  'rrrrrrr'
)
for ($y = 0; $y -lt 7; $y++) {
  for ($x = 0; $x -lt 7; $x++) { Set-Px (23 + $x) (22 + $y) $sealRows[$y][$x] }
}

# ---- 渲染:宣纸底 + 纸纹杂点 + 逻辑网格放大 ----
function New-Icon {
  param([int]$Size, [string]$Path, [double]$Fill)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

  # 宣纸底铺满
  $bg = New-Object System.Drawing.SolidBrush (Convert-HexToColor $PAPER)
  $gfx.FillRectangle($bg, 0, 0, $Size, $Size)
  $bg.Dispose()

  # 纸纹杂点(固定种子,细腻无序)
  $rnd = New-Object System.Random(20260829)
  $dk = Convert-HexToColor $PAPER_DK
  $hi = Convert-HexToColor $PAPER_HI
  $n = [int]($Size * $Size / 700)
  for ($i = 0; $i -lt $n; $i++) {
    $x = $rnd.Next($Size); $y = $rnd.Next($Size)
    $w = $rnd.Next(1, 4)
    $brush = New-Object System.Drawing.SolidBrush ($(if ($rnd.Next(3) -eq 0) { $hi } else { $dk }))
    $gfx.FillRectangle($brush, $x, $y, $w, 1)
    $brush.Dispose()
  }

  # 32×32 逻辑网格放大(Fill=0.72 时四周约留 10% 安全边距)
  $cell = [int][Math]::Floor($Size * $Fill / $G)
  $off = [int](($Size - $cell * $G) / 2)
  $charColor = @{ 'k' = $INK; 'm' = $INK_SOFT; 'r' = $SEAL; 'w' = $PAPER_HI; 'd' = $WASH }
  for ($y = 0; $y -lt $G; $y++) {
    for ($x = 0; $x -lt $G; $x++) {
      $ch = [string]$script:grid[$y][$x]
      if ($ch -eq '.') { continue }
      $hex = $charColor[$ch]
      if (-not $hex) { continue }
      $brush = New-Object System.Drawing.SolidBrush (Convert-HexToColor $hex)
      $gfx.FillRectangle($brush, $off + $x * $cell, $off + $y * $cell, $cell, $cell)
      $brush.Dispose()
    }
  }
  $gfx.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("OK  {0}  ({1}x{1}, 网格占比 {2})" -f $Path, $Size, $Fill)
}

New-Icon -Size 192 -Path (Join-Path $icons 'icon-192.png') -Fill 0.86
New-Icon -Size 512 -Path (Join-Path $icons 'icon-512.png') -Fill 0.86
New-Icon -Size 512 -Path (Join-Path $icons 'maskable-512.png') -Fill 0.72
Write-Host '全部图标生成完毕。'
