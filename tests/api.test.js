const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
let server,dir,company,seeker,other,job,application;
const base='http://127.0.0.1:3107';
const jobInput={no_fee_policy_accepted:true,title:'Weekend opportunity',category:'Retail',city:'Jakarta',location:'Cipete, Jakarta Selatan',pay:150000,day:'Sabtu',hours:'08.00 - 16.00',description:'Membantu operasional toko serta melayani pelanggan pada akhir pekan.',requirements:'Ramah dan komunikatif, bersedia bekerja dalam tim.',work_mode:'Onsite'};
const businessInput={name:'Toko Melati',business_type:'individual',employee_count:'Solopreneur',industry:'Retail',city:'Jakarta',address:'Jalan Melati nomor 10, Jakarta Selatan',email:'toko@example.test',phone:'081234567890',description:'Usaha retail yang melayani kebutuhan harian pelanggan di lingkungan sekitar.'};
const pngLogo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1kAAAAASUVORK5CYII=','base64');
function pdfBytes(size=400){const bytes=Buffer.alloc(size,32);bytes.write('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');bytes.write('\n%%EOF',size-6);return bytes;}
async function request(route,method='GET',body,cookie,portal,autoVerify=true){portal=portal||(cookie?.startsWith('workend_company_')||body?.role==='company'?'company':'seeker');const r=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json','X-Workend-Portal':portal,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});const response={status:r.status,body:await r.json(),cookie:r.headers.getSetCookie().find(c=>/workend_.*_(?:session|pending)=.+/.test(c))?.split(';')[0]};if(autoVerify&&response.body.verification_required&&['/register','/login'].includes(route)){const code=JSON.parse(fs.readFileSync(path.join(dir,'mail-outbox.json'),'utf8'))[body.email];return request('/auth/verification/confirm','POST',{code},response.cookie,portal,false);}return response;}
before(async()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'workend-test-'));server=spawn(process.execPath,['--require','./tests/mail-transport.cjs','server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'3107',DATA_DIR:dir,NODE_ENV:'test',TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_AUTH_TOKEN:'test-token',TWILIO_VERIFY_SERVICE_SID:'VA'+'0'.repeat(32),RESEND_API_KEY:'test',MAIL_FROM:'Workend <test@example.test>'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server timeout')),10000);server.stdout.once('data',()=>{clearTimeout(timeout);resolve();});server.once('error',reject);});});
after(async()=>{server?.kill();await new Promise(resolve=>server?.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});});
test('Public jobs contain explicitly non-applicable demos',async()=>{const r=await request('/jobs');assert.equal(r.status,200);assert.equal(r.body.jobs.length,6);assert.ok(r.body.jobs.every(j=>j.owner===null));});
test('Register both roles and protect authentication',async()=>{const c=await request('/register','POST',{name:'Test Studio',email:'company@example.test',password:'test-password-123',role:'company'});assert.equal(c.status,200);company=c.cookie;assert.equal(c.body.user.password,undefined);assert.match(company,/workend_company_session=/);const s=await request('/register','POST',{name:'Test Candidate',email:'seeker@example.test',password:'test-password-123',role:'seeker'});assert.equal(s.status,200);seeker=s.cookie;const o=await request('/register','POST',{name:'Other Studio',email:'other@example.test',password:'test-password-123',role:'company'});other=o.cookie;assert.equal((await request('/login','POST',{email:'company@example.test',password:'wrong-password'})).status,401);assert.equal((await request('/applications')).status,401);assert.equal((await request('/company/jobs','GET',undefined,seeker)).status,403);});
test('Employer must register a valid company before publishing or reopening jobs',async()=>{assert.equal((await request('/me','GET',undefined,company,'employer')).body.user.company,null);assert.equal((await request('/jobs','POST',{},company,'employer')).status,403);assert.equal((await request('/jobs/demo-0','PATCH',{active:true},company,'employer')).status,403);const data={name:'Test Studio',business_type:'registered',employee_count:'1-10',industry:'Retail',city:'Jakarta',address:'Jalan Melati nomor 10, Jakarta Selatan',email:'business@example.test',phone:'081234567890',description:'Kami menyediakan produk kebutuhan harian dan pelayanan pelanggan yang ramah.',website:'https://example.test'};assert.equal((await request('/employer/company','PUT',data,seeker)).status,403);assert.equal((await request('/employer/company','PUT',{...data,address:''},company,'employer')).status,400);assert.equal((await request('/employer/company','PUT',{...data,email:'invalid'},company,'employer')).status,400);assert.equal((await request('/employer/company','PUT',{...data,phone:'abcdefgh'},company,'employer')).status,400);assert.equal((await request('/employer/company','PUT',{...data,website:'javascript:alert(1)'},company,'employer')).status,400);assert.equal((await request('/jobs','POST',{},company,'employer')).status,403);const r=await request('/employer/company','PUT',data,company,'employer');assert.equal(r.status,200);assert.equal(r.body.user.company.name,'Test Studio');assert.equal((await request('/employer/company','GET',undefined,other,'employer')).body.company,null);});
test('Publish job, validate weekends and enforce ownership',async()=>{const data={no_fee_policy_accepted:true,title:'Weekend test position',category:'Retail',city:'Jakarta',location:'Jakarta Selatan',pay:180000,day:'Sabtu',hours:'08.00 – 16.00',description:'Membantu operasional toko pada akhir pekan dengan pelayanan yang baik.',requirements:'Ramah, jujur, dan komunikatif.'};assert.equal((await request('/jobs','POST',data,seeker)).status,403);assert.equal((await request('/jobs','POST',{...data,day:'Senin'},company)).status,400);const r=await request('/jobs','POST',data,company);assert.equal(r.status,201);job=r.body.id;assert.equal((await request('/jobs/'+job,'PATCH',{active:false},other)).status,404);});
test('Save, apply, prevent duplicate and reject demo applications',async()=>{assert.equal((await request('/jobs/'+job+'/save','POST',{},seeker)).body.saved,true);assert.deepEqual((await request('/saved','GET',undefined,seeker)).body.saved,[job]);const data={job_id:job,letter:'Saya tertarik pada posisi ini dan siap bekerja pada hari Sabtu.',portfolio:'https://example.com/portfolio'};assert.equal((await request('/applications','POST',{...data,job_id:'demo-0'},seeker)).status,400);assert.equal((await request('/applications','POST',{...data,portfolio:'javascript:alert(1)'},seeker)).status,400);assert.equal((await request('/applications','POST',data,seeker)).status,201);assert.equal((await request('/applications','POST',data,seeker)).status,409);const list=await request('/applications','GET',undefined,company);assert.equal(list.body.applications.length,1);application=list.body.applications[0].id;assert.equal((await request('/applications','GET',undefined,other)).body.applications.length,0);});
test('Company updates status, seeker sees it, unauthorized writes fail',async()=>{assert.equal((await request('/applications/'+application,'PATCH',{status:'Diterima'},other)).status,404);assert.equal((await request('/applications/'+application,'PATCH',{status:'Diterima'},seeker)).status,403);assert.equal((await request('/applications/'+application,'PATCH',{status:'Wawancara'},company)).status,200);assert.equal((await request('/applications','GET',undefined,seeker)).body.applications[0].status,'Wawancara');assert.equal((await request('/jobs/'+job,'PATCH',{active:false},company)).status,200);assert.ok(!(await request('/jobs')).body.jobs.some(j=>j.id===job));assert.equal((await request('/company/jobs','GET',undefined,company)).body.jobs[0].applicants,1);});
test('Profile persists, logout invalidates session, login restores account',async()=>{const r=await request('/profile','PATCH',{name:'Updated Candidate',bio:'Weekend worker',phone:'08123456789'},seeker);assert.equal(r.body.user.name,'Updated Candidate');assert.equal((await request('/me','GET',undefined,seeker)).body.user.bio,'Weekend worker');await request('/logout','POST',{},seeker);assert.equal((await request('/me','GET',undefined,seeker)).body.user,null);const login=await request('/login','POST',{email:'seeker@example.test',password:'test-password-123'});assert.equal(login.status,200);assert.equal(login.body.user.name,'Updated Candidate');});
test('Cross-origin writes and invalid payloads rejected',async()=>{const r=await fetch(base+'/api/logout',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);const bad=await fetch(base+'/api/login',{method:'POST',body:'not json'});assert.equal(bad.status,400);assert.equal((await fetch(base+'/server.js')).status,404);});
test('Employer URLs load directly and old company links redirect',async()=>{for(const route of ['/','/employer','/employer/']){const response=await fetch(base+route);assert.equal(response.status,200);assert.match(await response.text(),/src="\/app.js"/);}for(const route of ['/company','/company/']){const response=await fetch(base+route,{redirect:'manual'});assert.equal(response.status,308);assert.equal(response.headers.get('location'),'/employer');}assert.equal((await fetch(base+'/employer/missing')).status,404);});
test('Portal login rejects opposite roles and registration cannot override portal role',async()=>{assert.equal((await request('/login','POST',{email:'company@example.test',password:'test-password-123'},undefined,'seeker')).status,403);assert.equal((await request('/login','POST',{email:'seeker@example.test',password:'test-password-123'},undefined,'company')).status,403);assert.equal((await request('/register','POST',{name:'Invalid Role',email:'invalid@example.test',password:'test-password-123',role:'company'},undefined,'seeker')).status,400);assert.equal((await request('/login','POST',{email:'company@example.test',password:'test-password-123'},undefined,'company')).status,200);});
test('Both portal sessions coexist and logging out one does not log out the other',async()=>{const login=await request('/login','POST',{email:'seeker@example.test',password:'test-password-123'},undefined,'seeker');seeker=login.cookie;const cookies=company+'; '+seeker;assert.equal((await request('/me','GET',undefined,cookies,'seeker')).body.user.role,'seeker');assert.equal((await request('/me','GET',undefined,cookies,'company')).body.user.role,'company');assert.equal((await request('/me','GET',undefined,company,'seeker')).body.user,null);assert.equal((await request('/me','GET',undefined,seeker,'company')).body.user,null);await request('/logout','POST',{},cookies,'company');assert.equal((await request('/me','GET',undefined,cookies,'company')).body.user,null);assert.equal((await request('/me','GET',undefined,cookies,'seeker')).body.user.role,'seeker');company=(await request('/login','POST',{email:'company@example.test',password:'test-password-123'},undefined,'company')).cookie;});
test('Company advertisements appear in worker feed and closing/reopening updates availability',async()=>{const result=await request('/jobs','POST',{no_fee_policy_accepted:true,title:'Shared portal position',category:'Retail',city:'Bandung',location:'Braga, Bandung',pay:190000,day:'Minggu',hours:'10.00 - 18.00',description:'Melayani pelanggan dan membantu operasional toko pada akhir pekan.',requirements:'Ramah, teliti, dan mampu bekerja bersama tim.'},company,'company');assert.equal(result.status,201);const id=result.body.id;let feed=await request('/jobs','GET',undefined,seeker,'seeker');assert.ok(feed.body.jobs.some(j=>j.id===id&&j.company==='Test Studio'));assert.equal((await request('/applications','POST',{job_id:id,letter:'Saya siap membantu toko dan tersedia sepanjang hari Minggu.',portfolio:'https://example.test/cv'},seeker,'seeker')).status,201);const applicants=await request('/applications','GET',undefined,company,'company');assert.ok(applicants.body.applications.some(a=>a.job_id===id));await request('/jobs/'+id,'PATCH',{active:false},company,'company');assert.ok(!(await request('/jobs','GET',undefined,seeker,'seeker')).body.jobs.some(j=>j.id===id));await request('/jobs/'+id,'PATCH',{active:true},company,'company');assert.ok((await request('/jobs','GET',undefined,undefined,'seeker')).body.jobs.some(j=>j.id===id));});
test('Company identity stays separate from Employer contact profile and cannot be cleared',async()=>{await request('/profile','PATCH',{name:'Employer Contact',phone:'08123456789',bio:'Penanggung jawab perekrutan'},company,'employer');assert.equal((await request('/me','GET',undefined,company,'employer')).body.user.company.name,'Test Studio');let feed=(await request('/jobs')).body.jobs;assert.ok(feed.some(j=>j.owner&&j.company==='Test Studio'));const business=(await request('/employer/company','GET',undefined,company,'employer')).body.company;const update=await request('/employer/company','PUT',{...business,name:'Studio Baru'},company,'employer');assert.equal(update.status,200);assert.equal(update.body.user.name,'Employer Contact');assert.ok((await request('/jobs')).body.jobs.filter(j=>j.owner===update.body.user.id).every(j=>j.company==='Studio Baru'));assert.equal((await request('/employer/company','PUT',{...business,name:''},company,'employer')).status,400);assert.equal((await request('/employer/company','GET',undefined,company,'employer')).body.company.name,'Studio Baru');const login=await request('/login','POST',{email:'company@example.test',password:'test-password-123'},undefined,'employer');assert.equal(login.body.user.company.name,'Studio Baru');});
test('Onsite requires a workplace while Remote ignores stale location fields',async()=>{
 assert.equal((await request('/jobs','POST',{...jobInput,city:'',location:''},company)).status,400);
 assert.equal((await request('/jobs','POST',{...jobInput,work_mode:'Hybrid'},company)).status,400);
 const remote=await request('/jobs','POST',{...jobInput,work_mode:'Remote',city:'Jakarta',location:'Stale office address'},company);assert.equal(remote.status,201);
 const j=(await request('/jobs')).body.jobs.find(j=>j.id===remote.body.id);assert.equal(j.work_mode,'Remote');assert.equal(j.city,'Remote');assert.equal(j.location,'Kerja dari mana saja');
 const noLocation={...jobInput,work_mode:'Remote'};delete noLocation.city;delete noLocation.location;assert.equal((await request('/jobs','POST',noLocation,company)).status,201);
});
test('Daily pay accepts Indonesian separators with a minimum of Rp50.000',async()=>{
 for(const pay of [50000,'50000','50.000','150.000',150000]){const r=await request('/jobs','POST',{...jobInput,pay},company);assert.equal(r.status,201);const j=(await request('/jobs')).body.jobs.find(j=>j.id===r.body.id);assert.equal(j.pay,Number(String(pay).replace(/\./g,'')));}
 for(const pay of [49999,'49.999',0,-50000,'150.00','1e5',50000.5,10000001])assert.equal((await request('/jobs','POST',{...jobInput,pay},company)).status,400);
});
test('Application requires at least one CV source and accepts both',async()=>{
 const id=(await request('/jobs','POST',jobInput,company)).body.id;
 assert.equal((await request('/applications','POST',{job_id:id},seeker)).status,400);
 assert.equal((await request('/applications','POST',{job_id:id,letter:'',portfolio:'not-a-url'},seeker)).status,400);
 const both=await request('/applications','POST',{job_id:id,portfolio:'https://example.test',cv_file:{name:'cv.pdf',data:pdfBytes().toString('base64')}},seeker);assert.equal(both.status,201);
 const bothSaved=(await request('/applications','GET',undefined,company)).body.applications.find(a=>a.id===both.body.id);assert.equal(bothSaved.cv_name,'cv.pdf');assert.equal(bothSaved.portfolio,'https://example.test');
 const linkJob=(await request('/jobs','POST',jobInput,company)).body.id;
 const result=await request('/applications','POST',{job_id:linkJob,portfolio:'https://example.test/my-cv'},seeker);assert.equal(result.status,201);
 const a=(await request('/applications','GET',undefined,company)).body.applications.find(a=>a.id===result.body.id);assert.equal(a.letter,'');assert.equal(a.portfolio,'https://example.test/my-cv');assert.equal(a.cv_name,null);
});
test('PDF upload validates size/content and limits downloads to applicant and receiving Employer',async()=>{
 const id=(await request('/jobs','POST',jobInput,company)).body.id;
 for(const cv_file of [{name:'cv.exe',data:pdfBytes().toString('base64')},{name:'cv.pdf',data:Buffer.from('This is not a PDF').toString('base64')},{name:'cv.pdf',data:'invalid-base64'}])assert.equal((await request('/applications','POST',{job_id:id,cv_file},seeker)).status,400);
 const tooLarge={name:'cv.pdf',data:pdfBytes(5*1024*1024+1).toString('base64')};assert.equal((await request('/applications','POST',{job_id:id,cv_file:tooLarge},seeker)).status,413);
 const bytes=pdfBytes(5*1024*1024);const cv_file={name:'CV Pelamar.pdf',data:bytes.toString('base64')};
 const result=await request('/applications','POST',{job_id:id,letter:'',cv_file},seeker);assert.equal(result.status,201);const appId=result.body.id;
 for(const [cookie,portal] of [[seeker,'seeker'],[company,'employer']]){const r=await fetch(base+'/api/applications/'+appId+'/cv',{headers:{Cookie:cookie,'X-Workend-Portal':portal}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');assert.match(r.headers.get('content-disposition'),/attachment/);assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);}
 assert.equal((await request('/applications/'+appId+'/cv','GET',undefined,other,'employer')).status,404);assert.equal((await request('/applications/'+appId+'/cv')).status,401);
 const outsider=await request('/register','POST',{name:'Another Applicant',email:'outsider@example.test',password:'test-password-123',role:'seeker'});assert.equal((await request('/applications/'+appId+'/cv','GET',undefined,outsider.cookie)).status,404);
 for(const cookie of [company,seeker]){const a=(await request('/applications','GET',undefined,cookie)).body.applications.find(a=>a.id===appId);assert.equal(a.cv_name,'CV Pelamar.pdf');assert.equal(a.portfolio,'');assert.equal(a.data,undefined);}
 assert.equal((await request('/applications','POST',{job_id:id,cv_file},seeker)).status,409);
});
test('Business type, employee count and office address are required for both business categories',async()=>{
 for(const overrides of [{business_type:''},{business_type:'unknown'},{employee_count:''},{employee_count:'1000000'},{address:''}])assert.equal((await request('/employer/company','PUT',{...businessInput,...overrides},other,'employer')).status,400);
 assert.equal((await request('/jobs','POST',jobInput,other,'employer')).status,403);
 for(const business_type of ['individual','registered']){const r=await request('/employer/company','PUT',{...businessInput,business_type},other,'employer');assert.equal(r.status,200);assert.equal(r.body.user.company.business_type,business_type);assert.equal(r.body.user.company.registration_complete,true);assert.equal(r.body.user.company.logo_url,null);}
 for(const employee_count of ['Solopreneur','1-10','11-50','51-200','201-500','501-1000','1001-5000','5001+']){const r=await request('/employer/company','PUT',{...businessInput,employee_count},other,'employer');assert.equal(r.status,200);assert.equal(r.body.user.company.employee_count,employee_count);}
});
test('Optional company logo is public on existing jobs, persists through edits, and can be removed',async()=>{
 const business=(await request('/employer/company','GET',undefined,company,'employer')).body.company;
 const logo_file={data:pngLogo.toString('base64')};
 assert.equal((await request('/employer/company','PUT',{...business,logo_file},seeker)).status,403);
 const result=await request('/employer/company','PUT',{...business,logo_file},company,'employer');assert.equal(result.status,200);const owner=result.body.user.id;const url=result.body.user.company.logo_url;assert.match(url,/^\/api\/companies\/[^/]+\/logo\?v=/);assert.equal(result.body.user.company.data,undefined);
 const image=await fetch(base+url);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await image.arrayBuffer()),pngLogo);
 const rows=(await request('/jobs')).body.jobs.filter(j=>j.owner===owner);assert.ok(rows.length>0);assert.ok(rows.every(j=>j.logo_url===url));assert.ok(rows.every(j=>j.address===undefined&&j.email===undefined));
 const apps=(await request('/applications','GET',undefined,seeker)).body.applications;assert.ok(apps.some(a=>a.company_owner===owner&&a.logo_url===url));
 assert.equal((await request('/employer/company','GET',undefined,other,'employer')).body.company.logo_url,null);
 const edit=await request('/employer/company','PUT',{...business,name:'Updated Business Name'},company,'employer');assert.equal(edit.body.user.company.logo_url,url);
 const removed=await request('/employer/company','PUT',{...business,remove_logo:true},company,'employer');assert.equal(removed.body.user.company.logo_url,null);assert.equal((await fetch(base+url)).status,404);assert.ok((await request('/jobs')).body.jobs.filter(j=>j.owner===owner).every(j=>j.logo_url===null));
});
test('Invalid or oversized logos do not modify the saved company',async()=>{
 const business=(await request('/employer/company','GET',undefined,company,'employer')).body.company;
 for(const data of [Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),'invalid',Buffer.alloc(0).toString('base64')])assert.equal((await request('/employer/company','PUT',{...business,name:'Must not persist',logo_file:{data}},company,'employer')).status,400);
 const oversized=Buffer.alloc(2*1024*1024+1);pngLogo.copy(oversized);assert.equal((await request('/employer/company','PUT',{...business,logo_file:{data:oversized.toString('base64')}},company,'employer')).status,413);
 assert.equal((await request('/employer/company','PUT',{...business,logo_file:{data:pngLogo.toString('base64')},remove_logo:true},company,'employer')).status,400);
 assert.equal((await request('/employer/company','GET',undefined,company,'employer')).body.company.name,business.name);
});


