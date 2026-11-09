# Security and data boundaries

[简体中文](SECURITY.md) | English

Report security concerns to [friend_rrw@163.com](mailto:friend_rrw@163.com). Do not include credentials or personal meeting content in a public issue.

AIVoice provides read-only access to existing device results for the authenticated user. The business backend checks account state and ownership on reads. MCP arguments cannot choose another user's identity. Organization membership or administrator status is not required in version 0.3.0.

Authorization uses OAuth authorization code flow with PKCE S256, resource-bound access tokens, and rotating refresh tokens. Personal revocation removes the grant and associated tokens. Revocation cannot recall information already received by a client.

The service accepts client metadata documents and dynamic client registration. A client-supplied display name does not mean the platform has verified that client. MCP access tokens, mini-program credentials, and internal bridge JWTs serve different purposes and are not interchangeable. MCP access tokens are not forwarded to the business backend.

The SQLite volume contains OAuth state, tokens, grants, and signing material. Protect and persist it; do not commit it or put it in an image. The current storage design is for a single service instance. Business report bodies are not stored in that volume. Follow the proxy examples to avoid logging sensitive authorization requests.

CLI credentials are stored per OS user, profile, and server. Unix directories/files use restrictive permissions; Windows relies on the actual account directory ACL. Do not share credentials. Use separate profiles for concurrent processes so refresh credentials do not overwrite one another.

Installers verify pinned download checksums before activation and do not replace system Node.js. HTTPS and control of the distribution directory are part of the distribution trust boundary. Uninstalling the program preserves credentials and grants; use logout or the mini program to revoke authorization.

Targeted local checks are not a penetration test or proof of client compatibility. Real deployment, mini-program authorization, account isolation, token refresh, and revocation need verification in the intended environment. Provide redacted errors and version information when reporting problems.
