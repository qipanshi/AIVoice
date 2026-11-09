# 安装、更新与卸载

简体中文 | [English](installers.en.md) · [项目首页](../README.md)

使用官网安装脚本。无需发布 npm 包，也不要求使用者有 npm 账号、Node.js 或 npm。

## 用户入口

Windows PowerShell：
```powershell
irm https://open.qipanshi.com/install.ps1 | iex
```

macOS/Linux：
```sh
curl -fsSL https://open.qipanshi.com/install.sh | sh
```

脚本运行后先校验文件 SHA256，再检验 CLI 版本，成功才更新启动器。默认目录：
- Windows：%LOCALAPPDATA%/AIVoice，用户 PATH 添加 bin 子目录。
- macOS/Linux：~/.local/share/aivoice，向对应 .zshrc / .bashrc / .profile 添加 PATH。

Windows 使用系统自带 curl.exe（支持版本的 Windows 10/11）；无需管理员权限，不改系统 Node.js。CLI 权限凭证仍在 ~/.aivoice，与程序安装目录分离。安装优先从开放平台下载相应运行环境；平台未配置对应文件时，安装器会提示并尝试 Node.js 官方下载站。Windows 已有安装若包含哈希与官方一致的相同版本运行环境，可复用而无需重复下载。下载、校验、解压和启用均显示阶段提示。Linux 需满足官方 Node 24 的 glibc/运行环境要求（不是 Alpine/musl 专用构建），系统需有 curl、tar、SHA256 工具，Linux tar 需能解 xz。

## 分发内容和维护者构建

应用包是平台无关的 JavaScript 与锁定的生产依赖；Node 运行时优先由开放平台镜像提供，也可从 nodejs.org 下载，校验值固定在 cli/runtime-checksums.json。没有使用用户系统 npm。程序包内保留依赖许可证，运行时也保留官方 LICENSE。

维护者可在 MCP 服务器的 server 目录运行 `sh scripts/prepare-node-mirrors.sh`，逐一从 Node.js 官方站下载并核验全部六种受支持的系统/架构文件；加具体文件名可只准备指定平台。文件位于 downloads/，Docker 部署需随后重建镜像才能对外提供。服务未准备对应镜像时，安装器回退到官方站点，不保证其网络速度。为避免将约数百 MB 的运行时归入开源代码仓库，不应把这些镜像文件提交到 GitHub。

若 downloads/ 已包含匹配版本的应用包，可直接用于构建服务镜像。后续修改 CLI 时：
1. 在 cli/ 执行 npm ci --ignore-scripts、npm run build。
2. 构建临时 npm 包，使用隔离目录安装生产依赖，禁止使用开发目录里混入私有依赖的 node_modules。
3. 从 server/ 执行以下开发构建命令，Python 3 和开发者 npm 只用于打包，不是用户安装前提：

```sh
cd cli
npm pack --ignore-scripts --pack-destination ../downloads
cd ..
npm install --prefix ../cli-distribution-build ./downloads/aivoice-mcp-cli-0.3.1.tgz --ignore-scripts --omit=dev
python scripts/build-cli-distribution.py ../cli-distribution-build/node_modules
```

生成 aivoice-cli-0.3.1.zip、aivoice-cli-0.3.1.tar.gz、SHA256SUMS-CLI-0.3.1。压缩包是安装脚本内部实现，不要求用户手工处理。版本改变时同时更新脚本版本、CLI 版本、文档和清单；Node 版本改变必须重新核对官方校验值。

## 更新与回退

新版本发布后重新执行同一安装命令。新版本先装到独立 versions/<版本>，验证成功才更新 bin 启动器，旧版本保留。失败时保留原启动器。

需要回退时，运行旧版本目录中的 runtime/node 与 app/dist/main.js 即可先验证。再把启动器的版本路径改回已保留版本；不恢复旧凭证快照。实际可回退的版本以本机已保留目录为准。

## 卸载

先关闭正在使用 AIVoice CLI 的工作台或终端任务，然后运行安装器放在本机的卸载脚本，无需联网。

Windows PowerShell：

```powershell
& "$env:LOCALAPPDATA\AIVoice\uninstall.ps1"
```

macOS / Linux：

```sh
sh "$HOME/.local/share/aivoice/uninstall.sh"
```

使用自定义安装目录时，Windows 为该脚本提供 `-InstallDir`；macOS/Linux 设置 `AIVOICE_INSTALL_DIR`。卸载器清理安装器管理的版本和命令入口，并移除安装时添加的用户 PATH 项；重新打开终端后生效。个人凭证和远端授权均会保留。用户自己添加到安装目录的其他文件不会被当作程序删除。尚未包含卸载脚本的旧版，可以先更新，或按版本目录手工移除程序。

如需同时撤销当前 profile 的远端授权，请先执行 `aivoice logout`；也可在声掌门小程序中解除应用授权。`logout --local` 只删除对应的本地凭证，不代表远端授权已撤销。

## 验证边界

CLI 0.3.1 的 Windows x64 安装已在隔离目录使用本机模拟下载源验证复用、全新安装和错误校验值；公网分发和最终用户机器仍需在对应版本部署后实测。macOS/Linux 脚本已过语法与代码核对，尚未在目标系统实机安装；ARM64 也待实机验证。不能把官方存在下载包等同于本项目已在该系统完成验收。脚本不包含自动更新后台服务。

