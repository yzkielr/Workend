const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createAuthVerification}=require('../auth-verification');
function fixture(deliver){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,role TEXT,password TEXT,email_verified_at TEXT);CREATE TABLE companies(owner TEXT,verified_email TEXT,verified_at TEXT);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);INSERT INTO users VALUES('owner','old@example.test','company','password','verified');INSERT INTO sessions VALUES('old-session','owner',9999999999999);`);
 const auth=createAuthVerification(db,deliver),user=()=>db.prepare("SELECT * FROM users WHERE id='owner'").get();
 async function call(route,body={}){let result;await auth.handle({p:'/api/profile/email/'+route,method:'POST',body,user:user(),requireUser(){},verify:(p,stored)=>p===stored,req:{headers:{}},res:{setHeader(){}},portal:'company',json:(r,status,data)=>result={status,data},cleanUser:u=>({email:u.email})});return result;}
 return {db,auth,user,call};
}
test('Cancellation and failed delivery keep old verified email and cannot be confirmed',async()=>{
 let code;const f=fixture(async(e,v)=>{code=v;});await f.call('request',{email:'new@example.test',password:'password'});assert.equal(f.user().email,'old@example.test');await f.call('cancel');await assert.rejects(f.call('confirm',{code}));assert.equal(f.auth.emailChange(f.user()),null);assert.equal(f.user().email_verified_at,'verified');f.db.close();
 const failed=fixture(async()=>{throw new Error('offline');});await assert.rejects(failed.call('request',{email:'new@example.test',password:'password'}),e=>e.status===503);assert.equal(failed.user().email,'old@example.test');assert.equal(failed.auth.emailChange(failed.user()),null);await assert.rejects(failed.call('confirm',{code:'123456'}));failed.db.close();
});
test('Wrong/expired codes, an email claimed during verification, and excessive password attempts are rejected',async()=>{
 let code;const f=fixture(async(e,v)=>{code=v;});await f.call('request',{email:'new@example.test',password:'password'});
 for(let i=0;i<5;i++)await assert.rejects(f.call('confirm',{code:'invalid'}));await assert.rejects(f.call('confirm',{code}),/Batas percobaan/);
 f.db.exec('UPDATE email_changes SET attempts=0,expires=0');await assert.rejects(f.call('confirm',{code}),/kedaluwarsa/);
 f.db.prepare('UPDATE email_changes SET expires=?').run(Date.now()+600000);f.db.exec("INSERT INTO users VALUES('other','new@example.test','seeker','password',NULL)");await assert.rejects(f.call('confirm',{code}),e=>e.status===409);assert.equal(f.user().email,'old@example.test');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);f.db.close();
 const limited=fixture(async()=>{});for(let i=0;i<10;i++)await assert.rejects(limited.call('request',{email:'new@example.test',password:'wrong'}));await assert.rejects(limited.call('request',{email:'new@example.test',password:'password'}),e=>e.status===429);limited.db.close();
});
