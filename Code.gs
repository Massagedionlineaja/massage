/** Entry point. Semua helper berakhiran _ agar tidak dapat dipanggil dari browser. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(name) {
  if (['Styles', 'App', 'Artwork'].indexOf(name) < 0) throw new Error('Invalid include');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Jalankan satu kali dari editor Apps Script. Aman dijalankan ulang; tidak menghapus data. */
function setupApp_() {
  validateConfig_();
  return locked_(function () {
    const props = PropertiesService.getScriptProperties();
    let dbId = props.getProperty('DATABASE_ID');
    if (!dbId) {
      const book = SpreadsheetApp.create(CONFIG.APP_NAME + ' — Database');
      book.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
      dbId = book.getId();
      props.setProperty('DATABASE_ID', dbId);
    }
    const book = SpreadsheetApp.openById(dbId);
    Object.keys(appHeaders_()).forEach(function (name) {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      expandColumns_(sheet,appHeaders_()[name].length);
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, appHeaders_()[name].length).setValues([appHeaders_()[name]])
          .setBackground('#E9DFCE').setFontWeight('bold');
        sheet.setFrozenRows(1);
      } else {
        const actual = sheet.getRange(1, 1, 1, appHeaders_()[name].length).getValues()[0];
        if (JSON.stringify(actual) !== JSON.stringify(appHeaders_()[name])) {
          throw new Error('Header tab ' + name + ' berbeda. Jangan mengubah nama/urutan kolom.');
        }
      }
    });
    if (book.getSheetByName('Services').getLastRow() === 1) {
      book.getSheetByName('Services').getRange(2, 1, INITIAL_SERVICES.length, HEADERS.Services.length).setValues(INITIAL_SERVICES);
    }
    if (!props.getProperty('KTP_FOLDER_ID')) {
      const folder = DriveApp.createFolder(CONFIG.APP_NAME + ' — KTP Privat');
      folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      props.setProperty('KTP_FOLDER_ID', folder.getId());
    }
    if (!props.getProperty('AUTH_PEPPER')) props.setProperty('AUTH_PEPPER', Utilities.getUuid() + Utilities.getUuid());
    SpreadsheetApp.flush();
    console.log('Database: ' + book.getUrl());
    console.log('Folder KTP privat: ' + DriveApp.getFolderById(props.getProperty('KTP_FOLDER_ID')).getUrl());
    console.log('Setup selesai. Deploy sebagai Web app, Execute as Me, akses Anyone.');
  });
}

function validateConfig_() {
  if (!CONFIG.ADMIN_EMAILS.length || CONFIG.ADMIN_EMAILS.some(function (e) { return /GANTI/i.test(e) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); })) {
    fail_('Isi ADMIN_EMAILS di Config.gs dengan email admin yang sebenarnya.');
  }
  if (!/^62\d{8,13}$/.test(CONFIG.ADMIN_WHATSAPP)) fail_('Isi ADMIN_WHATSAPP di Config.gs dengan format 628… tanpa tanda +.');
}

/** Satu gateway dengan allowlist tindakan. Tidak ada endpoint baca Sheet/Drive generik. */
function api(action, payload) {
  partnershipEvidenceCache_=null;
  try {
    if (typeof action !== 'string' || !payload || typeof payload !== 'object' || Array.isArray(payload)) fail_('Permintaan tidak valid.');
    const routes = {
      therapistLoginInfo:therapistLoginInfo_, therapistLogin:therapistLogin_, adminCredentialInfo:adminCredentialInfo_, adminSetCredential:adminSetCredential_, publicTherapistApplication:publicTherapistApplication_, adminEditTherapistProfile:adminEditTherapistProfile_, bootstrap: bootstrap_, requestOtp: requestOtp_, verifyOtp: verifyOtp_, logout: logout_,
      me: me_, saveProfile: saveProfile_, findTherapists: findTherapists_, getReviews: getReviews_,
      createBooking: createBooking_, myBookings: myBookings_, cancelBooking: cancelBooking_,
      submitReview: submitReview_, registerTherapist: registerTherapist_, therapistDashboard: therapistDashboard_,
      setAvailability: setAvailability_, adminDashboard: adminDashboard_, adminTherapist: adminTherapist_,
      adminBooking: adminBooking_, adminKtp: adminKtp_, quoteBooking: quoteBooking_, adminSavePromo: adminSavePromo_, adminTogglePromo: adminTogglePromo_, adminSaveService: adminSaveService_, requestSkills: requestSkills_, adminReviewSkills: adminReviewSkills_, bookingExtras: bookingExtras_, submitAddon: submitAddon_, adminAddon: adminAddon_, adminBaseInvoice: adminBaseInvoice_, currentAgreement: currentAgreement_, acceptAgreement: acceptAgreement_, agreementRecords: agreementRecords_, submitVerification: submitVerification_, verificationDetails: verificationDetails_, verificationDocument: verificationDocument_, reviewVerification: reviewVerification_, updateCoverage:updateCoverage_
    };
    if (!Object.prototype.hasOwnProperty.call(routes, action)) fail_('Tindakan tidak tersedia.');
    if (action !== 'bootstrap') { ready_(); ensurePromoSchema_(); }
    therapistAuthGate_(action,payload);
    return {ok: true, data: routes[action](payload)};
  } catch (error) {
    if (!error.userFacing) console.error('API failure: ' + action + ' / ' + (error.name || 'Error'));
    return {ok: false, error: error.userFacing ? error.message : 'Proses belum berhasil. Silakan coba lagi atau hubungi admin.', code: error.appCode || 'REQUEST_FAILED'};
  }
}

