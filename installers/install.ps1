param(
    [string]$BaseUrl = 'https://open.qipanshi.com',
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'AIVoice'),
    [switch]$NoPath
)

function Install-AIVoice {
    param([string]$BaseUrl, [string]$InstallDir, [switch]$NoPath)
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw 'Windows curl.exe is required (included with supported Windows 10/11 versions).' }
    $release = '0.3.1'
    $nodeRelease = '24.18.0'
    $origin = [Uri]$BaseUrl
    if ($origin.Scheme -ne 'https' -and -not ($origin.Scheme -eq 'http' -and $origin.Host -eq '127.0.0.1')) { throw 'Installation origin must use HTTPS.' }
    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $arch = switch ($architecture) { 'AMD64' { 'x64' }; 'ARM64' { 'arm64' }; default { throw 'Windows x64 or ARM64 is required.' } }
    # Published Node.js 24.18.0 binary hashes, for safely reusing a prior installation.
    $nodeExeHash = (@{ x64 = '9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52de'; arm64 = 'c7225670c3f477778e18c43a55867f7a0d76468221245e5981ab80eb953c8102' })[$arch]
    $root = [IO.Path]::GetFullPath($InstallDir)
    $versions = Join-Path $root 'versions'
    $destination = Join-Path $versions $release
    $bin = Join-Path $root 'bin'
    New-Item -ItemType Directory -Force -Path $versions, $bin | Out-Null
    $stage = Join-Path $versions ('.staging-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    try {
        if (-not (Test-Path -LiteralPath $destination)) {
            Write-Host "Installing AIVoice $release for Windows $arch..."
            Write-Host '[1/4] 正在获取安装校验信息...'
            $checksFile = Join-Path $stage 'checksums'
            curl.exe --fail --silent --show-error --location --connect-timeout 20 --max-time 60 --output $checksFile "$BaseUrl/aivoice/downloads/SHA256SUMS-CLI-$release"
            if ($LASTEXITCODE -ne 0) { throw 'Cannot download the release checksums.' }
            $checks = Get-Content -LiteralPath $checksFile -Raw -Encoding UTF8
            $appFile = "aivoice-cli-$release.zip"
            $nodeFile = "node-v$nodeRelease-win-$arch.zip"
            $runtimeSource = $null
            foreach ($candidate in @(Get-ChildItem -LiteralPath $versions -Directory -Force)) {
                if ($candidate.Name -eq $release -or $candidate.Name -like '.staging-*') { continue }
                $previousRuntime = Join-Path $candidate.FullName 'runtime'
                $previousNode = Join-Path $previousRuntime 'node.exe'
                $previousLicense = Join-Path $previousRuntime 'LICENSE'
                if ((Test-Path -LiteralPath $previousNode -PathType Leaf) -and (Test-Path -LiteralPath $previousLicense -PathType Leaf) -and (Get-FileHash -LiteralPath $previousNode -Algorithm SHA256).Hash.ToLowerInvariant() -eq $nodeExeHash) {
                    $runtimeSource = $previousRuntime
                    break
                }
            }
            foreach ($item in @(@($appFile, "$BaseUrl/aivoice/downloads/$appFile"), @($nodeFile, "https://nodejs.org/dist/v$nodeRelease/$nodeFile"))) {
                $fileName = $item[0]
                if ($fileName -eq $nodeFile -and $runtimeSource) { Write-Host '[3/4] 已找到并校验此前的运行环境，无需重复下载。'; continue }
                $expected = @($checks -split "`n" | ForEach-Object { $parts = $_.Trim() -split '\s+'; if ($parts.Length -eq 2 -and $parts[1] -eq $fileName) { $parts[0] } })
                if ($expected.Count -ne 1 -or $expected[0] -notmatch '^[a-f0-9]{64}$') { throw "Missing checksum: $fileName" }
                $download = Join-Path $stage $fileName
                if ($fileName -eq $appFile) {
                    Write-Host '[2/4] 正在下载 AIVoice 程序包...'
                    curl.exe --fail --location --progress-bar --connect-timeout 20 --max-time 300 --output $download $item[1]
                } else {
                    Write-Host '[3/4] 正在从开放平台下载 Node.js 运行环境...'
                    $mirror = "$BaseUrl/aivoice/downloads/$nodeFile"
                    curl.exe --fail --silent --head --location --connect-timeout 10 --max-time 15 --output NUL $mirror
                    if ($LASTEXITCODE -eq 0) {
                        curl.exe --fail --location --progress-bar --connect-timeout 20 --max-time 300 --output $download $mirror
                    }
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host '平台暂未提供该运行环境，正在从 Node.js 官方网站下载...'
                        curl.exe --fail --location --progress-bar --connect-timeout 20 --max-time 900 --output $download $item[1]
                    }
                }
                if ($LASTEXITCODE -ne 0) { throw "Download failed: $fileName. Previous installation remains active." }
                Write-Host "正在校验并解压：$fileName"
                if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected[0]) { throw "Checksum mismatch: $fileName" }
                Expand-Archive -LiteralPath $download -DestinationPath $stage
                Remove-Item -LiteralPath $download
            }
            $vendorRuntime = if ($runtimeSource) { $runtimeSource } else { Join-Path $stage "node-v$nodeRelease-win-$arch" }
            $runtime = Join-Path $stage 'runtime'
            New-Item -ItemType Directory -Path $runtime | Out-Null
            if ((Get-FileHash -LiteralPath (Join-Path $vendorRuntime 'node.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $nodeExeHash) { throw 'Node.js binary checksum mismatch.' }
            Copy-Item -LiteralPath (Join-Path $vendorRuntime 'node.exe'), (Join-Path $vendorRuntime 'LICENSE') -Destination $runtime
            Remove-Item -LiteralPath $checksFile
            Write-Host '[4/4] 正在验证并启用 AIVoice...'
            $reported = & (Join-Path $stage 'runtime/node.exe') (Join-Path $stage 'app/dist/main.js') --version
            if ($LASTEXITCODE -ne 0 -or $reported -ne $release) { throw 'CLI verification failed. Previous installation remains active.' }
            # Both resolved paths are within this install root; never move a user-supplied arbitrary tree.
            $allowed = [IO.Path]::GetFullPath($versions).TrimEnd('\') + '\'
            if (-not ([IO.Path]::GetFullPath($stage).StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) -or -not ([IO.Path]::GetFullPath($destination).StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase))) { throw 'Invalid installation path.' }
            # Copy the verified payload instead of renaming an extracted Windows tree.
            New-Item -ItemType Directory -Path $destination | Out-Null
            Copy-Item -LiteralPath (Join-Path $stage 'app'), $runtime -Destination $destination -Recurse
        }
        $reported = & (Join-Path $destination 'runtime/node.exe') (Join-Path $destination 'app/dist/main.js') --version
        if ($LASTEXITCODE -ne 0 -or $reported -ne $release) { throw 'Existing version is incomplete. It has not been activated.' }
        Copy-Item -LiteralPath (Join-Path $destination 'app/uninstall.ps1') -Destination (Join-Path $root 'uninstall.ps1') -Force
        $launcher = "@echo off`r`n`"%~dp0..\versions\$release\runtime\node.exe`" `"%~dp0..\versions\$release\app\dist\main.js`" %*`r`n"
        [IO.File]::WriteAllText((Join-Path $bin 'aivoice.cmd'), $launcher, [Text.Encoding]::ASCII)
        [IO.File]::WriteAllText((Join-Path $root '.aivoice-install'), $release)
        if (-not $NoPath) {
            $userPath = [string][Environment]::GetEnvironmentVariable('Path', 'User')
            if (($userPath -split ';') -notcontains $bin) { [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $bin).TrimStart(';'), 'User') }
            if (($env:Path -split ';') -notcontains $bin) { $env:Path = $bin + ';' + $env:Path }
        }
        Write-Host "Installed AIVoice $release. Run: aivoice --version, then aivoice login"
        Write-Host "Location: $root"
    } finally {
        if (Test-Path -LiteralPath $stage) {
            $allowed = [IO.Path]::GetFullPath($versions).TrimEnd('\') + '\.staging-'
            if ([IO.Path]::GetFullPath($stage).StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $stage -Recurse -Force }
        }
    }
}

Install-AIVoice -BaseUrl $BaseUrl.TrimEnd('/') -InstallDir $InstallDir -NoPath:$NoPath
