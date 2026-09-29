const crypto=require('node:crypto');
const {sendEmail}=require('./features');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const cookie=(name,value,age)=>`${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${process.env.NODE_ENV==='production'?'; Secure':''}`;

function createAuthVerification(db,deliver=sendEmail){
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='email_verified_at'))db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
 db.exec(`CREATE TABLE IF NOT EXISTS pending_auth(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS account_codes(user_id TEXT PRIMARY KEY REFERENCES users(id),email TEXT NOT NULL,hash TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL,delivered INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS account_code_sends(user_id TEXT NOT NULL,sent INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS email_changes(user_id TEXT PRIMARY KEY REFERENCES users(id),old_email TEXT NOT NULL,new_email TEXT NOT NULL,hash TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL,sent INTEGER NOT NULL,delivered INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS email_change_attempts(user_id TEXT PRIMARY KEY REFERENCES users(id),count INTEGER NOT NULL,started INTEGER NOT NULL);`);
 // Preserve only earlier verification of the exact login email, never infer it from profile completion.
 db.exec(`UPDATE users SET email_verified_at=(SELECT verified_at FROM companies c WHERE c.owner=users.id AND c.verified_email=users.email AND c.verified_at IS NOT NULL)
 WHERE role='company' AND email_verified_at IS NULL AND EXISTS(SELECT 1 FROM companies c WHERE c.owner=users.id AND c.verified_email=users.email AND c.verified_at IS NOT NULL);`);
 function pending(req){
  const value=(req.headers.cookie||'').split(/;\s*/).find(c=>c.startsWith('workend_company_pending='))?.split('=')[1];
  if(!value)return null;
  return db.prepare("SELECT u.*,p.token AS pending_token FROM pending_auth p JOIN users u ON u.id=p.user_id WHERE p.token=? AND p.expires>? AND u.role='company' AND u.email_verified_at IS NULL").get(digest(value),Date.now());
 }
 function info(account){
  if(!account)return {};
  const code=db.prepare('SELECT sent,expires,delivered,attempts FROM account_codes WHERE user_id=?').get(account.id);
  return {verification_required:true,email:account.email,email_sent:!!(code?.delivered&&code.expires>Date.now()&&code.attempts<5),retry_after:code?Math.max(0,Math.ceil((code.sent+60000-Date.now())/1000)):0};
 }
 async function send(account){
  const now=Date.now(),old=db.prepare('SELECT sent FROM account_codes WHERE user_id=?').get(account.id);
  if(old&&now-old.sent<60000)fail('Tunggu 60 detik sebelum meminta kode baru.',429);
  db.prepare('DELETE FROM account_code_sends WHERE sent<?').run(now-86400000);
  if(db.prepare('SELECT COUNT(*) AS n FROM account_code_sends WHERE user_id=?').get(account.id).n>=10)fail('Batas 10 pengiriman per hari tercapai. Coba kembali besok.',429);
  const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),nonce=crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT OR REPLACE INTO account_codes VALUES(?,?,?,?,?,?,?,0)').run(account.id,account.email,digest(nonce+code),nonce,now+600000,0,now);
  db.prepare('INSERT INTO account_code_sends VALUES(?,?)').run(account.id,now);
  try{await deliver(account.email,code);db.prepare('UPDATE account_codes SET delivered=1 WHERE user_id=? AND nonce=?').run(account.id,nonce);}
  catch(error){db.prepare('UPDATE account_codes SET expires=0 WHERE user_id=? AND nonce=?').run(account.id,nonce);if(error.status)throw error;fail('Kode belum berhasil dikirim. Coba lagi nanti.',503);}
 }
 async function begin(account,res){
  const token=crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM pending_auth WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO pending_auth VALUES(?,?,?)').run(digest(token),account.id,Date.now()+1800000);
  res.setHeader('Set-Cookie',[cookie('workend_company_pending',token,1800),cookie('workend_company_session','',0)]);
  const current=info(account);let delivery_error;
  if(!current.email_sent&&current.retry_after===0){try{await send(account);}catch(error){delivery_error=error.message;}}
  return {...info(account),...(delivery_error?{delivery_error}:{})};
 }
 function emailChange(account){
  if(!account||account.role!=='company')return null;
  const row=db.prepare('SELECT new_email,expires,sent FROM email_changes WHERE user_id=? AND old_email=? AND delivered=1 AND expires>?').get(account.id,account.email,Date.now());
  return row?{email:row.new_email,expires:row.expires,retry_after:Math.max(0,Math.ceil((row.sent+60000-Date.now())/1000))}:null;
 }
 async function sendEmailChange(account,email){
  const now=Date.now(),old=db.prepare('SELECT sent FROM email_changes WHERE user_id=?').get(account.id);
  if(old&&now-old.sent<60000)fail('Tunggu 60 detik sebelum meminta kode baru.',429);
  db.prepare('DELETE FROM account_code_sends WHERE sent<?').run(now-86400000);
  if(db.prepare('SELECT COUNT(*) AS n FROM account_code_sends WHERE user_id=?').get(account.id).n>=10)fail('Batas 10 pengiriman per hari tercapai.',429);
  const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),nonce=crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT OR REPLACE INTO email_changes VALUES(?,?,?,?,?,?,0,?,0)').run(account.id,account.email,email,digest(nonce+code),nonce,now+600000,now);
  db.prepare('INSERT INTO account_code_sends VALUES(?,?)').run(account.id,now);
  try{await deliver(email,code);db.prepare('UPDATE email_changes SET delivered=1 WHERE user_id=? AND nonce=?').run(account.id,nonce);}
  catch(error){db.prepare('UPDATE email_changes SET expires=0 WHERE user_id=? AND nonce=?').run(account.id,nonce);if(error.status)throw error;fail('Kode belum berhasil dikirim. Email akun Anda belum berubah.',503);}
 }
 async function handle({p,method,body,req,res,portal,json,cleanUser,user,requireUser,verify}){
  if(p.startsWith('/api/profile/email/')&&method==='POST'){
   requireUser('company');
   if(p==='/api/profile/email/request'){
    const now=Date.now(),attempt=db.prepare('SELECT * FROM email_change_attempts WHERE user_id=?').get(user.id);
    if(attempt&&now-attempt.started<900000&&attempt.count>=10)fail('Terlalu banyak percobaan. Coba lagi dalam 15 menit.',429);
    db.prepare('INSERT OR REPLACE INTO email_change_attempts VALUES(?,?,?)').run(user.id,attempt&&now-attempt.started<900000?attempt.count+1:1,attempt&&now-attempt.started<900000?attempt.started:now);
    if(typeof body.password!=='string'||body.password.length>128||!verify(body.password,user.password))fail('Kata sandi saat ini tidak cocok.');
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))fail('Masukkan email baru yang valid.');
    if(email===user.email)fail('Email baru harus berbeda dari email saat ini.');
    if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('Email tersebut sudah digunakan akun lain.',409);
    await sendEmailChange(user,email);json(res,200,{email_change:emailChange(user)});return true;
   }
   if(p==='/api/profile/email/cancel'){
    db.prepare('DELETE FROM email_changes WHERE user_id=?').run(user.id);json(res,200,{ok:true});return true;
   }
   const record=db.prepare('SELECT * FROM email_changes WHERE user_id=?').get(user.id);
   if(!record||record.old_email!==user.email||!record.delivered||record.expires<Date.now())fail('Permintaan ganti email kedaluwarsa. Mulai kembali dari profil.');
   if(p==='/api/profile/email/resend'){
    if(db.prepare('SELECT id FROM users WHERE email=?').get(record.new_email))fail('Email tersebut sudah digunakan akun lain. Batalkan dan pilih alamat lain.',409);
    await sendEmailChange(user,record.new_email);json(res,200,{email_change:emailChange(user)});return true;
   }
   if(p==='/api/profile/email/confirm'){
    if(record.attempts>=5)fail('Batas percobaan tercapai. Minta kode baru.');
    db.prepare('UPDATE email_changes SET attempts=attempts+1 WHERE user_id=?').run(user.id);
    if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code)||!crypto.timingSafeEqual(Buffer.from(record.hash),Buffer.from(digest(record.nonce+body.code))))fail('Kode tidak cocok. Masukkan 6 angka dari email baru.');
    if(db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(record.new_email,user.id))fail('Email tersebut sudah digunakan akun lain. Batalkan dan pilih alamat lain.',409);
    const session=crypto.randomBytes(32).toString('hex');
    db.exec('BEGIN');
    try{
     db.prepare('UPDATE users SET email=?,email_verified_at=? WHERE id=?').run(record.new_email,new Date().toISOString(),user.id);
     db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
     db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session,user.id,Date.now()+604800000);
     db.prepare('DELETE FROM pending_auth WHERE user_id=?').run(user.id);
     db.prepare('DELETE FROM account_codes WHERE user_id=?').run(user.id);
     db.prepare('DELETE FROM email_changes WHERE user_id=?').run(user.id);
     db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');if(error.code?.startsWith('SQLITE_CONSTRAINT'))fail('Email tersebut sudah digunakan akun lain.',409);throw error;}
    res.setHeader('Set-Cookie',[cookie('workend_company_session',session,604800),cookie('workend_company_pending','',0)]);
    json(res,200,{user:cleanUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});return true;
   }
   return false;
  }
  if(!p.startsWith('/api/auth/verification/')||method!=='POST')return false;
  if(portal!=='company')fail('Verifikasi ini khusus akun Employer.',403);
  const account=pending(req);if(!account)fail('Sesi verifikasi berakhir. Masuk kembali untuk melanjutkan.',401);
  if(p==='/api/auth/verification/cancel'){
   db.prepare('DELETE FROM pending_auth WHERE token=?').run(account.pending_token);
   res.setHeader('Set-Cookie',cookie('workend_company_pending','',0));json(res,200,{ok:true});return true;
  }
  if(p==='/api/auth/verification/send'){
   await send(account);json(res,200,{...info(account),message:'Kode 6 angka dikirim ke email akun Anda. Berlaku 10 menit.'});return true;
  }
  if(p==='/api/auth/verification/confirm'){
   const record=db.prepare('SELECT * FROM account_codes WHERE user_id=?').get(account.id);
   if(!record||!record.delivered||record.expires<Date.now()||record.email!==account.email||record.attempts>=5)fail('Kode kedaluwarsa atau batas percobaan tercapai. Minta kode baru.');
   db.prepare('UPDATE account_codes SET attempts=attempts+1 WHERE user_id=?').run(account.id);
   if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code)||!crypto.timingSafeEqual(Buffer.from(record.hash),Buffer.from(digest(record.nonce+body.code))))fail('Kode tidak cocok. Masukkan 6 angka dari email Anda.');
   const session=crypto.randomBytes(32).toString('hex');
   db.exec('BEGIN');
   try{
    db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(new Date().toISOString(),account.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session,account.id,Date.now()+604800000);
    db.prepare('DELETE FROM pending_auth WHERE user_id=?').run(account.id);
    db.prepare('DELETE FROM account_codes WHERE user_id=?').run(account.id);
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
   res.setHeader('Set-Cookie',[cookie('workend_company_session',session,604800),cookie('workend_company_pending','',0)]);
   json(res,200,{user:cleanUser(db.prepare('SELECT * FROM users WHERE id=?').get(account.id))});return true;
  }
  return false;
 }
 return {pending,info,begin,handle,emailChange};
}
module.exports={createAuthVerification};
