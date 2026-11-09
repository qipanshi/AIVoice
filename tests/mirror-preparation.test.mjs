import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,readFile,chmod} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {resolve,join,sep,delimiter} from 'node:path';
import {existsSync} from 'node:fs';
const run=promisify(execFile);
const bash=process.platform==='win32'?'E:\\Git\\Git\\bin\\bash.exe':'sh';
async function fixture(){
  const base=resolve('..'),root=await mkdtemp(join(base,'aivoice-mirror-prepare-'));
  assert.ok(root.startsWith(base+sep));
  for(const d of ['scripts','downloads','fake-bin'])await mkdir(join(root,d));
  await copyFile(resolve('scripts/prepare-node-mirrors.sh'),join(root,'scripts','prepare-node-mirrors.sh'));
  const name='node-v24.18.0-win-x64.zip',payload='aivoice-runtime-fixture';
  const hash=createHash('sha256').update(payload).digest('hex');
  await writeFile(join(root,'downloads/SHA256SUMS-CLI-0.3.1'),`${hash}  ${name}\n`);
  const fake=join(root,'fake-bin/curl');
  await writeFile(fake,`#!/bin/sh\nwhile [ "$#" -gt 0 ]; do case "$1" in -o) output=$2; shift 2;; *) shift;; esac; done\nprintf '${payload}' > "$output"\nprintf 'request\\n' >> "$AIVOICE_TEST_MIRROR_LOG"\n`);await chmod(fake,0o755);
  const posix=p=>process.platform==='win32'?p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase()):p;
  const bashEnv=join(root,'bash-env');await writeFile(bashEnv,`PATH='${posix(join(root,'fake-bin'))}':"$PATH"; export PATH\n`);
  const env={...process.env,PATH:join(root,'fake-bin')+delimiter+process.env.PATH,BASH_ENV:posix(bashEnv),AIVOICE_TEST_MIRROR_LOG:posix(join(root,'calls.log'))};
  return {root,name,env,payload};
}
test('server mirror preparation verifies downloads and skips existing verified files',async t=>{
  if(process.platform==='win32'&&!existsSync(bash))return t.skip('Git Bash unavailable');
  const f=await fixture();await run(bash,[join(f.root,'scripts/prepare-node-mirrors.sh'),f.name],{cwd:f.root,env:f.env});
  assert.equal(await readFile(join(f.root,'downloads',f.name),'utf8'),f.payload);
  await run(bash,[join(f.root,'scripts/prepare-node-mirrors.sh'),f.name],{cwd:f.root,env:f.env});
  assert.equal((await readFile(join(f.root,'calls.log'),'utf8')).trim(),'request');
});
test('server mirror preparation does not replace an existing invalid file',async t=>{
  if(process.platform==='win32'&&!existsSync(bash))return t.skip('Git Bash unavailable');
  const f=await fixture();const existing=join(f.root,'downloads',f.name);await writeFile(existing,'keep-invalid');
  await assert.rejects(run(bash,[join(f.root,'scripts/prepare-node-mirrors.sh'),f.name],{cwd:f.root,env:f.env}));
  assert.equal(await readFile(existing,'utf8'),'keep-invalid');
});
test('server mirror preparation verifies an already complete partial file without redownloading',async t=>{
  if(process.platform==='win32'&&!existsSync(bash))return t.skip('Git Bash unavailable');
  const f=await fixture();await writeFile(join(f.root,'downloads',f.name+'.part'),f.payload);
  await run(bash,[join(f.root,'scripts/prepare-node-mirrors.sh'),f.name],{cwd:f.root,env:f.env});
  assert.equal(await readFile(join(f.root,'downloads',f.name),'utf8'),f.payload);
  assert.equal(existsSync(join(f.root,'calls.log')),false);
});
