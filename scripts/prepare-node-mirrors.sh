#!/bin/sh
set -eu

# Download original Node.js release archives once to serve future CLI installers.
# Values come from the installed CLI release checksum file, which pins official SHA256.
cd "$(dirname "$0")/.."
checksums='downloads/SHA256SUMS-CLI-0.3.1'
[ -f "$checksums" ] || { echo '缺少 CLI 0.3.1 校验清单，请先上传新版 downloads 文件。' >&2; exit 1; }
if [ "$#" -eq 0 ]; then
  set -- node-v24.18.0-win-x64.zip node-v24.18.0-win-arm64.zip \
    node-v24.18.0-linux-x64.tar.xz node-v24.18.0-linux-arm64.tar.xz \
    node-v24.18.0-darwin-x64.tar.gz node-v24.18.0-darwin-arm64.tar.gz
fi
for name do
  case "$name" in
    node-v24.18.0-win-x64.zip|node-v24.18.0-win-arm64.zip|node-v24.18.0-linux-x64.tar.xz|node-v24.18.0-linux-arm64.tar.xz|node-v24.18.0-darwin-x64.tar.gz|node-v24.18.0-darwin-arm64.tar.gz) ;;
    *) echo "不支持的运行环境文件：$name" >&2; exit 1;;
  esac
  expected=$(awk -v name="$name" '$2==name {print $1}' "$checksums")
  case "$expected" in *[!0-9a-f]*|'') echo "校验值无效：$name" >&2; exit 1;; esac
  [ "${#expected}" -eq 64 ] || { echo "校验值无效：$name" >&2; exit 1; }
  destination="downloads/$name"
  if [ -f "$destination" ]; then
    actual=$(sha256sum "$destination" | awk '{print $1}')
    [ "$actual" = "$expected" ] || { echo "已有文件校验不通过，请检查：$destination" >&2; exit 1; }
    printf '已存在且校验通过：%s\n' "$name"
    continue
  fi
  printf '下载 Node.js 官方运行环境：%s\n' "$name"
  # A partial file can be resumed on a subsequent run after a connection failure.
  part="$destination.part"
  if [ -f "$part" ] && [ "$(sha256sum "$part" | awk '{print $1}')" = "$expected" ]; then
    mv "$part" "$destination"
    printf '已完成文件校验通过：%s\n' "$name"
    continue
  fi
  if [ -f "$part" ]; then
    curl -fL --progress-bar --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 1800 -C - -o "$part" "https://nodejs.org/dist/v24.18.0/$name"
  else
    curl -fL --progress-bar --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 1800 -o "$part" "https://nodejs.org/dist/v24.18.0/$name"
  fi
  actual=$(sha256sum "$part" | awk '{print $1}')
  [ "$actual" = "$expected" ] || { echo "校验不通过，请检查下载文件：$part" >&2; exit 1; }
  mv "$part" "$destination"
  printf '下载及校验完成：%s\n' "$name"
done
echo '运行环境镜像准备完成；如服务使用 Docker 构建，还需重建原有 MCP 镜像。'
