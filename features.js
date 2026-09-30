
const crypto = require('node:crypto');
const {createPhoneVerification,normalizePhone,phoneStatus}=require('./phone-verification');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max, fallback = '') => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim().length > max) fail('Isian terlalu panjang atau tidak valid.');
  return value.trim();
};

async function sendEmail(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) fail('Pengiriman email verifikasi belum diaktifkan oleh pengelola Workend.', 503);
  let response;
  try { response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [email], subject: 'Kode verifikasi kontak Workend',
      text: `Kode verifikasi email akun Employer Anda: ${code}\nBerlaku 10 menit. Jangan bagikan kode ini. Abaikan jika Anda tidak memintanya.` })
  }); } catch { fail('Layanan email tidak dapat dihubungi. Kode belum berhasil dikirim; coba lagi nanti.', 503); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || ['restricted_api_key','suspended_api_key','invalid_api_key','missing_api_key','invalid_permission'].includes(result.name)) fail('Layanan email belum siap karena konfigurasi pengirim bermasalah. Hubungi pengelola Workend.', 503);
    if (response.status === 403 && result.name === 'validation_error') fail('Pengiriman ke alamat ini belum diizinkan. Pengelola perlu memverifikasi domain pengirim atau mengaktifkan pengiriman di luar mode uji.', 503);
    if (['daily_quota_exceeded','monthly_quota_exceeded'].includes(result.name)) fail('Kuota pengiriman email layanan sedang habis. Hubungi pengelola Workend.', 503);
    if (response.status === 429) fail('Layanan email sedang membatasi pengiriman. Tunggu sebentar lalu coba lagi.', 429);
    fail('Email belum berhasil dikirim. Coba lagi nanti atau hubungi pengelola.', 503);
  }
  if (!result.id || typeof result.id !== 'string') fail('Layanan email belum mengonfirmasi pengiriman. Coba lagi nanti.', 503);
}

