// Shared UI for recurring work, contact verification, profiles, reports, and distance.
let workerLocationDraft=null;
const requiredMark='<span class="required-label" aria-label="Wajib diisi">*</span>';
function markRequiredFields(){
 for(const input of document.querySelectorAll?.('input[required],select[required],textarea[required]')||[]){
  const label=input.type==='radio'?input.closest('fieldset')?.querySelector('legend'):input.labels?.[0];
  if(label&&!label.querySelector('.required-label'))label.insertAdjacentHTML('beforeend',' '+requiredMark);
 }
}
function workerProfilePage(u){
 const sections=[['identity','Informasi pribadi'],['about','Tentang saya'],['experience','Pengalaman kerja'],['interests','Minat pekerjaan'],['skills','Keahlian'],['certificates','Sertifikat & pelatihan']];
 const completed=['photo_url','headline','bio','experience','interests','skills','certificates'].filter(key=>u[key]?.trim()).length;
 const percent=Math.round(completed/7*100);
 return `<main class="container page-content worker-profile">${pageHead('Profil profesional','Tunjukkan potensi dan pengalamanmu untuk kesempatan akhir pekan berikutnya.')}<form id="profile-form" class="worker-profile-layout"><aside class="profile-overview"><section class="panel profile-summary"><div class="profile-cover"></div><div id="photo-preview">${profileAvatar(u)}</div><span class="tag gold">Pencari kerja</span><h2>${esc(u.name)}</h2><p>${esc(u.headline||'Tambahkan judul profil untuk memperkenalkan keahlianmu.')}</p><div class="profile-completion"><div><strong>Kelengkapan profil</strong><span>${percent}%</span></div><progress max="100" value="${percent}" aria-label="Kelengkapan profil">${percent}%</progress><small>${percent===100?'Profilmu sudah terisi lengkap. Pastikan selalu diperbarui.':'Lengkapi bagian yang relevan agar Employer lebih mengenalmu. Bagian tambahan bersifat opsional.'}</small></div><nav class="profile-section-nav" aria-label="Bagian profil">${sections.map(([id,label])=>`<button type="button" data-action="profile-section" data-section="profile-${id}">${label}${icon('chevron')}</button>`).join('')}</nav></section><p class="profile-privacy">${icon('user')} Profil dibagikan kepada Employer saat kamu melamar.</p></aside><div class="profile-editor"><section class="panel profile-section" id="profile-identity"><div class="profile-section-title">${icon('user')}<div><h2>Informasi pribadi</h2><p>Foto dan informasi yang membantu Employer mengenalmu.</p></div></div><div class="field"><label for="f-photo-file">Foto profil (opsional)</label><input id="f-photo-file" name="photo_file" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG, atau WebP, maksimal 2 MB.</small>${u.photo_url?'<label class="check-label"><input name="remove_photo" type="checkbox">Hapus foto saat disimpan</label>':''}</div>${field('name','Nama lengkap','text',u.name,'required minlength="2" maxlength="100"')}${field('headline','Judul profil','text',u.headline||'','maxlength="120" placeholder="Contoh: Barista • Pelayanan pelanggan • Siap kerja weekend"')}${field('email','Email akun','email',u.email,'disabled')}${phoneFields(u,'profile')}</section><section class="panel profile-section" id="profile-about"><div class="profile-section-title">${icon('user')}<div><h2>Tentang saya</h2><p>Ceritakan kelebihan dan tujuanmu dalam beberapa kalimat.</p></div></div>${textarea('bio','Deskripsi diri',u.bio||'','maxlength="1500" placeholder="Apa yang kamu kuasai dan kontribusi apa yang ingin kamu berikan?"')}</section>${workerProfileFields(u)}<div class="profile-save-bar"><div class="form-error" role="alert"></div><span>Perubahan tersimpan setelah kamu menekan Simpan.</span><button type="submit" class="btn btn-primary">${icon('check')}Simpan perubahan</button></div></div></form></main>`;
}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-action=profile-section]');if(!button)return;
 const section=document.getElementById(button.dataset.section);section?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 section?.querySelector('input,textarea,select')?.focus({preventScroll:true});
});
function employerEmailField(u){
 return `${field('email','Email akun untuk masuk','email',u.email,'readonly aria-describedby="email-change-help"')}<div class="email-settings"><button type="button" class="btn btn-outline" data-action="change-email">${u.email_change?'Lanjutkan verifikasi email baru':'Ubah email'}</button><p class="field-hint" id="email-change-help">${u.email_change?'Menunggu verifikasi: '+esc(u.email_change.email)+'. Email lama masih aktif.':'Ganti email akun melalui verifikasi 6 angka. Email operasional perusahaan dikelola di halaman Perusahaan.'}</p></div>`;
}
function emailChangePrompt(){
 if(state.user?.role!=='company')return;
 if(state.user.email_change)return emailChangeConfirmation(state.user.email_change);
 modal(`<h2>Ubah email akun</h2><p class="subtitle">Email saat ini: <strong>${esc(state.user.email)}</strong>. Alamat lama tetap aktif sampai email baru berhasil diverifikasi.</p><form id="email-change-request">${field('email','Email baru','email','','required maxlength="254" autocomplete="email"')}${field('password','Kata sandi saat ini','password','','required maxlength="128" autocomplete="current-password"')}<p class="field-hint">Kode 6 angka akan dikirim ke email baru. Perubahan ini tidak mengganti email operasional perusahaan.</p><div class="form-error" role="alert"></div><button class="btn btn-primary full" type="submit">Kirim kode verifikasi</button></form>`);
}
function emailChangeConfirmation(pending){
 modal(`<h2>Verifikasi email baru</h2><p class="subtitle">Masukkan kode 6 angka yang dikirim ke <strong>${esc(pending.email)}</strong>.</p><form id="email-change-confirm"><div class="field"><label for="f-code">Kode verifikasi 6 angka</label><input class="otp-code" id="f-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required><small>Kode berlaku 10 menit. Email lama masih aktif hingga konfirmasi berhasil.</small></div><div class="form-error" role="alert"></div><button class="btn btn-primary full" type="submit">Verifikasi & ganti email</button></form><div class="verification-options"><button type="button" class="text-link" data-action="change-email-resend">Kirim ulang kode</button><button type="button" class="text-link" data-action="change-email-cancel">Batalkan perubahan</button></div><p class="field-hint">Kirim ulang tersedia setelah 60 detik. Setelah berhasil, sesi di perangkat lain akan berakhir; kamu tetap masuk di perangkat ini.</p>`);
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 const action=b.dataset.action;if(!['change-email','change-email-resend','change-email-cancel'].includes(action))return;
 b.disabled=true;
 try{
  if(action==='change-email')emailChangePrompt();
  if(action==='change-email-resend'){const result=await post('/profile/email/resend');state.user.email_change=result.email_change;emailChangeConfirmation(result.email_change);}
  if(action==='change-email-cancel'){await post('/profile/email/cancel');state.user.email_change=null;closeModal();render();toast('Perubahan dibatalkan. Email lama tetap aktif.');}
 }catch(error){const field=document.querySelector('#email-change-confirm .form-error');if(field)field.textContent=error.message;else toast(error.message);}finally{b.disabled=false;}
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!['email-change-request','email-change-confirm'].includes(form.id))return;
 e.preventDefault();const button=form.querySelector('[type=submit]'),error=form.querySelector('.form-error');button.disabled=true;error.textContent='';
 try{
  const data=Object.fromEntries(new FormData(form));
  if(form.id==='email-change-request'){const result=await post('/profile/email/request',data);form.elements.password.value='';state.user.email_change=result.email_change;emailChangeConfirmation(result.email_change);}
  else{const result=await post('/profile/email/confirm',data);state.user=result.user;closeModal();await refresh();toast('Email akun berhasil diganti dan terverifikasi.');}
 }catch(err){error.textContent=err.message;}finally{button.disabled=false;}
});
function locationPrompt(){
 workerLocationDraft=state.searchLocation?{...state.searchLocation}:null;
 modal(`<h2>Tentukan lokasi</h2><p class="subtitle">Pilih titik pencarian dan maksimal jarak pekerjaan dalam satu langkah.</p><form id="location-form">${locationPicker('worker')}<p class="selected-location notice" role="status">${workerLocationDraft?'Titik dipilih: '+esc(workerLocationDraft.label):'Belum memilih titik lokasi.'}</p><div class="field"><label for="radius-km">Maksimal jarak (km)</label><input id="radius-km" name="radius" type="number" min="1" max="500" step="1" inputmode="numeric" value="${state.searchLocation?(state.radius||''):10}" placeholder="Contoh: 10"><small>1–500 km. Kosongkan untuk tanpa batas jarak.</small></div><p class="field-hint">Jarak garis lurus, bukan rute perjalanan. Saat radius aktif, hanya lowongan onsite dengan titik lokasi yang ditampilkan. Lokasi perangkat hanya digunakan di sesi halaman ini dan tidak disimpan ke profil.</p><div class="form-error" role="alert"></div><button class="btn btn-primary full" type="submit">Terapkan lokasi</button>${state.searchLocation?'<button type="button" class="text-link reset-location" data-action="clear-distance">Hapus filter lokasi & jarak</button>':''}</form>`);
}
function verificationPrompt(data){
 state.pendingVerification=data;
 modal(`${brand()}<div class="eyebrow">VERIFIKASI EMAIL EMPLOYER</div><h2>Konfirmasi emailmu.</h2><p class="subtitle">Masukkan kode 6 angka untuk melanjutkan ke akun Employer.<br><strong>${esc(data.email)}</strong></p><div class="email-delivery"><p role="status">${data.email_sent?'Permintaan pengiriman diterima. Email bisa memerlukan beberapa saat.':'Kode belum terkirim ke emailmu.'}</p><button class="btn btn-gold full email-send-button" type="button" data-action="verification-send">${icon('arrow')}${data.email_sent?'Kirim ulang kode email':'Kirim kode ke email'}</button><small class="email-retry-hint">Belum menerima kode? Periksa folder spam dan pastikan alamat email benar.</small></div><form id="verification-form"><div class="form-error email-delivery-error" role="alert">${esc(data.delivery_error||'')}</div><div class="field"><label for="f-code">Kode verifikasi 6 angka</label><input class="otp-code" id="f-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required aria-describedby="otp-help"><small id="otp-help">Masukkan keenam angka, termasuk 0 di awal jika ada. Kode berlaku 10 menit.</small></div><button class="btn btn-primary full" type="submit" ${data.email_sent?'':'disabled'}>Verifikasi & masuk ${icon('arrow')}</button></form><div class="verification-options"><button class="text-link" type="button" data-action="verification-back">Kembali ke masuk</button></div>`);
 emailResendCountdown(data.retry_after);
}
function emailResendCountdown(seconds){
 const button=document.querySelector('[data-action=verification-send]');
 if(!button||!seconds)return;
 const deadline=Date.now()+Math.max(0,Number(seconds))*1000;
 const update=()=>{
  if(!button.isConnected)return;
  const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
  button.disabled=remaining>0;
  button.textContent=remaining?`Kirim kode lagi dalam ${remaining} detik`:state.pendingVerification?.email_sent?'Kirim ulang kode email':'Kirim kode ke email';
  if(remaining)setTimeout(update,1000);
 };
 update();
}
document.addEventListener('input',e=>{if(e.target.id==='f-code')e.target.value=e.target.value.replace(/\D/g,'').slice(0,6);});
document.addEventListener('paste',e=>{if(e.target.id==='f-code'){e.preventDefault();e.target.value=(e.clipboardData?.getData('text')||'').replace(/\D/g,'').slice(0,6);}});
function trustBadges(value) {
  return `<div class="trust-badges"><span class="trust-badge ${value.profile_complete?'confirmed':''}">${icon(value.profile_complete?'check':'briefcase')}${value.profile_complete?'Profil bisnis lengkap':'Profil bisnis belum lengkap'}</span><span class="trust-badge ${value.contact_verified?'confirmed':''}">${icon(value.contact_verified?'check':'user')}${value.contact_verified?'Kontak terverifikasi':'Kontak belum terverifikasi'}</span></div>`;
}
function verificationPanel() {
  const c=state.user?.company;if(!c)return '';
  return `<section class="panel verification-panel"><h2>Status Employer</h2>${trustBadges(c)}<p class="field-hint">Kontak terverifikasi berarti email akun penanggung jawab telah dikonfirmasi sebelum masuk. Ini bukan pemeriksaan legalitas usaha. Email operasional perusahaan yang berbeda tidak otomatis ikut terverifikasi.</p></section>`;
}
function scheduleLabel(j) {
  const date=s=>new Date(s+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
  return j.start_date&&j.end_date?`${j.schedule_type==='once'?'Satu akhir pekan':'Berulang setiap '+j.day} · ${date(j.start_date)} – ${date(j.end_date)}`:'Jangka waktu dikonfirmasi Employer';
}
function scheduleFields() {
  return `<fieldset class="choice-group"><legend>Jangka waktu kebutuhan pekerja</legend><div class="field"><label for="f-schedule_type">Pola kerja</label><select name="schedule_type" id="f-schedule_type"><option value="recurring">Berulang setiap akhir pekan</option><option value="once">Satu akhir pekan saja</option></select></div><div class="form-grid">${field('start_date','Tanggal mulai','date','','required')}${field('end_date','Tanggal selesai','date','','required')}</div><p class="field-hint">Pilih rentang beberapa minggu atau bulan untuk pekerjaan berulang. Pekerja hanya bekerja pada hari Sabtu/Minggu yang dipilih di dalam rentang tersebut.</p></fieldset>`;
}
function policyNotice(){return '<div class="notice">Melamar dan memperoleh pekerjaan melalui Workend tidak boleh dikenai pungutan. Jangan membayar deposit, biaya administrasi rekrutmen, atau biaya agar diterima. <button type="button" class="text-link" data-action="policy">Baca kebijakan</button></div>';}
function cvFields(){return `<fieldset class="choice-group"><legend>CV / portofolio ${requiredMark}</legend><p class="field-hint">Isi minimal salah satu: tautan atau file PDF. Jika salah satu sudah diisi, yang lainnya opsional. Keduanya juga boleh dilampirkan.</p>${field('portfolio','Tautan CV / portofolio','url','','maxlength="500" placeholder="https://…"')}<div class="field"><label for="f-cv-file">File CV / portofolio (PDF)</label><input id="f-cv-file" name="cv_file" type="file" accept=".pdf,application/pdf"><small>Maksimal 5 MB. Hanya kamu dan Employer penerima lamaran yang dapat mengunduhnya.</small></div></fieldset>`;}
async function readUpload(file,maxMB){
  if(file.size>maxMB*1024*1024)throw new Error(`Ukuran file maksimal ${maxMB} MB.`);
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('File tidak dapat dibaca.'));reader.readAsDataURL(file);});
  return {name:file.name,data};
}
async function flexibleCvPayload(form){
  const portfolio=form.elements.portfolio.value.trim(),file=form.elements.cv_file.files[0];
  if(!portfolio&&!file)throw new Error('Isi tautan CV/portofolio atau pilih file PDF. Cukup salah satu.');
  if(file&&!/\.pdf$/i.test(file.name))throw new Error('Lampiran CV harus PDF.');
  return {portfolio,...(file?{cv_file:await readUpload(file,5)}:{})};
}
function profileAvatar(user){return user.photo_url?`<img class="profile-avatar" src="${esc(user.photo_url)}" alt="Foto ${esc(user.name)}">`:`<span class="profile-avatar avatar-fallback" aria-label="Belum ada foto">${esc((user.name||'W').slice(0,1))}</span>`;}
function workerProfileFields(u){return [
 ['experience','Pengalaman kerja','Pengalaman kerja','briefcase',u.experience,4000,'Posisi • Nama tempat • Periode\nCeritakan tugas dan pencapaianmu. Pengalaman organisasi atau proyek juga boleh.'],
 ['interests','Minat pekerjaan','Bidang yang diminati','search',u.interests,500,'Contoh: Food & Beverage, retail, event'],
 ['skills','Keahlian','Keahlian','spark',u.skills,1000,'Contoh: latte art, pelayanan pelanggan, kasir'],
 ['certificates','Sertifikat & pelatihan','Sertifikat dan pelatihan','check',u.certificates,3000,'Nama sertifikat • Penerbit • Tahun\nTambahkan tautan sertifikat jika tersedia.']
 ].map(([id,title,label,symbol,value,max,placeholder])=>`<section class="panel profile-section" id="profile-${id}"><div class="profile-section-title">${icon(symbol)}<div><h2>${title}</h2><p>${id==='experience'?'Tunjukkan pengalaman yang relevan. Belum pernah bekerja? Kamu boleh mengosongkannya.':id==='interests'?'Bidang pekerjaan yang ingin kamu jelajahi di akhir pekan.':id==='skills'?'Tuliskan kemampuan yang dapat kamu gunakan saat bekerja.':'Tambahkan pelatihan yang mendukung keahlianmu.'}</p></div></div>${id==='interests'?field(id,label,'text',value||'',`maxlength="${max}" placeholder="${placeholder}"`):textarea(id,label,value||'',`maxlength="${max}" placeholder="${placeholder}"`)}</section>`).join('');}

