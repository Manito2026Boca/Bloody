param(
  [string]$Source = (Join-Path $PSScriptRoot '..\public\brand\source\manito-brand-reference.jpg')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$brand = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public\brand'))
$sourcePath = [System.IO.Path]::GetFullPath($Source)

function Export-Crop {
  param(
    [System.Drawing.Image]$Image,
    [System.Drawing.Rectangle]$Crop,
    [string]$Name,
    [int]$Width = 0,
    [int]$Height = 0
  )

  $targetWidth = if ($Width -gt 0) { $Width } else { $Crop.Width }
  $targetHeight = if ($Height -gt 0) { $Height } else { $Crop.Height }
  $bitmap = [System.Drawing.Bitmap]::new($targetWidth, $targetHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $destination = [System.Drawing.Rectangle]::new(0, 0, $targetWidth, $targetHeight)
    $graphics.DrawImage($Image, $destination, $Crop, [System.Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save((Join-Path $brand $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$image = [System.Drawing.Image]::FromFile($sourcePath)
try {
  if ($image.Width -ne 1280 -or $image.Height -ne 1280) {
    throw "Expected the 1280x1280 approved reference sheet."
  }

  Export-Crop $image ([System.Drawing.Rectangle]::new(150, 145, 980, 280)) 'manito-reference-horizontal.png'
  Export-Crop $image ([System.Drawing.Rectangle]::new(175, 575, 315, 320)) 'manito-reference-mark.png'
  Export-Crop $image ([System.Drawing.Rectangle]::new(735, 570, 425, 330)) 'manito-reference-stacked.png'
  Export-Crop $image ([System.Drawing.Rectangle]::new(528, 980, 225, 225)) 'manito-reference-app-icon.png'
  Export-Crop $image ([System.Drawing.Rectangle]::new(528, 980, 225, 225)) 'manito-icon-192.png' 192 192
  Export-Crop $image ([System.Drawing.Rectangle]::new(528, 980, 225, 225)) 'manito-icon-512.png' 512 512
  Export-Crop $image ([System.Drawing.Rectangle]::new(528, 980, 225, 225)) 'manito-maskable-512.png' 512 512
  Export-Crop $image ([System.Drawing.Rectangle]::new(528, 980, 225, 225)) 'apple-touch-icon.png' 180 180
  Export-Crop $image ([System.Drawing.Rectangle]::new(528, 980, 225, 225)) 'manito-favicon-64.png' 64 64
} finally {
  $image.Dispose()
}
