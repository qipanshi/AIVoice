param([string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'AIVoice'), [switch]$NoPath)
function Uninstall-AIVoice {
    param([string]$InstallDir, [switch]$NoPath)
    $ErrorActionPreference = 'Stop'
    $root = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
    $versions = [IO.Path]::GetFullPath((Join-Path $root 'versions')).TrimEnd('\')
    $marker = Join-Path $root '.aivoice-install'
    if (!(Test-Path -LiteralPath $marker -PathType Leaf) -or !(Test-Path -LiteralPath $versions -PathType Container)) { throw '未找到安装器创建的 AIVoice 安装目录。' }
    if (((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or ((Get-Item -LiteralPath $versions -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '安装目录包含链接，无法安全自动卸载。' }
    $credentials = if ($env:AIVOICE_CONFIG_DIR) { [IO.Path]::GetFullPath($env:AIVOICE_CONFIG_DIR).TrimEnd('\') } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.aivoice' }
    if ($credentials.Equals($versions,[StringComparison]::OrdinalIgnoreCase) -or $credentials.StartsWith($versions+'\',[StringComparison]::OrdinalIgnoreCase)) { throw '本地凭证位于程序版本目录，请先移出该目录再卸载。' }
    $managed = @()
    foreach ($candidate in @(Get-ChildItem -LiteralPath $versions -Directory -Force)) {
        if ($candidate.Name -notmatch '^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$' -or ($candidate.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
        $resolved = (Resolve-Path -LiteralPath $candidate.FullName).Path
        if (!$resolved.StartsWith($versions+'\',[StringComparison]::OrdinalIgnoreCase)) { continue }
        $package = Join-Path $resolved 'app\package.json'
        if (!(Test-Path -LiteralPath $package -PathType Leaf)) { continue }
        try { $name = (Get-Content -LiteralPath $package -Raw | ConvertFrom-Json).name } catch { continue }
        if ($name -ne 'aivoice-mcp-cli') { continue }
        if (Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1) { throw '程序目录中存在链接，无法安全自动卸载。' }
        $managed += $resolved
    }
    Write-Host '正在卸载 AIVoice 程序...'
    foreach ($directory in $managed) {
        try { Remove-Item -LiteralPath $directory -Recurse -Force }
        catch { throw '卸载未完成，请关闭使用 AIVoice 的工作台和终端后重试。' }
    }
    $bin = Join-Path $root 'bin'
    $launcher = Join-Path $bin 'aivoice.cmd'
    if (Test-Path -LiteralPath $launcher -PathType Leaf) { Remove-Item -LiteralPath $launcher -Force }
    if (!$NoPath) {
        $path = [string][Environment]::GetEnvironmentVariable('Path', 'User')
        $parts = @($path -split ';')
        $kept = @($parts | Where-Object { $_.TrimEnd('\') -ine $bin.TrimEnd('\') })
        if ($kept.Count -ne $parts.Count) { [Environment]::SetEnvironmentVariable('Path', ($kept -join ';'), 'User') }
    }
    Remove-Item -LiteralPath $marker -Force
    $localUninstaller = Join-Path $root 'uninstall.ps1'
    if (Test-Path -LiteralPath $localUninstaller -PathType Leaf) { Remove-Item -LiteralPath $localUninstaller -Force }
    foreach ($directory in @($versions, $bin, $root)) {
        if ((Test-Path -LiteralPath $directory -PathType Container) -and !(Get-ChildItem -LiteralPath $directory -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $directory -Force }
    }
    Write-Host 'AIVoice 程序已卸载，本地凭证和远端授权已保留。请重新打开终端。'
}
Uninstall-AIVoice -InstallDir $InstallDir -NoPath:$NoPath