test('Recurring dates and coordinates persist; policy agreement is mandatory',async()=>{
 const input={...jobInput,schedule_type:'recurring',start_date:'2026-10-01',end_date:'2027-01-31',latitude:-6.2,longitude:106.8};
 assert.equal((await request('/jobs','POST',{...input,no_fee_policy_accepted:false},company)).status,400);
 const result=await request('/jobs','POST',input,company);assert.equal(result.status,201);
 const row=(await request('/jobs')).body.jobs.find(j=>j.id===result.body.id);
 assert.equal(row.start_date,input.start_date);assert.equal(row.end_date,input.end_date);assert.equal(row.latitude,-6.2);assert.equal(row.profile_complete,true);assert.equal(row.contact_verified,true);assert.ok(row.no_fee_policy_at);
 assert.equal((await request('/jobs','POST',{...input,end_date:'2026-09-01'},company)).status,400);
 assert.equal((await request('/jobs','POST',{...input,latitude:100},company)).status,400);
});
test('Worker profiles and photos persist and remain limited to the worker and receiving Employer',async()=>{
 const data={name:'Updated Candidate',bio:'Ready for weekends',phone:'0812345678',headline:'Experienced barista',experience:'Barista at Cafe A, 2024?2026',interests:'F&B, Event',skills:'Latte art, cashier',certificates:'Barista Certificate, 2025\nhttps://example.test/certificate',photo_file:{data:pngLogo.toString('base64')}};
 const updated=await request('/profile','PATCH',data,seeker);assert.equal(updated.status,200);assert.equal(updated.body.user.skills,data.skills);assert.ok(updated.body.user.photo_url);
 const me=(await request('/me','GET',undefined,seeker)).body.user;assert.equal(me.experience,data.experience);
 const photoUrl=base+me.photo_url;
 for(const cookie of [seeker,company])assert.equal((await fetch(photoUrl,{headers:{Cookie:cookie}})).status,200);
 assert.equal((await fetch(photoUrl)).status,404);assert.equal((await fetch(photoUrl,{headers:{Cookie:other}})).status,404);
 const applicant=(await request('/applications','GET',undefined,company)).body.applications.find(a=>a.user_id===me.id);assert.equal(applicant.skills,data.skills);assert.equal(applicant.photo_url,me.photo_url);
 assert.equal((await request('/profile','PATCH',{...data,skills:'x'.repeat(1001)},seeker)).status,400);
 await request('/profile','PATCH',{remove_photo:true},seeker);assert.equal((await fetch(photoUrl,{headers:{Cookie:seeker}})).status,404);
 assert.equal((await request('/me','GET',undefined,seeker)).body.user.headline,data.headline);
});
test('Reports enforce login, target ownership, duplicate protection and reporter privacy',async()=>{
 const id=(await request('/jobs','POST',jobInput,company)).body.id;
 const data={job_id:id,target:'lowongan',reason:'Meminta biaya/pungutan',details:'Diminta membayar biaya pendaftaran sebelum wawancara.'};
 assert.equal((await request('/reports','POST',data)).status,401);
 assert.equal((await request('/reports','POST',data,company)).status,403);
 assert.equal((await request('/reports','POST',{...data,job_id:'missing'},seeker)).status,404);
 const r=await request('/reports','POST',data,seeker);assert.equal(r.status,201);
 assert.equal((await request('/reports','POST',data,seeker)).status,409);
 assert.equal((await request('/reports','POST',{...data,target:'employer'},seeker)).status,201);
 const own=await request('/reports','GET',undefined,seeker);assert.ok(own.body.reports.some(item=>item.id===r.body.id));
 assert.equal((await request('/reports','GET',undefined,company)).status,403);
 const newSeeker=await request('/register','POST',{name:'Another Candidate',email:'another-candidate@example.test',password:'test-password-123'});
 assert.deepEqual((await request('/reports','GET',undefined,newSeeker.cookie)).body.reports,[]);
 assert.equal((await request('/auth/verification/send','POST',{},seeker)).status,403);
 assert.equal((await request('/auth/verification/confirm','POST',{code:'123456'},company)).status,401);
});


