# Client integration

[简体中文](clients.md) | English · [Project home](../README.en.md)

## Choose a connection

| Client capability | Approach |
| --- | --- |
| Streamable HTTP plus MCP OAuth discovery and authorization | Add `https://open.qipanshi.com/mcp` and follow the client's personal authorization flow. |
| Can launch a stdio MCP process but cannot complete remote OAuth | Install the CLI on the machine running the client, run `aivoice login`, then configure `aivoice mcp`. |
| Only an HTTP URL and static headers | These fields alone do not establish automatic OAuth support; check the product's current documentation or use stdio if supported. |

HTTP here means MCP Streamable HTTP. Do not infer compatibility from a generic URL field or an older SSE option. Authorization, token refresh, and configuration vary between clients and versions.

## stdio example

```json
{
  "mcpServers": {
    "AIVoice": { "command": "aivoice", "args": ["mcp", "--profile", "default"] }
  }
}
```

This is an example; use the format documented by your client. First run `aivoice login` on the **machine running the client**, under the same OS user and profile. If a Windows client cannot run the `.cmd` launcher, use the expanded absolute paths to Node and the script as described in the [CLI guide](cli.en.md). Use separate profiles for concurrent processes to avoid overwriting refresh credentials.

When the client runs on a server, the stdio process runs there too and does not automatically inherit credentials from the user's computer. The current approach targets a single-user process/profile and does not treat a shared client process as a multi-user security boundary.

## Verification scope

The maintainer has tested the CLI, WorkBuddy integration, and access to the user's own meetings in a test environment. This does not imply that all versions and products have been verified. Confirm support and test the actual versions of Qwen Work, Doubao Work, DSH, and other clients before relying on them.

A useful acceptance sequence is: connect, confirm personal authorization, read existing personal records, refresh or reconnect, then verify that revocation denies further access. Use two test accounts to verify cross-user isolation. Revocation cannot remove content already retrieved by a client.
