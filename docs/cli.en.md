# AIVoice CLI

[中文说明](../cli/README.md) | English · [Project home](../README.en.md)

The CLI reads the authenticated user's existing device meeting results and offers a stdio bridge for compatible MCP tools. It does not generate reports or transcriptions.

## Install and sign in

Windows PowerShell:

```powershell
irm https://open.qipanshi.com/install.ps1 | iex
```

macOS / Linux:

```sh
curl -fsSL https://open.qipanshi.com/install.sh | sh
```

Reopen your terminal and run `aivoice --version`, then `aivoice login` and follow the browser and mini-program authorization prompts. `aivoice status` checks the connection. The hosted installer serves the version deployed by the operator; repository changes may not yet be online.

The installer prepares a separate Node.js runtime. It verifies downloaded files and does not replace system Node.js. Runtime archives are fetched from the platform when available, otherwise from the official Node.js host. Availability and download speed depend on the selected mirror and network.

## Commands and options

Run `aivoice <command> --help` for the current executable's options. Examples are illustrative; replace meeting IDs with values returned by your own list.

| Command | Purpose | Options |
| --- | --- | --- |
| `login` | Authorize and save credentials | `--no-browser`, `--callback-port <0–65535>` |
| `status` | Connect and list available tools | Common options |
| `logout` | Revoke remotely and remove local credentials | `--local` removes local credentials only |
| `meetings` | List your existing meetings | `--start`, `--end`, `--keyword`, `--offset`, `--limit` |
| `transcript <ID>` | Read an existing transcript | `--offset`, `--limit` |
| `report <ID>` | Read an existing report | `--kind`, `--offset`, `--limit` |
| `mcp` | Start the stdio bridge | Common options |

All commands accept `--server <URL>`, `--profile <name>`, and `--help`; `--version` prints the CLI version. The default endpoint is `https://open.qipanshi.com/mcp`; default profile is `default`. `AIVOICE_MCP_URL` and `AIVOICE_CONFIG_DIR` can override the default endpoint and credential directory. Profiles contain personal credentials and must not be shared.

### Common and login options

| Option | Default | Details |
| --- | --- | --- |
| `--server <URL>` | `https://open.qipanshi.com/mcp` | Full MCP endpoint; overrides `AIVOICE_MCP_URL`. HTTP is allowed only for loopback development. |
| `--profile <name>` | `default` | 1–64 letters, digits, underscores or hyphens. Credentials are separated by profile and server. |
| `--help`, `-h` | Off | Show help without starting authorization. |
| `--version`, `-v` | Off | Print the CLI version. |
| `login --no-browser` | Off | Print the authorization URL without opening a browser. |
| `login --callback-port <number>` | `0` | Integer 0–65535; 0 chooses an available loopback port. |

Credentials default to `~/.aivoice`; `AIVOICE_CONFIG_DIR` overrides that directory. Unix permissions are restrictive; Windows relies on the actual user directory ACL. Authorization waits up to ten minutes and uses a loopback callback, OAuth state and PKCE.

### Meeting and content options

| Command / option | Default | Details |
| --- | --- | --- |
| `meetings --start`, `--end` | No date filter | `YYYY-MM-DD`, inclusive, Asia/Shanghai; start must not be later than end. |
| `meetings --keyword` | No keyword | Title filter, at most 100 characters. |
| `meetings --offset` | `0` | Integer 0–100000, list offset. |
| `meetings --limit` | `20` | Integer 1–50. |
| `transcript <ID>` / `report <ID>` | Required | Complete positive meeting ID returned by `meetings`. |
| Content `--offset` | `0` | Integer 0–10000000, character offset. |
| Content `--limit` | `12000` | Integer 100–24000. |
| `report --kind` | `standard` | `standard` or `industry`. |

Business limits are validated by the remote MCP service. `status` and `mcp` have no additional business options.

```sh
aivoice meetings --start 2026-11-01 --end 2026-11-06 --limit 20
aivoice transcript 1001 --offset 0 --limit 12000
aivoice report 1001 --kind standard
```

Meeting dates use `YYYY-MM-DD` and the Asia/Shanghai time zone, inclusive of both dates. List `--limit` is 1–50, default 20; content `--limit` is 100–24000, default 12000. Use the returned `nextOffset` to request the next page with the same filters. Report `--kind` is `standard` or `industry`; an unavailable report is not generated automatically.

## Use as a stdio bridge

Sign in on the same machine and OS account running the client, with the same server and profile, before adding:

```json
{
  "mcpServers": {
    "AIVoice": { "command": "aivoice", "args": ["mcp", "--profile", "default"] }
  }
}
```

Client configuration syntax varies. Use separate profiles if multiple processes need concurrent access. If a Windows client cannot run the `.cmd` launcher, configure expanded absolute paths to the installed `runtime/node.exe` and `app/dist/main.js` under `%LOCALAPPDATA%/AIVoice/versions/<version>/`; do not assume the client expands environment variables. A hosted client runs the bridge on its host, not on the user's desktop.

## Remove access or uninstall

`aivoice logout` requests remote revocation and then removes the local credentials; if the request fails, credentials remain for retry. `aivoice logout --local` only removes the local credentials. Authorization may also be revoked in the mini program.

CLI 0.3.1 provides offline local uninstall scripts. Close tools using the CLI first. These scripts remove the managed program and launcher, while **keeping the local credentials and remote authorization**.

Windows PowerShell:

```powershell
& "$env:LOCALAPPDATA\AIVoice\uninstall.ps1"
```

macOS / Linux:

```sh
sh "$HOME/.local/share/aivoice/uninstall.sh"
```

Reopen the terminal for PATH changes. Installations older than 0.3.1 do not include these uninstall scripts.

## Troubleshooting

- If authorization fails, check the service address and account, then retry `aivoice login`. Never post credentials when requesting help.
- An OAuth callback to `127.0.0.1` returns the authorization result to the local CLI process; it is not the public MCP server address.
- For an SSH-hosted CLI, forward a fixed callback port to the user's browser machine; use `--no-browser --callback-port <port>` on the host. The port must match the SSH forwarding configuration.
- Queries produce JSON on stdout. Diagnostic messages go to stderr. The stdio bridge reserves stdout for the MCP protocol.
- Successful commands exit with code 0; failures exit with code 1. A report that is not ready is a failure, not a request to generate it.

## Build from source

The CLI package supports Node.js 22 or 24. In `cli/`, run `npm ci --ignore-scripts`, `npm run check`, and `npm run build`. Run `npm pack` for a local developer package; it does not publish the package. The hosted installation archives are built separately as documented in [distribution](installers.en.md).