test('Employer registration and old unverified login cannot access the app until email confirmation',async()=>{
 const credentials={name:'Pending Employer',email:'pending@example.test',password:'test-password-123',role:'company'};
 const pending=await request('/register','POST',credentials,undefined,'employer',false);
 assert.equal(pending.status,200);assert.equal(pending.body.verification_required,true);assert.equal(pending.body.user,undefined);assert.match(pending.cookie,/workend_company_pending=/);assert.equal(pending.body.email_sent,true);
 const me=await request('/me','GET',undefined,pending.cookie,'employer');assert.equal(me.body.user,null);assert.equal(me.body.verification_required,true);
 for(const route of ['/employer/jobs','/employer/company','/applications'])assert.equal((await request(route,'GET',undefined,pending.cookie,'employer')).status,401);
 assert.equal((await request('/profile','PATCH',{name:'Attempt bypass'},pending.cookie,'employer')).status,401);
 const login=await request('/login','POST',credentials,undefined,'employer',false);assert.equal(login.body.verification_required,true);assert.equal(login.body.user,undefined);
 const code=JSON.parse(fs.readFileSync(path.join(dir,'mail-outbox.json'),'utf8'))[credentials.email];
 assert.equal((await request('/auth/verification/confirm','POST',{code:'abc123'},pending.cookie,'employer')).status,400);
 const verified=await request('/auth/verification/confirm','POST',{code},pending.cookie,'employer');assert.equal(verified.body.user.email_verified,true);assert.match(verified.cookie,/workend_company_session=/);
 assert.equal((await request('/auth/verification/confirm','POST',{code},login.cookie,'employer')).status,401);
 const nextLogin=await request('/login','POST',credentials,undefined,'employer',false);assert.equal(nextLogin.body.user.email_verified,true);assert.equal(nextLogin.body.verification_required,undefined);
});


