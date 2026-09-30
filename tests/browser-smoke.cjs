// Optional real-browser smoke: node tests/browser-smoke.cjs (Chrome installed).
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'workend-browser-'));
const origin='http://127.0.0.1:3111',debug='http://127.0.0.1:9338';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const processes=[];let ws;
async function waitHttp(url){for(let i=0;i<40;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(500)});if(r.ok)return r;}catch{}await pause(100);}throw new Error('Timeout '+url);}
async function run(){
 processes.push(spawn(process.execPath,['--require','./tests/mail-transport.cjs','server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'3111',DATA_DIR:path.join(temp,'data'),NODE_ENV:'test',TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_AUTH_TOKEN:'test-token',TWILIO_VERIFY_SERVICE_SID:'VA'+'0'.repeat(32),RESEND_API_KEY:'test',MAIL_FROM:'Workend <test@example.test>'},stdio:'ignore',windowsHide:true}));
 await waitHttp(origin);
 const executable=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 const chrome=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9338',`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{stdio:'ignore',windowsHide:true});processes.push(chrome);
 chrome.on('error',()=>{});
 await waitHttp(debug+'/json/version');const pages=await (await fetch(debug+'/json')).json();
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let id=0;const waiting=new Map(),errors=[];
 ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const p=waiting.get(data.id);if(p){waiting.delete(data.id);data.error?p.reject(new Error(JSON.stringify(data.error))):p.resolve(data.result);}}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text+': '+(data.params.exceptionDetails.exception?.description||''));};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;waiting.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(80);}throw new Error('Timed out: '+expression);};
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/employer'});await until("typeof state!=='undefined' && document.querySelector('[data-action=register]')");
 fs.mkdirSync(path.resolve('artifacts'),{recursive:true});
 await evaluate("auth('login')");
 for(const [width,theme] of [[1366,'light'],[390,'dark'],[320,'light']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await evaluate(`document.documentElement.dataset.theme='${theme}'`);
  assert.ok(await evaluate("document.querySelector('.modal>.eyebrow').getBoundingClientRect().top-document.querySelector('.modal>.brand').getBoundingClientRect().bottom>=24"));
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts',`auth-${width}-${theme}.png`),Buffer.from(screenshot.data,'base64'));
 }
 await evaluate("auth('register');document.querySelector('[name=name]').value='Browser Employer';document.querySelector('[name=email]').value='browser-employer@example.test';document.querySelector('[name=password]').value='test-password-123';document.querySelector('#auth-form').requestSubmit()");
 await until("!!document.querySelector('#verification-form')");
 assert.equal(await evaluate('state.user'),null);
 assert.equal(await evaluate("fetch('/api/employer/jobs',{headers:{'X-Workend-Portal':'employer'}}).then(r=>r.status)"),401);
 fs.mkdirSync(path.resolve('artifacts'),{recursive:true});
 for(const [width,theme] of [[1366,'light'],[390,'dark'],[320,'light']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await evaluate(`document.documentElement.dataset.theme='${theme}'`);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
  assert.ok(await evaluate("document.querySelector('.modal>.eyebrow').getBoundingClientRect().top-document.querySelector('.modal>.brand').getBoundingClientRect().bottom>=24"));
  assert.equal(await evaluate("document.querySelector('[data-action=verification-send]').disabled"),true);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts',`verification-${width}-${theme}.png`),Buffer.from(screenshot.data,'base64'));
 }
 // A rejected send must show an actionable error, never a successful delivery message.
 await evaluate("verificationPrompt({email:'browser-employer@example.test',email_sent:false});window.realFetch=fetch;window.fetch=async url=>String(url).endsWith('/me')?new Response(JSON.stringify({verification_required:true,email:'browser-employer@example.test',email_sent:false,retry_after:60})):new Response(JSON.stringify({error:'Pengiriman email verifikasi belum diaktifkan oleh pengelola Workend.'}),{status:503});document.querySelector('[data-action=verification-send]').click()");
 await until("document.querySelector('.email-delivery-error')?.textContent.includes('belum diaktifkan')");
 assert.equal(await evaluate("document.querySelector('#verification-form [type=submit]').disabled"),true);
 assert.equal(await evaluate("document.querySelector('[data-action=verification-send]').disabled"),true);
 await evaluate("window.fetch=window.realFetch;verificationPrompt({email:'browser-employer@example.test',email_sent:true,retry_after:0})");
 assert.equal(await evaluate("document.querySelector('[data-action=verification-send]').disabled"),false);
 const readyScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts','verification-send-ready-mobile.png'),Buffer.from(readyScreenshot.data,'base64'));
 const code=JSON.parse(fs.readFileSync(path.join(temp,'data','mail-outbox.json'),'utf8'))['browser-employer@example.test'];
 await evaluate(`(()=>{const clipboard=new DataTransfer();clipboard.setData('text','${code.slice(0,3)} ${code.slice(3)}');document.querySelector('#f-code').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:clipboard}));document.querySelector('#verification-form').requestSubmit();})()`);
 await until("!!state.user?.email_verified && !document.querySelector('#verification-form')");
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
 const setup=await evaluate(`(async()=>{const r=await api('/employer/company',{method:'PUT',body:JSON.stringify({name:'Cafe Browser',business_type:'individual',employee_count:'1-10',industry:'Kuliner',city:'Jakarta',address:'Jalan Browser nomor 10, Jakarta',email:'cafe@example.test',phone:'081234567890',description:'Cafe untuk pengujian jadwal akhir pekan Workend.'})});state.user=r.user;await refresh();return !!document.querySelector('.verification-panel');})()`);assert.equal(setup,true);
 await evaluate("newJob()");
 await evaluate(`(()=>{const f=document.querySelector('#job-form');for(const [k,v] of Object.entries({title:'Barista akhir pekan',category:'Food & Beverage',city:'Jakarta',location:'Cipete Jakarta',day:'Sabtu & Minggu',hours:'08.00–16.00',schedule_type:'recurring',start_date:'2026-10-01',end_date:'2027-01-31',pay:'150.000',description:'Membantu operasional cafe dan pelayanan pelanggan setiap akhir pekan.',requirements:'Ramah, teliti, dan bisa bekerja dalam tim.'}))f.elements[k].value=v;setPickedLocation(f.querySelector('.location-picker'),{latitude:-6.2,longitude:106.8,label:'Cipete Jakarta'});f.elements.no_fee_policy_accepted.checked=true;f.requestSubmit();})()`);
 await until("!document.querySelector('#job-form') && state.companyJobs.length===1");
 assert.equal(await evaluate('state.companyJobs[0].end_date'),'2027-01-31');
 await send('Page.navigate',{url:origin+'/'});await until("typeof state!=='undefined' && state.jobs.some(j=>j.title==='Barista akhir pekan')");
 await evaluate(`(async()=>{const r=await post('/register',{name:'Browser Worker',email:'browser-worker@example.test',password:'test-password-123'});state.user=r.user;await refresh();navigate('profile');})()`);
 await until("!!document.querySelector('#profile-form')");
 await evaluate(`(()=>{const f=document.querySelector('#profile-form');f.elements.headline.value='Barista siap weekend';f.elements.experience.value='Cafe sebelumnya, 2024–2026';f.elements.skills.value='Latte art, kasir';f.elements.interests.value='F&B';f.elements.certificates.value='Pelatihan barista 2025';const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1kAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],'photo.png',{type:'image/png'}));f.elements.photo_file.files=dt.files;f.requestSubmit();})()`);
 await until("state.user.headline==='Barista siap weekend' && !!state.user.photo_url");
 await until("document.querySelector('.profile-summary img.profile-avatar')?.naturalWidth>0");
 assert.equal(await evaluate("document.querySelector('.profile-avatar').complete && document.querySelector('.profile-avatar').naturalWidth>0"),true);
 for(const [width,theme] of [[1366,'light'],[390,'dark'],[320,'light']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await evaluate(`document.documentElement.dataset.theme='${theme}';window.scrollTo(0,0)`);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
  assert.equal(await evaluate("document.querySelector('label[for=f-name] .required-label').textContent"),'*');
  const profileShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts',`profile-new-${width}-${theme}.png`),Buffer.from(profileShot.data,'base64'));
 }
 await evaluate("document.querySelector('[data-section=profile-experience]').click()");
 assert.equal(await evaluate('document.activeElement.name'),'experience');
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});

 await evaluate("document.querySelector('#profile-form [name=phone_country]').value='ID';document.querySelector('#profile-form [name=phone]').value='081234567890';document.querySelector('#profile-form').requestSubmit()");
 await until("state.user.phone==='+6281234567890'");
 await evaluate("document.querySelector('[data-action=phone-send]').click()");await until("!!document.querySelector('#phone-verification-form')");
 const smsCode=JSON.parse(fs.readFileSync(path.join(temp,'data','sms-outbox.json'),'utf8'))['+6281234567890'].code;
 await evaluate(`document.querySelector('#phone-verification-form [name=code]').value='${smsCode}';document.querySelector('#phone-verification-form').requestSubmit()`);
 await until("state.user.phone_verified && !document.querySelector('#phone-verification-form')");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
 await evaluate("document.documentElement.dataset.theme='dark';document.querySelector('.phone-field').scrollIntoView({block:'center'})");
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
 const phoneScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts','phone-profile-mobile-dark.png'),Buffer.from(phoneScreenshot.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate("navigate('jobs')");await until("!!document.querySelector('[data-action=search-location]')");
 await send('Browser.grantPermissions',{origin,permissions:['geolocation']});
 await send('Emulation.setGeolocationOverride',{latitude:-6.21,longitude:106.8,accuracy:20});
 await evaluate("document.querySelector('[data-action=search-location]').click();document.querySelector('[data-action=device-location]').click()");
 await until("!!workerLocationDraft && !!document.querySelector('#location-form')");
 assert.equal(await evaluate('state.searchLocation'),null);
 await evaluate("document.querySelector('#radius-km').value='12'");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
 const locationScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts','location-popup-mobile.png'),Buffer.from(locationScreenshot.data,'base64'));
 await evaluate("document.querySelector('#location-form').requestSubmit()");
 await until("!!state.searchLocation && !document.querySelector('.modal')");
 assert.equal(await evaluate('state.radius'),12);
 assert.equal(await evaluate('filtered().length'),1);
 await evaluate("detail(filtered()[0].id)");
 assert.ok((await evaluate("document.querySelector('.modal').innerText")).includes('31 Jan 2027'));
 await evaluate("document.querySelector('[data-action=apply]').click();document.querySelector('[name=portfolio]').value='https://example.test/cv';document.querySelector('#apply-form').requestSubmit()");
 await until("state.applications.length===1 && !document.querySelector('#apply-form')");
 await evaluate("navigate('jobs')");await until("state.page==='jobs'");
 await evaluate("detail(state.jobs.find(j=>j.owner).id);document.querySelector('[data-action=report-job]').click();document.querySelector('[name=details]').value='Employer meminta biaya sebelum proses wawancara.';document.querySelector('#report-form').requestSubmit()");
 await until("document.querySelector('.modal')?.innerText.includes('Laporan tercatat')");
 await evaluate("closeModal();navigate('jobs')");
 fs.mkdirSync(path.resolve('artifacts'),{recursive:true});
 for(const [width,theme] of [[1366,'light'],[390,'light'],[390,'dark'],[320,'dark']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await evaluate(`document.documentElement.dataset.theme='${theme}';render()`);await pause(100);
  const sizes=await evaluate('({content:document.documentElement.scrollWidth,viewport:innerWidth})');assert.ok(sizes.content<=sizes.viewport+1,JSON.stringify({width,theme,...sizes}));
  const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts',`worker-${width}-${theme}.png`),Buffer.from(image.data,'base64'));
 }
 await send('Page.navigate',{url:origin+'/employer'});await until("typeof state!=='undefined' && !!state.user?.company && state.applications.length===1");
 await evaluate("document.documentElement.dataset.theme='dark';showApplication(state.applications[0].id,true)");await pause(100);
 assert.ok((await evaluate("document.querySelector('.modal').innerText")).includes('Latte art'));
 assert.equal(await evaluate("document.querySelector('.profile-avatar').complete && document.querySelector('.profile-avatar').naturalWidth>0"),true);
 const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts','employer-mobile-dark.png'),Buffer.from(image.data,'base64'));
 await evaluate("closeModal();newJob()");
 for(const theme of ['light','dark']){
  await evaluate(`document.documentElement.dataset.theme='${theme}'`);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts',`employer-job-mobile-${theme}.png`),Buffer.from(screenshot.data,'base64'));
 }

 await evaluate("closeModal();navigate('profile')");await until("!!document.querySelector('[data-action=change-email]')");
 await evaluate("document.querySelector('[data-action=change-email]').click();document.querySelector('#email-change-request [name=email]').value='new-browser-employer@example.test';document.querySelector('#email-change-request [name=password]').value='test-password-123';document.querySelector('#email-change-request').requestSubmit()");
 await until("!!document.querySelector('#email-change-confirm')");assert.equal(await evaluate('state.user.email'),'browser-employer@example.test');
 const changeCode=JSON.parse(fs.readFileSync(path.join(temp,'data','mail-outbox.json'),'utf8'))['new-browser-employer@example.test'];
 await evaluate(`document.querySelector('#email-change-confirm [name=code]').value='${changeCode}';document.querySelector('#email-change-confirm').requestSubmit()`);
 await until("state.user.email==='new-browser-employer@example.test' && !document.querySelector('#email-change-confirm')");
 assert.equal(await evaluate('state.user.email_verified'),true);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
 const emailScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts','employer-email-profile-mobile.png'),Buffer.from(emailScreenshot.data,'base64'));

 await evaluate("navigate('business')");await until("!!document.querySelector('#business-form')");
 await evaluate("document.querySelector('#business-form [name=phone_country]').value='SG';document.querySelector('#business-form [name=phone]').value='81234567';document.querySelector('#business-form').requestSubmit()");
 await until("state.user.company.phone==='+6581234567' && state.page==='dashboard'");
 await evaluate("navigate('business')");await until("!!document.querySelector('#business-form')");
 await evaluate("document.querySelector('[data-action=phone-send]').click()");await until("!!document.querySelector('#phone-verification-form')");
 const businessCode=JSON.parse(fs.readFileSync(path.join(temp,'data','sms-outbox.json'),'utf8'))['+6581234567'].code;
 await evaluate(`document.querySelector('#phone-verification-form [name=code]').value='${businessCode}';document.querySelector('#phone-verification-form').requestSubmit()`);
 await until("state.user.company.phone_verified && !document.querySelector('#phone-verification-form')");
 await send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:true});
 await evaluate("document.documentElement.dataset.theme='light';document.querySelector('.phone-field').scrollIntoView({block:'center'})");
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
 const companyPhoneScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.resolve('artifacts','phone-business-mobile-light.png'),Buffer.from(companyPhoneScreenshot.data,'base64'));
 const employerId=await evaluate('state.user.id');
 await send('Page.navigate',{url:origin+'/'});await until("typeof state!=='undefined' && !!state.user");
 await evaluate("post('/logout').then(()=>{state.user=null;auth('login');document.querySelector('#auth-form [name=email]').value='new-browser-employer@example.test';document.querySelector('#auth-form [name=password]').value='test-password-123';document.querySelector('#auth-form').requestSubmit()})");
 await until("state.user?.email==='new-browser-employer@example.test' && state.user.role==='seeker' && !document.querySelector('#auth-form')");
 assert.equal(await evaluate('state.user.id'),employerId);
 assert.equal(await evaluate("post('/applications',{job_id:state.jobs.find(j=>j.owner===state.user.id).id,portfolio:'https://example.test/cv'}).then(()=>false).catch(e=>e.message.includes('sendiri'))"),true);
 await evaluate("navigate('profile')");await until("!!document.querySelector('.worker-profile-layout')");
 await send('Page.navigate',{url:origin+'/employer'});await until("typeof state!=='undefined' && state.user?.role==='company'");
 assert.equal(await evaluate('state.user.id'),employerId);
 assert.deepEqual(errors,[]);
 console.log('Browser smoke passed: recurring job, profile/photo, geolocation/radius, link-only CV, report, Employer profile access; desktop/mobile light/dark have no horizontal overflow.');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 ws?.close();for(const proc of processes)proc.kill();await pause(800);
 // Only remove this run's uniquely allocated temp directory, after checking its parent.
 if(path.dirname(path.resolve(temp))===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('workend-browser-')){try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
