# 客户端接入

简体中文 | [English](clients.en.md) · [项目首页](../README.md)

## 选择接入方式

| 客户端支持情况 | 使用方式 |
| --- | --- |
| 支持 Streamable HTTP、MCP OAuth 发现及授权流程 | 添加 `https://open.qipanshi.com/mcp`，按客户端提示完成个人授权。 |
| 能启动 stdio MCP 程序，但不能完成远程 OAuth | 在工作台运行所在的机器安装 CLI，先 `aivoice login`，再配置 `aivoice mcp`。 |
| 只有 HTTP URL 和静态请求头 | 不能仅凭界面判断它支持自动 OAuth；需查阅其当前版本文档或使用支持 stdio 的方式。 |

这里的 HTTP 指 MCP Streamable HTTP，不能由一个 URL 输入框或旧式 SSE 选项推断兼容性。客户端的授权跳转、令牌刷新、配置格式及操作因产品和版本而异。

## stdio 示例

```json
{
  "mcpServers": {
    "AIVoice": { "command": "aivoice", "args": ["mcp", "--profile", "default"] }
  }
}
```

上述 JSON 仅为常见格式示例，实际字段以客户端文档为准。先在工作台**运行所在机器**、同一系统用户及 profile 执行 `aivoice login`。Windows 客户端若不能执行 `.cmd`，请按 [CLI 文档](../cli/README.md)填写展开后的 Node 与脚本绝对路径。多个进程同时使用时使用不同 profile，避免相互覆盖刷新令牌。

工作台运行在服务器时，stdio 也运行在服务器，不能自动读取用户电脑上的凭证。当前讨论及实现面向单用户进程/profile，不将一个共享的工作台进程作为多用户隔离方案。

## 已知验证范围

维护者曾在测试环境验证 CLI、WorkBuddy 接入和本人会议读取；具体结果取决于实际部署版本及客户端版本，不代表所有产品或版本都经过验证。千问工作、豆包工作、DSH 及其他客户端应以其版本实际支持的能力和现场测试为准。

建议验证：连接 → 个人扫码确认 → 本人已有记录读取 → 刷新或重连 → 解除授权后拒绝；使用两个测试账号核对不能读取对方成果。授权撤销不会删除客户端已经取得的内容。