test('Employer email change verifies the new address, preserves old access until confirmed and revokes old sessions',async()=>{
 const account={name:'Email Change Employer',email:'change-owner@example.test',password:'test-password-123',role:'company'};
 const original=await request('/register','POST',account,undefined,'employer');const session=original.cookie;
 const second=(await request('/login','POST',account,undefined,'employer')).cookie;
 await request('/employer/company','PUT',businessInput,session,'employer');
 const body={email:'NEW-OWNER@example.test',password:account.password};
 assert.equal((await request('/profile/email/request','POST',body,undefined,'employer')).status,401);
 assert.equal((await request('/profile/email/request','POST',body,seeker,'seeker')).status,403);
 assert.equal((await request('/profile/email/request','POST',{...body,password:'wrong'},session,'employer')).status,400);
 assert.equal((await request('/profile/email/request','POST',{...body,email:'invalid'},session,'employer')).status,400);
 assert.equal((await request('/profile/email/request','POST',{...body,email:account.email},session,'employer')).status,400);
 assert.equal((await request('/profile/email/request','POST',{...body,email:'company@example.test'},session,'employer')).status,409);
 assert.equal((await request('/profile','PATCH',{email:body.email},session,'employer')).status,400);
 const pending=await request('/profile/email/request','POST',body,session,'employer');assert.equal(pending.status,200);assert.equal(pending.body.email_change.email,'new-owner@example.test');
 let me=(await request('/me','GET',undefined,session,'employer')).body.user;assert.equal(me.email,account.email);assert.equal(me.email_verified,true);assert.equal(me.email_change.email,'new-owner@example.test');
 assert.equal((await request('/profile/email/resend','POST',{},session,'employer')).status,429);
 const code=JSON.parse(fs.readFileSync(path.join(dir,'mail-outbox.json'),'utf8'))['new-owner@example.test'];assert.ok(!JSON.stringify(pending.body).includes(code));
 assert.equal((await request('/profile/email/confirm','POST',{code:'12345'},session,'employer')).status,400);
 const done=await request('/profile/email/confirm','POST',{code},session,'employer');assert.equal(done.status,200);assert.equal(done.body.user.email,'new-owner@example.test');assert.equal(done.body.user.email_change,null);assert.equal(done.body.user.company.email,businessInput.email);assert.equal(done.body.user.email_verified,true);
 for(const old of [session,second])assert.equal((await request('/me','GET',undefined,old,'employer')).body.user,null);
 assert.equal((await request('/me','GET',undefined,done.cookie,'employer')).body.user.email,'new-owner@example.test');
 assert.equal((await request('/profile/email/confirm','POST',{code},done.cookie,'employer')).status,400);
 assert.equal((await request('/login','POST',account,undefined,'employer')).status,401);
 assert.equal((await request('/login','POST',{...account,email:'new-owner@example.test'},undefined,'employer')).status,200);
});


