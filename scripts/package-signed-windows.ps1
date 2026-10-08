param(
  [string]$CertificateSha1 = $env:MARKLAB_WINDOWS_CERTIFICATE_SHA1
)

$ErrorActionPreference = 'Stop'

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
  throw 'Local Windows signing can only run on Windows.'
}

$normalizedThumbprint = (([string]$CertificateSha1) -replace '\s', '').ToUpperInvariant()
if ($normalizedThumbprint -notmatch '^[0-9A-F]{40}$') {
  throw 'Set MARKLAB_WINDOWS_CERTIFICATE_SHA1 to the 40-character thumbprint of a local code-signing certificate.'
}

$certificateStores = @('Cert:\CurrentUser\My', 'Cert:\LocalMachine\My')
$certificate = $certificateStores |
  ForEach-Object { Get-Item -LiteralPath "$_\$normalizedThumbprint" -ErrorAction SilentlyContinue } |
  Select-Object -First 1
if ($null -eq $certificate) {
  throw "The signing certificate was not found in Cert:\CurrentUser\My or Cert:\LocalMachine\My: $normalizedThumbprint"
}

if (-not $certificate.HasPrivateKey) {
  throw 'The selected signing certificate does not have an accessible private key.'
}

$now = Get-Date
if ($certificate.NotBefore -gt $now -or $certificate.NotAfter -le $now) {
  throw "The selected signing certificate is outside its validity period: $($certificate.NotBefore) - $($certificate.NotAfter)"
}

$codeSigningEku = '1.3.6.1.5.5.7.3.3'
$hasCodeSigningEku = $certificate.EnhancedKeyUsageList |
  Where-Object { $_.ObjectId.Value -eq $codeSigningEku }
if ($null -eq $hasCodeSigningEku) {
  throw 'The selected certificate does not include the Code Signing enhanced key usage.'
}

Write-Host "Building Windows artifacts with local certificate $normalizedThumbprint."
& pnpm electron:build
if ($LASTEXITCODE -ne 0) {
  throw "Electron bundle build failed with exit code $LASTEXITCODE."
}

& pnpm exec electron-builder --win --publish never `
  '-c.forceCodeSigning=true' `
  "-c.win.signtoolOptions.certificateSha1=$normalizedThumbprint"
if ($LASTEXITCODE -ne 0) {
  throw "Signed Windows packaging failed with exit code $LASTEXITCODE."
}

& "$PSScriptRoot\verify-windows-signatures.ps1" -ReleaseDirectory "$PSScriptRoot\..\release"
if ($LASTEXITCODE -ne 0) {
  throw "Windows signature verification failed with exit code $LASTEXITCODE."
}
