// Test process preload only: simulate delivery without adding a bypass to the app.
const fs=require('node:fs'),path=require('node:path');
if(process.env.NODE_ENV!=='test'||!process.env.DATA_DIR)throw new Error('Test mail transport requires isolated test environment.');
const originalFetch=global.fetch;
global.fetch=async(url,options)=>{
 if(String(url).startsWith('https://verify.twilio.com/v2/Services/')){
  const fields=new URLSearchParams(options.body),file=path.join(process.env.DATA_DIR,'sms-outbox.json');
  fs.mkdirSync(process.env.DATA_DIR,{recursive:true});
  const outbox=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  let record,status;
  if(String(url).endsWith('/Verifications')){
   record={sid:'VE'+require('node:crypto').randomBytes(16).toString('hex'),to:fields.get('To'),code:String(require('node:crypto').randomInt(0,1000000)).padStart(6,'0')};
   outbox[record.to]=record;fs.writeFileSync(file,JSON.stringify(outbox));status='pending';
  }else{
   record=Object.values(outbox).find(r=>r.sid===fields.get('VerificationSid'));
   if(!record)return new Response('{}',{status:404});
   status=fields.get('Code')===record.code?'approved':'pending';
  }
  return new Response(JSON.stringify({sid:record.sid,to:record.to,status}),{status:200,headers:{'Content-Type':'application/json'}});
 }
 if(String(url)==='https://api.resend.com/emails'){
  const payload=JSON.parse(options.body),code=payload.text.match(/\b\d{6}\b/)[0];
  const file=path.join(process.env.DATA_DIR,'mail-outbox.json');
  fs.mkdirSync(process.env.DATA_DIR,{recursive:true});
  const outbox=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  outbox[payload.to[0]]=code;fs.writeFileSync(file,JSON.stringify(outbox));
  return new Response(JSON.stringify({id:'test-message'}),{status:200,headers:{'Content-Type':'application/json'}});
 }
 return originalFetch(url,options);
};
