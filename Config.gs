/** UBAH DUA NILAI DI BAWAH, kemudian jalankan setupApp dari editor. */
const CONFIG = Object.freeze({
  APP_NAME: 'Massage di Onlineaja',
  ADMIN_EMAILS: ['triputratu@gmail.com'],
  ADMIN_WHATSAPP: '6281295128064', // contoh format: 6281234567890
  TIMEZONE: 'Asia/Jakarta',
  OTP_MINUTES: 10,
  SESSION_HOURS: 24,
  MAX_KTP_BYTES: 2 * 1024 * 1024,
  MIN_NOTICE_MINUTES: 120,
  MAX_BOOKING_DAYS: 60,
  OPEN_HOUR: 8,
  CLOSE_HOUR: 22,
  TRAVEL_BUFFER_MINUTES: 60,
  OTP_EMAIL_DAILY_LIMIT: 60,
  PRIVACY_VERSION: '2026-09-09'
});

const AREAS = Object.freeze({
  Jakarta: ['Jakarta Barat', 'Jakarta Selatan', 'Jakarta Utara', 'Jakarta Timur', 'Jakarta Pusat'],
  Tangerang: ['Serpong', 'Karawaci', 'Bintaro/Ciputat', 'BSD'],
  Depok: ['Depok 2', 'Sawangan', 'Limo', 'Beji', 'Citayam'],
  Bogor: ['Bogor Kota', 'Cibinong', 'Bojonggede'],
  Bekasi: ['Bekasi']
});

// Harga dibiarkan kosong sampai admin menentukan tarif. Satu baris per durasi.
const INITIAL_SERVICES = [
  ['massage60', 'Massage', 60, '', true, 'Relaksasi tubuh setelah hari yang panjang.', false],
  ['massage90', 'Massage', 90, '', true, 'Waktu lebih panjang untuk tubuh beristirahat.', false],
  ['massage120', 'Massage', 120, '', true, 'Sesi menyeluruh dengan tempo yang nyaman.', false],
  ['refleksi60', 'Refleksi', 60, '', true, 'Perawatan relaksasi untuk kaki yang lelah.', false],
  ['lulur90', 'Lulur', 90, '', true, 'Perawatan tubuh dengan lulur.', false],
  ['fisiotherapy60', 'Fisiotherapy', 60, '', true, 'Tersedia setelah kompetensi profesional diverifikasi admin.', true],
  ['creambath60', 'Creambath', 60, '', true, 'Perawatan rambut dan pijat ringan kepala.', false]
];

const HEADERS = Object.freeze({
  Users: ['id', 'email', 'name', 'whatsapp', 'createdAt', 'updatedAt'],
  Therapists: ['id', 'userId', 'fullName', 'whatsapp', 'experience', 'skills', 'city', 'areas', 'ktpFileId', 'ktpUrl', 'status', 'available', 'physioVerified', 'adminNote', 'consentVersion', 'consentedAt', 'createdAt', 'updatedAt'],
  Bookings: ['id', 'requestId', 'customerId', 'customerName', 'customerWhatsapp', 'therapistId', 'therapistName', 'serviceId', 'serviceName', 'duration', 'price', 'city', 'area', 'address', 'notes', 'startAt', 'endAt', 'status', 'adminNote', 'createdAt', 'updatedAt'],
  Reviews: ['id', 'bookingId', 'customerId', 'therapistId', 'customerLabel', 'rating', 'comment', 'createdAt'],
  Services: ['id', 'name', 'duration', 'price', 'active', 'description', 'requiresCredential'],
  Sessions: ['tokenHash', 'userId', 'expiresAt', 'createdAt'],
  Auth: ['email', 'codeHash', 'expiresAt', 'attempts', 'lastSentAt', 'day', 'dayCount'],
  AuditLog: ['id', 'actorId', 'action', 'recordId', 'detail', 'createdAt']
});
