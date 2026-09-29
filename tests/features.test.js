const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createFeatures}=require('../features');
function fixture(sendEmail){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,bio TEXT,phone TEXT);CREATE TABLE companies(owner TEXT PRIMARY KEY,name TEXT,industry TEXT,city TEXT,address TEXT,email TEXT,phone TEXT,description TEXT,business_type TEXT,employee_count TEXT);CREATE TABLE jobs(id TEXT PRIMARY KEY,owner TEXT);INSERT INTO users VALUES('owner','Owner','','');INSERT INTO companies VALUES('owner','Toko','Retail','Jakarta','Address','business@example.test','0812345678','Description','individual','1-10');`);
 const feature=createFeatures(db,{sendEmail});
 async function call(route,body={}){let result;await feature.handle({p:'/api/employer/verification/'+route,method:'POST',body,user:{id:'owner'},req:{},res:{},json:(r,status,data)=>{result={status,data};},requireUser:()=>{},cleanUser:()=>feature.trust('owner')});return result;}
 return {db,feature,call};
}
test('Schedules accept multi-month weekends and one weekend, reject impossible dates and invalid location',()=>{
 const {db,feature}=fixture();
 const recurring={schedule_type:'recurring',start_date:'2026-10-01',end_date:'2027-01-31',latitude:-6.2,longitude:106.8};
 assert.deepEqual(feature.jobFields(recurring,'Onsite','Sabtu & Minggu'),['recurring','2026-10-01','2027-01-31',-6.2,106.8]);
 assert.deepEqual(feature.jobFields({...recurring,schedule_type:'once',start_date:'2026-10-03',end_date:'2026-10-04'},'Remote','Sabtu & Minggu'),['once','2026-10-03','2026-10-04',null,null]);
 for(const invalid of [{end_date:'2026-09-01'},{start_date:'2026-02-30'},{schedule_type:'once'},{latitude:100},{latitude:'',longitude:106.8},{start_date:'2026-10-05',end_date:'2026-10-06'}])assert.throws(()=>feature.jobFields({...recurring,...invalid},'Onsite','Sabtu & Minggu'));
 db.close();
});