function createFeatures(db, options = {}) {
  const phone=createPhoneVerification(db,options.phoneProvider);
  for (const [table, columns] of Object.entries({
    users: { email_verified_at: 'TEXT', headline: "TEXT NOT NULL DEFAULT ''", experience: "TEXT NOT NULL DEFAULT ''", interests: "TEXT NOT NULL DEFAULT ''", skills: "TEXT NOT NULL DEFAULT ''", certificates: "TEXT NOT NULL DEFAULT ''" },
    companies: { verified_email: "TEXT NOT NULL DEFAULT ''", verified_at: 'TEXT' },
    jobs: { schedule_type: "TEXT NOT NULL DEFAULT 'recurring'", start_date: 'TEXT', end_date: 'TEXT', latitude: 'REAL', longitude: 'REAL', no_fee_policy_at: 'TEXT' }
  })) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    for (const [column, definition] of Object.entries(columns)) if (!existing.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS profile_photos(user_id TEXT PRIMARY KEY REFERENCES users(id), mime TEXT NOT NULL, data BLOB NOT NULL, version TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS contact_codes(owner TEXT PRIMARY KEY REFERENCES users(id),email TEXT NOT NULL,hash TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS verification_sends(owner TEXT NOT NULL,sent INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,reporter TEXT NOT NULL REFERENCES users(id),job_id TEXT REFERENCES jobs(id),employer_id TEXT NOT NULL REFERENCES users(id),target TEXT NOT NULL,reason TEXT NOT NULL,details TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Diterima',created TEXT NOT NULL,resolved_at TEXT,note TEXT NOT NULL DEFAULT '');`);

  function profile(user) {
    const photo = db.prepare('SELECT version FROM profile_photos WHERE user_id=?').get(user.id);
    return {...Object.fromEntries(['headline','experience','interests','skills','certificates'].map(key => [key, user[key] || '']).concat([['photo_url', photo ? `/api/profiles/${user.id}/photo?v=${photo.version}` : null]])),...phoneStatus(user)};
  }
  function trust(owner) {
    const c = db.prepare('SELECT * FROM companies WHERE owner=?').get(owner);
    const account=db.prepare('SELECT email_verified_at FROM users WHERE id=?').get(owner);
    return { profile_complete: !!(c && c.name && c.industry && c.city && c.address && c.email && c.phone && c.description && c.business_type && c.employee_count), contact_verified: !!account?.email_verified_at, contact_channel: account?.email_verified_at ? 'email' : null };
  }
  function jobFields(body, workMode, day) {
    const type = body.schedule_type || 'recurring';
    if (!['once', 'recurring'].includes(type)) fail('Pilih pola kerja yang tersedia.');
    const start = body.start_date || null, end = body.end_date || null;
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
    if ((start || end) && (!validDate(start) || !validDate(end))) fail('Isi tanggal mulai dan selesai yang valid.');
    if (body.schedule_type && !start) fail('Tentukan rentang tanggal kebutuhan pekerja.');
    if (start && (end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 1827)) fail('Rentang kerja harus berurutan dan maksimal 5 tahun.');
    if (start) {
      const first = new Date(start).getUTCDay();
      const span = (Date.parse(end) - Date.parse(start)) / 86400000;
      const hasDay = n => ((n - first + 7) % 7) <= span;
      if ((day.includes('Sabtu') && !hasDay(6)) || (day.includes('Minggu') && !hasDay(0))) fail('Rentang tanggal harus mencakup hari kerja yang dipilih.');
      if (type === 'once' && (span > 1 || ![0,6].includes(first) || ![0,6].includes(new Date(end).getUTCDay()))) fail('Satu akhir pekan hanya mencakup Sabtu dan/atau Minggu dalam pekan yang sama.');
    }
    let lat = null, lon = null;
    if (workMode === 'Onsite' && (body.latitude != null && body.latitude !== '' || body.longitude != null && body.longitude !== '')) {
      if(!['string','number'].includes(typeof body.latitude)||!['string','number'].includes(typeof body.longitude))fail('Titik lokasi tidak valid.');
      lat = Number(body.latitude); lon = Number(body.longitude);
      if (body.latitude === '' || body.longitude === '' || body.latitude == null || body.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) fail('Pilih titik lokasi kerja yang valid.');
    }
    if(body.schedule_type && workMode==='Onsite' && lat===null)fail('Pilih titik lokasi kerja untuk pencarian berdasarkan jarak.');
    return [type, start, end, lat, lon];
  }
  const geoCache = new Map();
  let geoNext = 0;
  async function handle({p,method,body,user,req,res,json,requireUser,cleanUser,validateLogo}) {
    if(await phone.handle({p,method,body,user,requireUser,res,json,cleanUser}))return true;
    if (/^\/api\/profiles\/[^/]+\/photo$/.test(p) && method === 'GET') {
      const id = p.split('/')[3];
      // Images cannot send the custom portal header. Authorize either valid portal session.
      const tokens = (req.headers.cookie || '').split(/;\s*/).filter(c => /^workend_(seeker|company)_session=/.test(c)).map(c => c.split('=')[1]);
      const allowed = tokens.some(token => {
        const viewer = db.prepare("SELECT user_id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>? AND (sessions.portal<>'company' OR users.email_verified_at IS NOT NULL)").get(token, Date.now());
        return viewer && (viewer.user_id === id || db.prepare('SELECT a.id FROM applications a JOIN jobs j ON a.job_id=j.id WHERE a.user_id=? AND j.owner=?').get(id, viewer.user_id));
      });
      if (!allowed) fail('Photo tidak dapat diakses.', 404);
      const photo = db.prepare('SELECT * FROM profile_photos WHERE user_id=?').get(id);
      if (!photo) fail('Foto tidak ditemukan.',404);
      res.setHeader('Content-Type',photo.mime);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.end(Buffer.from(photo.data));return true;
    }
    if (p === '/api/profile' && method === 'PATCH') {
      requireUser();
      if(body.email!==undefined&&body.email!==user.email)fail('Gunakan Ubah email untuk memverifikasi alamat baru.');
      const values = { name: text(body.name,100,user.name), bio:text(body.bio,1500,user.bio),phone:text(body.phone,30,user.phone), ...profile(user) };
      const normalized=normalizePhone(values.phone,body.phone_country??user.phone_country??'ID');values.phone=normalized.number;
      if (values.name.length < 2) fail('Nama minimal 2 karakter.');
      for (const [key,max] of [['headline',120],['experience',4000],['interests',500],['skills',1000],['certificates',3000]]) values[key] = text(body[key],max,user[key] || '');
      if (body.photo_file && body.remove_photo) fail('Pilih mengganti atau menghapus foto.');
      const photo = body.photo_file ? validateLogo(body.photo_file) : null;
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE users SET name=?,bio=?,phone=?,headline=?,experience=?,interests=?,skills=?,certificates=? WHERE id=?').run(values.name,values.bio,values.phone,values.headline,values.experience,values.interests,values.skills,values.certificates,user.id);
        phone.saved(user.id,'profile',normalized);
        if(photo) db.prepare('INSERT INTO profile_photos VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mime=excluded.mime,data=excluded.data,version=excluded.version').run(user.id,photo.mime,photo.data,photo.version);
        else if(body.remove_photo === true) db.prepare('DELETE FROM profile_photos WHERE user_id=?').run(user.id);
        db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK');throw error; }
      json(res,200,{user:cleanUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});return true;
    }
    if (p === '/api/reports' && method === 'POST') {
      requireUser('seeker');
      const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(text(body.job_id,100));
      if (!job?.owner) fail('Lowongan atau Employer tidak ditemukan.',404);
      const target = text(body.target,30), reason = text(body.reason,80), details = text(body.details,2000);
      if (!['lowongan','employer'].includes(target) || !['Meminta biaya/pungutan','Informasi palsu','Penipuan','Konten tidak pantas','Lainnya'].includes(reason) || details.length < 10) fail('Pilih jenis laporan, alasan, dan penjelasan minimal 10 karakter.');
      if (db.prepare('SELECT id FROM reports WHERE reporter=? AND target=? AND employer_id=? AND (target=\'employer\' OR job_id=?) AND status IN (\'Diterima\',\'Ditinjau\')').get(user.id,target,job.owner,job.id)) fail('Laporan untuk tujuan ini sudah tercatat dan menunggu penanganan.',409);
      if (db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter=? AND created>?').get(user.id,new Date(Date.now()-86400000).toISOString()).n >= 5) fail('Maksimal 5 laporan per hari.',429);
      const id=crypto.randomUUID();
      db.prepare('INSERT INTO reports(id,reporter,job_id,employer_id,target,reason,details,created) VALUES(?,?,?,?,?,?,?,?)').run(id,user.id,job.id,job.owner,target,reason,details,new Date().toISOString());
      json(res,201,{id,status:'Diterima'});return true;
    }
    if (p === '/api/reports' && method === 'GET') {
      requireUser('seeker');
      json(res,200,{reports:db.prepare('SELECT r.id,r.target,r.reason,r.details,r.status,r.created,r.resolved_at,j.title,j.company FROM reports r LEFT JOIN jobs j ON j.id=r.job_id WHERE reporter=? ORDER BY r.created DESC').all(user.id)});return true;
    }
    if (p === '/api/locations/search' && method === 'POST') {
      const query = text(body.query,160);
      if(query.length<3) fail('Ketik nama jalan, tempat, atau area minimal 3 karakter.');
      const cached=geoCache.get(query.toLowerCase());
      if(cached && cached.expires>Date.now()){json(res,200,{locations:cached.rows});return true;}
      if(Date.now()<geoNext) fail('Tunggu sebentar sebelum mencari lokasi lagi.',429);
      geoNext=Date.now()+1100;
      const endpoint=new URL(process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search');
      endpoint.search=new URLSearchParams({q:query,format:'jsonv2',limit:'5',countrycodes:'id'}).toString();
      try {
        const response=await fetch(endpoint,{headers:{'User-Agent':process.env.GEOCODER_USER_AGENT || 'Workend/1.0 (weekend job location search)','Accept-Language':'id'},signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error();
        const results=await response.json();
        const rows=results.map(r=>({label:r.display_name,latitude:Number(r.lat),longitude:Number(r.lon)})).filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude));
        if(geoCache.size>500)geoCache.clear();geoCache.set(query.toLowerCase(),{rows,expires:Date.now()+86400000});
        json(res,200,{locations:rows});return true;
      }catch{fail('Pencarian area belum tersedia. Coba lagi atau gunakan lokasi perangkat.',503);}
    }
    return false;
  }
  return {handle,profile,trust,jobFields,phone};
}
module.exports={createFeatures,sendEmail};
