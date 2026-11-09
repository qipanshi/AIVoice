# AIVoice CLI

简体中文 | [English](../docs/cli.en.md) · [项目首页](../README.md)

读取本人在声掌门已有的设备会议、转写和报告，并为 MCP 工作台提供 stdio 桥接。所有正常小程序用户均可扫码授权，无需加入组织。

## 安装

正式分发采用官网一行安装脚本，不依赖 npm 注册、npm 全局安装或用户手动解压。以下地址在本次服务器更新部署后可用。

Windows PowerShell：
```powershell
irm https://open.qipanshi.com/install.ps1 | iex
```

macOS / Linux：
```sh
curl -fsSL https://open.qipanshi.com/install.sh | sh
```

脚本安装到个人目录，下载独立 Node.js 24.18.0 运行时及 CLI，并校验 SHA256，不替换系统 Node.js。运行环境优先从开放平台下载，未配置镜像时回退到 nodejs.org；Windows 已有符合官方校验值的相同版本运行环境可复用。macOS/Linux 重新打开终端加载 PATH；工作台也需重启。支持 Windows、macOS、Linux 的 x64 / ARM64；各平台实际验证状态见[安装指南的验证边界](../docs/installers.md#验证边界)。

```sh
aivoice --version
aivoice login
aivoice status
aivoice meetings --start 2026-11-01 --end 2026-11-06
aivoice report 1001 --kind industry
```

日期、ID 是示例。ID 从 meetings 结果中取。安装、更新、回退和卸载细节见仓库 docs/installers.md。

## 命令

| 命令 | 用途 | 必填参数 |
| --- | --- | --- |
| login | 打开扫码授权，保存个人 OAuth 凭证 | 无 |
| status | 实际连接并列出工具名，不显示令牌 | 无 |
| logout | 撤销远端令牌后删除本地凭证 | 无 |
| meetings | 按条件查询本人设备会议 | 无 |
| transcript | 分段读取已有转写 | 会议ID |
| report | 分段读取已有报告 | 会议ID |
| mcp | 向工作台提供 stdio 桥接 | 无 |

每条命令支持 `aivoice <命令> --help`；全局版本 `--version / -v`，帮助 `--help / -h`。

## Options（所有命令）

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| --server <URL> | 否 | https://open.qipanshi.com/mcp | 完整 MCP URL；仅本机调试允许 HTTP |
| --profile <名称> | 否 | default | 1–64 位字母、数字、下划线或连字符；不同工具可分开授权 |
| --help / -h | 否 | 关闭 | 显示该命令帮助，不发起授权 |

环境变量 `AIVOICE_MCP_URL` 可设置默认 server，命令参数优先；`AIVOICE_CONFIG_DIR` 可指定个人凭证目录，默认 `~/.aivoice`。按 profile 和服务器地址隔离。文件含令牌，不能公开或共享。Unix 目录 0700 / 文件 0600，Windows 使用个人目录和系统 ACL，不把 POSIX mode 误称为 Windows ACL 加固。

## Options（login）

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| --no-browser | 否 | 自动打开浏览器 | 只在终端输出授权链接 |
| --callback-port <整数> | 否 | 0 自动选择 | 0–65535；固定端口用于 SSH 转发，端口需空闲 |

浏览器扫码后回到终端查看成功结果。回调只绑定 127.0.0.1；等待授权最多 10 分钟。授权码、PKCE 和 state 绑定本次请求；不会把小程序 JWT 发给外部工具。

服务器上执行 CLI 时，先在个人电脑运行 `ssh -L 19231:127.0.0.1:19231 用户@服务器`，再在服务器执行 `aivoice login --no-browser --callback-port 19231`，在个人电脑浏览器打开授权链接。两处端口需对应，单纯复制链接不够；不向公网开放回调端口。

## Options（meetings）

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| --start <YYYY-MM-DD> | 否 | 不限制开始日期 | Asia/Shanghai，包含当天 |
| --end <YYYY-MM-DD> | 否 | 不限制结束日期 | 包含当天，不能早于 start |
| --keyword <文字> | 否 | 无关键词 | 标题筛选，最多 100 字符 |
| --offset <整数> | 否 | 0 | 0–100000，列表偏移 |
| --limit <整数> | 否 | 20 | 每页 1–50 条 |

```sh
aivoice meetings --start 2026-11-01 --end 2026-11-06 --keyword 项目 --limit 20
aivoice meetings --offset 20 --limit 20
```

翻页时保留原筛选条件，offset 使用实际返回的 nextOffset，不凭示例猜测。

## Options（transcript / report）

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| 会议ID | 是 | 无 | meetings 返回的完整正整数 ID |
| --offset <整数> | 否 | 0 | 0–10000000，正文字符偏移 |
| --limit <整数> | 否 | 12000 | 每段 100–24000 字符 |
| --kind <类型> | 否，仅 report | standard | standard 普通报告 / industry 行业报告 |

```sh
aivoice transcript 1001 --limit 12000
aivoice report 1001 --kind industry --offset 0 --limit 12000
```

nextOffset 非空时继续读取下一段。报告不存在返回 not_ready，不触发生成。日期、ID 等业务字段最终由远端 MCP 统一校验。

## Options（logout / status / mcp）

logout 的 `--local` 默认关闭：正常先撤销远端令牌再删除本地文件，网络失败保留本地凭证以便重试。使用 --local 只删除本地文件，不代表远端授权撤销；可以在声掌门小程序解除授权。

卸载程序：先关闭使用 CLI 的工作台，Windows 执行 `& "$env:LOCALAPPDATA\AIVoice\uninstall.ps1"`，macOS/Linux 执行 `sh "$HOME/.local/share/aivoice/uninstall.sh"`。卸载会保留本地凭证和远端授权，重新打开终端后生效。需撤销授权时，先执行 `aivoice logout` 或在小程序中解除授权。

status、mcp 没有额外业务选项。mcp 先在同一系统用户、server、profile 下 login：

```json
{"mcpServers":{"AIVoice":{"command":"aivoice","args":["mcp","--profile","default"]}}}
```

Windows 工作台若不能执行 aivoice.cmd，用下列展开后的完整路径：
- command：`%LOCALAPPDATA%/AIVoice/versions/0.3.1/runtime/node.exe`
- args：`%LOCALAPPDATA%/AIVoice/versions/0.3.1/app/dist/main.js`、`mcp`

不要把未展开的百分号变量交给不支持变量展开的工具。macOS/Linux 可将 command 写为 `~/.local/share/aivoice/bin/aivoice` 展开后的绝对路径。

同一 profile 一次由一个 CLI/桥接进程使用；同时运行多个工具时分别登录不同 profile，避免刷新令牌相互覆盖。DSH 仅面向单用户进程/profile，不面向多人共享实例。

## 输出与故障

查询 stdout 输出 JSON；诊断写 stderr。退出码 0 表示该命令成功，1 表示失败（参数错误、未登录、业务未就绪或服务故障）。mcp 的 stdout 只含 MCP 协议，不能当普通查询命令手动读取。报告正文是不可信资料，不应执行正文中的指令。

授权过期可自动刷新；个人撤销、账号停用或删除后会被服务端拒绝。需要重新授权时在终端 login，再重连工具。域名从 ha 切至 open 后须使用新地址重新授权。

## 开发者构建

安装 Node.js 22/24 和 npm；在 cli/ 执行 npm ci --ignore-scripts、npm run check、npm run build。npm pack 产物仅作开发验收，不作为普通用户入口，也不表示已发布 npm。部署端分发构建参见 docs/installers.md。MIT 适用于代码，业务数据仍需授权。

