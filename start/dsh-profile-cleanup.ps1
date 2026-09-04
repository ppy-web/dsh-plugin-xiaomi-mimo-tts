$ErrorActionPreference = 'Stop'

$dshRoot = if ([string]::IsNullOrWhiteSpace($env:DSH_HOME)) {
  Join-Path $env:USERPROFILE '.dsh'
} else {
  [IO.Path]::GetFullPath($env:DSH_HOME)
}
$profileRoot = [IO.Path]::GetFullPath((Join-Path $dshRoot 'profiles\web')).TrimEnd('\')
$manifestPath = Join-Path $profileRoot 'package.json'
$packageNames = @('dsh-xiaomi-tts', 'dsh-plugin-xiaomi-mimo-tts')

if (Test-Path -LiteralPath $manifestPath) {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $dependencies = @($manifest.dependencies.PSObject.Properties.Name)
  $bundles = @($manifest.dsh.profile.bundles)
  foreach ($packageName in $packageNames) {
    if ($dependencies -contains $packageName -or $bundles -contains $packageName) {
      throw "Profile manifest still contains $packageName after dsh plugin remove."
    }
  }
}

foreach ($packageName in $packageNames) {
  $fullPath = [IO.Path]::GetFullPath((Join-Path $profileRoot "node_modules\$packageName"))
  if (-not $fullPath.StartsWith($profileRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing path outside profile: $fullPath"
  }
  $item = Get-Item -LiteralPath $fullPath -Force -ErrorAction SilentlyContinue
  if ($null -eq $item) { continue }
  if ($item.LinkType -in @('Junction', 'SymbolicLink')) {
    Write-Host "[INFO] Removing stale $($item.LinkType): $($item.FullName)"
    Remove-Item -LiteralPath $item.FullName -Force
  } else {
    Write-Host "[INFO] Removing residual package directory: $($item.FullName)"
    Remove-Item -LiteralPath $item.FullName -Recurse -Force
  }
}