function bootstrap_() {
  let configured = false;
  try { ready_(); ensurePromoSchema_(); configured = true; } catch (e) { /* tampilkan keadaan setup */ }
  return {
    appName: CONFIG.APP_NAME, areas: DISTRICTS, skills: configured ? skillNames_() : [], highlights: configured ? promoHighlights_() : [],
    services: configured ? catalogServices_() : [], configured: configured,
    adminWhatsapp: /^62\d{8,13}$/.test(CONFIG.ADMIN_WHATSAPP) ? CONFIG.ADMIN_WHATSAPP : '',
    timezone: CONFIG.TIMEZONE, openHour: CONFIG.OPEN_HOUR, closeHour: CONFIG.CLOSE_HOUR,
    minNoticeMinutes: CONFIG.MIN_NOTICE_MINUTES, maxBookingDays: CONFIG.MAX_BOOKING_DAYS,
    agreement: currentAgreement_(), privacyVersion: CONFIG.PRIVACY_VERSION
  };
}

function ready_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('DATABASE_ID') || !props.getProperty('AUTH_PEPPER') || !props.getProperty('KTP_FOLDER_ID')) {
    fail_('Website sedang disiapkan. Admin perlu menjalankan setupApp_ di editor Apps Script.');
  }
  validateConfig_();
}

