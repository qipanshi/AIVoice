import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,copyFile,mkdtemp,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createReadStream} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';

// This is a disposable install under the workspace. It never changes the user's launcher or PATH.
test('Windows upgrade reuses the verified existing Node runtime without reaching nodejs.org', {timeout:180000}, async t=>{
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return t.skip('Windows runtime fixture unavailable');
  const root=process.cwd();
  const installed=process.env.AIVOICE_TEST_NODE_RUNTIME || join(process.env.LOCALAPPDATA,'AIVoice','versions','0.2.0','runtime');
  if (!existsSync(join(installed,'node.exe')) || !existsSync(join(installed,'LICENSE'))) return t.skip('Node 24.18.0 fixture unavailable');
  const fixture=await mkdtemp(resolve(root,'../aivoice-win-upgrade-'));
  const old=join(fixture,'versions','0.2.0','runtime');await mkdir(old,{recursive:true});
  await copyFile(join(installed,'node.exe'),join(old,'node.exe'));
  await copyFile(join(installed,'LICENSE'),join(old,'LICENSE'));
  const version=JSON.parse(await readFile(resolve(root,'cli/package.json'),'utf8')).version;
  const archive=resolve(root,`downloads/aivoice-cli-${version}.zip`);
  const hash=createHash('sha256').update(await readFile(archive)).digest('hex');
  const requests=[];
  const server=createServer((req,res)=>{
    requests.push(req.url);
    if(req.url.includes('SHA256SUMS-CLI-'))return res.end(`${hash}  aivoice-cli-${version}.zip\n${'0'.repeat(64)}  node-v24.18.0-win-x64.zip\n`);
    if(req.url.endsWith(`aivoice-cli-${version}.zip`))return createReadStream(archive).pipe(res);
    res.writeHead(404).end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const env={...process.env,HTTPS_PROXY:'http://127.0.0.1:1',https_proxy:'http://127.0.0.1:1',NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'};
  delete env.PSModulePath;
  const result=await new Promise(resolve=>{
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolvePath('installers/install.ps1'),'-BaseUrl',`http://127.0.0.1:${server.address().port}`,'-InstallDir',fixture,'-NoPath'],{env});
    let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('close',code=>resolve({code,output}));
  });
  assert.equal(result.code,0,result.output);
  assert.equal(requests.some(url=>url.includes('node-v24.18.0')),false,'An installed, verified Node should require no runtime download');
  const installedCli=await readFile(join(fixture,'.aivoice-install'),'utf8');assert.equal(installedCli.trim(),version);
  assert.equal(existsSync(join(fixture,'uninstall.ps1')),true,'offline uninstaller should be available');
  function resolvePath(name){return resolve(root,name);}
});

test('Windows first install downloads a verified runtime from the platform; corruption is rejected', {timeout:180000}, async t=>{
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return t.skip('Windows runtime fixture unavailable');
  const root=process.cwd();const workspace=resolve(root,'..');
  const installed=process.env.AIVOICE_TEST_NODE_RUNTIME || join(process.env.LOCALAPPDATA,'AIVoice','versions','0.2.0','runtime');
  if (!existsSync(join(installed,'node.exe')) || !existsSync(join(installed,'LICENSE'))) return t.skip('Node 24.18.0 fixture unavailable');
  const fixture=await mkdtemp(resolve(workspace,'aivoice-win-mirror-'));
  const nodeZip=join(fixture,'node-v24.18.0-win-x64.zip');
  const python='import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],"w",compression=zipfile.ZIP_STORED)\nz.write(sys.argv[2],"node-v24.18.0-win-x64/node.exe")\nz.write(sys.argv[3],"node-v24.18.0-win-x64/LICENSE")\nz.close()';
  execFileSync('python',['-c',python,nodeZip,join(installed,'node.exe'),join(installed,'LICENSE')]);
  const version=JSON.parse(await readFile(resolve(root,'cli/package.json'),'utf8')).version;
  const archive=resolve(root,`downloads/aivoice-cli-${version}.zip`);
  const appHash=createHash('sha256').update(await readFile(archive)).digest('hex');
  const nodeHash=createHash('sha256').update(await readFile(nodeZip)).digest('hex');
  let badChecksum=false;const requests=[];
  const server=createServer((req,res)=>{
    requests.push(req.url);
    if(req.url.includes('SHA256SUMS-CLI-'))return res.end(`${appHash}  aivoice-cli-${version}.zip\n${badChecksum?'0'.repeat(64):nodeHash}  node-v24.18.0-win-x64.zip\n`);
    if(req.url.endsWith(`aivoice-cli-${version}.zip`))return createReadStream(archive).pipe(res);
    if(req.url.endsWith('node-v24.18.0-win-x64.zip')){
      if(req.method==='HEAD') return res.end();
      return createReadStream(nodeZip).pipe(res);
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const env={...process.env,HTTPS_PROXY:'http://127.0.0.1:1',https_proxy:'http://127.0.0.1:1',NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'};delete env.PSModulePath;
  const run=dir=>new Promise(resolve=>{
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolvePath('installers/install.ps1'),'-BaseUrl',`http://127.0.0.1:${server.address().port}`,'-InstallDir',dir,'-NoPath'],{env});
    let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('close',code=>resolve({code,output}));
  });
  const fresh=join(fixture,'fresh');const ok=await run(fresh);
  assert.equal(ok.code,0,ok.output);
  assert.ok(requests.some(url=>url.endsWith('node-v24.18.0-win-x64.zip')));
  assert.equal((await readFile(join(fresh,'.aivoice-install'),'utf8')).trim(),version);
  assert.equal(existsSync(join(fresh,'uninstall.ps1')),true,'fresh install should include the offline uninstaller');
  badChecksum=true;const failed=join(fixture,'bad');const bad=await run(failed);
  assert.notEqual(bad.code,0);assert.match(bad.output,/Checksum mismatch/);
  assert.equal(existsSync(join(failed,'bin','aivoice.cmd')),false);
  assert.equal(existsSync(join(failed,'versions',version)),false);
  function resolvePath(name){return resolve(root,name);}
});