test('Phone country choice persists and SMS verifies only the saved profile number',async()=>{
 const user=await request('/register','POST',{name:'SMS Candidate',email:'sms-candidate@example.test',password:'test-password-123'});const cookie=user.cookie;
 let profile=await request('/profile','PATCH',{phone_country:'ID',phone:'081234567890'},cookie);assert.equal(profile.body.user.phone,'+6281234567890');assert.equal(profile.body.user.phone_country,'ID');assert.equal(profile.body.user.phone_verified,false);
 assert.equal((await request('/profile','PATCH',{phone_country:'SG',phone:'081234567890'},cookie)).status,400);
 assert.equal((await request('/phone/send','POST',{scope:'profile',sms_consent:true})).status,401);
 assert.equal((await request('/phone/send','POST',{scope:'profile'},cookie)).status,400);
 const sent=await request('/phone/send','POST',{scope:'profile',sms_consent:true,phone:'+6581234567'},cookie);assert.equal(sent.status,200);assert.equal(sent.body.number,'+6281234567890');
 assert.equal((await request('/phone/send','POST',{scope:'profile',sms_consent:true},cookie)).status,429);
 const code=JSON.parse(fs.readFileSync(path.join(dir,'sms-outbox.json'),'utf8'))['+6281234567890'].code;
 assert.equal((await request('/phone/confirm','POST',{scope:'profile',code},seeker)).status,400);
 const done=await request('/phone/confirm','POST',{scope:'profile',code},cookie);assert.equal(done.status,200);assert.equal(done.body.user.phone_verified,true);
 profile=await request('/profile','PATCH',{phone_country:'ID',phone:'081234567890'},cookie);assert.equal(profile.body.user.phone_verified,true);
 profile=await request('/profile','PATCH',{phone_country:'SG',phone:'81234567'},cookie);assert.equal(profile.body.user.phone,'+6581234567');assert.equal(profile.body.user.phone_verified,false);assert.equal(profile.body.user.phone_verification,null);
});
test('Business phone country and verification remain independent from Employer profile phone',async()=>{
 const user=await request('/register','POST',{name:'SMS Employer',email:'sms-employer@example.test',password:'test-password-123',role:'company'},undefined,'employer');const cookie=user.cookie;
 const business={...businessInput,phone_country:'SG',phone:'81234567'};
 const saved=await request('/employer/company','PUT',business,cookie,'employer');assert.equal(saved.body.user.company.phone,'+6581234567');assert.equal(saved.body.user.company.phone_verified,false);
 const sent=await request('/phone/send','POST',{scope:'business',sms_consent:true},cookie,'employer');assert.equal(sent.status,200);
 const code=JSON.parse(fs.readFileSync(path.join(dir,'sms-outbox.json'),'utf8'))['+6581234567'].code;
 assert.equal((await request('/phone/confirm','POST',{scope:'business',code},other,'employer')).status,400);
 const done=await request('/phone/confirm','POST',{scope:'business',code},cookie,'employer');assert.equal(done.body.user.company.phone_verified,true);assert.equal(done.body.user.phone_verified,false);
 const changed=await request('/employer/company','PUT',{...business,phone:'81234568'},cookie,'employer');assert.equal(changed.body.user.company.phone_verified,false);
});
