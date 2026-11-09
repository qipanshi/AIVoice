# 变更记录 / Changelog

这里记录仓库包含的源码变化，不代表对应版本已部署到官方服务或发布至 npm。

These entries describe source changes in this repository, not deployment to the hosted service or publication to npm.

## CLI 0.3.1

- 安装进度提示、Windows 相同版本运行环境校验复用、平台运行环境镜像与官方回退。
- 授权结果页面在令牌交换和保存成功后显示；增加保留凭证及授权的本地卸载脚本。
- Install progress, verified Windows runtime reuse, platform-hosted runtime archives and official fallback.
- Styled authorization result pages after successful token exchange and storage; local uninstall scripts that preserve credentials and grants.

## MCP 0.3.0 / CLI 0.3.0

- 面向正常的小程序用户个人授权，不再要求组织或组织管理员；保留本人已有设备成果的读取边界。
- 服务地址改为 `https://open.qipanshi.com/mcp`，项目名称为 AIVoice。
- Personal authorization for eligible mini-program users without requiring an organization or administrator role; access remains limited to the user's own existing device results.
- Service endpoint changed to `https://open.qipanshi.com/mcp`, with AIVoice branding.

## MCP / CLI 0.2.0

- 增加 CLI 查询、stdio 桥接、个人 OAuth 登录及开放平台接入说明。
- Added CLI queries, a stdio bridge, personal OAuth login, and integration guidance.
