# Deploying the MCP service

[简体中文](deployment.md) | English · [Project home](../README.en.md)

This guide is for service operators. To connect to the existing hosted service, see the [README](../README.en.md) or [CLI guide](cli.en.md).

## Prerequisites

- Node.js 24 for development, or Docker and Docker Compose for the container deployment.
- An HTTPS hostname, certificate, and reverse proxy reachable by clients.
- A backend implementing the [business adapter contract](architecture.md): it must handle account confirmation, the WeChat mini-program code, authorization confirmation, and read-only access to the user's own device results. Shengzhangmen's private backend, mini program, and database are not in this repository. Running the MCP service alone does not create a fully usable official service.
- A bridge secret configured on both sides, and secure persistent storage for OAuth state.

Before deploying, check existing hostnames, ports, proxy routes, and storage to avoid disturbing other services.

## Configuration

Create a deployment environment file from `deploy/.env.example` and set:

| Variable | Purpose |
| --- | --- |
| `AIVOICE_PUBLIC_ORIGIN` | HTTPS origin for this MCP service, e.g. `https://your-domain.example`, without `/mcp`. |
| `AIVOICE_BACKEND_ORIGIN` | HTTPS origin of the business adapter backend. |
| `AIVOICE_BRIDGE_SECRET` | Shared random secret configured on both services, at least 32 bytes. |
| `AIVOICE_ALLOWED_ORIGINS` | Explicit browser client origins if cross-origin access is needed; generally empty for desktop clients. |

Never commit actual environment files, bridge secrets, tokens, or the OAuth SQLite database. Do not treat test-user authorizations as production authorizations.

## Docker Compose

The `Dockerfile` copies `assets/`, `public/`, `installers/`, and `downloads/` into the service image. Ensure they contain the intended release artifacts before building; see the [distribution guide](installers.en.md) for CLI packaging.

From the repository root, after configuring the environment:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml build aivoice-mcp
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --no-deps aivoice-mcp
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
curl -fsS http://127.0.0.1:18620/health
```

The example binds the service only to `127.0.0.1:18620` and persists OAuth state in a named volume. Protect the volume and arrange backups; do not delete it as part of an update.

## HTTPS and verification

Merge the needed rules from `deploy/nginx-locations.conf.example` into the existing HTTPS site. Check for conflicting rules, test the configuration, then reload the **intended** proxy. Supply a certificate for your own host; do not replace another application's configuration.

Check that local `/health` returns `UP`, public discovery metadata uses the expected origin, and an unauthenticated `/mcp` request returns 401 with `WWW-Authenticate`. With test accounts, verify authorization, personal data access, cross-user isolation, and revocation. Test each supported client and WeChat environment explicitly.

## Rollback

Retain a working previous image and the necessary deployment configuration. If an update fails, restore the previous image and check health. Preserve the current OAuth volume; restoring historical authorization data could reactivate access that users revoked. Evaluate migration compatibility when data formats change.
