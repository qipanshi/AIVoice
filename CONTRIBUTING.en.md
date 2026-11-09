# Contributing

[简体中文](CONTRIBUTING.md) | English

Issues and improvements are welcome within AIVoice's current scope: reading the authenticated user's existing device results through MCP, CLI, or stdio.

## Report an issue

Include your operating system, client and AIVoice versions, reproduction steps, expected behavior, and actual result. Redact logs. Do not attach tokens, bridge secrets, WeChat identifiers, or real meeting content. Report security concerns privately as described in [Security](SECURITY.en.md).

## Development and checks

Use Node.js 24 from the repository root:

```sh
npm ci
npm run check
npm run build
npm run build:cli
```

Run checks relevant to the change: `npm run test:auth` for authorization, `npm run test:store` for persistence, and `npm run test:cli` after building the CLI. Focused installer and uninstaller tests are under `tests/`. Some cases require Windows PowerShell, Git Bash, or a verified Node.js runtime fixture. Report skipped cases separately from passes.

Tests use isolated directories and mock business data. Never add a private business database or real credentials. The private Shengzhangmen business adapter is not included in this repository.

## Submit a change

- Keep the scope clear. Describe the problem, changed behavior, verification, and unverified areas in the pull request.
- Keep command help and both language versions of documentation aligned when options change.
- Keep shell scripts in LF format. Preserve PowerShell 5-compatible encoding for scripts with Chinese text.
- For CLI distribution changes, update versions, installers, archives, and checksums together; see [distribution](docs/installers.en.md).
- Do not commit actual environment files, private integrations, authorization databases, personal credentials, logs, Node.js runtime mirrors, or historical installer packages.

Project code uses the [MIT license](LICENSE). Retain third-party notices and ensure you have the right to contribute any third-party material.
