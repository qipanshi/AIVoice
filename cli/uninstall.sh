#!/bin/sh
set -eu
install_root=${AIVOICE_INSTALL_DIR:-"$HOME/.local/share/aivoice"}
[ -f "$install_root/.aivoice-install" ] && [ -d "$install_root/versions" ] || { echo '未找到安装器创建的 AIVoice 安装目录。' >&2; exit 1; }
[ ! -L "$install_root" ] && [ ! -L "$install_root/versions" ] || { echo '安装目录包含链接，无法安全自动卸载。' >&2; exit 1; }
root=$(cd -P "$install_root" && pwd -P)
versions=$(cd -P "$root/versions" && pwd -P)
[ "$versions" = "$root/versions" ] || exit 1
if [ -n "${AIVOICE_CONFIG_DIR:-}" ] && [ -d "$AIVOICE_CONFIG_DIR" ]; then
  credentials=$(cd -P "$AIVOICE_CONFIG_DIR" && pwd -P)
  case "$credentials/" in "$versions/"*) echo '本地凭证位于程序版本目录，请先移出再卸载。' >&2; exit 1;; esac
fi
echo '正在卸载 AIVoice 程序...'
for dir in "$versions"/*; do
  [ -d "$dir" ] && [ ! -L "$dir" ] || continue
  case "${dir##*/}" in *[!0-9A-Za-z.+-]*|'') continue;; esac
  [ -f "$dir/app/package.json" ] || continue
  grep -Eq '"name"[[:space:]]*:[[:space:]]*"aivoice-mcp-cli"' "$dir/app/package.json" || continue
  resolved=$(cd -P "$dir" && pwd -P)
  case "$resolved/" in "$versions/"*) ;; *) continue;; esac
  [ -z "$(find "$resolved" -type l -print -quit)" ] || { echo '程序目录中存在链接，无法安全自动卸载。' >&2; exit 1; }
  rm -rf -- "$resolved"
done
rm -f -- "$root/bin/aivoice" "$root/.aivoice-install"
if [ "${AIVOICE_NO_PATH:-0}" != 1 ]; then
  for profile in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
    if [ -f "$profile" ]; then
      path_line="export PATH='$root/bin':\$PATH"
      if grep -Fqx "$path_line" "$profile"; then
        temp=$(mktemp "${profile}.aivoice.XXXXXXXX")
        cp -p "$profile" "$temp"
        awk -v target="$path_line" '$0 == "# AIVoice CLI" {pending=1;next} pending {if($0 != target) print "# AIVoice CLI";pending=0} $0 != target {print} END {if(pending) print "# AIVoice CLI"}' "$profile" > "$temp"
        mv "$temp" "$profile"
      fi
    fi
  done
fi
rm -f -- "$root/uninstall.sh"
rmdir "$versions" "$root/bin" "$root" 2>/dev/null || true
echo 'AIVoice 程序已卸载，本地凭证和远端授权已保留。请重新打开终端。'
