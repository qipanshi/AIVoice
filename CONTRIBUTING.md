# 参与贡献

简体中文 | [English](CONTRIBUTING.en.md)

欢迎提交问题说明和改进建议。请围绕 AIVoice 的当前范围：通过 MCP、CLI 或 stdio 读取本人已有设备成果。

## 提交问题

说明操作系统、客户端名称与版本、AIVoice 版本、复现步骤、预期行为与实际结果。日志应先脱敏，不要附带令牌、桥接密钥、微信标识或真实会议内容。安全问题请按 [安全说明](SECURITY.md)私下报告。

## 开发与检查

在仓库根目录使用 Node.js 24：

```sh
npm ci
npm run check
npm run build
npm run build:cli
```

只运行改动相关的现有检查：授权模块使用 `npm run test:auth`；持久化模块使用 `npm run test:store`；CLI 先构建再运行 `npm run test:cli`。安装与卸载脚本的针对性用例位于 `tests/`。部分用例需要 Windows PowerShell、Git Bash 或已校验的 Node.js 运行环境；缺少环境时跳过并说明，不把跳过作为通过。

测试使用隔离目录和模拟业务资料。不要将私人业务数据库或真实账号凭证加入测试；这份源码不能独立提供声掌门私有适配后台。

## 提交改动

- 保持修改范围清楚，在 PR 中说明问题、行为变化、检查结果和未验证项。
- 新增或变更命令参数时同步中文、英文文档和帮助信息。
- `.sh` 文件保留 LF 换行；Windows 安装脚本中的中文需保留兼容 PowerShell 5 的编码。
- 修改 CLI 分发时同步版本、安装脚本、当前安装包及校验清单，具体见[安装与分发](docs/installers.md)。
- 不提交真实 `.env`、私有业务集成、认证数据库、个人凭证、日志、Node.js 镜像或历史安装包。

本项目代码使用 [MIT 许可证](LICENSE)；提交第三方内容时须保留对应许可，并确认有权贡献该内容。
