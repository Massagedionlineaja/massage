/** Promo schema: append-only migration; existing Config.gs remains unchanged. */
function appHeaders_() {
  return therapistAuthHeaders_(operationsHeaders_(Object.assign({}, HEADERS, {
    Bookings: HEADERS.Bookings.concat(['normalPrice','discount','promoId','promoName','promoCode','promoStartsAt','promoEndsAt']),
    Promos: ['id','name','mode','code','discountType','value','serviceIds','startsAt','endsAt','serviceFrom','serviceTo','totalLimit','perCustomerLimit','active','createdAt','updatedAt']
  })));
}
function ensurePromoSchema_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PROMO_SCHEMA') === '5') return;
  locked_(function () {
    if (props.getProperty('PROMO_SCHEMA') === '5') return;
    const book = SpreadsheetApp.openById(props.getProperty('DATABASE_ID'));
    ['Bookings','Promos','Services','Therapists','Addons','Verifications','AgreementAcceptances','Users','Sessions','TherapistCredentials'].forEach(function (name) {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      const expected = appHeaders_()[name];
      expandColumns_(sheet,expected.length);
      if (sheet.getLastRow()) {
        const actual = sheet.getRange(1,1,1,expected.length).getValues()[0];
        if (actual.some(function (v,i) { return v !== '' && v !== expected[i]; })) fail_('Header '+name+' berbeda. Hubungi pengelola sebelum pembaruan.');
        if(HEADERS[name] && actual.slice(0,HEADERS[name].length).some(function(v,i){return v!==HEADERS[name][i];})) fail_('Header '+name+' tidak sesuai.');
      }
      sheet.getRange(1,1,1,expected.length).setValues([expected]).setBackground('#E9DFCE').setFontWeight('bold');
      sheet.setFrozenRows(1);
    });
    SpreadsheetApp.flush(); props.setProperty('PROMO_SCHEMA','5');
  });
}
function promoDate_(value, optional) {
  if (!value && optional) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) fail_('Isi tanggal dan jam promo dalam WIB.');
  const d = new Date(value + ':00+07:00');
  if (!Number.isFinite(+d) || Utilities.formatDate(d,CONFIG.TIMEZONE,'yyyy-MM-dd') !== value.slice(0,10) || Number(value.slice(11,13))>23 || Number(value.slice(14,16))>59) fail_('Tanggal promo tidak valid.');
  return d.toISOString();
}
function promoLimit_(value) {
  if (value === '' || value === undefined || value === null) return '';
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 1000000) fail_('Kuota harus bilangan bulat 1–1.000.000 atau kosong.');
  return n;
}
function adminSavePromo_(p) {
  const user = requireUser_(p,true);
  const name = text_(p.name,'Nama promo',3,80);
  if (['AUTO','CODE'].indexOf(p.mode)<0 || ['PERCENT','FIXED'].indexOf(p.discountType)<0) fail_('Jenis promo tidak valid.');
  const code = p.mode === 'CODE' ? text_(p.code || '', 'Kode promo',3,30).toUpperCase() : '';
  if (code && !/^[A-Z0-9_-]+$/.test(code)) fail_('Kode hanya boleh huruf, angka, tanda - dan _.');
  const value = Number(p.value);
  if (!Number.isSafeInteger(value) || value <= 0 || value > (p.discountType === 'PERCENT' ? 100 : 100000000)) fail_('Nilai diskon tidak valid. Persentase maksimal 100%.');
  const available = services_().filter(function(s){return s.kind!=='ADDON';});
  const ids = pickList_(p.serviceIds,available.map(function(s){return s.id;}),'layanan/durasi',available.length);
  if (available.some(function(s){return ids.indexOf(s.id)>=0 && (s.price === null || s.price <= 0);})) fail_('Isi harga normal positif di tab Services sebelum membuat promo.');
  const startsAt = promoDate_(p.startsAt), endsAt = promoDate_(p.endsAt), serviceFrom = promoDate_(p.serviceFrom,true), serviceTo = promoDate_(p.serviceTo,true);
  if (startsAt >= endsAt || (serviceFrom && serviceTo && serviceFrom >= serviceTo)) fail_('Akhir periode harus setelah awal periode.');
  if (typeof p.active !== 'boolean') fail_('Status aktif tidak valid.');
  const totalLimit = promoLimit_(p.totalLimit), perCustomerLimit = promoLimit_(p.perCustomerLimit);
  return locked_(function () {
    const promos = rows_('Promos');
    let row = p.id ? promos.find(function(x){return x.id === p.id;}) : null;
    if (p.id && !row) fail_('Promo tidak ditemukan.');
    if (code && promos.some(function(x){return x.id !== p.id && x.code === code;})) fail_('Kode promo sudah digunakan. Gunakan kode berbeda.');
    if(p.highlight !== undefined && typeof p.highlight !== 'boolean') fail_('Pilihan highlight tidak valid.');
    const order=Number(p.highlightOrder || 0);if(!Number.isInteger(order)||order<0||order>999)fail_('Urutan highlight harus 0–999.');
    row = Object.assign(row || {id:id_('PRM'),createdAt:now_()}, {highlight:p.highlight===undefined?!!(row&&bool_(row.highlight)):p.highlight,highlightOrder:order,name:name,mode:p.mode,code:code,discountType:p.discountType,value:value,serviceIds:JSON.stringify(ids),startsAt:startsAt,endsAt:endsAt,serviceFrom:serviceFrom,serviceTo:serviceTo,totalLimit:totalLimit,perCustomerLimit:perCustomerLimit,active:p.active,updatedAt:now_()});
    write_('Promos',row); audit_(user.id,'PROMO_SAVED',row.id,name); return {id:row.id};
  });
}
function adminTogglePromo_(p) {
  const user = requireUser_(p,true);
  if (typeof p.active !== 'boolean') fail_('Status tidak valid.');
  return locked_(function(){const row = rows_('Promos').find(function(x){return x.id===p.id;});if(!row)fail_('Promo tidak ditemukan.');row.active=p.active;row.updatedAt=now_();write_('Promos',row);audit_(user.id,'PROMO_ACTIVE',row.id,String(p.active));return true;});
}
function priceQuote_(service, userId, rawCode, startAt, bookings, suppliedPromos) {
  const code = text_(rawCode || '', 'Kode promo',0,30).toUpperCase();
  const promos = suppliedPromos || rows_('Promos'), now = Date.now();
  const candidates = promos.filter(function(p) {
    if (!bool_(p.active) || !(now >= +new Date(p.startsAt) && now < +new Date(p.endsAt)) || list_(p.serviceIds).indexOf(service.id)<0 || service.price === null) return false;
    if (code ? p.mode !== 'CODE' || p.code !== code : p.mode !== 'AUTO') return false;
    if (startAt && ((p.serviceFrom && startAt < p.serviceFrom) || (p.serviceTo && startAt >= p.serviceTo))) return false;
    const used = bookings.filter(function(b){return b.promoId === p.id;}); // cancellations still consume quota
    if (p.totalLimit !== '' && used.length >= Number(p.totalLimit)) return false;
    if (userId && p.perCustomerLimit !== '' && used.filter(function(b){return b.customerId === userId;}).length >= Number(p.perCustomerLimit)) return false;
    return Number(p.value)>0 && ['FIXED','PERCENT'].indexOf(p.discountType)>=0;
  }).map(function(p){return {promo:p,discount:Math.min(service.price,Math.floor(p.discountType==='PERCENT'?service.price*Number(p.value)/100:Number(p.value)))};})
    .filter(function(x){return x.discount>0;}).sort(function(a,b){return b.discount-a.discount || a.promo.id.localeCompare(b.promo.id);});
  if (code && !candidates.length) fail_('Kode tidak berlaku untuk layanan/jadwal ini, periodenya berakhir, atau kuotanya habis.');
  const winner = candidates[0], p = winner ? winner.promo : null;
  const q = {normalPrice:service.price,price:service.price === null ? null : service.price-(winner?winner.discount:0),discount:winner?winner.discount:0,promoId:p?p.id:'',promoName:p?p.name:'',promoCode:p?p.code:'',promoStartsAt:p?p.startsAt:'',promoEndsAt:p?p.endsAt:'',serviceFrom:p?p.serviceFrom:'',serviceTo:p?p.serviceTo:'',perCustomerLimit:p?p.perCustomerLimit:''};
  q.quoteKey = hash_(JSON.stringify({quote:q,serviceId:service.id,name:service.name,duration:service.duration,skill:service.skill,requiresCredential:service.requiresCredential})); return q;
}
function catalogServices_() {
  const promos = rows_('Promos'), bookings = rows_('Bookings');
  return services_().filter(function(s){return s.kind!=='ADDON';}).map(function(s){return Object.assign({},s,{offer:priceQuote_(s,'','','',bookings,promos)});});
}
function quoteBooking_(p) {
  const user = requireUser_(p), s = service_(p.serviceId), times = schedule_(p.date,p.time,s.duration);
  return priceQuote_(s,user.id,p.promoCode || '',times.startAt,rows_('Bookings'));
}

function expandColumns_(sheet, count) {
  const current = sheet.getMaxColumns();
  if(current < count) sheet.insertColumnsAfter(current,count-current);
}
