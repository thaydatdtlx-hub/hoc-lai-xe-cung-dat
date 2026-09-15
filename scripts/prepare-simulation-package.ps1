# Windows PowerShell 5.1+. Does not install or execute the downloaded program.
[CmdletBinding()]
param([string]$ArchivePath, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path ([Environment]::GetFolderPath('Desktop')) ('MoPhong-upload-' + [Guid]::NewGuid().ToString('N'))
}
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output directory already exists. Choose a new directory.' }
$null = New-Item -ItemType Directory -Path $OutputDirectory
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path
if (-not $ArchivePath) {
    $ArchivePath = Join-Path $OutputDirectory 'OnTapMoPhongSetup_v200_x64.rar'
    $partial = $ArchivePath + '.downloading'
    $source = 'https://www.mophonggiaothong.com/PMMP/OnTapMoPhong/OnTapMoPhongSetup_v200_x64.rar'
    Write-Host 'Downloading the full archive. Allow at least 12 GB of free disk space.'
    Invoke-WebRequest -UseBasicParsing -Uri $source -OutFile $partial
    Move-Item -LiteralPath $partial -Destination $ArchivePath
}
$ArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
$inputStream = [IO.File]::OpenRead($ArchivePath)
$parts = @()
try {
    $signature = New-Object byte[] 7
    if ($inputStream.Read($signature, 0, 7) -ne 7) { throw 'Archive is too short.' }
    $magic = [BitConverter]::ToString($signature)
    if ($magic -notin @('52-61-72-21-1A-07-00', '52-61-72-21-1A-07-01')) {
        throw 'Not a RAR archive. The download may be an error page.'
    }
    $inputStream.Position = 0
    $buffer = New-Object byte[] (1MB)
    $partNumber = 0
    while ($inputStream.Position -lt $inputStream.Length) {
        $partNumber++
        $name = 'archive.part{0:D3}' -f $partNumber
        $path = Join-Path $OutputDirectory $name
        $outputStream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
        $written = 0L
        try {
            while ($written -lt 200MB) {
                $count = [int][Math]::Min($buffer.Length, 200MB - $written)
                $read = $inputStream.Read($buffer, 0, $count)
                if ($read -eq 0) { break }
                $outputStream.Write($buffer, 0, $read)
                $written += $read
            }
        } finally { $outputStream.Dispose() }
        $parts += [ordered]@{ name = $name; size = $written; sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
        Write-Host ('Prepared {0}: {1} bytes' -f $name, $written)
    }
} finally { $inputStream.Dispose() }
$manifest = [ordered]@{
    schemaVersion = 1
    archiveName = [IO.Path]::GetFileName($ArchivePath)
    archiveSize = (Get-Item -LiteralPath $ArchivePath).Length
    archiveSha256 = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    parts = $parts
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'parts.json') -Encoding UTF8
Write-Host "Done: $OutputDirectory"
Write-Host 'Upload only archive.part* and parts.json to the shared Drive folder. Keep the original RAR locally.'
