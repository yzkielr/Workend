const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const {createAuthVerification}=require('../auth-verification');
function fixture(deliver){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,role TEXT);CREATE TABLE companies(owner TEXT,verified_email TEXT,verified_at TEXT);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);INSERT INTO users VALUES('employer','owner@example.test','company');`);
 const auth=createAuthVerification(db,deliver);let cookies=[];
 const res={setHeader:(key,value)=>{cookies=Array.isArray(value)?value:[value];}};
 const req=()=>({headers:{cookie:cookies.map(c=>c.split(';')[0]).join('; ')}});
 const account=()=>db.prepare('SELECT * FROM users').get();
 async function begin(){return auth.begin(account(),res);}
 async function call(route,body={},portal='company',request=req()) {let result;await auth.handle({p:'/api/auth/verification/'+route,method:'POST',body,req:request,res,portal,json:(r,status,data)=>{result={status,data};},cleanUser:u=>({id:u.id,email_verified:!!u.email_verified_at})});return result;}
 return {db,auth,begin,call,req,account};
}
test('Unverified login creates only pending authorization; six digits create a session once',async()=>{
 let code;const f=fixture(async(email,value)=>{assert.equal(email,'owner@example.test');code=value;});
 const initial=await f.begin();assert.equal(initial.verification_required,true);assert.equal(initial.email_sent,true);assert.match(code,/^\d{6}$/);assert.ok(!JSON.stringify(initial).includes(code));assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
 const request=f.req();await assert.rejects(f.call('confirm',{code:'12345'}),/6 angka/);
 assert.equal((await f.call('confirm',{code})).data.user.email_verified,true);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
 await assert.rejects(f.call('confirm',{code},'company',request),e=>e.status===401);f.db.close();
});
test('Expiry, retry limit, role, resend cooldown and undelivered messages cannot be bypassed',async()=>{
 let code;const f=fixture(async(e,v)=>{code=v;});await f.begin();await assert.rejects(f.call('send'),e=>e.status===429);await assert.rejects(f.call('confirm',{code},'seeker'),e=>e.status===403);
 for(let i=0;i<5;i++)await assert.rejects(f.call('confirm',{code:code==='000000'?'111111':'000000'}));
 await assert.rejects(f.call('confirm',{code}),/batas percobaan/);assert.equal(f.account().email_verified_at,null);
 f.db.exec('UPDATE account_codes SET expires=0,attempts=0');await assert.rejects(f.call('confirm',{code}),/kedaluwarsa/);f.db.close();
 const failed=fixture(async()=>{throw new Error('offline');});const r=await failed.begin();assert.equal(r.email_sent,false);assert.match(r.delivery_error,/belum berhasil/);assert.equal(failed.db.prepare('SELECT delivered FROM account_codes').get().delivered,0);await assert.rejects(failed.call('confirm',{code:'123456'}));assert.equal(failed.account().email_verified_at,null);failed.db.close();
});
test('Leading zeros are supported; codes are bound to account email and pending session',async()=>{
 const f=fixture(async()=>{});await f.begin();
 const record=f.db.prepare('SELECT nonce FROM account_codes').get();f.db.prepare('UPDATE account_codes SET hash=?').run(crypto.createHash('sha256').update(record.nonce+'012345').digest('hex'));
 await assert.rejects(f.call('confirm',{code:'012345'},'company',{headers:{}}),e=>e.status===401);
 assert.equal((await f.call('confirm',{code:'012345'})).data.user.email_verified,true);f.db.close();
 const changed=fixture(async()=>{});await changed.begin();changed.db.exec("UPDATE users SET email='changed@example.test'");await assert.rejects(changed.call('confirm',{code:'123456'}),/kode baru/);changed.db.close();
});
test('Refresh preserves pending state; cancel revokes it; already verified emails are retained on migration',async()=>{
 const f=fixture(async()=>{});await f.begin();assert.equal(f.auth.info(f.auth.pending(f.req())).email_sent,true);const previous=f.req();await f.call('cancel');assert.equal(f.auth.pending(previous),undefined);
 f.db.exec("INSERT INTO companies VALUES('employer','owner@example.test','2026-09-28T00:00:00Z')");createAuthVerification(f.db,async()=>{});assert.equal(f.account().email_verified_at,'2026-09-28T00:00:00Z');f.db.close();
});
