import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../src/app.js';
import { Backend, UpstreamError } from '../src/backend.js';
import { Store, type Identity } from '../src/store.js';
import type { Config } from '../src/config.js';

class FakeBackend extends Backend {
  active = true;
  reads: {path: string; user: number}[] = [];
  override async identity(identity: Identity) {
    if (!this.active || identity.userId !== 11) throw new UpstreamError(403,'account_unavailable','账号不存在或已停用');
    return { ...identity, displayName:'测试用户' };
  }
  override async request<T>(path: string, identity?: Identity): Promise<T> {
    await this.identity(identity!);
    this.reads.push({path,user:identity!.userId});
    return { meetings:[{id:'1001',title:'设备会议'}],nextOffset:null } as T;
  }
  override async qrcode(_scene: string) { return { image:'iVBORw0KGgo=' }; }
}

test('OAuth, QR consent and authenticated MCP integration', async t => {
  const server=createServer();
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const config:Config={issuer:origin,resource:origin+'/mcp',backend:'http://127.0.0.1:1',bridgeSecret:'test-only-bridge-secret-at-least-32-bytes',database:':memory:',port:0,production:false,allowedOrigins:[origin]};
  const backend=new FakeBackend(config); const store=new Store(':memory:');
  const built=await createApp(config,store,backend); server.on('request',built.app);
  t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));store.db.close();});
  const registration=await fetch(origin+'/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'测试客户端',application_type:'native',redirect_uris:['http://127.0.0.1:19231/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
  const client=await registration.json() as {client_id:string};
  assert.equal(registration.status,201,JSON.stringify(client));
  const bridgeToken=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setIssuer('aivoice-backend').setAudience('aivoice-bridge').setSubject('11').setIssuedAt().setExpirationTime('60s').sign(new TextEncoder().encode(config.bridgeSecret));
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${bridgeToken}`};

  async function authorization(requestedScopes='meetings:read transcripts:read reports:read') {
    const jar=new Map<string,string>();
    const browser=async(path:string,init:RequestInit={})=>{
      const r=await fetch(new URL(path,origin),{...init,redirect:'manual',headers:{...init.headers,Cookie:[...jar.values()].join('; ')}});
      for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0];jar.set(pair.split('=')[0],pair);}
      return r;
    };
    const verifier=randomBytes(48).toString('base64url');
    const params=new URLSearchParams({client_id:client.client_id,response_type:'code',redirect_uri:'http://127.0.0.1:19231/callback',scope:requestedScopes,resource:config.resource,state:'binding-state',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
    let response=await browser('/oauth/authorize?'+params);
    assert.equal(response.status,303,await response.clone().text());
    const location=response.headers.get('location')!;
    response=await browser(location);
    assert.equal(response.status,200,await response.clone().text());
    const uid=new URL(location,origin).pathname.split('/').pop()!;
    const ticket=store.ticket(uid)!;assert.ok(ticket);
    return {uid,ticket,verifier,browser,async approve(){
      const approved=await fetch(`${origin}/aivoice/bridge/requests/${ticket.scene}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'allow',identity:{userId:11,organizationId:0,version:1,displayName:'测试用户'}})});
      assert.equal(approved.status,200,await approved.clone().text());
    },async finish(csrf=ticket.csrf){
      let r=await browser(`/aivoice/interaction/${uid}/finish`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf})});
      for(let i=0;i<8 && [302,303].includes(r.status);i++){
        const next=new URL(r.headers.get('location')!,origin);
        if(next.origin!==origin){assert.equal(next.searchParams.get('state'),'binding-state');return next;}
        r=await browser(next.href);
      }
      throw new Error(`Authorization did not complete: ${r.status} ${await r.text()}`);
    }};
  }
  async function exchange(code:string,verifier:string){return fetch(origin+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code,code_verifier:verifier,redirect_uri:'http://127.0.0.1:19231/callback',resource:config.resource})});}
  async function tokens(scope?:string){const flow=await authorization(scope);await flow.approve();const callback=await flow.finish();assert.equal(callback.searchParams.get('error'),null,callback.href);const r=await exchange(callback.searchParams.get('code')!,flow.verifier);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body as {access_token:string;refresh_token:string};}
  const mcpRequest=(token?:string)=>fetch(config.resource,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','MCP-Method':'tools/list',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});

  await t.test('discovery and unauthenticated requests reveal no user data',async()=>{
    const m=await fetch(origin+'/.well-known/oauth-protected-resource/mcp').then(r=>r.json());assert.equal(m.resource,config.resource);
    const a=await fetch(origin+'/.well-known/oauth-authorization-server').then(r=>r.json());assert.equal(a.issuer,origin);assert.ok(a.code_challenge_methods_supported.includes('S256'));
    assert.equal((await mcpRequest()).status,401);assert.equal((await mcpRequest(bridgeToken)).status,401);assert.equal(backend.reads.length,0);
  });
  await t.test('QR consent is browser-bound, CSRF-protected and one-time',async()=>{
    const flow=await authorization();
    const outsider=await fetch(origin+`/aivoice/interaction/${flow.uid}/status`);assert.notEqual(outsider.status,200);
    await flow.approve();
    const bad=await flow.browser(`/aivoice/interaction/${flow.uid}/finish`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'csrf=wrong'});assert.equal(bad.status,403);
    const replay=await fetch(origin+`/aivoice/bridge/requests/${flow.ticket.scene}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'allow',identity:{userId:11,organizationId:0,version:1,displayName:'测试用户'}})});assert.equal(replay.status,410);
    const callback=await flow.finish();assert.ok(callback.searchParams.get('code'));
  });
  await t.test('PKCE rejects a wrong verifier',async()=>{
    const flow=await authorization();await flow.approve();const callback=await flow.finish();
    const r=await exchange(callback.searchParams.get('code')!,randomBytes(48).toString('base64url'));assert.equal(r.status,400);
  });
  await t.test('official SDK client invokes read tools with server-derived identity',async()=>{
    const token=await tokens();const sdk=new Client({name:'AIVoice verification',version:'1.0.0'});
    await sdk.connect(new StreamableHTTPClientTransport(new URL(config.resource),{requestInit:{headers:{Authorization:`Bearer ${token.access_token}`}}}));
    try{const list=await sdk.listTools();assert.deepEqual(list.tools.map(x=>x.name),['list_meetings','get_transcript','get_report']);
      const result=await sdk.callTool({name:'list_meetings',arguments:{startDate:'2026-11-01'}});assert.notEqual(result.isError,true);assert.equal(backend.reads.at(-1)?.user,11);
    }finally{await sdk.close();}
  });
  await t.test('grant scope limits tool calls and no missing scope reaches backend',async()=>{
    const token=await tokens('meetings:read');const count=backend.reads.length;let status=0;let challenge='';
    const sdk=new Client({name:'scope-test',version:'1.0.0'});
    await sdk.connect(new StreamableHTTPClientTransport(new URL(config.resource),{requestInit:{headers:{Authorization:`Bearer ${token.access_token}`}},fetch:async(url,init)=>{const response=await fetch(url,init);status=response.status;challenge=response.headers.get('www-authenticate')||'';return response;}}));
    try { await assert.rejects(()=>sdk.callTool({name:'get_report',arguments:{meetingId:'1001'}}));assert.equal(status,403);assert.match(challenge,/insufficient_scope/);assert.match(challenge,/reports:read/);assert.equal(backend.reads.length,count); } finally {await sdk.close();}
  });
  await t.test('account disable blocks existing authorization and personal users need no organization',async()=>{
    const token=await tokens();backend.active=false;assert.equal((await mcpRequest(token.access_token)).status,403);
    backend.active=true;
  });
  await t.test('personal revocation invalidates both access and refresh tokens',async()=>{
    const token=await tokens();assert.ok(token.refresh_token);
    const model=await built.provider.AccessToken.find(token.access_token);assert.ok(model?.grantId);
    const r=await fetch(origin+`/aivoice/bridge/grants/${model.grantId}/revoke`,{method:'POST',headers,body:'{}'});assert.equal(r.status,200);
    assert.equal((await mcpRequest(token.access_token)).status,401);
    const refresh=await fetch(origin+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:token.refresh_token,resource:config.resource})});assert.equal(refresh.status,400);
  });
  await t.test('refresh rotates credentials and rejects replay',async()=>{
    const token=await tokens();
    const refresh=()=>fetch(origin+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:token.refresh_token,resource:config.resource})});
    const renewed=await refresh();const body=await renewed.json();assert.equal(renewed.status,200,JSON.stringify(body));assert.ok(body.access_token);assert.ok(body.refresh_token);assert.notEqual(body.refresh_token,token.refresh_token);
    assert.equal((await refresh()).status,400);
  });
  await t.test('one user cannot revoke or list another user grant',async()=>{
    const token=await tokens();const model=await built.provider.AccessToken.find(token.access_token);
    const other=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setIssuer('aivoice-backend').setAudience('aivoice-bridge').setSubject('12').setIssuedAt().setExpirationTime('60s').sign(new TextEncoder().encode(config.bridgeSecret));
    const foreignHeaders={...headers,Authorization:`Bearer ${other}`};
    const revoke=await fetch(origin+`/aivoice/bridge/grants/${model!.grantId}/revoke`,{method:'POST',headers:foreignHeaders,body:'{}'});assert.equal(revoke.status,404);
    const listed=await fetch(origin+'/aivoice/bridge/grants',{headers:foreignHeaders}).then(r=>r.json());assert.deepEqual(listed,[]);assert.ok(await built.provider.Grant.find(model!.grantId!));
  });
});
