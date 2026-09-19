/** Therapist credentials. Browser PBKDF2-SHA256/600000, server HMAC pepper.
 * The derived proof is a password-equivalent: HTTPS only, never log/persist it.
 * Public application email is contact data, never an authenticated identity. */
function therapistAuthHeaders_(h) {
  h.Users=h.Users.concat(['accountKind']);
  h.Sessions=h.Sessions.concat(['method','credentialRevision']);
  h.Therapists=h.Therapists.concat(['contactEmail']);
  h.TherapistCredentials=['userId','username','salt','verifier','revision','failures','lockedUntil','updatedAt'];
  return h;
}
function username_(v){const s=text_(v,'Username',4,32).toLowerCase();if(!/^[a-z][a-z0-9._-]{3,31}$/.test(s))fail_('Username 4–32 karakter, dimulai huruf; gunakan huruf, angka, titik, _ atau -.');return s;}
function authHex_(s){return typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);}
function authMac_(value){return Utilities.computeHmacSha256Signature(value,pepper_(),Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function credential_(userId){return rows_('TherapistCredentials').find(function(c){return c.userId===userId;});}
function authBudget_(key,limit,minutes){
  const props=PropertiesService.getScriptProperties(),now=Date.now();let b=JSON.parse(props.getProperty(key)||'{}');
  if(!b.until||now>=b.until)b={until:now+minutes*60000,count:0};
  if(b.count>=limit)fail_('Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.');
  b.count++;props.setProperty(key,JSON.stringify(b));
}
function sessionIssue_(u,method,remember,revision){
  const ss=sheet_('Sessions');rows_('Sessions').filter(function(s){return new Date(s.expiresAt).getTime()<=Date.now();}).sort(function(a,b){return b._row-a._row;}).forEach(function(s){ss.deleteRow(s._row);});
  const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  write_('Sessions',{tokenHash:hash_(token),userId:u.id,method:method,credentialRevision:revision||'',createdAt:now_(),expiresAt:new Date(Date.now()+(remember?720:24)*3600000).toISOString()});
  u._authMethod=method;return {token:token,user:userView_(u)};
}
function therapistLoginInfo_(p){const name=username_(p.username);return locked_(function(){authBudget_('THERAPIST_LOGIN_INFO',200,15);const c=rows_('TherapistCredentials').find(function(x){return x.username===name;});return {salt:c&&c.verifier?c.salt:authMac_('unknown:'+name),iterations:600000};});}
function therapistLogin_(p){
  const name=username_(p.username);if(!authHex_(p.proof))fail_('Username atau password belum sesuai.');
  return locked_(function(){
    authBudget_('THERAPIST_LOGIN_TRIES',200,15);
    const c=rows_('TherapistCredentials').find(function(x){return x.username===name;});
    const invalid='Username atau password belum sesuai, atau akses belum disiapkan admin.';
    if(!c||!c.verifier)fail_(invalid);
    if(new Date(c.lockedUntil).getTime()>Date.now())fail_('Akses ditunda 15 menit setelah beberapa percobaan gagal. Hubungi admin jika lupa password.');
    if(!same_(c.verifier,authMac_('therapist:'+c.userId+':'+p.proof))){
      c.failures=Number(c.failures||0)+1;if(c.failures>=5){c.lockedUntil=new Date(Date.now()+900000).toISOString();c.failures=0;}write_('TherapistCredentials',c);fail_(invalid);
    }
    const u=rows_('Users').find(function(x){return x.id===c.userId;});if(!u)fail_(invalid);
    c.failures=0;c.lockedUntil='';write_('TherapistCredentials',c);
    return sessionIssue_(u,'THERAPIST',p.remember===true,c.revision);
  });
}
function adminCredentialInfo_(p){const admin=requireUser_(p,true);const t=rows_('Therapists').find(function(x){return x.id===p.therapistId;});if(!t)fail_('Therapist tidak ditemukan.');const c=credential_(t.userId),revision=Number(c&&c.revision||0),salt=hash_(Utilities.getUuid()+Utilities.getUuid()),expires=Date.now()+600000;const ticket=authMac_(['reset',admin.id,t.id,revision,salt,expires].join(':'));return {revision:revision,salt:salt,expires:expires,ticket:ticket,iterations:600000};}
function adminSetCredential_(p){
  const admin=requireUser_(p,true),name=username_(p.username);
  if(!authHex_(p.proof)||!authHex_(p.salt)||!Number.isSafeInteger(p.expires)||p.expires<Date.now()||p.expires>Date.now()+600000||!Number.isInteger(p.revision))fail_('Form akses kedaluwarsa. Buka kembali.');
  if(!same_(p.ticket,authMac_(['reset',admin.id,p.therapistId,p.revision,p.salt,p.expires].join(':'))))fail_('Permintaan pengaturan akses tidak valid.');
  return locked_(function(){
    const t=rows_('Therapists').find(function(x){return x.id===p.therapistId;});if(!t)fail_('Therapist tidak ditemukan.');
    const all=rows_('TherapistCredentials');let c=all.find(function(x){return x.userId===t.userId;});
    if(Number(c&&c.revision||0)!==p.revision)fail_('Akses sudah berubah. Buka kembali form.');
    if(all.some(function(x){return x.userId!==t.userId&&x.username===name;}))fail_('Username sudah digunakan.');
    c=Object.assign(c||{userId:t.userId},{username:name,salt:p.salt,verifier:authMac_('therapist:'+t.userId+':'+p.proof),revision:p.revision+1,failures:0,lockedUntil:'',updatedAt:now_()});write_('TherapistCredentials',c);
    // Revision invalidation takes effect immediately; remove previous sessions as cleanup.
    rows_('Sessions').filter(function(s){return s.userId===t.userId;}).sort(function(a,b){return b._row-a._row;}).forEach(function(s){sheet_('Sessions').deleteRow(s._row);});
    audit_(admin.id,'THERAPIST_ACCESS_RESET',t.id,'Username: '+name);return {username:name};
  });
}
function therapistAuthGate_(action,p){
  if(!p.token||['bootstrap','requestOtp','verifyOtp','therapistLoginInfo','therapistLogin','publicTherapistApplication'].indexOf(action)>=0)return;
  const u=requireUser_(p),c=credential_(u.id);
  if(u._authMethod==='APPLICATION'&&['me','logout','therapistDashboard'].indexOf(action)<0)fail_('Pendaftaran sudah terkirim. Hubungi admin untuk akses username dan password.','FORBIDDEN');
  if(c&&c.verifier&&u._authMethod==='EMAIL'&&!isAdmin_(u)&&['me','logout'].indexOf(action)<0)fail_('Gunakan username dan password therapist. Keluar dahulu dari akun email ini.','FORBIDDEN');
}
function publicTherapistApplication_(p){
  const name=username_(p.username),contact=email_(p.email),requestId=text_(p.requestId,'ID pendaftaran',16,100);
  // Single lock covers username claim, all validation, upload and registration.
  return locked_(function(){
    authBudget_('THERAPIST_APPLICATIONS',50,60);
    if(rows_('TherapistCredentials').some(function(c){return c.username===name;}))fail_('Username sudah digunakan. Jika sebelumnya sudah mengirim pendaftaran, hubungi admin.');
    const u={id:id_('USR'),email:'',name:'',whatsapp:'',accountKind:'THERAPIST',createdAt:now_(),updatedAt:now_()};
    // Validate all fields before writing identity. Email never used to claim an existing account.
    text_(p.fullName,'Nama lengkap',2,100);phone_(p.whatsapp);text_(p.experience,'Pengalaman kerja',10,1200);coverageInput_(p.coverage);pickList_(p.skills,skillNames_(),'keahlian',Math.max(1,skillNames_().length));
    if(p.consent!==true)fail_('Setujui penggunaan data.');paymentInput_(p);agreementInput_(p);imageBytes_(p.ktp,'KTP');imageBytes_(p.selfie,'Selfie');
    if(rows_('Therapists').some(function(t){return String(t.whatsapp)===phone_(p.whatsapp);}))fail_('WhatsApp sudah terdaftar. Hubungi admin untuk menyiapkan akses akun lama.');
    const result=registerTherapistData_(u,p);
    u.name=p.fullName.trim();u.whatsapp=phone_(p.whatsapp);write_('Users',u);
    write_('TherapistCredentials',{userId:u.id,username:name,revision:0,updatedAt:now_()});
    const t=rows_('Therapists').find(function(x){return x.id===result.id;});t.contactEmail=contact;write_('Therapists',t);
    return sessionIssue_(u,'APPLICATION',false,0);
  });
}
function adminEditTherapistProfile_(p){
  const admin=requireUser_(p,true),fullName=text_(p.fullName,'Nama lengkap',2,100),whatsapp=phone_(p.whatsapp),contact=email_(p.email),experience=text_(p.experience,'Pengalaman',10,1200),coverage=coverageInput_(p.coverage);
  return locked_(function(){const t=rows_('Therapists').find(function(x){return x.id===p.therapistId;});if(!t)fail_('Therapist tidak ditemukan.');
    if(t.updatedAt!==p.updatedAt)fail_('Profil sudah berubah. Buka kembali form.');
    if(rows_('Therapists').some(function(x){return x.id!==t.id&&String(x.whatsapp)===whatsapp;}))fail_('WhatsApp sudah digunakan therapist lain.');
    if((t.fullName!==fullName||String(t.whatsapp)!==whatsapp)&&p.identityChecked!==true)fail_('Konfirmasi ulang identitas dan WhatsApp sebelum mengubahnya.');
    if(String(t.whatsapp)!==whatsapp){const c=credential_(t.userId);if(c){c.verifier='';c.revision=Number(c.revision||0)+1;c.updatedAt=now_();write_('TherapistCredentials',c);}rows_('Sessions').filter(function(s){return s.userId===t.userId;}).sort(function(a,b){return b._row-a._row;}).forEach(function(s){sheet_('Sessions').deleteRow(s._row);});}
    const before={fullName:t.fullName,whatsapp:t.whatsapp,contactEmail:t.contactEmail,experience:t.experience,coverage:t.coverage};
    Object.assign(t,{fullName:fullName,whatsapp:whatsapp,contactEmail:contact,experience:experience,coverage:JSON.stringify(coverage),updatedAt:now_()});write_('Therapists',t);
    audit_(admin.id,'THERAPIST_PROFILE_EDIT',t.id,JSON.stringify({before:before,after:{fullName:fullName,whatsapp:whatsapp,contactEmail:contact,experience:experience,coverage:coverage}}));return true;
  });
}
