# CLI installation and distribution

[简体中文](installers.md) | English · [Project home](../README.en.md)

The supported user-facing entry points are the hosted PowerShell and shell installers described in the [CLI guide](cli.en.md). They install to the current user's directory and prepare an independent Node.js runtime. CLI 0.3.1 adds stage and download progress, a local uninstall script, and verified reuse of an existing Windows runtime.

The platform can host original Node.js archives. If the appropriate platform archive is unavailable, installers fall back to the official Node.js distribution site; network performance is not guaranteed. Linux installations require tools including `curl`, `tar`, a SHA256 utility, and support for extracting xz archives. Node.js platform requirements also apply.

## Preparing the service-side mirror

From the service repository, an operator can populate one verified archive:

```sh
sh scripts/prepare-node-mirrors.sh node-v24.18.0-win-x64.zip
```

Running the script without an argument prepares the supported Windows, macOS, and Linux x64/ARM64 archives. It downloads original releases and verifies the pinned SHA256 values. The resulting `downloads/node-v*` files are not source files and should not be committed to the repository. For the supplied Docker deployment, rebuild the service image after preparing a mirror. A mirror is not available until the operator has completed this step.

## Building CLI application archives

The CLI ZIP and tar.gz contain the JavaScript application and locked production dependencies, not the Node runtime. Build using a clean dependency directory:

```sh
cd cli
npm ci --ignore-scripts
npm run build
npm pack --ignore-scripts --pack-destination ../downloads
cd ..
npm install --prefix ../cli-distribution-build ./downloads/aivoice-mcp-cli-0.3.1.tgz --ignore-scripts --omit=dev
python scripts/build-cli-distribution.py ../cli-distribution-build/node_modules
```

This produces `downloads/aivoice-cli-0.3.1.zip`, `downloads/aivoice-cli-0.3.1.tar.gz`, and `downloads/SHA256SUMS-CLI-0.3.1`. Operators should update versions and pinned checksums together for a future release. Building a package locally does not publish it to npm.

## Upgrade, rollback, and uninstall

Rerun the installer for an update. It prepares the new version before switching the launcher; an unsuccessful install leaves the previous launcher in place. To roll back, use a previously retained version and restore the launcher path for that version; do not restore an old credential snapshot.

CLI 0.3.1 provides offline uninstall scripts; see [the CLI guide](cli.en.md#remove-access-or-uninstall). Uninstall removes the managed program and launcher while retaining local credentials and remote authorization. Use `aivoice logout` before uninstalling, or revoke the application in the mini program, if revocation is also intended.

## Verification scope

The Windows x64 0.3.1 installer was checked in isolated directories against a local mock download source, including runtime reuse, a fresh install, and rejection of a checksum mismatch. A public deployment and actual end-user network, PATH behavior, Windows ARM64, and native macOS/Linux installation still require testing in those environments.
