const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {normalizePhone,phoneStatus}=require('./phone-verification');
const { DatabaseSync } = require('node:sqlite');
const root = __dirname;
if (fs.existsSync(path.join(root,'.env'))) process.loadEnvFile(path.join(root,'.env'));
fs.mkdirSync(process.env.DATA_DIR || path.join(root, 'data'), { recursive: true });
const db = new DatabaseSync(path.join(process.env.DATA_DIR || path.join(root, 'data'), 'workend.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,bio TEXT DEFAULT '',phone TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),title TEXT,company TEXT,category TEXT,city TEXT,location TEXT,pay INTEGER,day TEXT,hours TEXT,description TEXT,requirements TEXT,color TEXT,logo TEXT,active INTEGER DEFAULT 1,created TEXT);
CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,job_id TEXT REFERENCES jobs(id),user_id TEXT REFERENCES users(id),letter TEXT,portfolio TEXT,status TEXT DEFAULT 'Dikirim',created TEXT,UNIQUE(job_id,user_id));
CREATE TABLE IF NOT EXISTS saved(user_id TEXT REFERENCES users(id),job_id TEXT REFERENCES jobs(id),PRIMARY KEY(user_id,job_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS companies(owner TEXT PRIMARY KEY REFERENCES users(id),name TEXT NOT NULL,industry TEXT NOT NULL,city TEXT NOT NULL,address TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,description TEXT NOT NULL,website TEXT NOT NULL DEFAULT '',created TEXT NOT NULL);`);
if (!db.prepare('SELECT id FROM jobs LIMIT 1').get()) {
 const seeds = [
 ['Weekend Barista','Kopi Tuku','Food & Beverage','Jakarta','Cipete, Jakarta Selatan',180000,'Sabtu & Minggu','08.00 – 16.00','Bantu kami menyajikan kopi dan pengalaman hangat bagi tetangga Tuku. Kamu akan menyiapkan minuman, melayani pelanggan, dan menjaga area kerja tetap nyaman.','Ramah dan komunikatif\nTertarik pada dunia kopi\nBersedia bekerja Sabtu dan Minggu','#e8ede5','tuku'],
 ['Event Crew','Sunday People','Event & Hospitality','Jakarta','Senayan, Jakarta Pusat',250000,'Sabtu','09.00 – 18.00','Jadilah bagian dari tim di balik acara kreatif akhir pekan. Bantu registrasi, koordinasi pengunjung, dan kebutuhan operasional acara.','Komunikatif dan tepat waktu\nNyaman bekerja dalam tim\nTerbuka untuk mahasiswa','#eee6f5','sp.'],
 ['Store Assistant','Pot Meets Pop','Retail','Bandung','Braga, Bandung',175000,'Sabtu & Minggu','10.00 – 18.00','Temani pelanggan menemukan produk favorit dan bantu tim toko menciptakan pengalaman belanja yang menyenangkan.','Tertarik pada fashion\nTeliti dan ramah\nBersedia bekerja di toko','#f4e9d8','PMP'],
 ['Content Creator','Studio Senja','Kreatif & Digital','Remote','Kerja dari mana saja',300000,'Minggu','Fleksibel · 6 jam','Buat konten singkat yang bercerita untuk brand lokal. Mulai dari ide, pengambilan gambar, hingga editing video pendek.','Mampu mengedit video pendek\nMemiliki portofolio karya\nKreatif dan mandiri','#f3e4df','s.'],
 ['Guest Experience Host','Bobobox','Event & Hospitality','Bandung','Dago, Bandung',220000,'Sabtu & Minggu','08.00 – 16.00','Sambut tamu dan bantu mereka menikmati pengalaman menginap yang nyaman bersama tim operasional akhir pekan.','Komunikasi yang baik\nBahasa Inggris dasar\nBerorientasi pada pelayanan','#e0ece8','bob'],
 ['Tutor Bahasa Inggris','Cakap','Edukasi','Remote','Online',275000,'Sabtu','09.00 – 15.00','Bantu pelajar berlatih percakapan bahasa Inggris melalui kelas online interaktif dengan materi yang telah tersedia.','Lancar berbahasa Inggris\nSabar dan komunikatif\nKoneksi internet stabil','#e2eaf1','C']
 ];
 const insert=db.prepare('INSERT INTO jobs(id,title,company,category,city,location,pay,day,hours,description,requirements,color,logo,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 seeds.forEach((s,i)=>insert.run('demo-'+i,...s,new Date(Date.now()-i*86400000).toISOString()));
}
// Preserve existing jobs and infer their work arrangement on first migration.
if(!db.prepare('PRAGMA table_info(jobs)').all().some(column=>column.name==='work_mode')){
 db.exec("ALTER TABLE jobs ADD COLUMN work_mode TEXT NOT NULL DEFAULT 'Onsite'; UPDATE jobs SET work_mode='Remote' WHERE city='Remote';");
}
db.exec(`CREATE TABLE IF NOT EXISTS application_files(application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,name TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL);`);
const companyColumns=db.prepare('PRAGMA table_info(companies)').all().map(column=>column.name);
for(const column of ['business_type','employee_count'])if(!companyColumns.includes(column))db.exec(`ALTER TABLE companies ADD COLUMN ${column} TEXT NOT NULL DEFAULT '';`);
db.exec('CREATE TABLE IF NOT EXISTS company_logos(owner TEXT PRIMARY KEY REFERENCES companies(owner) ON DELETE CASCADE,mime TEXT NOT NULL,data BLOB NOT NULL,version TEXT NOT NULL);');
const employeeCounts=['Solopreneur','1-10','11-50','51-200','201-500','501-1000','1001-5000','5001+'];
const logoUrl=owner=>{if(!owner)return null;const logo=db.prepare('SELECT version FROM company_logos WHERE owner=?').get(owner);return logo?'/api/companies/'+owner+'/logo?v='+logo.version:null;};
const features=require('./features').createFeatures(db);
const authVerification=require('./auth-verification').createAuthVerification(db);
const withLogo=row=>({...row,logo_url:logoUrl(row.owner||row.company_owner),...((row.owner||row.company_owner)?features.trust(row.owner||row.company_owner):{}),...(row.user_id&&row.name?features.profile(db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id)): {})});
const getCompany=owner=>{const company=db.prepare('SELECT * FROM companies WHERE owner=?').get(owner);return company?{...company,...features.trust(owner),...phoneStatus(company),phone_verification:features.phone.pending(owner,'business',company.phone),logo_url:logoUrl(owner),registration_complete:features.trust(owner).profile_complete}:null;};
function validateLogo(file){
 if(!file||typeof file!=='object'||typeof file.data!=='string'||file.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw Object.assign(new Error('Logo harus berupa gambar PNG, JPG, atau WebP.'),{status:400});
 const data=Buffer.from(file.data,'base64');
 if(data.length>2*1024*1024)throw Object.assign(new Error('Ukuran logo maksimal 2 MB.'),{status:413});
 let mime;
 if(data.length>=33&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&data.subarray(12,16).toString()==='IHDR'&&data.readUInt32BE(16)>0&&data.readUInt32BE(20)>0)mime='image/png';
 else if(data.length>4&&data[0]===255&&data[1]===216&&data[2]===255&&data[data.length-2]===255&&data[data.length-1]===217)mime='image/jpeg';
 else if(data.length>=30&&data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP'&&data.readUInt32LE(4)===data.length-8)mime='image/webp';
 else throw Object.assign(new Error('Isi logo bukan gambar PNG, JPG, atau WebP yang valid.'),{status:400});
 return {data,mime,version:crypto.createHash('sha256').update(data).digest('hex').slice(0,24)};
}
const parsePay=value=>{
 if(typeof value==='number')return Number.isSafeInteger(value)?value:NaN;
 if(typeof value!=='string'||! /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(value.trim()))return NaN;
 return Number(value.trim().replace(/\./g,''));
};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const cleanAccount=u=>u?({id:u.id,name:u.name,email:u.email,role:u.role,email_verified:!!u.email_verified_at,email_change:authVerification.emailChange(u),bio:u.bio,phone:u.phone,phone_verification:features.phone.pending(u.id,'profile',u.phone),...features.profile(u),company:u.role==='company'?getCompany(u.id):null}):null;
const hash=(pass,salt=crypto.randomBytes(16).toString('hex'))=>salt+':'+crypto.scryptSync(pass,salt,64).toString('hex');
const verify=(pass,stored)=>{const check=hash(pass,stored.split(':')[0]);return crypto.timingSafeEqual(Buffer.from(check),Buffer.from(stored));};
const limits=new Map();
async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin');
 const url=new URL(req.url,'http://localhost'); const p=url.pathname; const method=req.method;
 try {
 if(!p.startsWith('/api/')){
  if(p==='/vendor/libphonenumber.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return fs.createReadStream(path.join(path.dirname(require.resolve('libphonenumber-js/package.json')),'bundle','libphonenumber-max.js')).pipe(res);}
  if(['/company','/company/'].includes(p)){res.writeHead(308,{Location:'/employer'+url.search});return res.end();}
  const filename=['/','/employer','/employer/'].includes(p)?'index.html':p.slice(1); const file=path.resolve(root,'public',filename);
  if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) return json(res,404,{error:'Halaman tidak ditemukan.'});
  res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','css':'text/css','js':'text/javascript','svg':'image/svg+xml','png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp','ico':'image/x-icon'})[path.extname(file).slice(1).toLowerCase()]||'application/octet-stream');return fs.createReadStream(file).pipe(res);
 }
 res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(method)&&req.headers.origin&&req.headers.origin!==`${req.socket.encrypted?'https':'http'}://${req.headers.host}`)return json(res,403,{error:'Asal permintaan tidak diizinkan.'});
 let body={};if(['POST','PATCH','PUT'].includes(method)){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>(p==='/api/applications'&&method==='POST'?8*1024*1024:(p==='/api/employer/company'&&method==='PUT'||p==='/api/profile'&&method==='PATCH')?3*1024*1024:30000))return json(res,413,{error:'Data terlalu besar.'});}try{body=JSON.parse(raw||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch{return json(res,400,{error:'Data tidak valid.'});}}
 const requestedPortal=req.headers['x-workend-portal']||'seeker';
 const portal=requestedPortal==='employer'?'company':requestedPortal;
 if(!['seeker','company'].includes(portal))return json(res,400,{error:'Portal tidak valid.'});
 const cookieName='workend_'+portal+'_session';
 const token=(req.headers.cookie||'').split(/;\s*/).find(x=>x.startsWith(cookieName+'='))?.split('=')[1];
 const accountSession=token?db.prepare("SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>? AND sessions.portal=? AND (sessions.portal<>'company' OR users.email_verified_at IS NOT NULL)").get(token,Date.now(),portal):null;
 const user=accountSession?{...accountSession,role:portal}:null;
 const cleanUser=u=>u?cleanAccount({...u,role:portal}):null;
 const requireUser=role=>{if(!user)throw Object.assign(new Error('Silakan masuk terlebih dahulu.'),{status:401});if(role&&user.role!==role)throw Object.assign(new Error('Akses tidak diizinkan untuk peran ini.'),{status:403});};
 const requireCompany=()=>{requireUser('company');const company=getCompany(user.id);if(!company?.registration_complete)throw Object.assign(new Error('Daftarkan perusahaan terlebih dahulu sebelum memasang atau membuka lowongan.'),{status:403});return company;};
 const str=(key,min=1,max=5000)=>{if(typeof body[key]!=='string'||body[key].trim().length<min||body[key].trim().length>max)throw Object.assign(new Error(`Isian ${key} belum sesuai.`),{status:400});return body[key].trim();};
 if(await authVerification.handle({p,method,body,req,res,portal,json,cleanUser,user,requireUser,verify}))return;
 if(await features.handle({p,method,body,user,req,res,json,requireUser,cleanUser,validateLogo}))return;
 if(p.match(/^\/api\/companies\/[^/]+\/logo$/)&&method==='GET'){
  const logo=db.prepare('SELECT mime,data FROM company_logos WHERE owner=?').get(p.split('/')[3]);
  if(!logo)return json(res,404,{error:'Logo tidak ditemukan.'});
  res.setHeader('Content-Type',logo.mime);res.setHeader('Content-Length',logo.data.length);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");return res.end(Buffer.from(logo.data));
 }
 if(p==='/api/employer/company'&&method==='GET'){requireUser('company');return json(res,200,{company:cleanUser(user).company});}
 if(p==='/api/employer/company'&&method==='PUT'){
  requireUser('company');
  const businessType=str('business_type'),employeeCount=str('employee_count');
  if(!['registered','individual'].includes(businessType)||!employeeCounts.includes(employeeCount))return json(res,400,{error:'Pilih jenis usaha dan jumlah karyawan yang tersedia.'});
  const normalizedPhone=normalizePhone(str('phone',1,30),body.phone_country??getCompany(user.id)?.phone_country??'ID',true);
  const name=str('name',2,100),industry=str('industry',2,100),city=str('city',2,80),address=str('address',10,500),email=str('email',3,254).toLowerCase(),phone=normalizedPhone.number,description=str('description',30,2000),website=body.website==null?'':str('website',0,500);
  if(!/^\S+@\S+\.\S+$/.test(email)||!/^\+?[\d\s().-]{8,30}$/.test(phone)||phone.replace(/\D/g,'').length<8)return json(res,400,{error:'Periksa email dan nomor telepon perusahaan.'});
  if(website){try{const link=new URL(website);if(!['http:','https:'].includes(link.protocol)||!link.hostname)throw new Error();}catch{return json(res,400,{error:'Website harus berupa tautan http atau https yang valid.'});}}
  if(body.logo_file&&body.remove_logo)return json(res,400,{error:'Pilih unggah logo baru atau hapus logo lama, bukan keduanya.'});
  const logo=body.logo_file?validateLogo(body.logo_file):null;
  db.exec('BEGIN');
  try{
   db.prepare('INSERT INTO companies(owner,name,industry,city,address,email,phone,description,website,created) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,industry=excluded.industry,city=excluded.city,address=excluded.address,email=excluded.email,phone=excluded.phone,description=excluded.description,website=excluded.website').run(user.id,name,industry,city,address,email,phone,description,website,new Date().toISOString());
   db.prepare('UPDATE companies SET business_type=?,employee_count=? WHERE owner=?').run(businessType,employeeCount,user.id);
   features.phone.saved(user.id,'business',normalizedPhone);
   db.prepare("UPDATE companies SET verified_email='',verified_at=NULL WHERE owner=? AND verified_email<>?").run(user.id,email);
   if(logo)db.prepare('INSERT INTO company_logos(owner,mime,data,version) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET mime=excluded.mime,data=excluded.data,version=excluded.version').run(user.id,logo.mime,logo.data,logo.version);
   else if(body.remove_logo===true)db.prepare('DELETE FROM company_logos WHERE owner=?').run(user.id);
   db.prepare('UPDATE jobs SET company=?,logo=? WHERE owner=?').run(name,name.slice(0,2).toUpperCase(),user.id);
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return json(res,200,{user:cleanUser(user)});
 }
 if(p==='/api/me'&&method==='GET')return json(res,200,{user:cleanUser(user),...(portal==='company'&&!user?authVerification.info(authVerification.pending(req)):{})});
 if(['/api/register','/api/login'].includes(p)&&method==='POST'){
  const key=req.socket.remoteAddress;const lim=limits.get(key)||{count:0,time:Date.now()};if(Date.now()-lim.time>600000){lim.count=0;lim.time=Date.now();}lim.count++;limits.set(key,lim);if(lim.count>40)return json(res,429,{error:'Terlalu banyak percobaan. Coba lagi 10 menit mendatang.'});
  const email=str('email',3,254).toLowerCase(); const password=str('password',8,128);let account;
  if(p==='/api/register'){
   const name=str('name',2,100);const role=portal;if((body.role&&body.role!==portal)||!/^\S+@\S+\.\S+$/.test(email))return json(res,400,{error:'Email atau peran tidak sesuai dengan portal ini.'});
   if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return json(res,409,{error:'Email sudah terdaftar. Silakan masuk.'});
   const id=crypto.randomUUID();db.prepare('INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)').run(id,name,email,hash(password),role);account=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  }else{account=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!account||!verify(password,account.password))return json(res,401,{error:'Email atau kata sandi tidak cocok.'});}
  if(portal==='company'&&!account.email_verified_at)return json(res,200,await authVerification.begin(account,res));
  const session=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(token,user_id,expires,portal) VALUES(?,?,?,?)').run(session,account.id,Date.now()+7*86400000,portal);
  res.setHeader('Set-Cookie',`${cookieName}=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`);return json(res,200,{user:cleanUser(account)});
 }
 if(p==='/api/logout'&&method==='POST'){if(user)db.prepare('DELETE FROM sessions WHERE token=?').run(token);res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);return json(res,200,{ok:true});}
 if(p==='/api/jobs'&&method==='GET')return json(res,200,{jobs:db.prepare('SELECT * FROM jobs WHERE active=1 AND (owner IS NULL OR owner IN (SELECT owner FROM companies)) ORDER BY created DESC').all().map(withLogo)});
 if(p==='/api/saved'&&method==='GET'){requireUser('seeker');return json(res,200,{saved:db.prepare('SELECT job_id FROM saved WHERE user_id=?').all(user.id).map(x=>x.job_id)});}
 if(p.match(/^\/api\/jobs\/[^/]+\/save$/)&&method==='POST'){requireUser('seeker');const id=p.split('/')[3];if(!db.prepare('SELECT id FROM jobs WHERE id=?').get(id))return json(res,404,{error:'Lowongan tidak ditemukan.'});const exists=db.prepare('SELECT * FROM saved WHERE user_id=? AND job_id=?').get(user.id,id);if(exists)db.prepare('DELETE FROM saved WHERE user_id=? AND job_id=?').run(user.id,id);else db.prepare('INSERT INTO saved VALUES(?,?)').run(user.id,id);return json(res,200,{saved:!exists});}
 if(p==='/api/applications'&&method==='GET'){requireUser();const rows=user.role==='seeker'?db.prepare('SELECT a.*,(SELECT name FROM application_files WHERE application_id=a.id) AS cv_name,j.owner AS company_owner,j.title,j.company,j.city,j.pay,j.day,j.logo,j.color FROM applications a JOIN jobs j ON a.job_id=j.id WHERE a.user_id=? ORDER BY a.created DESC').all(user.id):db.prepare('SELECT a.*,(SELECT name FROM application_files WHERE application_id=a.id) AS cv_name,j.title,u.name,u.email,u.phone,u.bio FROM applications a JOIN jobs j ON a.job_id=j.id JOIN users u ON a.user_id=u.id WHERE j.owner=? ORDER BY a.created DESC').all(user.id);return json(res,200,{applications:rows.map(withLogo)});}
 if(p.match(/^\/api\/applications\/[^/]+\/cv$/)&&method==='GET'){
  requireUser();
  const file=db.prepare('SELECT f.* FROM application_files f JOIN applications a ON a.id=f.application_id JOIN jobs j ON j.id=a.job_id WHERE a.id=? AND (a.user_id=? OR j.owner=?)').get(p.split('/')[3],user.id,user.id);
  if(!file)return json(res,404,{error:'Lampiran tidak ditemukan atau tidak dapat diakses.'});
  res.setHeader('Content-Type',file.mime);res.setHeader('Content-Disposition',`attachment; filename="cv.pdf"; filename*=UTF-8''${encodeURIComponent(file.name)}`);res.setHeader('Content-Length',file.data.length);return res.end(Buffer.from(file.data));
 }
 if(p==='/api/applications'&&method==='POST'){
  requireUser('seeker');
  const job=db.prepare('SELECT * FROM jobs WHERE id=? AND active=1 AND (owner IS NULL OR owner IN (SELECT owner FROM companies))').get(str('job_id'));
  if(!job)return json(res,404,{error:'Lowongan sudah tidak tersedia.'});
  if(!job.owner)return json(res,400,{error:'Ini lowongan demo. Lamaran tersedia untuk lowongan perusahaan terdaftar.'});
  if(job.owner===user.id)return json(res,400,{error:'Kamu tidak dapat melamar lowongan perusahaanmu sendiri.'});
  const letter=body.letter==null?'':str('letter',0,4000);
  const portfolio=body.portfolio==null?'':str('portfolio',0,500);
  const file=body.cv_file;
  if(!portfolio&&!file)return json(res,400,{error:'Isi minimal satu: tautan CV/portofolio atau lampiran PDF.'});
  if(portfolio){try{const link=new URL(portfolio);if(!['http:','https:'].includes(link.protocol)||!link.hostname)throw new Error();}catch{return json(res,400,{error:'Gunakan tautan portofolio http atau https yang valid.'});}}
  let fileData,fileName;
  if(file){
   if(typeof file!=='object'||typeof file.name!=='string'||!file.name.trim()||file.name.length>180||! /\.pdf$/i.test(file.name)||typeof file.data!=='string'||file.data.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(file.data))return json(res,400,{error:'Lampiran harus berupa file PDF yang valid.'});
   fileData=Buffer.from(file.data,'base64');
   if(fileData.length>5*1024*1024)return json(res,413,{error:'Ukuran PDF maksimal 5 MB.'});
   if(fileData.length<10||fileData.subarray(0,5).toString()!=='%PDF-'||!fileData.subarray(-1024).includes(Buffer.from('%%EOF')))return json(res,400,{error:'Isi file bukan PDF yang valid.'});
   fileName=file.name.replace(/[\\/\x00-\x1f\x7f]/g,'_');
  }
  const id=crypto.randomUUID();
  db.exec('BEGIN');
  try{
   db.prepare('INSERT INTO applications(id,job_id,user_id,letter,portfolio,created) VALUES(?,?,?,?,?,?)').run(id,job.id,user.id,letter,portfolio,new Date().toISOString());
   if(fileData)db.prepare('INSERT INTO application_files(application_id,name,mime,data) VALUES(?,?,?,?)').run(id,fileName,'application/pdf',fileData);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');if(e.message.includes('UNIQUE'))return json(res,409,{error:'Kamu sudah melamar lowongan ini.'});throw e;}
  return json(res,201,{ok:true,id});
 }
 if(['/api/company/jobs','/api/employer/jobs'].includes(p)&&method==='GET'){requireUser('company');return json(res,200,{jobs:db.prepare('SELECT j.*,(SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS applicants FROM jobs j WHERE owner=? ORDER BY created DESC').all(user.id).map(withLogo)});}
 if(p==='/api/jobs'&&method==='POST'){
  const company=requireCompany();
  if(body.no_fee_policy_accepted!==true)return json(res,400,{error:'Setujui kebijakan tanpa pungutan kepada pencari kerja sebelum menerbitkan lowongan.'});
  const workMode=body.work_mode??(body.city==='Remote'?'Remote':'Onsite');
  if(!['Onsite','Remote'].includes(workMode))return json(res,400,{error:'Pilih salah satu: Onsite atau Remote.'});
  const title=str('title',3,100),category=str('category'),city=workMode==='Remote'?'Remote':str('city',2,80),location=workMode==='Remote'?'Kerja dari mana saja':str('location',3,160),day=str('day'),hours=str('hours',3,80),description=str('description',30,4000),requirements=str('requirements',10,2000);
  const pay=parsePay(body.pay);
  if(!Number.isSafeInteger(pay)||pay<50000||pay>10000000)return json(res,400,{error:'Upah per hari minimal Rp50.000 dan maksimal Rp10.000.000.'});
  if(!['Sabtu','Minggu','Sabtu & Minggu'].includes(day)||!['Food & Beverage','Event & Hospitality','Retail','Kreatif & Digital','Edukasi','Lainnya'].includes(category))return json(res,400,{error:'Periksa kategori dan hari kerja.'});
  const extra=features.jobFields(body,workMode,day);
  const id=crypto.randomUUID();
  db.prepare('INSERT INTO jobs(id,owner,title,company,category,city,location,pay,day,hours,description,requirements,color,logo,created,work_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,title,company.name,category,city,location,pay,day,hours,description,requirements,'#eee6d8',company.name.slice(0,2).toUpperCase(),new Date().toISOString(),workMode);
  db.prepare('UPDATE jobs SET schedule_type=?,start_date=?,end_date=?,latitude=?,longitude=?,no_fee_policy_at=? WHERE id=?').run(...extra,new Date().toISOString(),id);
  return json(res,201,{id});
 }
 if(p.match(/^\/api\/jobs\/[^/]+$/)&&method==='PATCH'){requireUser('company');if(typeof body.active!=='boolean')return json(res,400,{error:'Status tidak valid.'});if(body.active)requireCompany();const result=db.prepare('UPDATE jobs SET active=? WHERE id=? AND owner=?').run(body.active?1:0,p.split('/')[3],user.id);return json(res,result.changes?200:404,result.changes?{ok:true}:{error:'Lowongan tidak ditemukan.'});}
 if(p.match(/^\/api\/applications\/[^/]+$/)&&method==='PATCH'){requireUser('company');if(!['Dikirim','Ditinjau','Wawancara','Diterima','Ditolak'].includes(body.status))return json(res,400,{error:'Status tidak valid.'});const result=db.prepare('UPDATE applications SET status=? WHERE id=? AND job_id IN(SELECT id FROM jobs WHERE owner=?)').run(body.status,p.split('/')[3],user.id);return json(res,result.changes?200:404,result.changes?{ok:true}:{error:'Lamaran tidak ditemukan.'});}
 return json(res,404,{error:'Endpoint tidak ditemukan.'});
 }catch(error){if(!error.status)console.error(error);return json(res,error.status||500,{error:error.status?error.message:'Terjadi kesalahan server. Silakan coba lagi.'});}
}
const server=http.createServer(handler);server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('Workend siap di http://localhost:'+(process.env.PORT||3000)));
