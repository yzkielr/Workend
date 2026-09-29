const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sendEmail}=require('../features');

test('Email delivery requires configuration and provider acceptance; safe errors explain failed sends',async t=>{
 const originalKey=process.env.RESEND_API_KEY,originalFrom=process.env.MAIL_FROM;
 t.after(()=>{for(const [key,value] of Object.entries({RESEND_API_KEY:originalKey,MAIL_FROM:originalFrom})){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 delete process.env.RESEND_API_KEY;delete process.env.MAIL_FROM;
 const request=t.mock.method(global,'fetch',async()=>{throw new Error('must not send');});
 await assert.rejects(sendEmail('owner@example.test','012345'),/belum diaktifkan/);
 assert.equal(request.mock.callCount(),0);
 process.env.RESEND_API_KEY='test-private-key';process.env.MAIL_FROM='Workend <verify@example.test>';
 for(const [status,name,pattern] of [[401,'validation_error',/konfigurasi pengirim/],[403,'validation_error',/domain pengirim/],[429,'rate_limit_exceeded',/membatasi/],[429,'daily_quota_exceeded',/Kuota/],[500,'application_error',/belum berhasil/]]){
  request.mock.mockImplementation(async()=>new Response(JSON.stringify({name,message:'PRIVATE PROVIDER DATA'}),{status}));
  await assert.rejects(sendEmail('owner@example.test','012345'),error=>{assert.match(error.message,pattern);assert.doesNotMatch(error.message,/PRIVATE|test-private-key|012345/);return true;});
 }
 request.mock.mockImplementation(async()=>{throw new Error('PRIVATE NETWORK DATA');});
 await assert.rejects(sendEmail('owner@example.test','012345'),/tidak dapat dihubungi/);
 request.mock.mockImplementation(async()=>new Response('{}',{status:200}));
 await assert.rejects(sendEmail('owner@example.test','012345'),/belum mengonfirmasi/);
 request.mock.mockImplementation(async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');
  const body=JSON.parse(options.body);assert.deepEqual(body.to,['owner@example.test']);assert.match(body.text,/012345/);
  return new Response(JSON.stringify({id:'test-accepted-message'}),{status:200});
 });
 await sendEmail('owner@example.test','012345');
});
