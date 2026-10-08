param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseDirectory
)

$ErrorActionPreference = 'Stop'

function Resolve-SignToolPath {
  $command = Get-Command 'signtool.exe' -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  $candidateRoots = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'),
    (Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'),
    $env:ELECTRON_BUILDER_CACHE
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_) }

  foreach ($root in $candidateRoots) {
    $candidate = Get-ChildItem -LiteralPath $root -Filter 'signtool.exe' -File -Recurse |
      Where-Object { $_.FullName -match '[\\/]x64[\\/]' } |
      Sort-Object -Property FullName -Descending |
      Select-Object -First 1

    if ($null -ne $candidate) {
      return $candidate.FullName
    }
  }

  throw 'signtool.exe was not found. Install the Windows SDK before producing a signed release.'
}

$resolvedReleaseDirectory = (Resolve-Path -LiteralPath $ReleaseDirectory).Path
$installerFiles = @(
  Get-ChildItem -LiteralPath $resolvedReleaseDirectory -Filter '*-setup.exe' -File
)
$appExecutablePath = Join-Path $resolvedReleaseDirectory 'win-unpacked\Marklab.exe'

if ($installerFiles.Count -ne 1) {
  throw "Expected exactly one Windows setup executable, found $($installerFiles.Count)."
}

if (-not (Test-Path -LiteralPath $appExecutablePath -PathType Leaf)) {
  throw "Packaged application executable was not found: $appExecutablePath"
}

$targets = @($installerFiles[0].FullName, $appExecutablePath)
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
