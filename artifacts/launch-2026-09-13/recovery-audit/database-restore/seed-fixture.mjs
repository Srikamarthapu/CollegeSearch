import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {createClient}=createRequire('/Volumes/Seagate /CollegeSearch/package.json')('@supabase/supabase-js');
const root='/tmp/collegesearch-restore-gsg4rkw2';
const c=JSON.parse(await fs.readFile(`${root}/local-status.json`,'utf8'));
assert.equal(c.API_URL,'http://127.0.0.1:56321');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(c.API_URL,c.SECRET_KEY,opts);
if(process.argv[2]==='delete-sentinel'){
  const f=JSON.parse(await fs.readFile(`${root}/fixture.json`,'utf8'));
  assert.equal((await admin.auth.admin.deleteUser(f.users.deleted.id)).error,null);
  assert.ok((await admin.auth.admin.getUserById(f.users.deleted.id)).error);
  await fs.writeFile(`${root}/deletion-receipt.json`,JSON.stringify({id:f.users.deleted.id,deletedAt:new Date().toISOString(),scope:'synthetic local account deleted after checkpoint'},null,2)+'\n');
  console.log(JSON.stringify({deletedSentinel:true}));
}else{
  const fixture={createdAt:new Date().toISOString(),users:{}};
  for(const [label,colleges] of [['a',[110635,110653]],['b',[110644]],['deleted',[110635]]]){
    const email=`restore-${label}-${randomUUID()}@example.test`,password=`Restore!${randomUUID()}`;
    const r=await admin.auth.admin.createUser({email,password,email_confirm:true});
    assert.equal(r.error,null);
    fixture.users[label]={id:r.data.user.id,colleges};
    await fs.writeFile(`${root}/fixture.json`,JSON.stringify(fixture,null,2)+'\n');
    const client=createClient(c.API_URL,c.PUBLISHABLE_KEY,opts);
    const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null);
    const claims=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url').toString());
    assert.equal(claims.sub,r.data.user.id);assert.ok(claims.session_id);
    assert.deepEqual((await client.rpc('account_session_active')).data,true);
    assert.equal((await client.from('saved_colleges').insert(colleges.map(unit_id=>({user_id:r.data.user.id,unit_id})))).error,null);
    fixture.users[label]={id:r.data.user.id,sessionId:claims.session_id,colleges};
    await fs.writeFile(`${root}/fixture.json`,JSON.stringify(fixture,null,2)+'\n');
  }
  console.log(JSON.stringify({seededUsers:3,seededSessions:3,seededSavedRows:4,origin:c.API_URL}));
}
