# MCP 服务部署

简体中文 | [English](deployment.en.md) · [项目首页](../README.md)

本文面向部署和维护人员。普通用户接入现有服务，请看[首页](../README.md)或 [CLI 指南](../cli/README.md)。

## 部署前提

- Node.js 24 开发环境，或 Docker 与 Docker Compose。
- 可供客户端访问的 HTTPS 域名和证书，及可用的反向代理。
- 实现 [业务适配契约](architecture.md) 的后台：负责账号确认、微信小程序码、授权确认和按本人设备成果进行只读查询。声掌门私有后台、小程序及其数据库不包含在本仓库；没有适配后台时，单独部署 MCP 不构成完整可用的官方服务。
- 双方约定的桥接密钥与对应配置，以及用于持久化 OAuth 数据的独立安全存储。

同一套 MCP 服务可部署在单独服务器，也可以与其他服务共用服务器。先核对现有域名、端口、代理路由与存储，避免覆盖既有配置。

## 配置

从 `deploy/.env.example` 创建部署环境文件，并为现场填写：

| 变量 | 作用 |
| --- | --- |
| `AIVOICE_PUBLIC_ORIGIN` | 客户端访问此服务的 HTTPS origin，例如 `https://your-domain.example`；不要带 `/mcp`。 |
| `AIVOICE_BACKEND_ORIGIN` | 对应业务适配后台的 HTTPS origin。 |
| `AIVOICE_BRIDGE_SECRET` | 服务与适配后台约定的随机密钥，至少 32 字节。 |
| `AIVOICE_ALLOWED_ORIGINS` | 浏览器型客户端允许跨域时，按需填写明确来源；一般桌面客户端留空。 |

真实环境文件、桥接密钥、个人令牌和 OAuth SQLite 数据不得提交仓库或发给第三方。不要将测试用户授权直接当作生产授权使用。

## Docker Compose

`Dockerfile` 构建服务时会复制 `assets/`、`public/`、`installers/` 和 `downloads/`。构建前需确保它们包含拟发布版本的对应资源；CLI 分发文件生成方式见[安装与分发](installers.md)。

在仓库根目录，配置完成后运行：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml build aivoice-mcp
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --no-deps aivoice-mcp
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
curl -fsS http://127.0.0.1:18620/health
```

示例将服务仅绑定到本机 `127.0.0.1:18620`，并通过命名卷持久化 OAuth 状态。请按实际部署管理卷、限制访问并制定备份策略；不要删除认证卷来更新服务。

## HTTPS 与验证

把 `deploy/nginx-locations.conf.example` 所需规则合并进已有 HTTPS 站点；先检查规则是否冲突，再测试并重载**目标**反向代理。不要直接覆盖其他应用的站点配置。对应主机名和证书由部署者自行提供。

部署后核对：`/health` 本机返回 `UP`；公网发现地址返回与新域名一致的元数据；未授权请求 `/mcp` 返回 401 及 `WWW-Authenticate`。随后使用测试账号按顺序验证授权、本人数据读取、他人数据隔离及授权撤销。不同客户端和微信环境需分别实测。

## 回退

预先保留可运行的上一版本镜像和必要的部署配置。如果新版本异常，按部署环境恢复旧镜像并核对健康状态。保留当前 OAuth 数据卷，避免通过还原历史授权数据重新启用已撤销的授权；涉及数据结构不兼容时应先评估对应版本的迁移说明。
