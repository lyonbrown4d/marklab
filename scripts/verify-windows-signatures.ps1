param(
  # Use src-tauri/target/release, or src-tauri/target/<target>/release.
  [Parameter(Mandatory = $true)]
  [string]$ReleaseDirectory
)

$ErrorActionPreference = 'Stop'

function Resolve-SignToolPath {
  $command = Get-Command 'signtool.exe' -ErrorAction SilentlyContinue
  if ($null -ne $command -and $command.Source -match '[\\/]Windows Kits[\\/]') {
    return $command.Source
  }

  $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  if (Test-Path -LiteralPath $sdkRoot -PathType Container) {
    $candidate = Get-ChildItem -LiteralPath $sdkRoot -Filter 'signtool.exe' -File -Recurse |
      Where-Object { $_.FullName -match '[\\/](x64|arm64)[\\/]' } |
      Sort-Object -Property FullName -Descending |
      Select-Object -First 1
    if ($null -ne $candidate) { return $candidate.FullName }
  }

  throw 'signtool.exe was not found in the Windows SDK. Install the SDK before signature verification.'
}

$resolvedReleaseDirectory = (Resolve-Path -LiteralPath $ReleaseDirectory).Path
$bundleDirectory = Join-Path $resolvedReleaseDirectory 'bundle'
$appExecutablePath = Join-Path $resolvedReleaseDirectory 'marklab-desktop.exe'
$installerFiles = @()
foreach ($kind in @('nsis', 'msi')) {
  $directory = Join-Path $bundleDirectory $kind
  if (Test-Path -LiteralPath $directory -PathType Container) {
    $extension = if ($kind -eq 'nsis') { '*.exe' } else { '*.msi' }
    $files = @(Get-ChildItem -LiteralPath $directory -Filter $extension -File)
    if ($files.Count -gt 1) {
      throw "Expected at most one $kind installer, found $($files.Count). Use a clean Tauri bundle directory."
    }
    $installerFiles += $files
  }
}
if ($installerFiles.Count -eq 0) {
  throw "No Tauri NSIS/MSI installers were found below '$bundleDirectory'."
}
if (-not (Test-Path -LiteralPath $appExecutablePath -PathType Leaf)) {
  throw "Native application executable was not found: $appExecutablePath"
}

$targets = @($appExecutablePath) + @($installerFiles | ForEach-Object { $_.FullName })
$signToolPath = Resolve-SignToolPath
foreach ($target in $targets) {
  $verifyArguments = @('verify', '/pa', '/all', '/tw', '/v', $target)
  & $signToolPath @verifyArguments
  if ($LASTEXITCODE -ne 0) {
    throw "SignTool verification failed for '$target' with exit code $LASTEXITCODE."
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $target
  if ($signature.Status -ne 'Valid') {
    throw "Authenticode validation failed for '$target': $($signature.StatusMessage)"
  }
  if ($null -eq $signature.TimeStamperCertificate) {
    throw "Authenticode signature is missing a trusted timestamp: '$target'"
  }
  Write-Host "Valid Authenticode signature: $target"
}
