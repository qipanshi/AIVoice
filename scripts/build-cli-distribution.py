"""Build platform-independent CLI payloads from a clean npm production install.
Usage: python scripts/build-cli-distribution.py /path/to/installed/node_modules
The Node runtimes are fetched by installers from nodejs.org using pinned hashes.
"""
import hashlib
import json
import shutil
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
modules = Path(sys.argv[1]).resolve()
version = json.loads((root / 'cli/package.json').read_text(encoding='utf-8'))['version']
out = root / 'downloads'
out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='aivoice-dist-') as temporary:
    staging = Path(temporary)
    app = staging / 'app'
    app.mkdir()
    for name in ['dist', 'package.json', 'LICENSE', 'README.md', 'npm-shrinkwrap.json', 'uninstall.ps1', 'uninstall.sh']:
        source = root / 'cli' / name
        if source.is_dir(): shutil.copytree(source, app / name)
        else: shutil.copy2(source, app / name)
    shutil.copytree(modules, app / 'node_modules', ignore=shutil.ignore_patterns('.bin', '.package-lock.json', 'aivoice-mcp-cli'))
    assert (app / 'node_modules/@modelcontextprotocol/client/package.json').is_file()
    assert not list(app.rglob('*.node')), 'Native dependency needs separate platform packaging'
    files = sorted(p for p in app.rglob('*') if p.is_file())
    assert all(not p.is_symlink() and p.name != '.env' and not p.name.endswith('.sqlite') for p in files)
    archive_zip = out / f'aivoice-cli-{version}.zip'
    archive_tar = out / f'aivoice-cli-{version}.tar.gz'
    with zipfile.ZipFile(archive_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in files: archive.write(file, file.relative_to(staging).as_posix())
    def permissions(info):
        info.uid = info.gid = 0
        info.uname = info.gname = ''
        info.mode = 0o755 if info.isdir() else 0o644
        return info
    with tarfile.open(archive_tar, 'w:gz') as archive: archive.add(app, arcname='app', filter=permissions)
    checksums = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [archive_zip, archive_tar]}
    checksums.update(json.loads((root / 'cli/runtime-checksums.json').read_text(encoding='utf-8')))
    (out / f'SHA256SUMS-CLI-{version}').write_text(''.join(f'{digest}  {name}\n' for name, digest in sorted(checksums.items())), encoding='utf-8')
    print(f'Packaged {len(files)} files. ZIP {archive_zip.stat().st_size} bytes; tar.gz {archive_tar.stat().st_size} bytes.')
