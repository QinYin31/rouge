# ===== 《像素幸存者》PWA 图标生成(🎨美术agent 名下 tools/gen-icons.ps1)=====
# 深蓝底 #0b0d17 + 16×16 逻辑网格的英雄脸(大方块像素,橙色调点缀)
# 输出:icons/icon-192.png、icons/icon-512.png、icons/maskable-512.png(maskable 版四周留约10%安全边距)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path     # tools/
$proj = Split-Path -Parent $root
$icons = Join-Path $proj 'icons'
New-Item -ItemType Directory -Force -Path $icons | Out-Null

# ---- 调色板(与 js/sprites.js 同源的 EDG32 风格;PS 哈希键不区分大小写,改用大小写敏感 switch) ----
function Get-PalColor([string]$ch) {
  switch -CaseSensitive ($ch) {
    'k' { '181425' } 'K' { '262b44' } 'A' { '3a4466' } 'C' { '8b9bb4' } 'D' { 'c0cbdc' }
    'R' { 'e43b44' } 'O' { 'feae34' } 'y' { 'fee761' } 'S' { 'e8b796' } 's' { 'c28569' }
    'u' { '0099db' } 'G' { '3e8948' }
    default { $null }
  }
}

# ---- 16×16 英雄脸(战士构图,橙缨 + 金瞳高光点缀) ----
$face = @(
  '......kOOk......',
  '.....kOOOOk.....',
  '....kCOOOOCk....',
  '...kCCCCCCCCk...',
  '...kCCCCCCCCk...',
  '...kCKKDDKKCk...',
  '...kCKyDDyKCk...',
  '...kCCCCCCCCk...',
  '....kCCDDCCk....',
  '....kCCCCCCk....',
  '.....kkkkkk.....',
  '....kOACCAOk....',
  '...kAACCCAACk...',
  '..kAACCCAACCk...',
  '.kAACCCCCCAACk..',
  '.kkkkkkkkkkkkkk.'
)

function New-Icon {
  param([int]$Size, [string]$Path, [double]$Fill)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

  # 深蓝底铺满
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0x0b, 0x0d, 0x17))
  $gfx.FillRectangle($bg, 0, 0, $Size, $Size)
  $bg.Dispose()

  # 16×16 逻辑网格放大(Fill=0.72 时四周约留 10% 安全边距)
  $cell = [int][Math]::Floor($Size * $Fill / 16)
  $off = [int](($Size - $cell * 16) / 2)
  for ($y = 0; $y -lt 16; $y++) {
    for ($x = 0; $x -lt 16; $x++) {
      $ch = [string]$face[$y][$x]
      if ($ch -eq '.') { continue }
      $hex = Get-PalColor $ch
      if (-not $hex) { continue }
      $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,
        [Convert]::ToInt32($hex.Substring(0, 2), 16),
        [Convert]::ToInt32($hex.Substring(2, 2), 16),
        [Convert]::ToInt32($hex.Substring(4, 2), 16)))
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
