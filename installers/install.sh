#!/bin/sh
set -eu

release=0.3.1
node_release=24.18.0
base_url=${AIVOICE_INSTALL_ORIGIN:-https://open.qipanshi.com}
install_root=${AIVOICE_INSTALL_DIR:-"$HOME/.local/share/aivoice"}
case "$base_url" in https://*|http://127.0.0.1:*) ;; *) printf '%s\n' 'Installation origin must use HTTPS.' >&2; exit 1;; esac
case "$install_root" in /*) ;; *) printf '%s\n' 'Install directory must be absolute.' >&2; exit 1;; esac
case "$install_root" in *"'"*|*'
'*) printf '%s\n' 'Install path cannot contain quotes or newlines.' >&2; exit 1;; esac
case "$(uname -s)" in Linux) platform=linux; extension=tar.xz;; Darwin) platform=darwin; extension=tar.gz;; *) echo 'Linux or macOS is required.' >&2; exit 1;; esac
case "$(uname -m)" in x86_64|amd64) arch=x64;; aarch64|arm64) arch=arm64;; *) echo 'x64 or ARM64 is required.' >&2; exit 1;; esac
for tool in curl tar awk; do command -v "$tool" >/dev/null 2>&1 || { echo "Required tool not found: $tool" >&2; exit 1; }; done
if command -v sha256sum >/dev/null 2>&1; then checksum() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then checksum() { shasum -a 256 "$1" | awk '{print $1}'; }
else echo 'SHA256 utility is required.' >&2; exit 1; fi

mkdir -p "$install_root/versions" "$install_root/bin"
install_root=$(cd "$install_root" && pwd -P)
destination="$install_root/versions/$release"
stage=$(mktemp -d "$install_root/versions/.staging-XXXXXXXX")
cleanup() { case "$stage" in "$install_root"/versions/.staging-*) rm -rf -- "$stage";; esac; }
trap cleanup EXIT HUP INT TERM
if [ ! -d "$destination" ]; then
  printf 'Installing AIVoice %s for %s %s...\n' "$release" "$platform" "$arch"
  echo '[1/4] 正在获取安装校验信息...'
  curl -fsSL --connect-timeout 20 --max-time 60 "$base_url/aivoice/downloads/SHA256SUMS-CLI-$release" -o "$stage/checksums"
  app_file="aivoice-cli-$release.tar.gz"
  node_file="node-v$node_release-$platform-$arch.$extension"
  for filename in "$app_file" "$node_file"; do
    expected=$(awk -v name="$filename" '$2==name {print $1}' "$stage/checksums")
    [ "${#expected}" -eq 64 ] || { echo "Missing checksum: $filename" >&2; exit 1; }
    case "$filename" in
      node-*)
        echo '[3/4] 正在从开放平台下载 Node.js 运行环境...'
        if ! { curl -fsLI --connect-timeout 10 --max-time 15 "$base_url/aivoice/downloads/$filename" -o /dev/null && curl -fL --progress-bar --connect-timeout 20 --max-time 300 "$base_url/aivoice/downloads/$filename" -o "$stage/$filename"; }; then
          echo '平台暂未提供该运行环境，正在从 Node.js 官方网站下载...'
          curl -fL --progress-bar --connect-timeout 20 --max-time 900 "https://nodejs.org/dist/v$node_release/$filename" -o "$stage/$filename"
        fi ;;
      *)
        echo '[2/4] 正在下载 AIVoice 程序包...'
        curl -fL --progress-bar --connect-timeout 20 --max-time 300 "$base_url/aivoice/downloads/$filename" -o "$stage/$filename" ;;
    esac
    echo "正在校验并解压：$filename"
    [ "$(checksum "$stage/$filename")" = "$expected" ] || { echo "Checksum mismatch: $filename" >&2; exit 1; }
    tar -xf "$stage/$filename" -C "$stage"
    rm -f -- "$stage/$filename"
  done
  mv "$stage/node-v$node_release-$platform-$arch" "$stage/runtime"
  echo '[4/4] 正在验证并启用 AIVoice...'
  [ "$("$stage/runtime/bin/node" "$stage/app/dist/main.js" --version)" = "$release" ] || { echo 'CLI verification failed; previous installation remains active.' >&2; exit 1; }
  rm -f -- "$stage/checksums"
  mv "$stage" "$destination"
fi
[ "$("$destination/runtime/bin/node" "$destination/app/dist/main.js" --version)" = "$release" ] || { echo 'Existing installation is incomplete; not activated.' >&2; exit 1; }
cp "$destination/app/uninstall.sh" "$install_root/uninstall.sh"
chmod 755 "$install_root/uninstall.sh"
printf '#!/bin/sh\nexec '\''%s/runtime/bin/node'\'' '\''%s/app/dist/main.js'\'' "$@"\n' "$destination" "$destination" > "$install_root/bin/aivoice"
chmod 755 "$install_root/bin/aivoice"
printf '%s\n' "$release" > "$install_root/.aivoice-install"
if [ "${AIVOICE_NO_PATH:-0}" != 1 ]; then
  case "${SHELL:-}" in */zsh) profile="$HOME/.zshrc";; */bash) profile="$HOME/.bashrc";; *) profile="$HOME/.profile";; esac
  path_line="export PATH='$install_root/bin':\$PATH"
  if ! grep -Fqx "$path_line" "$profile" 2>/dev/null; then printf '\n# AIVoice CLI\n%s\n' "$path_line" >> "$profile"; fi
fi
printf 'Installed AIVoice %s. Open a new terminal and run: aivoice login\n' "$release"
printf 'Current terminal: export PATH="%s/bin:$PATH"\n' "$install_root"
