// Operator-only tool. Access requires filesystem access to the Workend database.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
const db=new DatabaseSync(path.join(process.env.DATA_DIR||path.join(root,'data'),'workend.sqlite'));
const [command,id,status,...note]=process.argv.slice(2);
if(command==='list'){
  const reports=db.prepare('SELECT id,target,job_id,employer_id,reason,details,status,created FROM reports ORDER BY created DESC').all();
  console.log(JSON.stringify(reports,null,2));
}else if(command==='status'&&id&&['Ditinjau','Selesai','Ditolak'].includes(status)&&note.join(' ').length>=10){
  const result=db.prepare('UPDATE reports SET status=?,note=?,resolved_at=? WHERE id=?').run(status,note.join(' '),status==='Ditinjau'?null:new Date().toISOString(),id);
  console.log(result.changes?'Status laporan diperbarui.':'Laporan tidak ditemukan.');
}else if(command==='close-job'&&id){
  const result=db.prepare('UPDATE jobs SET active=0 WHERE id=?').run(id);
  console.log(result.changes?'Lowongan ditutup.':'Lowongan tidak ditemukan.');
}else{console.log('Penggunaan:\nnode scripts/reports.js list\nnode scripts/reports.js status ID Ditinjau|Selesai|Ditolak "catatan internal minimal 10 karakter"\nnode scripts/reports.js close-job JOB_ID');process.exitCode=1;}
db.close();
