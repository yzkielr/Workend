const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {normalizePhone,phoneStatus,createPhoneVerification}=require('../phone-verification');
function fixture(provider){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT,phone TEXT);CREATE TABLE companies(owner TEXT PRIMARY KEY,phone TEXT);INSERT INTO users VALUES('worker','seeker','+6281234567890');INSERT INTO users VALUES('employer','company','+6581234567');INSERT INTO companies VALUES('employer','+6581234567');`);
 let called=0;
 const service=createPhoneVerification(db,provider||(async(resource,fields)=>{called++;return {sid:'VE'+'a'.repeat(32),to:'+6281234567890',status:resource==='Verifications'?'pending':fields.Code==='012345'?'approved':'pending'};}));
 const user=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id||'worker');
 async function call(action,body={},id='worker'){let result;const account=id?user(id):null;await service.handle({p:'/api/phone/'+action,method:'POST',body,user:account,requireUser:role=>{if(!account)throw Object.assign(new Error('login'),{status:401});if(role&&account.role!==role)throw Object.assign(new Error('role'),{status:403});},res:{},json:(r,status,data)=>result={status,data},cleanUser:u=>({...u,...phoneStatus(u)})});return result;}
 return {db,service,user,call,calls:()=>called};
}
test('Phone parsing validates international country and number, including Indonesia leading zero and shared calling codes',()=>{
 for(const n of ['081234567890','81234567890','+62 812-3456-7890','6281234567890'])assert.equal(normalizePhone(n,'ID').number,'+6281234567890');
 assert.equal(normalizePhone('81234567','SG').number,'+6581234567');assert.equal(normalizePhone('(202) 555-0123','US').number,'+12025550123');
 for(const [n,c] of [['+6581234567','ID'],['not a phone','ID'],['123','ID'],['081234567890','XX']])assert.throws(()=>normalizePhone(n,c));
 assert.equal(normalizePhone('','ID').number,'');assert.throws(()=>normalizePhone('','ID',true));
});
test('Verification requires explicit SMS request, saved scope and provider approval before marking number',async()=>{
 const f=fixture();assert.equal(f.user('employer').phone_country,'SG');
 await assert.rejects(f.call('send',{scope:'profile'},null),e=>e.status===401);
 await assert.rejects(f.call('send',{scope:'business',sms_consent:true}),e=>e.status===403);
 await assert.rejects(f.call('send',{scope:'profile'}));assert.equal(f.calls(),0);
 const sent=await f.call('send',{scope:'profile',sms_consent:true});assert.equal(sent.data.number,'+6281234567890');assert.ok(!JSON.stringify(sent).includes('012345'));assert.equal(phoneStatus(f.user()).phone_verified,false);
 await assert.rejects(f.call('send',{scope:'profile',sms_consent:true}),e=>e.status===429);
 await assert.rejects(f.call('confirm',{scope:'profile',code:'123456'}),/tidak cocok/);
 assert.equal((await f.call('confirm',{scope:'profile',code:'012345'})).data.user.phone_verified,true);
 await assert.rejects(f.call('confirm',{scope:'profile',code:'012345'}));
 f.db.exec("UPDATE users SET phone='+6281234567891' WHERE id='worker'");f.service.saved('worker','profile',normalizePhone('081234567891','ID'));assert.equal(phoneStatus(f.user()).phone_verified,false);
 f.db.exec("UPDATE users SET phone='+6281234567890' WHERE id='worker'");f.service.saved('worker','profile',normalizePhone('081234567890','ID'));assert.equal(phoneStatus(f.user()).phone_verified,false);f.db.close();
});
test('Expired, excessive-attempt, and stale-number SMS challenges are rejected',async()=>{
 const f=fixture();await f.call('send',{scope:'profile',sms_consent:true});
 for(let i=0;i<5;i++)await assert.rejects(f.call('confirm',{scope:'profile',code:'000000'}));
 await assert.rejects(f.call('confirm',{scope:'profile',code:'012345'}),/batas percobaan/);
 f.db.exec('UPDATE phone_verifications SET attempts=0,expires=0');await assert.rejects(f.call('confirm',{scope:'profile',code:'012345'}),/kedaluwarsa/);
 f.db.prepare('UPDATE phone_verifications SET expires=?').run(Date.now()+600000);f.db.exec("UPDATE users SET phone='+6281234567891' WHERE id='worker'");f.service.saved('worker','profile',normalizePhone('081234567891','ID'));
 await assert.rejects(f.call('confirm',{scope:'profile',code:'012345'}));assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM phone_verifications').get().n,0);f.db.close();
});
test('Provider failures and approving a different number never verify the saved number',async()=>{
 const failed=fixture(async()=>{throw new Error('offline');});await assert.rejects(failed.call('send',{scope:'profile',sms_consent:true}));assert.equal(failed.service.pending('worker','profile',failed.user().phone),null);assert.equal(phoneStatus(failed.user()).phone_verified,false);failed.db.close();
 const wrong=fixture(async(resource)=>({sid:'VE'+'a'.repeat(32),to:resource==='Verifications'?'+6281234567890':'+6581234567',status:resource==='Verifications'?'pending':'approved'}));await wrong.call('send',{scope:'profile',sms_consent:true});await assert.rejects(wrong.call('confirm',{scope:'profile',code:'012345'}));assert.equal(phoneStatus(wrong.user()).phone_verified,false);wrong.db.close();
});
test('Changing number while provider confirmation is in flight cannot verify the replacement number',async()=>{
 let release;const f=fixture(async resource=>resource==='Verifications'?{sid:'VE'+'a'.repeat(32),to:'+6281234567890',status:'pending'}:new Promise(resolve=>{release=resolve;}));
 await f.call('send',{scope:'profile',sms_consent:true});const pending=f.call('confirm',{scope:'profile',code:'012345'});
 f.db.exec("UPDATE users SET phone='+6281234567891' WHERE id='worker'");f.service.saved('worker','profile',normalizePhone('081234567891','ID'));
 release({sid:'VE'+'a'.repeat(32),to:'+6281234567890',status:'approved'});await assert.rejects(pending,e=>e.status===409);assert.equal(phoneStatus(f.user()).phone_verified,false);f.db.close();
});
