import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join,sep} from 'node:path';
const run=promisify(execFile);

async function fixture(){
  const base=resolve('..');const root=await mkdtemp(join(base,'aivoice-uninstall-direct-'));
  const target=resolve(root,'versions','0.3.1');
  assert.ok(root.startsWith(base+sep) && target.startsWith(resolve(root,'versions')+sep));
  await mkdir(join(target,'app'),{recursive:true});await writeFile(join(target,'app','package.json'),'{"name":"aivoice-mcp-cli"}');
  await mkdir(join(root,'bin'),{recursive:true});await writeFile(join(root,'bin','aivoice.cmd'),'fixture');
  await writeFile(join(root,'.aivoice-install'),'0.3.1');
  const foreign=join(root,'versions','0.0.7','app');await mkdir(foreign,{recursive:true});await writeFile(join(foreign,'package.json'),'{"name":"another-app"}');
  const helper=join(root,'uninstall.ps1');await copyFile(resolve('cli/uninstall.ps1'),helper);
  return {root,target,foreign,helper};
}

test('Windows local uninstaller removes only the program and retains credentials', {timeout:60000},async t=>{
  if(process.platform!=='win32')return t.skip('Windows-only');
  const f=await fixture();const credentials=join(f.root,'user-credentials');await mkdir(credentials);await writeFile(join(credentials,'keep.json'),'fixture-credential');
  const env={...process.env,AIVOICE_CONFIG_DIR:credentials};delete env.PSModulePath;
  const result=await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',f.helper,'-InstallDir',f.root,'-NoPath'],{env});
  assert.ok(result.stdout.length>0);assert.equal(existsSync(f.target),false);
  assert.equal(existsSync(join(f.root,'bin','aivoice.cmd')),false);
  assert.equal(await readFile(join(credentials,'keep.json'),'utf8'),'fixture-credential');
  assert.equal(existsSync(join(f.foreign,'package.json')),true);
});

test('uninstaller refuses if credentials are inside a managed version', {timeout:60000},async t=>{
  if(process.platform!=='win32')return t.skip('Windows-only');
  const f=await fixture();const credentials=join(f.target,'credentials');await mkdir(credentials);await writeFile(join(credentials,'keep.json'),'fixture-credential');
  const env={...process.env,AIVOICE_CONFIG_DIR:credentials};delete env.PSModulePath;
  await assert.rejects(run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',f.helper,'-InstallDir',f.root,'-NoPath'],{env}));
  assert.equal(await readFile(join(credentials,'keep.json'),'utf8'),'fixture-credential');
  assert.equal(existsSync(join(f.root,'.aivoice-install')),true);
});

test('POSIX uninstaller preserves personal credentials and unrelated files', {timeout:60000},async t=>{
  const bash = process.platform==='win32' ? 'E:\\Git\\Git\\bin\\bash.exe' : 'sh';
  if(process.platform==='win32'&&!existsSync(bash))return t.skip('Git Bash unavailable');
  const f=await fixture();const credentials=join(f.root,'user-credentials');await mkdir(credentials);await writeFile(join(credentials,'keep.json'),'fixture-credential');
  await writeFile(join(f.root,'bin','aivoice'),'fixture');
  const posix=path=>process.platform==='win32'?path.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase()):path;
  const env={...process.env,AIVOICE_INSTALL_DIR:posix(f.root),AIVOICE_CONFIG_DIR:posix(credentials),AIVOICE_NO_PATH:'1'};
  const result=await run(bash,[resolve('cli/uninstall.sh')],{env});
  assert.ok(result.stdout.length>0);assert.equal(existsSync(f.target),false);
  assert.equal(existsSync(join(f.root,'bin','aivoice')),false);
  assert.equal(await readFile(join(credentials,'keep.json'),'utf8'),'fixture-credential');
  assert.equal(existsSync(join(f.foreign,'package.json')),true);
});
