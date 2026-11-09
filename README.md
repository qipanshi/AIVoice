# AIVoice

<img src="assets/qipanshi_mcp.jpg" alt="AIVoice" width="88">

简体中文 | [English](README.en.md)

[接入平台](https://open.qipanshi.com/) · [CLI 参数](cli/README.md) · [参与贡献](CONTRIBUTING.md) · [变更记录](CHANGELOG.md)

AIVoice 连接声掌门与支持 MCP 的 AI 工具，让用户在授权后读取**本人使用声掌门设备产生、已经保存的会议记录、转写和报告**。本仓库包含 MCP 服务和命令行工具（CLI / stdio 桥接）。

例如，用户可以在已连接的助手中提出“总结我这周的会议并整理待办”。AIVoice 返回已有资料，如何归纳由使用者的 AI 助手决定。

## 能做什么

| 能力 | 说明 |
| --- | --- |
| MCP | 使用 Streamable HTTP 连接服务，完成个人授权后调用只读工具。 |
| CLI | 在终端查询会议、读取已有转写和报告；也可通过 stdio 为工作台连接 MCP。 |
| 个人授权 | 在声掌门小程序中确认本人账号和授权范围，并可在小程序中解除授权。 |

**数据范围：**只读取当前授权用户本人的已有设备成果；不会上传录音、启动转写、生成报告、修改或删除内容。此处的开源代码许可不赋予声掌门账号或业务数据的访问权限。

## 快速开始：MCP

1. 在支持 **Streamable HTTP 和 MCP OAuth 授权流程**的客户端中添加：

   ```text
   https://open.qipanshi.com/mcp
   ```

2. 按客户端提示打开授权页，用微信扫描页面上的小程序码，在声掌门中核对账号与权限后确认。
3. 授权完成后返回客户端，尝试读取自己的会议记录。不同产品和版本的配置位置可能不同；只有填写 HTTP 地址和自定义请求头的界面，不代表一定支持 OAuth。

如果客户端不能直接完成 OAuth，但支持启动本地 stdio MCP 程序，可以使用下方 CLI 桥接。具体操作参见[客户端接入](docs/clients.md)。

## 快速开始：CLI

Windows PowerShell：

```powershell
irm https://open.qipanshi.com/install.ps1 | iex
```

macOS / Linux：

```sh
curl -fsSL https://open.qipanshi.com/install.sh | sh
```

安装脚本准备独立 Node.js 运行环境，不替换系统 Node.js。首次安装需要网络；重新打开终端后：

```sh
aivoice --version
aivoice login
aivoice status
aivoice meetings --limit 5
aivoice report 1001
```

`1001` 仅是示例，应替换为会议列表返回的 ID。安装脚本及 CLI 更新需要服务运营方先完成相应版本部署；**本仓库包含的代码不代表线上已经更新**。详细参数、授权、卸载及 stdio 配置见 [CLI 中文文档](cli/README.md) / [CLI guide in English](docs/cli.en.md)。

stdio 示例（客户端配置格式按其产品文档调整）：

```json
{
  "mcpServers": {
    "AIVoice": { "command": "aivoice", "args": ["mcp"] }
  }
}
```

先在运行工作台的机器、同一系统用户和 profile 下执行 `aivoice login`；不要把令牌写入共享配置。Windows 中部分工作台可能需要填写展开后的 Node 和脚本完整路径，参见 CLI 文档。

## MCP 工具

| 工具 | 用途 | 主要参数 |
| --- | --- | --- |
| `list_meetings` | 查询本人会议列表 | `startDate`、`endDate`、`keyword`、`offset`、`limit` |
| `get_transcript` | 分段读取已有转写 | `meetingId`、`offset`、`limit` |
| `get_report` | 分段读取已有报告 | `meetingId`、`kind`（`standard` / `industry`）、`offset`、`limit` |

日期按 `Asia/Shanghai` 解释并包含起止日。列表默认 20 条、最多 50 条；正文默认每段 12,000 字符、最多 24,000 字符。返回 `nextOffset` 时应保留筛选条件并继续分页；报告未就绪时不会触发生成。

## 本地开发与部署

当前仓库包含 MCP 服务 **0.3.0** 和 CLI **0.3.1**；两者使用独立版本。当前 CLI 的 ZIP、tar.gz 及校验清单位于 `downloads/`，Node.js 运行环境镜像不提交仓库。

服务端开发需要 Node.js 24 和 npm：

```sh
npm ci
npm run check
npm run build
npm run build:cli
```

本仓库的 MCP 服务需要配置可用的业务适配后台才能完成真实账号授权和数据读取。声掌门私有业务后台、小程序及数据库不属于此仓库；自行部署本仓库不自动获得官方数据或账号。服务示例、反向代理和环境变量见[部署文档](docs/deployment.md)，交互与适配边界见[架构说明](docs/architecture.md)。

## 安全与反馈

不要在 issue、截图或配置示例中公开令牌、密钥和个人会议内容。安全问题请发送至 [friend_rrw@163.com](mailto:friend_rrw@163.com)，并参阅 [SECURITY.md](SECURITY.md)。

[开放平台](https://open.qipanshi.com/) · [CLI 参数](cli/README.md) · [客户端说明](docs/clients.md) · [安全说明](SECURITY.md)

## 许可证

[MIT](LICENSE)。第三方依赖遵循各自许可证；连接声掌门服务仍需有效账号、个人授权及服务端权限校验。