function certificateContent(value){return String(value||'').split('\n').map(line=>/^https?:\/\/\S+$/.test(line.trim())?`<a href="${esc(line.trim())}" target="_blank" rel="noopener noreferrer">Lihat sertifikat ↗</a>`:esc(line)).join('<br>');}
function applicantProfile(a){return `<section class="applicant-profile"><div class="profile-intro">${profileAvatar(a)}<div><h3>${esc(a.name)}</h3><p>${esc(a.headline||'')}</p></div></div>${[['Pengalaman',a.experience],['Bidang minat',a.interests],['Keahlian',a.skills]].filter(([,v])=>v).map(([label,value])=>`<h3>${label}</h3><p class="detail-copy">${esc(value)}</p>`).join('')}${a.certificates?`<h3>Sertifikat dan pelatihan</h3><p class="detail-copy">${certificateContent(a.certificates)}</p>`:''}</section>`;}
async function profilePayload(form,data){
  const result={...data};delete result.photo_file;result.remove_photo=!!form.elements.remove_photo?.checked;
  const file=form.elements.photo_file?.files[0];
  if(file){if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Pilih foto PNG, JPG, atau WebP.');result.photo_file=await readUpload(file,2);}
  return result;
}
function reportForm(id,target='lowongan'){
  if(!state.user)return auth();if(state.user.role!=='seeker')return toast('Pelaporan tersedia untuk pencari kerja.');
  const job=state.jobs.find(j=>j.id===id);if(!job?.owner)return;
  modal(`<h2>Laporkan ${target==='employer'?'Employer':'lowongan'}</h2><p class="subtitle">${esc(job.title)} · ${esc(job.company)}</p><form id="report-form" data-id="${esc(id)}" data-target="${target}">${selectField('reason','Alasan laporan',['Meminta biaya/pungutan','Informasi palsu','Penipuan','Konten tidak pantas','Lainnya'])}${textarea('details','Ceritakan masalahnya','','required minlength="10" maxlength="2000" placeholder="Sebutkan kejadian dan informasi pendukung. Jangan sertakan data identitas atau rekening pribadi."')}<p class="field-hint">Identitas pelapor tidak ditampilkan kepada Employer. Laporan akan dicatat untuk ditinjau pengelola; pengiriman tidak otomatis menutup lowongan.</p><div class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">Kirim laporan</button></form>`);
}
async function myReports(){
  if(!state.user)return auth();const {reports}=await api('/reports');
  modal(`<h2>Laporan saya</h2>${reports.length?reports.map(r=>`<article class="report-item"><h3>${esc(r.target==='employer'?r.company:r.title)}</h3><span class="tag gold">${esc(r.status)}</span><p>${esc(r.reason)}</p><p class="detail-copy">${esc(r.details)}</p><small>${new Date(r.created).toLocaleString('id-ID')}</small></article>`).join(''):'<p>Belum ada laporan yang dikirim.</p>'}`);
}
function haversine(a,b){
  if(!a||b.latitude==null||b.longitude==null||b.work_mode==='Remote'||b.city==='Remote')return null;
  const rad=x=>x*Math.PI/180,dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
function distanceLabel(j){const d=haversine(state.searchLocation,j);return d===null?'':` · ${d.toLocaleString('id-ID',{maximumFractionDigits:1})} km` ;}
function distanceFilter(){return `<div class="filter-group"><div class="filter-title">Jarak dari lokasimu</div><button type="button" class="btn btn-outline location-trigger" data-action="search-location">${icon('pin')}${state.searchLocation?'Ubah lokasi & jarak':'Tentukan lokasi'}</button><p class="field-hint location-summary">${esc(state.searchLocation?.label||'Pilih lokasi dan maksimal jarak di popup.')}${state.searchLocation?`<br><strong>${state.radius?'Maksimal '+state.radius+' km':'Tanpa batas jarak'}</strong>`:''}</p></div>`;}
function locationPicker(target){return `<div class="location-picker" data-target="${target}"><button type="button" class="btn btn-outline" data-action="device-location">${icon('pin')}Gunakan lokasi perangkat</button><div class="field"><label for="location-query-${target}">Cari nama tempat atau area</label><input id="location-query-${target}" class="location-query" maxlength="160" placeholder="Contoh: Stasiun MRT Cipete Raya"></div><button type="button" class="btn btn-outline" data-action="find-location">Cari area</button><div class="location-feedback" role="status"></div><div class="location-results"></div><small>Hasil pencarian © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Hanya teks pencarian area yang dikirim ke penyedia peta.</small></div>`;}
function workplaceFields(){return `<div class="workplace-location"><h3>Titik lokasi kerja</h3><p class="field-hint">Pilih titik tempat pekerja akan hadir agar lowongan bisa dicari berdasarkan jarak. Gunakan lokasi perangkat hanya ketika berada di tempat kerja.</p>${locationPicker('workplace')}<input type="hidden" name="latitude"><input type="hidden" name="longitude"><p class="workplace-selected field-hint" role="status">Belum memilih titik lokasi.</p></div>`;}
function setPickedLocation(picker,point){
  if(picker.dataset.target==='worker'){workerLocationDraft=point;picker.closest('form').querySelector('.selected-location').textContent='Titik dipilih: '+point.label;picker.querySelector('.location-results').innerHTML='';}
  else {const form=picker.closest('form');form.elements.latitude.value=point.latitude;form.elements.longitude.value=point.longitude;form.querySelector('.workplace-selected').textContent='Titik dipilih: '+point.label;picker.querySelector('.location-results').innerHTML='';}
}
function currentPosition(){return new Promise((resolve,reject)=>{
  if(!navigator.geolocation)return reject(new Error('Browser tidak mendukung lokasi. Cari area secara manual.'));
  navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,label:`Lokasi perangkat (akurasi sekitar ${Math.round(p.coords.accuracy)} m)`}),e=>reject(new Error(e.code===1?'Izin lokasi ditolak. Izinkan lokasi di browser atau cari area secara manual.':'Lokasi belum tersedia. Coba lagi atau cari area secara manual.')),{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
});}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
  const picker=b.closest('.location-picker');
  try{
    if(a==='policy')modal('<h2>Kebijakan tanpa pungutan</h2><p class="detail-copy">Employer dilarang meminta biaya untuk melamar atau memperoleh pekerjaan melalui Workend, termasuk deposit, biaya administrasi rekrutmen, pembelian paket wajib agar diterima, dan biaya penempatan.\n\nJika diminta membayar, hentikan proses dan gunakan tombol Laporkan pada detail lowongan. Pengelola dapat meninjau laporan, meminta klarifikasi, dan menutup lowongan atau membatasi akun jika terbukti melanggar.\n\nUpah, jadwal, dan tugas harus dijelaskan sebelum pekerja menyetujui pekerjaan. Verifikasi kontak hanya membuktikan akses ke kontak bisnis tersebut.</p>');
    if(a==='report-job')reportForm(b.dataset.id);
    if(a==='report-employer')reportForm(b.dataset.id,'employer');
    if(a==='my-reports')await myReports();
    if(a==='verification-send'){b.disabled=true;b.textContent='Mengirim kode…';try{const r=await post('/auth/verification/send');verificationPrompt(r);}catch(error){try{const current=await api('/me');if(current.verification_required&&b.isConnected)verificationPrompt({...current,delivery_error:error.message});}catch{}const field=document.querySelector('#verification-form .form-error');if(field)field.textContent=error.message;}finally{if(b.isConnected){b.disabled=false;b.textContent=state.pendingVerification?.email_sent?'Kirim ulang kode email':'Kirim kode ke email';}}}
    if(a==='verification-back'){try{await post('/auth/verification/cancel');}catch{}state.pendingVerification=null;auth();}
    if(a==='search-location')locationPrompt();
    if(a==='clear-distance'){state.radius=null;state.searchLocation=null;closeModal();render();}
    if(a==='device-location'){b.disabled=true;try{setPickedLocation(picker,await currentPosition());}finally{b.disabled=false;}}
    if(a==='find-location'){
      const feedback=picker.querySelector('.location-feedback');feedback.textContent='Mencari area…';b.disabled=true;
      try{const {locations}=await post('/locations/search',{query:picker.querySelector('.location-query').value.trim()});
        picker.querySelector('.location-results').innerHTML=locations.map(p=>`<button type="button" data-action="pick-location" data-lat="${p.latitude}" data-lon="${p.longitude}" data-label="${esc(p.label)}">${icon('pin')}${esc(p.label)}</button>`).join('');feedback.textContent=locations.length?'Pilih area yang paling sesuai:':'Area tidak ditemukan. Tambahkan nama kota atau tempat terdekat.';
      }catch(error){feedback.textContent=error.message;}finally{b.disabled=false;}
    }
    if(a==='pick-location')setPickedLocation(picker,{latitude:Number(b.dataset.lat),longitude:Number(b.dataset.lon),label:b.dataset.label});
  }catch(error){toast(error.message);}
});
document.addEventListener('change',e=>{
  if(e.target.name==='photo_file'){
    const file=e.target.files[0],form=e.target.form;if(!file)return;
    if(file.size>2*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){e.target.value='';toast('Foto harus PNG, JPG, atau WebP, maksimal 2 MB.');return;}
    if(form.elements.remove_photo)form.elements.remove_photo.checked=false;
    const reader=new FileReader();reader.onload=()=>{if(form.isConnected)form.querySelector('#photo-preview').innerHTML=`<img class="profile-avatar" src="${reader.result}" alt="Pratinjau foto profil">`;};reader.readAsDataURL(file);
  }
  if(e.target.name==='remove_photo'&&e.target.checked){e.target.form.elements.photo_file.value='';e.target.form.querySelector('#photo-preview').innerHTML=profileAvatar({...state.user,photo_url:null});}
});
document.addEventListener('submit',async e=>{
  const f=e.target;if(!['report-form','verification-form','location-form'].includes(f.id))return;e.preventDefault();
  const b=f.querySelector('[type=submit]'),error=f.querySelector('.form-error');b.disabled=true;error.textContent='';
  try{const data=Object.fromEntries(new FormData(f));
    if(f.id==='location-form'){if(!workerLocationDraft)throw new Error('Pilih titik lokasi terlebih dahulu.');const radius=data.radius?Number(data.radius):null;if(radius!==null&&(!Number.isInteger(radius)||radius<1||radius>500))throw new Error('Maksimal jarak harus 1?500 km.');state.searchLocation={...workerLocationDraft};state.radius=radius;state.city='';closeModal();render();toast('Lokasi dan jarak pencarian diterapkan.');}
    else if(f.id==='report-form'){const r=await post('/reports',{...data,target:f.dataset.target,job_id:f.dataset.id});modal(`<h2>Laporan tercatat</h2><p>Laporan kamu diterima untuk ditinjau pengelola.</p><p class="field-hint">Nomor laporan: ${esc(r.id)}</p><button class="btn btn-outline" data-action="my-reports">Lihat laporan saya</button>`);}
    else{const r=await post('/auth/verification/confirm',data);state.user=r.user;state.pendingVerification=null;await refresh();closeModal();navigate(companyComplete(state.user.company)?'dashboard':'business');toast('Email terverifikasi. Selamat datang di Workend Employer.');}
  }catch(err){error.textContent=err.message;}finally{b.disabled=false;}
});
