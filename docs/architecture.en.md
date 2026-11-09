# Protocol and business adapter

[简体中文](architecture.md) | English · [Project home](../README.en.md)

## Request flow

1. A compatible MCP client connects to the service and discovers the OAuth authorization endpoints.
2. The user opens the authorization page and scans the mini-program code. The business backend identifies the user and receives their explicit confirmation.
3. The client receives an authorization code and exchanges it with PKCE for tokens. The service stores OAuth state.
4. The client calls one of the read-only MCP tools. The service uses a separate internal service credential to ask the business adapter for that user's existing results.
5. The adapter checks the account and data ownership and returns only permitted results.

The client does not choose a user ID for access checks. The business adapter remains responsible for account state, device origin, and data ownership. The private Shengzhangmen backend, mini program, and database are not included in this repository.

## Components and boundaries

| Component | Responsibility |
| --- | --- |
| MCP client | Connect, complete OAuth, hold its own credentials, and call tools. |
| AIVoice MCP | MCP transport, OAuth interactions and state, and calls to the business adapter. |
| Business adapter | Mini-program identity and confirmation, account and ownership checks, and existing-result reads. |
| CLI | Terminal queries and an optional stdio bridge to the remote service. |

The MCP service can share a host with other software or be deployed separately. A locally running stdio bridge uses the credentials of its own OS user and profile. A shared process is not a per-user isolation boundary.

## Adapter contract

The open service calls `AIVOICE_BACKEND_ORIGIN/api/v1/aivoice/internal`. The business adapter provides:

| Route | Purpose |
| --- | --- |
| `GET /identity` | Resolve and validate the current account. |
| `POST /qrcode` | Produce the mini-program code for an authorization interaction. |
| `GET /meetings` | List the user's own existing device meetings. |
| `GET /meetings/:id/transcript` | Read an existing transcript segment. |
| `GET /meetings/:id/report` | Read an existing report segment. |

These are internal adapter endpoints, not a public general-purpose API. Internal calls use a distinct short-lived service JWT and shared bridge secret; MCP access tokens and mini-program login credentials are not interchangeable. The mini-program backend also calls the service's bridge to confirm authorization and manage the user's grants. Exact payloads and existing implementation details are documented in the [Chinese contract](architecture.md) and source code.

Successful adapter responses use HTTP 2xx with a `data` field; the reader does not depend on an outer numeric `code`. Failed responses use an appropriate HTTP error status with `error` and `message` fields.

Internal request JWTs use HS256, issuer `aivoice-mcp`, audience `aivoice-internal`, a user-ID subject and a 60-second lifetime. Only the QR-code request uses the `service` subject. Reverse bridge calls use issuer `aivoice-backend` and audience `aivoice-bridge`. Legacy organization/version fields remain in stored identity envelopes for compatibility; they do not enforce an organization requirement in 0.3.0.

The current OAuth configuration sets interaction/QR lifetime to ten minutes, authorization codes to 60 seconds, access tokens to 15 minutes, and refresh/grant lifetime to 30 days. Treat implementation and provider behavior as authoritative when changing these settings.

## Data and authorization

The three MCP tools read existing meetings, transcripts, and reports only. They do not start generation. The assistant may process returned text, but that text must be treated as untrusted content rather than instructions. All dates use Asia/Shanghai; clients should continue when `nextOffset` is returned.

OAuth state and signing material are persisted by the service and must be protected. A user's revocation blocks subsequent access but cannot retract data already returned to a client. See [security](../SECURITY.md) and the [deployment guide](deployment.en.md).