function fail_(message, code) {
  const error = new Error(message); error.userFacing = true; error.appCode = code || 'VALIDATION'; throw error;
}
function now_() { return new Date().toISOString(); }
function id_(prefix) { return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase(); }
function locked_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('Sedang ada proses lain. Tunggu sebentar, lalu coba lagi.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function sheet_(name) {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DATABASE_ID')).getSheetByName(name);
}
function rows_(name) {
  const sheet = sheet_(name);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, appHeaders_()[name].length).getValues().map(function (row, i) {
    const out = {_row: i + 2};
    appHeaders_()[name].forEach(function (h, n) { out[h] = row[n] instanceof Date ? row[n].toISOString() : row[n]; });
    return out;
  });
}
function safeCell_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(value)) return "'" + value;
  return value;
}
function write_(name, obj) {
  if(name==='Verifications'||name==='AgreementAcceptances')partnershipEvidenceCache_=null;
  const sheet = sheet_(name);
  const row = obj._row || sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, appHeaders_()[name].length).setValues([appHeaders_()[name].map(function (h) { return ['accountNumber','version','agreementVersion','partnershipVersion'].indexOf(h)>=0 && obj[h]!==undefined ? "'"+String(obj[h]) : safeCell_(obj[h]); })]);
  obj._row = row;
  return obj;
}
function plain_(obj) {
  if (!obj) return null;
  const out = Object.assign({}, obj); delete out._row; return out;
}
function text_(value, label, min, max) {
  if (typeof value !== 'string') fail_(label + ' perlu diisi.');
  const s = value.trim();
  if (s.length < min || s.length > max) fail_(label + ' harus berisi ' + min + '–' + max + ' karakter.');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) fail_(label + ' berisi karakter yang tidak didukung.');
  return s;
}
function email_(v) {
  const s = text_(v, 'Email', 5, 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail_('Alamat email belum valid.');
  return s;
}
function phone_(v) {
  let s = text_(v, 'Nomor WhatsApp', 9, 25).replace(/[\s()+-]/g, '');
  if (s.indexOf('0') === 0) s = '62' + s.slice(1);
  if (!/^62\d{8,13}$/.test(s)) fail_('Nomor WhatsApp harus dimulai 08… atau 628… dan valid.');
  return s;
}
function bool_(v) { return v === true || String(v).toLowerCase() === 'true'; }
function list_(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function pickList_(value, allowed, label, max) {
  if (!Array.isArray(value) || !value.length || value.length > max || new Set(value).size !== value.length || value.some(function (x) { return allowed.indexOf(x) < 0; })) {
    fail_('Pilih 1–' + max + ' ' + label + ' yang tersedia.');
  }
  return value;
}
function area_(city, area) {
  if (!Object.prototype.hasOwnProperty.call(DISTRICTS, city) || DISTRICTS[city].indexOf(area) < 0) fail_('Pilih kota / kabupaten dan kecamatan dari daftar.');
}
function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function pepper_() { return PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER'); }
function same_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function audit_(actorId, action, recordId, detail) {
  write_('AuditLog', {id: id_('LOG'), actorId: actorId, action: action, recordId: recordId, detail: detail || '', createdAt: now_()});
}

function requestOtp_(p) {
  const email = email_(p.email);
  return locked_(function () {
    const now = Date.now(), day = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
    let a = rows_('Auth').find(function (x) { return x.email === email; });
    if (a && now - new Date(a.lastSentAt).getTime() < 60000) fail_('Tunggu 60 detik sebelum meminta kode lagi.');
    const count = a && a.day === day ? Number(a.dayCount) : 0;
    if (count >= 8) fail_('Batas pengiriman kode untuk email ini tercapai. Coba lagi besok.');
    const props = PropertiesService.getScriptProperties();
    let global = JSON.parse(props.getProperty('OTP_BUDGET') || '{}');
    if (global.day !== day) global = {day: day, count: 0};
    if (global.count >= CONFIG.OTP_EMAIL_DAILY_LIMIT || MailApp.getRemainingDailyQuota() < 1) fail_('Pengiriman kode sedang penuh. Coba lagi nanti atau hubungi admin.');
    const random = hash_(Utilities.getUuid() + Utilities.getUuid() + pepper_());
    const code = String(parseInt(random.slice(0, 12), 16) % 1000000).padStart(6, '0');
    // Cadangkan kuota sebelum pengiriman agar kegagalan penyimpanan tidak membuka batas.
    global.count++; props.setProperty('OTP_BUDGET', JSON.stringify(global));
    a = Object.assign(a || {}, {email: email, codeHash: hash_(email + ':' + code + ':' + pepper_()),
      expiresAt: new Date(now + CONFIG.OTP_MINUTES * 60000).toISOString(), attempts: 0,
      lastSentAt: new Date(now).toISOString(), day: day, dayCount: count + 1});
    write_('Auth', a);
    try {
      MailApp.sendEmail({to: email, subject: code + ' — kode masuk ' + CONFIG.APP_NAME,
        body: 'Kode masuk Anda: ' + code + '\n\nBerlaku ' + CONFIG.OTP_MINUTES + ' menit. Jangan berikan kode ini kepada siapa pun, termasuk admin.\n\nJika Anda tidak meminta kode ini, abaikan email ini.\n\n' + CONFIG.APP_NAME,
        name: CONFIG.APP_NAME});
    } catch (e) {
      a.codeHash = ''; write_('Auth', a); fail_('Kode belum dapat dikirim. Tunggu satu menit lalu coba kembali.');
    }
    return {expiresInMinutes: CONFIG.OTP_MINUTES, resendInSeconds: 60};
  });
}

function verifyOtp_(p) {
  const email = email_(p.email), code = text_(p.code, 'Kode OTP', 6, 6);
  if (!/^\d{6}$/.test(code)) fail_('Kode OTP harus 6 angka.');
  return locked_(function () {
    const a = rows_('Auth').find(function (x) { return x.email === email; });
    if (!a || !a.codeHash || new Date(a.expiresAt).getTime() <= Date.now() || Number(a.attempts) >= 5) fail_('Kode tidak berlaku. Minta kode baru.');
    a.attempts = Number(a.attempts) + 1;
    if (!same_(a.codeHash, hash_(email + ':' + code + ':' + pepper_()))) {
      write_('Auth', a); fail_('Kode belum sesuai. Periksa email Anda.');
    }
    a.codeHash = ''; write_('Auth', a); // Sekali pakai, termasuk bila respons terputus.
    let user = rows_('Users').find(function (x) { return x.email === email && x.accountKind !== 'THERAPIST'; });
    if (!user) user = write_('Users', {id: id_('USR'), email: email, name: '', whatsapp: '', createdAt: now_(), updatedAt: now_()});
    // Bersihkan sesi kedaluwarsa saat login agar tabel tidak terus bertambah.
    const ss = sheet_('Sessions');
    rows_('Sessions').filter(function (s) { return new Date(s.expiresAt).getTime() <= Date.now(); })
      .sort(function (a, b) { return b._row - a._row; }).forEach(function (s) { ss.deleteRow(s._row); });
    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    write_('Sessions', {tokenHash: hash_(token), userId: user.id, expiresAt: new Date(Date.now() + CONFIG.SESSION_HOURS * 3600000).toISOString(), createdAt: now_()});
    return {token: token, user: userView_(user)};
  });
}
function requireUser_(p, admin) {
  if (!p || typeof p.token !== 'string' || !/^[a-fA-F0-9]{64}$/.test(p.token)) fail_('Silakan masuk kembali.', 'AUTH_REQUIRED');
  const digest = hash_(p.token);
  const session = rows_('Sessions').find(function (s) { return same_(String(s.tokenHash), digest) && new Date(s.expiresAt).getTime() > Date.now(); });
  if (!session) fail_('Sesi berakhir. Silakan masuk kembali.', 'AUTH_REQUIRED');
  const user = rows_('Users').find(function (x) { return x.id === session.userId; });
  if (!user) fail_('Silakan masuk kembali.', 'AUTH_REQUIRED');
  user._authMethod=session.method||'EMAIL';
  if(user._authMethod==='THERAPIST'||user._authMethod==='APPLICATION'){const c=credential_(user.id);if(!c||Number(c.revision||0)!==Number(session.credentialRevision||0))fail_('Akses berubah. Silakan masuk kembali.','AUTH_REQUIRED');}
  if (admin && !isAdmin_(user)) fail_('Hanya admin yang dapat mengakses bagian ini.', 'FORBIDDEN');
  return user;
}
function isAdmin_(u) { if(u.accountKind==='THERAPIST'||(u._authMethod&&u._authMethod!=='EMAIL'))return false; return CONFIG.ADMIN_EMAILS.map(function (x) { return x.trim().toLowerCase(); }).indexOf(u.email) >= 0; }
function userView_(u) {
  const c=credential_(u.id);
  return {authMethod:u._authMethod||'EMAIL',username:c?c.username:'',id: u.id, email: u.email, name: u.name, whatsapp: u.whatsapp, isAdmin: isAdmin_(u),
    isTherapist: rows_('Therapists').some(function (t) { return t.userId === u.id; })};
}
function me_(p) { return userView_(requireUser_(p)); }
function logout_(p) {
  const user = requireUser_(p);
  return locked_(function () {
    const s = rows_('Sessions').find(function (x) { return x.userId === user.id && same_(x.tokenHash, hash_(p.token)); });
    if (s) sheet_('Sessions').deleteRow(s._row);
    return true;
  });
}
function saveProfile_(p) {
  const user = requireUser_(p);
  const name = text_(p.name, 'Nama', 2, 100), whatsapp = phone_(p.whatsapp);
  return locked_(function () {
    const fresh = rows_('Users').find(function (x) { return x.id === user.id; });
    fresh.name = name; fresh.whatsapp = whatsapp; fresh.updatedAt = now_(); write_('Users', fresh);
    fresh._authMethod=user._authMethod;return userView_(fresh);
  });
}

function services_() {
  return allServices_().filter(function(s){return s.active && s.name && Number.isInteger(s.duration) && s.duration>=5 && s.duration<=240 && (s.price===null || (Number.isSafeInteger(s.price) && s.price>=0));});
}
function service_(id) {
  const s = services_().find(function (x) { return x.id === id && x.kind!=='ADDON'; });
  if (!s) fail_('Layanan tidak tersedia. Muat ulang pilihan layanan.'); return s;
}
function schedule_(date, time, duration) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) fail_('Pilih tanggal dan jam yang valid.');
  const hours = Number(time.slice(0, 2)), minutes = Number(time.slice(3));
  if (minutes < 0 || minutes >= 60 || minutes % 30 !== 0 || hours < CONFIG.OPEN_HOUR || hours * 60 + minutes + duration > CONFIG.CLOSE_HOUR * 60) fail_('Pilih jadwal dalam jam layanan, dengan interval 30 menit.');
  const start = new Date(date + 'T' + time + ':00+07:00');
  if (!Number.isFinite(start.getTime()) || Utilities.formatDate(start, CONFIG.TIMEZONE, 'yyyy-MM-dd') !== date) fail_('Tanggal tidak valid.');
  if (start.getTime() < Date.now() + CONFIG.MIN_NOTICE_MINUTES * 60000) fail_('Reservasi paling cepat ' + CONFIG.MIN_NOTICE_MINUTES / 60 + ' jam dari sekarang.');
  if (start.getTime() > Date.now() + CONFIG.MAX_BOOKING_DAYS * 86400000) fail_('Reservasi maksimal ' + CONFIG.MAX_BOOKING_DAYS + ' hari ke depan.');
  return {startAt: start.toISOString(), endAt: new Date(start.getTime() + duration * 60000).toISOString()};
}
function overlaps_(therapistId, startAt, endAt, bookings, excludeId) {
  const occupied = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'];
  const additions=rows_('Addons');
  const start = new Date(startAt).getTime(), end = new Date(endAt).getTime(), buffer = CONFIG.TRAVEL_BUFFER_MINUTES * 60000;
  return bookings.some(function (b) {
    return b.id !== excludeId && b.therapistId === therapistId && occupied.indexOf(b.status) >= 0 &&
      start < new Date(effectiveEnd_(b,additions)).getTime() + buffer && end + buffer > new Date(b.startAt).getTime();
  });
}
function eligible_(t, city, area, service) {
  return t.status === 'APPROVED' && partnershipReady_(t) && bool_(t.available) && coverageView_(t).indexOf(coverageKey_(city,area)) >= 0 &&
    list_(t.skills).indexOf(service.skill || service.name) >= 0 && (!service.requiresCredential || bool_(t.physioVerified));
}
function publicTherapist_(t, reviews) {
  const rr = reviews.filter(function (r) { return r.therapistId === t.id; });
  return {id: t.id, name: t.fullName, experience: t.experience, skills: list_(t.skills), coverage:coverageView_(t), city: t.city, areas: list_(t.areas),
    reviewCount: rr.length, rating: rr.length ? Math.round(rr.reduce(function (n, r) { return n + Number(r.rating); }, 0) / rr.length * 10) / 10 : null};
}
function findTherapists_(p) {
  requireUser_(p); area_(p.city, p.area);
  const s = service_(p.serviceId), times = schedule_(p.date, p.time, s.duration), bookings = rows_('Bookings'), reviews = rows_('Reviews');
  return rows_('Therapists').filter(function (t) { return eligible_(t, p.city, p.area, s) && !overlaps_(t.id, times.startAt, times.endAt, bookings); })
    .map(function (t) { return publicTherapist_(t, reviews); })
    .sort(function (a, b) { return (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name); });
}
function getReviews_(p) {
  requireUser_(p);
  const t = rows_('Therapists').find(function (x) { return x.id === p.therapistId && x.status === 'APPROVED'; });
  if (!t) fail_('Therapist tidak tersedia.');
  return rows_('Reviews').filter(function (r) { return r.therapistId === t.id; }).slice(-30).reverse()
    .map(function (r) { return {customerLabel: r.customerLabel, rating: Number(r.rating), comment: r.comment, createdAt: r.createdAt}; });
}

function createBooking_(p) {
  const user = requireUser_(p);
  if (!user.name || !user.whatsapp) fail_('Lengkapi nama dan WhatsApp Anda terlebih dahulu.');
  const requestId = text_(p.requestId, 'ID permintaan', 16, 100);
  const address = text_(p.address, 'Alamat lengkap', 10, 600), notes = text_(p.notes || '', 'Catatan', 0, 600);
  if (p.consent !== true) fail_('Setujui ketentuan reservasi untuk melanjutkan.');
  area_(p.city, p.area);
  return locked_(function () {
    const bookings = rows_('Bookings');
    const duplicate = bookings.find(function (b) { return b.customerId === user.id && b.requestId === requestId; });
    if (duplicate) return bookingView_(duplicate, [], true);
    if (bookings.filter(function (b) { return b.customerId === user.id && ['PENDING_ADMIN', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'].indexOf(b.status) >= 0; }).length >= 5) fail_('Maksimal 5 reservasi aktif. Selesaikan atau batalkan reservasi sebelumnya.');
    const s = service_(p.serviceId), times = schedule_(p.date, p.time, s.duration);
    const quote = priceQuote_(s, user.id, p.promoCode || '', times.startAt, bookings);
    if (!p.quoteKey || p.quoteKey !== quote.quoteKey) fail_('Harga atau promo berubah. Periksa kembali ringkasan harga sebelum menyimpan.', 'PRICE_CHANGED');
    const t = rows_('Therapists').find(function (x) { return x.id === p.therapistId; });
    if (!t || !eligible_(t, p.city, p.area, s)) fail_('Therapist tidak lagi sesuai dengan layanan atau area. Cari ulang therapist.');
    if (overlaps_(t.id, times.startAt, times.endAt, bookings)) fail_('Jadwal therapist baru saja terisi. Pilih waktu atau therapist lain.');
    const terms=agreementTerms_(agreementEvidence_(t));
    const b = {id: id_('MO'), requestId: requestId, customerId: user.id, customerName: user.name, customerWhatsapp: user.whatsapp,
      serviceSkill:s.skill,requiresCredential:s.requiresCredential,therapistId: t.id, therapistName: t.fullName, serviceId: s.id, serviceName: s.name, duration: s.duration,
      normalPrice: quote.normalPrice === null ? '' : quote.normalPrice, discount: quote.discount, promoId: quote.promoId, promoName: quote.promoName, promoCode: quote.promoCode, promoStartsAt: quote.promoStartsAt, promoEndsAt: quote.promoEndsAt, price: quote.price === null ? '' : quote.price, city: p.city, area: p.area, address: address, notes: notes,
      startAt: times.startAt, endAt: times.endAt, partnershipVersion:terms.version,therapistPercent:terms.percent,partnershipAgreementId:terms.agreementId,areaVersion:'KECAMATAN_V1',status: 'PENDING_ADMIN', adminNote: '', createdAt: now_(), updatedAt: now_()};
    write_('Bookings', b);
    audit_(user.id, 'BOOKING_CREATED', b.id, 'Ketentuan ' + CONFIG.PRIVACY_VERSION);
    return bookingView_(b, [], true);
  });
}
function whatsappUrl_(phone, message) { return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message); }
function whatsappBooking_(b) {
  return whatsappUrl_(CONFIG.ADMIN_WHATSAPP, 'Halo admin Massage di Onlineaja, saya ingin konfirmasi reservasi.\n\n' +
    'Kode: ' + b.id + '\nNama: ' + b.customerName + '\nWhatsApp: ' + b.customerWhatsapp +
    '\nLayanan: ' + b.serviceName + ' ' + b.duration + ' menit\nTherapist pilihan: ' + b.therapistName +
    '\nJadwal: ' + Utilities.formatDate(new Date(b.startAt), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm') + ' WIB' +
    '\nArea: ' + b.city + ' · ' + b.area + '\nAlamat: ' + b.address +
    (b.promoId ? '\nPromo: ' + b.promoName + (b.promoCode ? ' (' + b.promoCode + ')' : '') + '\nHarga normal: Rp' + Number(b.normalPrice).toLocaleString('id-ID') + '\nPotongan: Rp' + Number(b.discount).toLocaleString('id-ID') : '') +
    (b.notes ? '\nCatatan: ' + b.notes : '') + '\nEstimasi: ' + (b.price === '' ? 'Mohon info harga' : 'Rp' + Number(b.price).toLocaleString('id-ID')) +
    '\n\nMohon cek kesediaan therapist dan total pembayaran. Saya akan membayar setelah konfirmasi admin.');
}
function bookingView_(b, reviews, includeWhatsapp) {
  const out = plain_(b); delete out.requestId; delete out.adminNote; delete out.partnershipVersion; delete out.therapistPercent; delete out.partnershipAgreementId;
  out.price = b.price === '' ? null : Number(b.price); out.duration = Number(b.duration); out.effectiveEndAt=effectiveEnd_(b); out.invoice=invoiceSummary_(b,rows_('Addons').filter(function(a){return a.bookingId===b.id;}));
  out.reviewed = reviews.some(function (r) { return r.bookingId === b.id; });
  if (includeWhatsapp) out.whatsappUrl = whatsappBooking_(b);
  return out;
}
function myBookings_(p) {
  const user = requireUser_(p), reviews = rows_('Reviews');
  return rows_('Bookings').filter(function (b) { return b.customerId === user.id; }).reverse().map(function (b) { return bookingView_(b, reviews, true); });
}
function cancelBooking_(p) {
  const u = requireUser_(p);
  return locked_(function () {
    const b = rows_('Bookings').find(function (x) { return x.id === p.bookingId && x.customerId === u.id; });
    if (!b || b.status !== 'PENDING_ADMIN') fail_('Pembatalan setelah proses konfirmasi perlu melalui admin WhatsApp.');
    b.status = 'CANCELLED'; b.updatedAt = now_(); write_('Bookings', b); audit_(u.id, 'BOOKING_CANCELLED', b.id);
    return true;
  });
}
function submitReview_(p) {
  const u = requireUser_(p), rating = Number(p.rating), comment = text_(p.comment, 'Review', 5, 1000);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail_('Pilih rating 1 sampai 5.');
  return locked_(function () {
    const b = rows_('Bookings').find(function (x) { return x.id === p.bookingId && x.customerId === u.id && x.status === 'COMPLETED'; });
    if (!b) fail_('Review tersedia untuk reservasi Anda yang sudah selesai.');
    if (rows_('Reviews').some(function (r) { return r.bookingId === b.id; })) fail_('Reservasi ini sudah memiliki review.');
    const first = (u.name || 'Customer').split(' ')[0];
    write_('Reviews', {id: id_('REV'), bookingId: b.id, customerId: u.id, therapistId: b.therapistId,
      customerLabel: first.charAt(0).toUpperCase() + '***', rating: rating, comment: comment, createdAt: now_()});
    audit_(u.id, 'REVIEW_CREATED', b.id); return true;
  });
}

function registerTherapist_(p) { const u=requireUser_(p);return locked_(function(){
  const name=p.username?username_(p.username):'';
  if(name&&rows_('TherapistCredentials').some(function(c){return c.username===name&&c.userId!==u.id;}))fail_('Username sudah digunakan.');
  const contact=p.email?email_(p.email):u.email,result=registerTherapistData_(u,p);
  const t=rows_('Therapists').find(function(t){return t.id===result.id;});t.contactEmail=contact;write_('Therapists',t);
  if(name)write_('TherapistCredentials',Object.assign(credential_(u.id)||{userId:u.id,revision:0},{username:name,updatedAt:now_()}));
  return result;
}); }
function registerTherapistData_(u,p) {
  const fullName = text_(p.fullName, 'Nama lengkap', 2, 100), whatsapp = phone_(p.whatsapp);
  const experience = text_(p.experience, 'Pengalaman kerja', 10, 1200);
  const skills = pickList_(p.skills, skillNames_(), 'keahlian', Math.max(1,skillNames_().length));
  const coverage=coverageInput_(p.coverage);
  if (p.consent !== true) fail_('Persetujuan penggunaan data perlu dicentang.');
    if (rows_('Therapists').some(function (t) { return t.userId === u.id || String(t.whatsapp) === whatsapp; })) fail_('Pendaftaran therapist sudah ada untuk akun atau WhatsApp ini. Hubungi admin untuk pembaruan.');
    paymentInput_(p);agreementInput_(p);imageBytes_(p.ktp,'KTP');imageBytes_(p.selfie,'Selfie');
    const id=id_('THR'),created=[];
    const t={id:id,userId:u.id,fullName:fullName,whatsapp:whatsapp,experience:experience,skills:JSON.stringify(skills),city:'',areas:'[]',coverage:JSON.stringify(coverage),ktpFileId:'',ktpUrl:'',status:'PENDING',available:true,physioVerified:false,adminNote:'',consentVersion:CONFIG.PRIVACY_VERSION,consentedAt:now_(),createdAt:now_(),updatedAt:now_()};
    let recorded=false;
    try {const row=verificationRecord_(t,u,p,created);recorded=true;t.ktpFileId=row.ktpFileId;write_('Therapists',t);}
    catch(e){if(!recorded)created.forEach(function(f){f.setTrashed(true);});throw e;}
    audit_(u.id, 'THERAPIST_REGISTERED', id); return {id: id, status: 'PENDING'};

}
function therapistDashboard_(p) {
  const u = requireUser_(p), t = rows_('Therapists').find(function (x) { return x.userId === u.id; });
  if (!t) return {therapist: null, bookings: []};
  if(u._authMethod==='APPLICATION')return {applicationPending:true,therapist:{id:t.id,fullName:t.fullName,status:t.status,username:(credential_(u.id)||{}).username},bookings:[]};
  const profile = plain_(t); delete profile.ktpFileId; delete profile.ktpUrl; profile.partnership=partnershipSummary_(t);
  profile.coverage=coverageView_(t); profile.pendingSkills=list_(t.pendingSkills); profile.skills = list_(t.skills); profile.areas = list_(t.areas); profile.available = bool_(t.available);
  const reviews = rows_('Reviews');
  const summary = publicTherapist_(t, reviews); profile.rating = summary.rating; profile.reviewCount = summary.reviewCount;
  return {therapist: profile, bookings: rows_('Bookings').filter(function (b) {
    return b.therapistId === t.id && ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].indexOf(b.status) >= 0;
  }).reverse().map(function (b) {
    return {id: b.id, serviceName: b.serviceName, duration: Number(b.duration), endAt:effectiveEnd_(b), startAt: b.startAt, city: b.city, area: b.area,
      status: b.status, address: ['CONFIRMED', 'IN_PROGRESS'].indexOf(b.status) >= 0 ? b.address : ''};
  })};
}
function setAvailability_(p) {
  const u = requireUser_(p);
  if (typeof p.available !== 'boolean') fail_('Pilihan ketersediaan tidak valid.');
  return locked_(function () {
    const t = rows_('Therapists').find(function (x) { return x.userId === u.id; });
    if (!t || t.status !== 'APPROVED') fail_('Akun therapist belum aktif.');
    t.available = p.available; t.updatedAt = now_(); write_('Therapists', t);
    audit_(u.id, 'THERAPIST_AVAILABILITY', t.id, String(p.available)); return true;
  });
}

function adminDashboard_(p) {
  requireUser_(p, true);
  const therapists = rows_('Therapists'), reviews = rows_('Reviews');
  return {therapists: therapists.map(function (t) {
    const out = plain_(t); const c=credential_(t.userId),owner=rows_('Users').find(function(u){return u.id===t.userId;});out.loginUsername=c?c.username:'';out.passwordReady=!!(c&&c.verifier);out.contactEmail=t.contactEmail||(owner?owner.email:''); delete out.ktpFileId; delete out.ktpUrl; out.partnership=partnershipSummary_(t);
    out.coverage=coverageView_(t); out.pendingSkills=list_(t.pendingSkills); out.skills = list_(t.skills); out.areas = list_(t.areas); out.available = bool_(t.available); out.physioVerified = bool_(t.physioVerified);
    out.contactUrl = whatsappUrl_(t.whatsapp, 'Halo ' + t.fullName + ', saya admin Massage di Onlineaja.'); return out;
  }), bookings: rows_('Bookings').reverse().map(function (b) {
    const out = bookingView_(b, reviews, false); out.adminNote = b.adminNote;
    const t = therapists.find(function (t) { return t.id === b.therapistId; });
    out.customerUrl = whatsappUrl_(b.customerWhatsapp, 'Halo ' + b.customerName + ', saya admin Massage di Onlineaja. Mengenai reservasi ' + b.id + ' (' + b.serviceName + ').');
    out.therapistUrl = t ? whatsappUrl_(t.whatsapp, 'Halo ' + t.fullName + ', ada permintaan ' + b.id + ' untuk ' + b.serviceName + ' ' + b.duration + ' menit, ' + Utilities.formatDate(new Date(b.startAt), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm') + ' WIB di ' + b.area + ', ' + b.city + '. Harga jasa setelah promo: ' + (b.price===''?'belum ditetapkan':('Rp'+Number(b.price).toLocaleString('id-ID'))) + (b.partnershipVersion&&b.price!==''?'; bagian therapist '+b.therapistPercent+'%: Rp'+Math.floor(Number(b.price)*Number(b.therapistPercent)/100).toLocaleString('id-ID'):'; bagi hasil mengikuti kesepakatan pesanan') + '. Apakah bersedia?') : '';
    return out;
  }), promos: rows_('Promos').map(function (p) { const out = plain_(p); out.serviceIds = list_(p.serviceIds); out.active = bool_(p.active); out.used = rows_('Bookings').filter(function (b) { return b.promoId === p.id; }).length; return out; }), services: services_().filter(function(s){return s.kind!=='ADDON';}), catalog:allServices_(), additions:rows_('Addons').map(plain_), databaseUrl: SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DATABASE_ID')).getUrl()};
}
function adminTherapist_(p) {
  const u = requireUser_(p, true), note = text_(p.note || '', 'Catatan admin', 0, 600);
  if (['APPROVED', 'REJECTED', 'SUSPENDED'].indexOf(p.status) < 0) fail_('Status therapist tidak valid.');
  if (p.status === 'APPROVED' && p.identityChecked !== true) fail_('Konfirmasi pemeriksaan identitas sebelum menyetujui.');
  if (p.status !== 'APPROVED' && note.length < 5) fail_('Tuliskan alasan penolakan atau penonaktifan.');
  return locked_(function () {
    const t = rows_('Therapists').find(function (x) { return x.id === p.therapistId; });
    if (!t) fail_('Therapist tidak ditemukan.');
    if(p.status==='APPROVED'&&!partnershipReady_(t))fail_('Periksa selfie, pembayaran, dan bukti perjanjian melalui tombol Periksa & aktifkan.');
    t.status = p.status; t.physioVerified = p.physioVerified === true && allServices_().some(function(s){return s.requiresCredential&&list_(t.skills).indexOf(s.skill)>=0;});
    t.adminNote = note; t.updatedAt = now_(); write_('Therapists', t);
    audit_(u.id, 'THERAPIST_' + p.status, t.id, note); return true;
  });
}
function adminKtp_(p) {
  const u = requireUser_(p, true);
  const t = rows_('Therapists').find(function (x) { return x.id === p.therapistId; });
  if (!t) fail_('Dokumen tidak ditemukan.');
  const blob = DriveApp.getFileById(t.ktpFileId).getBlob();
  if (['image/jpeg', 'image/png'].indexOf(blob.getContentType()) < 0) fail_('Format dokumen tidak didukung.');
  locked_(function () { audit_(u.id, 'KTP_VIEWED', t.id); });
  return {mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes())};
}
function adminBooking_(p) {
  const u = requireUser_(p, true), note = text_(p.note || '', 'Catatan admin', 0, 600);
  const transitions = {PENDING_ADMIN: ['AWAITING_PAYMENT', 'CANCELLED'], AWAITING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED'], COMPLETED: [], CANCELLED: []};
  return locked_(function () {
    const all = rows_('Bookings'), b = all.find(function (x) { return x.id === p.bookingId; });
    if (!b || !transitions[b.status] || transitions[b.status].indexOf(p.status) < 0) fail_('Perubahan status tidak diizinkan. Muat ulang data terbaru.');
    if (p.status === 'AWAITING_PAYMENT') {
      if (p.therapistConfirmed !== true) fail_('Pastikan therapist sudah menyetujui jadwal via WhatsApp.');
      const t = rows_('Therapists').find(function (x) { return x.id === b.therapistId; });
      const s = {name:b.serviceName,skill:b.serviceSkill||b.serviceName,requiresCredential:bool_(b.requiresCredential)||b.serviceName==='Fisiotherapy'};
      if (!t || !bookingEligible_(t,b,s)) fail_('Therapist sedang tidak aktif atau tidak memenuhi layanan. Hubungi customer untuk reservasi pengganti.');
      if (new Date(b.startAt).getTime() <= Date.now()) fail_('Jadwal telah lewat. Buat reservasi baru.');
    }
    if (['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'].indexOf(p.status) >= 0 && overlaps_(b.therapistId, b.startAt, effectiveEnd_(b), all, b.id)) fail_('Jadwal bentrok dengan reservasi lain, termasuk jeda perjalanan 60 menit.');
    if (p.status === 'CONFIRMED' && b.price==='') fail_('Tetapkan nominal tagihan awal dahulu.');
    if (p.status === 'CONFIRMED' && p.paymentConfirmed !== true) fail_('Konfirmasi penerimaan pembayaran terlebih dahulu.');
    if (p.status === 'IN_PROGRESS' && new Date(b.startAt).getTime() > Date.now()) fail_('Reservasi belum memasuki waktu mulai.');
    if (p.status === 'COMPLETED' && new Date(effectiveEnd_(b)).getTime() > Date.now()) fail_('Waktu layanan belum selesai.');
    const extras=rows_('Addons').filter(function(a){return a.bookingId===b.id;});
    if(p.status==='COMPLETED'&&extras.some(function(a){return ['REQUESTED','AWAITING_PAYMENT','PAID'].indexOf(a.status)>=0;}))fail_('Selesaikan atau batalkan pengajuan tambahan terlebih dahulu.');
    if(p.status==='CANCELLED'&&extras.some(function(a){return committedAddon_(a)||a.status==='REQUESTED';}))fail_('Selesaikan pembatalan tambahan terlebih dahulu. Tambahan selesai tidak boleh dibatalkan.');
    if (p.status === 'CANCELLED' && note.length < 5) fail_('Isi alasan pembatalan.');
    if(p.status==='CONFIRMED'){b.basePaidAmount=Number(b.price);b.basePaymentAt=now_();}
    if(p.status==='CANCELLED'&&(b.basePaidAmount===''||b.basePaidAmount===undefined))b.basePaidAmount=basePaid_(b);
    const previous = b.status; b.status = p.status; b.adminNote = note; b.updatedAt = now_(); write_('Bookings', b);
    audit_(u.id, 'BOOKING_STATUS', b.id, previous + ' → ' + p.status + (note ? ': ' + note : '')); return true;
  });
}
