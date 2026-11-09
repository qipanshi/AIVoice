import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, accountId, parseAccount } from '../src/store.js';

test('personal accounts without an organization retain a valid user-bound identity',()=>{
  const identity={userId:11,organizationId:0,version:1,displayName:'个人用户'};
  assert.equal(parseAccount(accountId(identity)).userId,11);
  assert.equal(parseAccount(accountId(identity)).organizationId,0);
  for(const invalid of ['0:0:1','11:0:0','11:-1:1'])assert.throws(()=>parseAccount(invalid));
});

test('restart retains a consumed refresh credential and grant; revocation persists',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'aivoice-store-test-'));const file=join(directory,'auth.sqlite');
  let store=new Store(file);
  try {
    store.saveSetting('test-signing-key','test-only');
    await store.adapter('Grant').upsert('grant-1',{accountId:'11:7:1'},3600);
    await store.adapter('RefreshToken').upsert('refresh-1',{grantId:'grant-1',accountId:'11:7:1'},3600);
    await store.adapter('RefreshToken').consume('refresh-1');store.db.close();store=new Store(file);
    assert.equal(store.setting('test-signing-key'),'test-only');assert.ok((await store.adapter('RefreshToken').find('refresh-1'))?.consumed);
    await store.adapter('Grant').revokeByGrantId('grant-1');await store.adapter('Grant').destroy('grant-1');store.db.close();store=new Store(file);
    assert.equal(await store.adapter('Grant').find('grant-1'),undefined);assert.equal(await store.adapter('RefreshToken').find('refresh-1'),undefined);
  } finally {store.db.close();rmSync(directory,{recursive:true});}
});
