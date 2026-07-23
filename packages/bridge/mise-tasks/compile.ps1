#!/usr/bin/env pwsh
#MISE description="Compile the local bridge for a target platform."
#USAGE flag "--target <target>" help="Target platform: linux-x64, macos-arm64, or windows-x64" {
#USAGE   choices "linux-x64" "macos-arm64" "windows-x64"
#USAGE }
#USAGE flag "--version <version>" default="0.0.0-development" help="Version to embed in the binary."

$ErrorActionPreference = "Stop"
$Target = $env:usage_target
$Version = if ($env:usage_version) { $env:usage_version } else { "0.0.0-development" }

if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$') {
  throw "Invalid build version: $Version"
}

$VersionDefine = ConvertTo-Json -Compress $Version

switch ($Target) {
  "linux-x64" {
    $BunTarget = "bun-linux-x64"
    $OutputPath = "../../dist/mikoto-bridge-linux-x64"
  }
  "macos-arm64" {
    $BunTarget = "bun-darwin-arm64"
    $OutputPath = "../../dist/mikoto-bridge-macos-arm64"
  }
  "windows-x64" {
    $BunTarget = "bun-windows-x64"
    $OutputPath = "../../dist/mikoto-bridge-windows-x64.exe"
  }
}

bun build --compile "--target=$BunTarget" "--define=MIKOTO_BUILD_VERSION=$VersionDefine" "--outfile=$OutputPath" src/index.ts
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
