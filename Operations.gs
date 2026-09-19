/** Catalogue, skill approvals and supplemental invoices. All endpoints require api allowlist. */
function operationsHeaders_(base) {
  base.Services = HEADERS.Services.concat(['kind','skill','updatedAt']);
  base.Therapists = HEADERS.Therapists.concat(['pendingSkills','skillsNote','skillsRequestedAt']);
  base.Bookings = base.Bookings.concat(['serviceSkill','requiresCredential','basePaidAmount','basePaymentAt','baseRefundedAmount','baseRefundNote','baseInvoiceRevision']);
  base.Promos = base.Promos.concat(['highlight','highlightOrder']);
  base.Addons = ['id','requestId','bookingId','requesterId','requesterRole','serviceId','serviceName','skill','requiresCredential','quantity','duration','unitPrice','amount','discount','discountReason','status','note','adminNote','customerAgreed','therapistAgreed','startAt','endAt','paidAt','completedAt','refundedAmount','refundNote','createdAt','updatedAt','revision'];
  return partnershipHeaders_(base);
}
function serviceRecord_(s) {
  return {id:String(s.id),name:String(s.name),duration:Number(s.duration),price:s.price === '' ? null : Number(s.price),active:bool_(s.active),description:String(s.description),requiresCredential:s.name==='Fisiotherapy'||bool_(s.requiresCredential),kind:s.kind || 'BOTH',skill:s.skill || s.name,updatedAt:s.updatedAt || ''};
}
function allServices_() { return rows_('Services').map(serviceRecord_); }
function skillNames_() {return Array.from(new Set(allServices_().filter(function(s){return s.active;}).map(function(s){return s.skill;})));}
function addonService_(id) {
  const s=services_().find(function(s){return s.id===id && s.kind!=='MAIN';});
  if(!s)fail_('Layanan tambahan tidak tersedia. Muat ulang katalog.');
  if(s.price===null)fail_('Harga layanan tambahan belum ditentukan admin.');return s;
}
function adminSaveService_(p) {
  const u=requireUser_(p,true),name=text_(p.name,'Nama layanan',2,80),description=text_(p.description || '','Deskripsi',0,600);
  const duration=Number(p.duration),price=p.price===''?null:Number(p.price);
  if(!Number.isInteger(duration)||duration<5||duration>240)fail_('Durasi harus 5–240 menit.');
  if(price!==null && (!Number.isSafeInteger(price)||price<0||price>100000000))fail_('Harga rupiah tidak valid.');
  if(['MAIN','ADDON','BOTH'].indexOf(p.kind)<0 || typeof p.active!=='boolean' || typeof p.requiresCredential!=='boolean')fail_('Jenis atau status layanan tidak valid.');
  return locked_(function(){
    const all=rows_('Services');let s=p.id?all.find(function(s){return s.id===p.id;}):null;
    if(p.id&&!s)fail_('Layanan tidak ditemukan.');
    const skill=s?(s.skill||s.name):text_(p.skill || name,'Keahlian',2,80);
    if(all.some(function(x){return x.id!==p.id && String(x.name).toLowerCase()===name.toLowerCase()&&Number(x.duration)===duration;}))fail_('Nama dan durasi layanan sudah ada. Edit layanan tersebut.');
    s=Object.assign(s || {id:id_('SVC')},{name:name,description:description,duration:duration,price:price===null?'':price,active:p.active,kind:p.kind,skill:skill,requiresCredential:p.requiresCredential || skill==='Fisiotherapy',updatedAt:now_()});
    write_('Services',s);audit_(u.id,'SERVICE_SAVED',s.id,name);return serviceRecord_(s);
  });
}
function requestSkills_(p) {
  const u=requireUser_(p),allowed=skillNames_();
  const skills=pickList_(p.skills,allowed,'keahlian',Math.max(allowed.length,1));
  return locked_(function(){const t=rows_('Therapists').find(function(t){return t.userId===u.id && t.status==='APPROVED';});
    if(!t)fail_('Hanya therapist aktif yang dapat mengajukan pembaruan keahlian.');
    if(list_(t.pendingSkills).length)fail_('Pengajuan sebelumnya masih menunggu admin.');
    t.pendingSkills=JSON.stringify(skills);t.skillsRequestedAt=now_();t.skillsNote='';t.updatedAt=now_();write_('Therapists',t);audit_(u.id,'SKILLS_REQUESTED',t.id,JSON.stringify(skills));return true;});
}
function adminReviewSkills_(p) {
  const u=requireUser_(p,true),note=text_(p.note || '','Catatan',0,600);
  if(typeof p.approve!=='boolean')fail_('Keputusan tidak valid.');
  if(!p.approve&&note.length<5)fail_('Isi alasan penolakan.');
  return locked_(function(){const t=rows_('Therapists').find(function(t){return t.id===p.id;});
    if(!t||!list_(t.pendingSkills).length)fail_('Tidak ada pengajuan keahlian.');
    if(p.approve){if(p.competencyChecked!==true)fail_('Konfirmasi pemeriksaan kompetensi.');const skills=list_(t.pendingSkills);
      if(allServices_().some(function(s){return s.requiresCredential&&skills.indexOf(s.skill)>=0;})&&p.credentialChecked!==true)fail_('Verifikasi bukti kompetensi khusus diperlukan.');
      t.skills=JSON.stringify(skills);if(p.credentialChecked===true)t.physioVerified=true;
    }
    t.pendingSkills='[]';t.skillsNote=note;t.updatedAt=now_();write_('Therapists',t);audit_(u.id,p.approve?'SKILLS_APPROVED':'SKILLS_REJECTED',t.id,note);return true;
  });
}
function committedAddon_(a){return ['AWAITING_PAYMENT','PAID','COMPLETED'].indexOf(a.status)>=0;}
function effectiveEnd_(b,addons){return (addons || rows_('Addons')).filter(function(a){return a.bookingId===b.id && committedAddon_(a) && a.endAt;}).reduce(function(end,a){return a.endAt>end?a.endAt:end;},b.endAt);}
function bookingAccess_(u,id){
  const b=rows_('Bookings').find(function(b){return b.id===id;});if(!b)fail_('Reservasi tidak tersedia.','FORBIDDEN');
  const t=rows_('Therapists').find(function(t){return t.id===b.therapistId;});
  const role=isAdmin_(u)?'ADMIN':b.customerId===u.id?'CUSTOMER':t&&t.userId===u.id&&['CONFIRMED','IN_PROGRESS','COMPLETED'].indexOf(b.status)>=0?'THERAPIST':'';
  if(!role)fail_('Reservasi tidak tersedia.','FORBIDDEN');return {booking:b,therapist:t,role:role};
}
function canAddon_(b){return ['CONFIRMED','IN_PROGRESS'].indexOf(b.status)>=0;}
function addonEligible_(t,s){return t&&t.status==='APPROVED'&&list_(t.skills).indexOf(s.skill||s.name)>=0&&(!s.requiresCredential||bool_(t.physioVerified));}
function submitAddon_(p){
  const u=requireUser_(p),requestId=text_(p.requestId,'ID pengajuan',16,100),note=text_(p.note || '','Catatan tambahan',0,600),quantity=Number(p.quantity);
  if(!Number.isInteger(quantity)||quantity<1||quantity>5)fail_('Jumlah harus 1–5 sesi.');
  return locked_(function(){const access=bookingAccess_(u,p.bookingId),b=access.booking,all=rows_('Addons');
    const duplicate=all.find(function(a){return a.requesterId===u.id&&a.requestId===requestId;});if(duplicate){if(duplicate.bookingId!==b.id)fail_('ID pengajuan telah dipakai.');return {id:duplicate.id};}
    if(!canAddon_(b))fail_('Tambahan hanya untuk reservasi terkonfirmasi atau sedang berlangsung.');
    if(access.role==='THERAPIST'&&p.customerRequested!==true)fail_('Konfirmasi bahwa customer meminta tambahan.');
    const s=addonService_(p.serviceId);if(!addonEligible_(access.therapist,s))fail_('Keahlian therapist belum disetujui untuk layanan ini. Hubungi admin.');
    if(all.filter(function(a){return a.bookingId===b.id&&['REQUESTED','AWAITING_PAYMENT','PAID'].indexOf(a.status)>=0;}).length>=10)fail_('Maksimal 10 pengajuan aktif per reservasi.');
    if(Number(p.expectedPrice)!==s.price||Number(p.expectedDuration)!==s.duration||p.expectedName!==s.name)fail_('Harga atau rincian tambahan berubah. Tutup dan buka kembali daftar layanan.');
    const sequence=all.filter(function(a){return a.bookingId===b.id;}).length+1;
    const a={id:b.id+'-T'+String(sequence).padStart(2,'0'),requestId:requestId,bookingId:b.id,requesterId:u.id,requesterRole:access.role,serviceId:s.id,serviceName:s.name,skill:s.skill,requiresCredential:s.requiresCredential,quantity:quantity,duration:s.duration*quantity,unitPrice:s.price,amount:s.price*quantity,discount:0,discountReason:'',status:'REQUESTED',note:note,adminNote:'',customerAgreed:false,therapistAgreed:false,startAt:'',endAt:'',paidAt:'',completedAt:'',refundedAmount:0,refundNote:'',createdAt:now_(),updatedAt:now_(),revision:1};
    write_('Addons',a);audit_(u.id,'ADDON_REQUESTED',a.id,note);return {id:a.id};
  });
}
function basePaid_(b){return b.basePaidAmount!==''&&b.basePaidAmount!==undefined?Number(b.basePaidAmount):['CONFIRMED','IN_PROGRESS','COMPLETED'].indexOf(b.status)>=0&&b.price!==''?Number(b.price):0;}
function invoiceSummary_(b,addons){
  const committed=addons.filter(committedAddon_),base=b.status==='CANCELLED'?0:b.price===''?null:Number(b.price);
  const extra=committed.reduce(function(n,a){return n+Number(a.amount);},0);
  const received=basePaid_(b)+addons.filter(function(a){return !!a.paidAt;}).reduce(function(n,a){return n+Number(a.amount);},0);
  const refunded=Number(b.baseRefundedAmount||0)+addons.reduce(function(n,a){return n+Number(a.refundedAmount||0);},0);
  const total=base===null?null:base+extra,net=received-refunded;
  const allocated=(b.status==='CANCELLED'?0:basePaid_(b)-Number(b.baseRefundedAmount||0))+committed.filter(function(a){return !!a.paidAt;}).reduce(function(n,a){return n+Number(a.amount)-Number(a.refundedAmount||0);},0);
  return {base:base,extras:extra,total:total,received:received,refunded:refunded,netPaid:net,balance:total===null?null:Math.max(0,total-allocated),refundDue:Math.max(0,(b.status==='CANCELLED'?basePaid_(b)-Number(b.baseRefundedAmount||0):0)+addons.filter(function(a){return a.status==='CANCELLED'&&a.paidAt;}).reduce(function(n,a){return n+Number(a.amount)-Number(a.refundedAmount||0);},0)),unknownBasePayment:b.price===''&&['CONFIRMED','IN_PROGRESS','COMPLETED'].indexOf(b.status)>=0};
}
function addonWhatsapp_(a,b){return whatsappUrl_(CONFIG.ADMIN_WHATSAPP,'Halo admin, mohon konfirmasi tambahan layanan.\nReservasi: '+b.id+'\nTagihan: '+a.id+'\nLayanan: '+a.serviceName+' × '+a.quantity+'\nTambahan durasi: '+a.duration+' menit\nHarga: Rp'+(Number(a.unitPrice)*Number(a.quantity)).toLocaleString('id-ID')+'\nPotongan: Rp'+Number(a.discount).toLocaleString('id-ID')+'\nTotal tambahan: Rp'+Number(a.amount).toLocaleString('id-ID')+'\nStatus: '+a.status+'\nCatatan: '+a.note+'\nPembayaran dilakukan setelah persetujuan admin.');}
function bookingExtras_(p){
  const u=requireUser_(p),access=bookingAccess_(u,p.bookingId),b=access.booking,addons=rows_('Addons').filter(function(a){return a.bookingId===b.id;});
  return {booking:{id:b.id,status:b.status,serviceName:b.serviceName,price:b.price===''?null:Number(b.price),startAt:b.startAt,endAt:effectiveEnd_(b,addons)},role:access.role,revenue:access.role==='CUSTOMER'?null:revenueSplit_(b,addons),canRequest:canAddon_(b),summary:invoiceSummary_(b,addons),services:services_().filter(function(s){return s.kind!=='MAIN'&&s.price!==null&&addonEligible_(access.therapist,s);}),addons:addons.map(function(a){const out=plain_(a);delete out.requestId;delete out.requesterId;out.whatsappUrl=addonWhatsapp_(a,b);return out;})};
}
function verifyAddonSlot_(b,a,all){
  const others=all.filter(function(x){return x.id!==a.id;});
  const start=new Date(Math.max(+new Date(effectiveEnd_(b,others)),Date.now()));
  const end=new Date(+start+Number(a.duration)*60000);
  const serviceDay=Utilities.formatDate(new Date(b.startAt),CONFIG.TIMEZONE,'yyyy-MM-dd');
  const closing=new Date(serviceDay+'T'+String(CONFIG.CLOSE_HOUR).padStart(2,'0')+':00:00+07:00');
  if(+end>+closing)fail_('Tambahan melewati jam tutup atau tanggal reservasi.');
  if(overlaps_(b.therapistId,b.startAt,end.toISOString(),rows_('Bookings'),b.id))fail_('Tambahan durasi bentrok dengan jadwal berikutnya atau jeda perjalanan.');
  return {startAt:start.toISOString(),endAt:end.toISOString()};
}
function adminAddon_(p){
  const u=requireUser_(p,true),note=text_(p.note||'','Catatan admin',0,600);
  return locked_(function(){const all=rows_('Addons'),a=all.find(function(a){return a.id===p.id;});if(!a)fail_('Tagihan tidak ditemukan.');
    if(Number(p.revision)!==Number(a.revision))fail_('Tagihan sudah berubah. Muat ulang detail sebelum melanjutkan.');
    const access=bookingAccess_(u,a.bookingId),b=access.booking;
    if(p.action==='approve'){
      if(a.status!=='REQUESTED'||!canAddon_(b))fail_('Pengajuan tidak dapat disetujui.');
      if(p.customerAgreed!==true||p.therapistAgreed!==true)fail_('Pastikan customer menyetujui biaya dan therapist menyetujui layanan/jadwal.');
      if(!addonEligible_(access.therapist,{skill:a.skill,requiresCredential:bool_(a.requiresCredential)}))fail_('Kompetensi therapist belum memenuhi layanan tambahan.');
      const discount=Number(p.discount || 0),gross=Number(a.unitPrice)*Number(a.quantity);
      if(!Number.isSafeInteger(discount)||discount<0||discount>gross)fail_('Potongan tidak valid.');
      const reason=text_(p.discountReason || '','Alasan diskon',0,300);if(discount>0&&reason.length<5)fail_('Isi alasan potongan susulan.');
      Object.assign(a,verifyAddonSlot_(b,a,all));a.discount=discount;a.discountReason=reason;a.amount=gross-discount;a.customerAgreed=true;a.therapistAgreed=true;a.status='AWAITING_PAYMENT';
    }else if(p.action==='paid'){
      if(a.status!=='AWAITING_PAYMENT'||!canAddon_(b)||p.paymentConfirmed!==true)fail_('Konfirmasi penerimaan pembayaran diperlukan.');
      if(!addonEligible_(access.therapist,{skill:a.skill,requiresCredential:bool_(a.requiresCredential)}))fail_('Therapist tidak lagi memenuhi kompetensi.');
      if(+new Date(a.startAt)<Date.now()){
        if(p.customerAgreed!==true||p.therapistAgreed!==true)fail_('Waktu mulai tambahan telah lewat. Konfirmasi ulang persetujuan customer dan therapist untuk jadwal yang diperbarui.');
        Object.assign(a,verifyAddonSlot_(b,a,all));
      }
      if(overlaps_(b.therapistId,b.startAt,effectiveEnd_(b,all),rows_('Bookings'),b.id))fail_('Jadwal tambahan bentrok.');
      a.status='PAID';a.paidAt=now_();
    }else if(p.action==='complete'){
      if(a.status!=='PAID'||!canAddon_(b)||+new Date(a.endAt)>Date.now())fail_('Tambahan belum dibayar atau waktu layanan belum selesai.');
      a.status='COMPLETED';a.completedAt=now_();
    }else if(p.action==='reject'){
      if(a.status!=='REQUESTED'||note.length<5)fail_('Pengajuan harus masih diajukan dan alasan penolakan perlu diisi.');a.status='REJECTED';
    }else if(p.action==='cancel'){
      if(['REQUESTED','AWAITING_PAYMENT','PAID'].indexOf(a.status)<0||note.length<5)fail_('Pembatalan tidak tersedia atau alasan belum diisi.');a.status='CANCELLED';
    }else if(p.action==='refund'){
      const value=Number(p.refundAmount);
      if(a.status!=='CANCELLED'||!a.paidAt||p.refundConfirmed!==true||note.length<5||!Number.isSafeInteger(value)||value<=0||value>Number(a.amount)-Number(a.refundedAmount||0))fail_('Refund harus sesuai sisa pembayaran, disertai alasan dan konfirmasi transfer.');
      a.refundedAmount=Number(a.refundedAmount||0)+value;a.refundNote=note;
    }else fail_('Tindakan tagihan tidak valid.');
    a.adminNote=note;a.updatedAt=now_();a.revision=Number(a.revision)+1;write_('Addons',a);audit_(u.id,'ADDON_'+p.action.toUpperCase(),a.id,JSON.stringify({amount:a.amount,discount:a.discount,refund:a.refundedAmount,note:note}));return true;
  });
}
function adminBaseInvoice_(p){
  const u=requireUser_(p,true),note=text_(p.note||'','Catatan',5,600);
  return locked_(function(){const b=rows_('Bookings').find(function(b){return b.id===p.id;});if(!b)fail_('Reservasi tidak ditemukan.');
    if(Number(p.revision)!==Number(b.baseInvoiceRevision||0))fail_('Reservasi sudah berubah. Muat ulang dashboard.');
    const amount=Number(p.amount);if(!Number.isSafeInteger(amount)||amount<0||amount>100000000)fail_('Nominal tidak valid.');
    if(p.action==='price'){
      if(['PENDING_ADMIN','AWAITING_PAYMENT'].indexOf(b.status)<0||b.price!=='')fail_('Penetapan harga hanya untuk reservasi belum dibayar dengan harga kosong.');
      b.price=amount;b.normalPrice=amount;b.discount=0;
    }else if(p.action==='refund'){
      if(b.status!=='CANCELLED'||amount<=0||amount>basePaid_(b)-Number(b.baseRefundedAmount||0)||p.confirmed!==true)fail_('Refund tidak valid atau transfer belum dikonfirmasi.');
      b.baseRefundedAmount=Number(b.baseRefundedAmount||0)+amount;b.baseRefundNote=note;
    }else if(p.action==='legacyPayment'){
      if(['CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED'].indexOf(b.status)<0||b.price!==''||b.basePaidAmount!==''||p.confirmed!==true)fail_('Pencatatan ini hanya untuk pembayaran lama yang nominalnya belum tercatat.');
      b.price=amount;b.basePaidAmount=amount;b.basePaymentAt=now_();
    }else fail_('Tindakan tidak tersedia.');
    b.baseInvoiceRevision=Number(b.baseInvoiceRevision||0)+1;b.updatedAt=now_();write_('Bookings',b);audit_(u.id,'BASE_'+p.action.toUpperCase(),b.id,JSON.stringify({amount:amount,note:note}));return true;
  });
}
function promoHighlights_(){
  const now=Date.now(),bookings=rows_('Bookings'),services=services_().filter(function(s){return s.kind!=='ADDON'&&s.price!==null;});
  return rows_('Promos').filter(function(p){return bool_(p.highlight)&&bool_(p.active)&&now>=+new Date(p.startsAt)&&now<+new Date(p.endsAt)&&(p.totalLimit===''||bookings.filter(function(b){return b.promoId===p.id;}).length<Number(p.totalLimit))&&services.some(function(s){return list_(p.serviceIds).indexOf(s.id)>=0;});})
    .sort(function(a,b){return Number(a.highlightOrder||0)-Number(b.highlightOrder||0)||a.id.localeCompare(b.id);}).slice(0,10)
    .map(function(p){return {id:p.id,name:p.name,mode:p.mode,code:p.code,discountType:p.discountType,value:Number(p.value),startsAt:p.startsAt,endsAt:p.endsAt,serviceFrom:p.serviceFrom,serviceTo:p.serviceTo,serviceIds:list_(p.serviceIds).filter(function(id){return services.some(function(s){return s.id===id;});})};});
}
