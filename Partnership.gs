/** Verifikasi privat dan bukti persetujuan. Semua akses melalui api dengan otorisasi. */
let partnershipEvidenceCache_=null;
function agreementRows_(name) {
  if(!partnershipEvidenceCache_)partnershipEvidenceCache_={};
  if(!partnershipEvidenceCache_[name])partnershipEvidenceCache_[name]=rows_(name);
  return partnershipEvidenceCache_[name];
}
function partnershipHeaders_(base) {
  base.Therapists=base.Therapists.concat(['verificationId','verificationStatus','agreementId','agreementVersion','agreementHash','coverage']);
  base.Bookings=base.Bookings.concat(['partnershipVersion','therapistPercent','areaVersion','partnershipAgreementId']);
  base.Verifications=['id','therapistId','userId','requestId','ktpFileId','selfieFileId','paymentType','provider','accountNumber','accountName','status','note','createdAt','reviewedAt','reviewedBy','agreementId'];
  base.AgreementAcceptances=['id','therapistId','userId','fullName','email','whatsapp','version','effectiveDate','textHash','text','acceptedAt','dataConsent','therapistPercent'];
  return base;
}
function currentAgreement_() { return {version:PARTNERSHIP.version,effectiveDate:PARTNERSHIP.effectiveDate,text:PARTNERSHIP.text,textHash:hash_(PARTNERSHIP.text),therapistPercent:PARTNERSHIP.therapistPercent}; }
// Versi dalam Sheet lama dapat berupa angka (1.0 menjadi 1). Hash teks dan bukti
// pengajuan adalah sumber persetujuan; metadata profil bukan bukti persetujuan.
function agreementVersion_(value) {
  const v=String(value===undefined||value===null?'':value).trim();
  return /^\d+(?:\.\d+)*$/.test(v)?v.split('.').map(function(x){return String(Number(x));}).join('.').replace(/(?:\.0)+$/,''):v;
}
function agreementEvidence_(t,verification) {
  const r=verification||agreementRows_('Verifications').find(function(x){return x.id===t.verificationId;});
  if(!r||r.therapistId!==t.id||r.userId!==t.userId)return null;
  const a=agreementRows_('AgreementAcceptances').find(function(x){return x.id===r.agreementId;});
  if(!a||a.therapistId!==t.id||a.userId!==t.userId||!bool_(a.dataConsent)||!a.acceptedAt||!Number.isFinite(new Date(a.acceptedAt).getTime())||!a.version||typeof a.text!=='string'||!a.text||a.textHash!==hash_(a.text))return null;
  return a;
}
function agreementTerms_(a) {
  // Hanya salinan persetujuan versi awal yang hash-nya dikenal mendapat fallback 80%.
  // Jangan menerapkan persentase template baru ke persetujuan lama.
  const legacyHash='2c4eae48175200d70a367343cb32312b4fd45b9d013de153454edf20f0af778b';
  const percent=a&&a.therapistPercent!==''&&a.therapistPercent!==undefined?Number(a.therapistPercent):(a&&a.textHash===legacyHash?80:null);
  if(!a||percent===null||!Number.isFinite(percent)||percent<0||percent>100)fail_('Rincian bagi hasil pada bukti perjanjian perlu diperiksa admin.');
  return {version:String(a.version),percent:percent,agreementId:a.id};
}
function partnershipReady_(t) {
  const r=agreementRows_('Verifications').find(function(x){return x.id===t.verificationId;});
  return t.verificationStatus==='APPROVED' && !!r && r.status==='APPROVED' && !!agreementEvidence_(t,r);
}
function agreementInput_(p) {
  const a=currentAgreement_();
  if(p.agreementAccepted!==true || p.dataConsent!==true)fail_('Centang persetujuan perjanjian dan penggunaan data.');
  if(agreementVersion_(p.agreementVersion)!==agreementVersion_(a.version) || p.agreementHash!==a.textHash)fail_('Perjanjian diperbarui. Buka kembali dan baca versi terbaru sebelum menyetujui.');
  return a;
}
function acceptAgreementRecord_(t,u,a) {
  let row=rows_('AgreementAcceptances').find(function(x){return x.therapistId===t.id&&x.userId===u.id&&bool_(x.dataConsent)&&x.acceptedAt&&agreementVersion_(x.version)===agreementVersion_(a.version)&&x.textHash===a.textHash&&x.text===a.text;});
  if(!row){row={id:id_('AGR'),therapistId:t.id,userId:u.id,fullName:t.fullName,email:u.email,whatsapp:String(t.whatsapp),version:a.version,effectiveDate:a.effectiveDate,textHash:a.textHash,text:a.text,acceptedAt:now_(),dataConsent:true,therapistPercent:a.therapistPercent};write_('AgreementAcceptances',row);}
  t.agreementId=row.id;t.agreementVersion=a.version;t.agreementHash=a.textHash;return row.id;
}
function acceptAgreement_(p) {
  const u=requireUser_(p),a=agreementInput_(p);
  return locked_(function(){const t=rows_('Therapists').find(function(x){return x.userId===u.id;});if(!t)fail_('Daftar sebagai therapist terlebih dahulu.');const aid=acceptAgreementRecord_(t,u,a);const r=rows_('Verifications').find(function(x){return x.id===t.verificationId&&x.therapistId===t.id&&x.userId===u.id;});if(r&&r.status==='PENDING'){r.agreementId=aid;write_('Verifications',r);}t.updatedAt=now_();write_('Therapists',t);audit_(u.id,'AGREEMENT_ACCEPTED',t.id,a.version);return true;});
}
function therapistAccess_(p) {
  const u=requireUser_(p);const t=rows_('Therapists').find(function(x){return p.therapistId ? x.id===p.therapistId : x.userId===u.id;});
  if(!t || (!isAdmin_(u)&&t.userId!==u.id))fail_('Data therapist tidak tersedia.','FORBIDDEN');return {user:u,therapist:t};
}
function agreementRecords_(p) {
  const a=therapistAccess_(p);return rows_('AgreementAcceptances').filter(function(x){return x.therapistId===a.therapist.id;}).map(function(x){return {id:x.id,fullName:x.fullName,email:x.email,whatsapp:String(x.whatsapp),version:x.version,effectiveDate:x.effectiveDate,textHash:x.textHash,text:x.text,acceptedAt:x.acceptedAt};});
}
function paymentInput_(p) {
  if(['BANK','EWALLET'].indexOf(p.paymentType)<0)fail_('Pilih rekening bank atau e-wallet.');
  const provider=text_(p.provider,'Bank / e-wallet',2,60),name=text_(p.accountName,'Nama pemilik',2,100),number=text_(p.accountNumber,'Nomor rekening / e-wallet',5,30);
  if(!/^\d{5,30}$/.test(number))fail_('Nomor rekening hanya berisi angka, tanpa spasi atau tanda baca.');
  if(p.paymentType==='EWALLET'&&!/^0\d{9,14}$/.test(number))fail_('Nomor e-wallet memakai format 08… sebanyak 10–15 digit.');
  if(p.paymentType==='EWALLET'&&['DANA','GoPay','OVO','ShopeePay','LinkAja'].indexOf(provider)<0)fail_('Pilih provider e-wallet yang tersedia.');
  return {paymentType:p.paymentType,provider:provider,accountNumber:number,accountName:name};
}
function imageBytes_(upload,label) {
  const limit=CONFIG.MAX_KTP_BYTES;
  if(!upload||['image/jpeg','image/png'].indexOf(upload.mime)<0||typeof upload.base64!=='string'||upload.base64.length>Math.ceil(limit/3)*4+4||!/^[A-Za-z0-9+/]+={0,2}$/.test(upload.base64))fail_('Upload '+label+' JPG/PNG maksimal 2 MB.');
  let bytes;try{bytes=Utilities.base64Decode(upload.base64);}catch(e){fail_('Foto '+label+' tidak dapat dibaca.');}
  if(!bytes.length||bytes.length>limit)fail_('Ukuran '+label+' maksimal 2 MB.');
  const sig=bytes.slice(0,8).map(function(x){return(x+256)%256;});
  if(upload.mime==='image/jpeg' ? !(sig[0]===255&&sig[1]===216&&sig[2]===255) : JSON.stringify(sig)!=='[137,80,78,71,13,10,26,10]')fail_('Format '+label+' tidak sesuai.');
  return bytes;
}
function privateImage_(upload,label,id,created) {
  const bytes=imageBytes_(upload,label),folder=DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('KTP_FOLDER_ID'));
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE||folder.getEditors().length||folder.getViewers().length)fail_('Folder dokumen perlu diperiksa admin sebelum upload.');
  const f=folder.createFile(Utilities.newBlob(bytes,upload.mime,id+'-'+label+(upload.mime==='image/jpeg'?'.jpg':'.png')));created.push(f);f.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);return f.getId();
}
function verificationRecord_(t,u,p,created) {
  const payment=paymentInput_(p),a=agreementInput_(p),requestId=text_(p.requestId,'ID pengajuan',8,100);
  const previous=rows_('Verifications').filter(function(x){return x.therapistId===t.id;});
  const latest=previous.find(function(x){return x.id===t.verificationId;});
  if(latest&&latest.status==='PENDING')fail_('Pengajuan masih diperiksa admin. Tunggu hasilnya sebelum mengubah data.');
  const id=id_('VRF');
  let ktp=t.ktpFileId;
  if(p.ktp)ktp=privateImage_(p.ktp,'KTP',id,created);
  if(!ktp)fail_('Foto KTP wajib dilengkapi.');
  const selfie=p.selfie?privateImage_(p.selfie,'Selfie',id,created):(latest&&latest.selfieFileId);
  if(!selfie)fail_('Foto selfie wajib dilengkapi.');
  const agreementId=acceptAgreementRecord_(t,u,a);
  const row=Object.assign({id:id,therapistId:t.id,userId:u.id,requestId:requestId,ktpFileId:ktp,selfieFileId:selfie,status:'PENDING',note:'',createdAt:now_(),reviewedAt:'',reviewedBy:'',agreementId:agreementId},payment);
  write_('Verifications',row);t.verificationId=id;t.verificationStatus='PENDING';return row;
}
function submitVerification_(p) {
  const access=therapistAccess_(p),u=access.user;
  if(access.therapist.userId!==u.id)fail_('Pengajuan diisi sendiri oleh therapist.');
  return locked_(function(){
    const t=rows_('Therapists').find(function(x){return x.id===access.therapist.id;});
    const duplicate=rows_('Verifications').find(function(x){return x.therapistId===t.id&&x.requestId===p.requestId;});if(duplicate)return {id:duplicate.id};
    const created=[];let recorded=false;
    try{const row=verificationRecord_(t,u,p,created);recorded=true;t.updatedAt=now_();write_('Therapists',t);audit_(u.id,'VERIFICATION_SUBMITTED',t.id,row.id);return {id:row.id};}
    catch(e){if(!recorded)created.forEach(function(f){f.setTrashed(true);});throw e;}
  });
}
function verificationView_(r,full) {
  return {id:r.id,status:r.status,note:r.note,createdAt:r.createdAt,reviewedAt:r.reviewedAt,hasKtp:!!r.ktpFileId,hasSelfie:!!r.selfieFileId,paymentType:r.paymentType,provider:r.provider,accountName:r.accountName,accountNumber:full?String(r.accountNumber):'••••'+String(r.accountNumber).slice(-4)};
}
function verificationDetails_(p) {
  const a=therapistAccess_(p),rows=rows_('Verifications').filter(function(x){return x.therapistId===a.therapist.id;});
  if(isAdmin_(a.user))locked_(function(){audit_(a.user.id,'VERIFICATION_VIEWED',a.therapist.id);});
  const evidence=agreementEvidence_(a.therapist);
  return {therapistId:a.therapist.id,fullName:a.therapist.fullName,therapistStatus:a.therapist.status,physioVerified:bool_(a.therapist.physioVerified),requiresCredential:allServices_().some(function(s){return s.requiresCredential&&list_(a.therapist.skills).indexOf(s.skill)>=0;}),agreement:evidence?{id:evidence.id,version:String(evidence.version),acceptedAt:evidence.acceptedAt,textHash:evidence.textHash}:null,current:rows.find(function(x){return x.id===a.therapist.verificationId;})?verificationView_(rows.find(function(x){return x.id===a.therapist.verificationId;}),true):null,history:rows.slice().reverse().map(function(x){return verificationView_(x,true);}),ready:partnershipReady_(a.therapist)};
}
function verificationDocument_(p) {
  const a=therapistAccess_(p),r=rows_('Verifications').find(function(x){return x.id===p.verificationId&&x.therapistId===a.therapist.id;});
  if(!r||['KTP','SELFIE'].indexOf(p.kind)<0)fail_('Dokumen tidak tersedia.');
  const fid=p.kind==='KTP'?r.ktpFileId:r.selfieFileId;if(!fid)fail_('Dokumen belum tersedia.');
  const blob=DriveApp.getFileById(fid).getBlob();if(['image/jpeg','image/png'].indexOf(blob.getContentType())<0)fail_('Format dokumen tidak didukung.');
  locked_(function(){audit_(a.user.id,'PRIVATE_DOCUMENT_VIEWED',a.therapist.id,r.id+' '+p.kind);});return {mime:blob.getContentType(),base64:Utilities.base64Encode(blob.getBytes())};
}
function reviewVerification_(p) {
  const u=requireUser_(p,true),note=text_(p.note||'','Catatan pemeriksaan',0,600);
  if(['APPROVED','CHANGES_REQUIRED','REJECTED'].indexOf(p.status)<0)fail_('Status pemeriksaan tidak valid.');
  if(p.status!=='APPROVED'&&note.length<5)fail_('Jelaskan data yang perlu diperbaiki atau alasan penolakan.');
  if(p.status==='APPROVED'&&(p.identityChecked!==true||p.paymentChecked!==true))fail_('Konfirmasi pencocokan KTP, selfie, dan pemilik rekening / e-wallet.');
  return locked_(function(){
    const r=rows_('Verifications').find(function(x){return x.id===p.verificationId;});
    const t=r&&rows_('Therapists').find(function(x){return x.id===r.therapistId;});
    // Persetujuan dapat diulang untuk memulihkan hasil yang tersimpan sebagian.
    if(!r||!t||r.userId!==t.userId||t.verificationId!==r.id||!(r.status==='PENDING'||(r.status==='APPROVED'&&p.status==='APPROVED')))fail_('Pengajuan sudah diproses atau berubah. Muat ulang.');
    let evidence=null;
    if(p.status==='APPROVED'){
      evidence=agreementEvidence_(t,r);
      if(!evidence)fail_('Bukti persetujuan pengajuan ini belum lengkap atau tidak sesuai. Periksa Riwayat perjanjian; jangan mengubah bukti persetujuan di Sheets.');
      agreementTerms_(evidence);
      if(!r.ktpFileId||!r.selfieFileId)fail_('KTP dan selfie pengajuan wajib tersedia.');
      paymentInput_({paymentType:r.paymentType,provider:String(r.provider),accountName:String(r.accountName),accountNumber:String(r.accountNumber)});
      if(['SUSPENDED','REJECTED'].indexOf(t.status)>=0&&p.reactivate!==true)fail_('Centang persetujuan mengaktifkan kembali akun yang ditolak / dinonaktifkan.');
      if(typeof p.physioVerified==='boolean')t.physioVerified=p.physioVerified&&allServices_().some(function(s){return s.requiresCredential&&list_(t.skills).indexOf(s.skill)>=0;});
    }
    const fresh=r.status==='PENDING';
    if(fresh){r.status=p.status;r.note=note;r.reviewedAt=now_();r.reviewedBy=u.id;write_('Verifications',r);}
    const before=t.status;t.verificationStatus=p.status;t.updatedAt=now_();
    if(evidence){t.ktpFileId=r.ktpFileId;t.ktpUrl='';t.agreementId=evidence.id;t.agreementVersion=String(evidence.version);t.agreementHash=evidence.textHash;t.status='APPROVED';t.adminNote=note;}
    write_('Therapists',t);
    if(fresh)audit_(u.id,'VERIFICATION_'+p.status,t.id,r.id);
    if(evidence&&before!=='APPROVED')audit_(u.id,'THERAPIST_APPROVED',t.id,'Verifikasi '+r.id+'; persetujuan '+evidence.id);
    return {status:t.status,verificationStatus:t.verificationStatus};
  });
}
function partnershipSummary_(t) {
  const a=agreementEvidence_(t);
  return {status:t.verificationStatus||'INCOMPLETE',ready:partnershipReady_(t),agreementAccepted:!!a,agreementVersion:a?String(a.version):'',agreementCurrent:!!a&&a.textHash===hash_(PARTNERSHIP.text)};
}
function revenueSplit_(b,addons) {
  if(!b.partnershipVersion || b.therapistPercent==='')return null;
  const items=[{label:b.serviceName,amount:b.price===''?null:Number(b.price),discount:Number(b.discount||0),status:b.status}].concat(addons.filter(function(a){return committedAddon_(a);}).map(function(a){return {label:a.serviceName+' × '+a.quantity,amount:Number(a.amount),discount:Number(a.discount||0),status:a.status};}));
  const pct=Number(b.therapistPercent);
  return {version:b.partnershipVersion,percent:pct,items:items.map(function(x){const share=x.amount===null?null:Math.floor(x.amount*pct/100);return Object.assign(x,{therapist:share,platform:share===null?null:x.amount-share});})};
}
