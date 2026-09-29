const crypto=require('node:crypto');
const {parsePhoneNumberFromString,getCountries}=require('libphonenumber-js/max');
const countries=new Set(getCountries());
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function normalizePhone(value,country='ID',required=false){
 if(typeof country!=='string'||!countries.has(country))fail('Pilih negara nomor telepon yang valid.');
 if(typeof value!=='string'||value.length>40)fail('Nomor telepon tidak valid.');
 const raw=value.trim();
 if(!raw){if(required)fail('Nomor telepon wajib diisi.');return {number:'',country};}
 if(!/^\+?[\d\s().-]+$/.test(raw))fail('Nomor telepon hanya boleh berisi angka dan tanda pemisah.');
 const phone=parsePhoneNumberFromString(raw,country);
 if(!phone?.isValid()||phone.ext||phone.country!==country)fail('Periksa nomor telepon dan kode negara yang dipilih.');
 return {number:phone.number,country:phone.country,type:phone.getType()};
}
async function twilioRequest(resource,fields){
 const account=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN,service=process.env.TWILIO_VERIFY_SERVICE_SID;
 if(!/^AC[0-9a-f]{32}$/i.test(account||'')||!token||!/^VA[0-9a-f]{32}$/i.test(service||''))fail('Verifikasi SMS belum diaktifkan oleh pengelola Workend.',503);
 try{
  const response=await fetch(`https://verify.twilio.com/v2/Services/${service}/${resource}`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(account+':'+token).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields).toString()});
  if(response.status===429)fail('Terlalu banyak permintaan SMS. Coba kembali nanti.',429);
  if(response.status===404)fail('Kode SMS kedaluwarsa atau sudah digunakan. Minta kode baru.');
  if(!response.ok)fail('Layanan SMS belum dapat memproses nomor ini. Periksa nomor atau coba kembali nanti.',503);
  return await response.json();
 }catch(error){if(error.status)throw error;fail('Layanan SMS tidak dapat dihubungi. Nomor belum diverifikasi.',503);}
}
function phoneStatus(row){return {phone_country:row.phone_country||'ID',phone_verified:!!(row.phone&&row.phone_verified_at&&row.phone_verified_number===row.phone),phone_verified_at:row.phone&&row.phone_verified_number===row.phone?row.phone_verified_at:null};}
function createPhoneVerification(db,provider=twilioRequest){
 for(const table of ['users','companies']){
  const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
  for(const [name,type] of Object.entries({phone_country:"TEXT NOT NULL DEFAULT 'ID'",phone_verified_number:"TEXT NOT NULL DEFAULT ''",phone_verified_at:'TEXT'}))if(!columns.includes(name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  if(!columns.includes('phone_country')&&columns.includes('phone')){
   const key=table==='users'?'id':'owner';
   for(const row of db.prepare(`SELECT ${key},phone FROM ${table} WHERE phone LIKE '+%'`).all()){
    const country=parsePhoneNumberFromString(row.phone)?.country;
    if(country)db.prepare(`UPDATE ${table} SET phone_country=? WHERE ${key}=?`).run(country,row[key]);
   }
  }
 }
 db.exec(`CREATE TABLE IF NOT EXISTS phone_verifications(user_id TEXT NOT NULL REFERENCES users(id),scope TEXT NOT NULL,number TEXT NOT NULL,nonce TEXT NOT NULL,provider_sid TEXT,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL,PRIMARY KEY(user_id,scope));
 CREATE TABLE IF NOT EXISTS phone_send_log(user_id TEXT NOT NULL,number TEXT NOT NULL,sent INTEGER NOT NULL);`);
 function pending(id,scope,number){const normalized=parsePhoneNumberFromString(number||'','ID')?.number||number;const row=db.prepare('SELECT expires,sent FROM phone_verifications WHERE user_id=? AND scope=? AND number=? AND provider_sid IS NOT NULL AND expires>?').get(id,scope,normalized||'',Date.now());return row?{expires:row.expires,retry_after:Math.max(0,Math.ceil((row.sent+60000-Date.now())/1000))}:null;}
 function saved(id,scope,phone){
  const table=scope==='business'?'companies':'users',key=scope==='business'?'owner':'id';
  db.prepare(`UPDATE ${table} SET phone_country=?,phone_verified_at=CASE WHEN phone_verified_number=? THEN phone_verified_at ELSE NULL END,phone_verified_number=CASE WHEN phone_verified_number=? THEN phone_verified_number ELSE '' END WHERE ${key}=?`).run(phone.country,phone.number,phone.number,id);
  db.prepare('DELETE FROM phone_verifications WHERE user_id=? AND scope=? AND number<>?').run(id,scope,phone.number);
 }
 async function handle({p,method,body,user,requireUser,res,json,cleanUser}){
  if(!['/api/phone/send','/api/phone/confirm'].includes(p)||method!=='POST')return false;
  requireUser();const scope=body.scope;
  if(!['profile','business'].includes(scope))fail('Tujuan verifikasi nomor tidak valid.');
  if(scope==='business')requireUser('company');
  const table=scope==='business'?'companies':'users',key=scope==='business'?'owner':'id';
  const row=db.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(user.id);
  if(!row)fail('Simpan profil perusahaan terlebih dahulu.');
  const phone=normalizePhone(row.phone,row.phone_country||'ID',true);
  if(phoneStatus(row).phone_verified)fail('Nomor ini sudah terverifikasi.');
  if(phone.type==='FIXED_LINE')fail('Verifikasi SMS membutuhkan nomor seluler yang dapat menerima SMS.');
  if(p==='/api/phone/send'){
   if(body.sms_consent!==true)fail('Konfirmasi pengiriman kode SMS ke nomor yang tersimpan.');
   const now=Date.now();db.prepare('DELETE FROM phone_send_log WHERE sent<?').run(now-86400000);
   if(db.prepare('SELECT 1 FROM phone_send_log WHERE (user_id=? OR number=?) AND sent>? LIMIT 1').get(user.id,phone.number,now-60000))fail('Tunggu 60 detik sebelum mengirim kode SMS lagi.',429);
   if(db.prepare('SELECT COUNT(*) AS n FROM phone_send_log WHERE user_id=?').get(user.id).n>=5||db.prepare('SELECT COUNT(*) AS n FROM phone_send_log WHERE number=?').get(phone.number).n>=5)fail('Batas 5 pengiriman SMS per hari tercapai.',429);
   const globalLimit=Number(process.env.SMS_DAILY_LIMIT)||100;
   if(db.prepare('SELECT COUNT(*) AS n FROM phone_send_log').get().n>=globalLimit)fail('Pengiriman SMS sementara dibatasi. Coba kembali nanti.',429);
   const nonce=crypto.randomUUID();
   db.prepare('INSERT OR REPLACE INTO phone_verifications VALUES(?,?,?,?,NULL,?,0,?)').run(user.id,scope,phone.number,nonce,now+600000,now);
   db.prepare('INSERT INTO phone_send_log VALUES(?,?,?)').run(user.id,phone.number,now);
   let result;
   try{result=await provider('Verifications',{To:phone.number,Channel:'sms'});if(result.status!=='pending'||result.to!==phone.number||!/^VE[0-9a-f]{32}$/i.test(result.sid||''))fail('Kode SMS belum berhasil dikirim. Coba kembali nanti.',503);}
   catch(error){db.prepare('UPDATE phone_verifications SET expires=0 WHERE user_id=? AND scope=? AND nonce=?').run(user.id,scope,nonce);throw error;}
   const updated=db.prepare(`UPDATE phone_verifications SET provider_sid=? WHERE user_id=? AND scope=? AND nonce=? AND EXISTS(SELECT 1 FROM ${table} WHERE ${key}=? AND phone=?)`).run(result.sid,user.id,scope,nonce,user.id,row.phone);
   if(!updated.changes)fail('Nomor berubah saat pengiriman. Simpan nomor dan mulai verifikasi lagi.',409);
   json(res,200,{number:phone.number,verification:pending(user.id,scope,phone.number)});return true;
  }
  const record=db.prepare('SELECT * FROM phone_verifications WHERE user_id=? AND scope=?').get(user.id,scope);
  if(!record||!record.provider_sid||record.expires<Date.now()||record.number!==phone.number||record.attempts>=5)fail('Kode kedaluwarsa, nomor berubah, atau batas percobaan tercapai. Minta kode baru.');
  if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))fail('Masukkan kode SMS yang terdiri dari 6 angka.');
  db.prepare('UPDATE phone_verifications SET attempts=attempts+1 WHERE user_id=? AND scope=?').run(user.id,scope);
  const result=await provider('VerificationCheck',{VerificationSid:record.provider_sid,Code:body.code});
  if(result.status!=='approved'||result.to!==phone.number||result.sid!==record.provider_sid)fail('Kode SMS tidak cocok. Periksa keenam angkanya.');
  db.exec('BEGIN');
  try{
   const updated=db.prepare(`UPDATE ${table} SET phone=?,phone_verified_number=?,phone_verified_at=? WHERE ${key}=? AND phone=? AND EXISTS(SELECT 1 FROM phone_verifications WHERE user_id=? AND scope=? AND nonce=?)`).run(phone.number,phone.number,new Date().toISOString(),user.id,row.phone,user.id,scope,record.nonce);
   if(!updated.changes)fail('Nomor atau permintaan berubah. Mulai verifikasi lagi.',409);
   db.prepare('DELETE FROM phone_verifications WHERE user_id=? AND scope=?').run(user.id,scope);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  json(res,200,{user:cleanUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});return true;
 }
 return {handle,saved,pending};
}
module.exports={normalizePhone,phoneStatus,createPhoneVerification};
