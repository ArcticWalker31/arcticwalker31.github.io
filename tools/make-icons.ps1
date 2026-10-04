# make-icons.ps1 — generate simple letter icons for an app folder.
#
# Usage (from the repo root, in PowerShell):
#   .\tools\make-icons.ps1 -Dir budget -Letter B -Bg '#8797B2'
#
# Writes <Dir>/icons/icon.svg, icon-192.png, icon-512.png and
# apple-touch-icon.png (180). iOS needs PNGs for home-screen icons; the SVG is
# used as the browser-tab favicon. Backgrounds are full-bleed squares because
# iOS and Android apply their own rounded mask.
#
# Palette suggestions: #60935D green, #8797B2 slate, #EE6352 coral, #493B2A brown.

param(
  [Parameter(Mandatory = $true)][string]$Dir,
  [Parameter(Mandatory = $true)][string]$Letter,
  [string]$Bg = '#493B2A',
  [string]$Fg = '#FEFFEA'
)

Add-Type -AssemblyName System.Drawing

$out = Join-Path $Dir 'icons'
New-Item -ItemType Directory -Force $out | Out-Null
$Letter = $Letter.Substring(0, 1).ToUpper()

foreach ($spec in @(@{ n = 'icon-512.png'; s = 512 }, @{ n = 'icon-192.png'; s = 192 }, @{ n = 'apple-touch-icon.png'; s = 180 })) {
  $s = $spec.s
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($Bg))

  # Letter sized to ~half the icon, centered (inside the maskable safe zone).
  $font = New-Object System.Drawing.Font('Segoe UI Semibold', [single]($s * 0.52), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Fg))
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $rect = New-Object System.Drawing.RectangleF(0, [single](-$s * 0.03), $s, $s)
  $g.DrawString($Letter, $font, $brush, $rect, $fmt)

  $bmp.Save((Join-Path $out $spec.n), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

$svg = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="$Bg"/>
  <text x="256" y="248" text-anchor="middle" dominant-baseline="central"
        font-family="Segoe UI, system-ui, sans-serif" font-weight="600" font-size="266" fill="$Fg">$Letter</text>
</svg>
"@
Set-Content -Path (Join-Path $out 'icon.svg') -Value $svg -Encoding UTF8

Get-ChildItem $out | Select-Object Name, Length
