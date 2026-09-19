/** Katalog kecamatan bersama untuk customer dan therapist. Sumber tercantum di README.
 * Cakupan adalah pilihan therapist, bukan jaminan ketersediaan. Jangan ubah nama key
 * tanpa migrasi eksplisit: gabungan kota|kecamatan membedakan nama yang sama.
 * AREAS lama dalam Config.gs dipertahankan untuk riwayat pesanan lama saja.
 */
const DISTRICTS = Object.freeze({
  "Jakarta Barat": [
    "Cengkareng",
    "Grogol Petamburan",
    "Kalideres",
    "Kebon Jeruk",
    "Kembangan",
    "Palmerah",
    "Taman Sari",
    "Tambora"
  ],
  "Jakarta Selatan": [
    "Cilandak",
    "Jagakarsa",
    "Kebayoran Baru",
    "Kebayoran Lama",
    "Mampang Prapatan",
    "Pancoran",
    "Pasar Minggu",
    "Pesanggrahan",
    "Setiabudi",
    "Tebet"
  ],
  "Jakarta Utara": [
    "Cilincing",
    "Kelapa Gading",
    "Koja",
    "Pademangan",
    "Penjaringan",
    "Tanjung Priok"
  ],
  "Jakarta Timur": [
    "Cakung",
    "Cipayung",
    "Ciracas",
    "Duren Sawit",
    "Jatinegara",
    "Kramat Jati",
    "Makasar",
    "Matraman",
    "Pasar Rebo",
    "Pulo Gadung"
  ],
  "Jakarta Pusat": [
    "Cempaka Putih",
    "Gambir",
    "Johar Baru",
    "Kemayoran",
    "Menteng",
    "Sawah Besar",
    "Senen",
    "Tanah Abang"
  ],
  "Kabupaten Kepulauan Seribu": [
    "Kepulauan Seribu Selatan",
    "Kepulauan Seribu Utara"
  ],
  "Kota Depok": [
    "Beji",
    "Bojongsari",
    "Cilodong",
    "Cimanggis",
    "Cinere",
    "Cipayung",
    "Limo",
    "Pancoran Mas",
    "Sawangan",
    "Sukmajaya",
    "Tapos"
  ],
  "Kota Bogor": [
    "Bogor Barat",
    "Bogor Selatan",
    "Bogor Tengah",
    "Bogor Timur",
    "Bogor Utara",
    "Tanah Sareal"
  ],
  "Kabupaten Bogor": [
    "Babakan Madang",
    "Bojonggede",
    "Caringin",
    "Cariu",
    "Ciampea",
    "Ciawi",
    "Cibinong",
    "Cibungbulang",
    "Cigombong",
    "Cigudeg",
    "Cijeruk",
    "Cileungsi",
    "Ciomas",
    "Cisarua",
    "Ciseeng",
    "Citeureup",
    "Dramaga",
    "Gunung Putri",
    "Gunungsindur",
    "Jasinga",
    "Jonggol",
    "Kemang",
    "Klapanunggal",
    "Leuwiliang",
    "Leuwisadeng",
    "Megamendung",
    "Nanggung",
    "Pamijahan",
    "Parung",
    "Parungpanjang",
    "Rancabungur",
    "Rumpin",
    "Sukajaya",
    "Sukamakmur",
    "Sukaraja",
    "Tajurhalang",
    "Tamansari",
    "Tanjungsari",
    "Tenjo",
    "Tenjolaya"
  ],
  "Kota Tangerang": [
    "Batuceper",
    "Benda",
    "Cibodas",
    "Ciledug",
    "Cipondoh",
    "Jatiuwung",
    "Karang Tengah",
    "Karawaci",
    "Larangan",
    "Neglasari",
    "Periuk",
    "Pinang",
    "Tangerang"
  ],
  "Kabupaten Tangerang": [
    "Balaraja",
    "Cikupa",
    "Cisauk",
    "Cisoka",
    "Curug",
    "Gunung Kaler",
    "Jambe",
    "Jayanti",
    "Kelapa Dua",
    "Kemiri",
    "Kosambi",
    "Kresek",
    "Kronjo",
    "Legok",
    "Mauk",
    "Mekar Baru",
    "Pagedangan",
    "Pakuhaji",
    "Panongan",
    "Pasar Kemis",
    "Rajeg",
    "Sepatan",
    "Sepatan Timur",
    "Sindang Jaya",
    "Solear",
    "Sukadiri",
    "Sukamulya",
    "Teluknaga",
    "Tigaraksa"
  ],
  "Kota Tangerang Selatan": [
    "Ciputat",
    "Ciputat Timur",
    "Pamulang",
    "Pondok Aren",
    "Serpong",
    "Serpong Utara",
    "Setu"
  ],
  "Kota Bekasi": [
    "Bantargebang",
    "Bekasi Barat",
    "Bekasi Selatan",
    "Bekasi Timur",
    "Bekasi Utara",
    "Jatiasih",
    "Jatisampurna",
    "Medansatria",
    "Mustikajaya",
    "Pondokgede",
    "Pondokmelati",
    "Rawalumbu"
  ],
  "Kabupaten Bekasi": [
    "Babelan",
    "Bojongmangu",
    "Cabangbungin",
    "Cibarusah",
    "Cibitung",
    "Cikarang Barat",
    "Cikarang Pusat",
    "Cikarang Selatan",
    "Cikarang Timur",
    "Cikarang Utara",
    "Karangbahagia",
    "Kedungwaringin",
    "Muaragembong",
    "Pebayuran",
    "Serang Baru",
    "Setu",
    "Sukakarya",
    "Sukatani",
    "Sukawangi",
    "Tambelang",
    "Tambun Selatan",
    "Tambun Utara",
    "Tarumajaya"
  ]
});
function coverageKey_(city,area) {return city+'|'+area;}
function coverageKeys_() {
  return Object.keys(DISTRICTS).reduce(function(out,city){return out.concat(DISTRICTS[city].map(function(area){return coverageKey_(city,area);}));},[]);
}
function coverageInput_(value) {
  const allowed=coverageKeys_();
  if(!Array.isArray(value)||!value.length||value.length>allowed.length||new Set(value).size!==value.length||value.some(function(k){return typeof k!=='string'||allowed.indexOf(k)<0;}))fail_('Pilih kecamatan yang valid, minimal satu. Pilihan boleh lintas kota / kabupaten.');
  return value.slice().sort();
}
function coverageView_(t) {
  const allowed=coverageKeys_();
  return list_(t.coverage).filter(function(k,i,a){return typeof k==='string'&&allowed.indexOf(k)>=0&&a.indexOf(k)===i;});
}
function updateCoverage_(p) {
  const u=requireUser_(p),coverage=coverageInput_(p.coverage);
  return locked_(function(){
    const t=rows_('Therapists').find(function(x){return x.userId===u.id;});
    if(!t)fail_('Profil therapist tidak ditemukan.');
    // Perubahan lokasi tidak mengganti dokumen, persetujuan, atau snapshot booking.
    const before=coverageView_(t);t.coverage=JSON.stringify(coverage);t.updatedAt=now_();write_('Therapists',t);
    audit_(u.id,'THERAPIST_COVERAGE',t.id,JSON.stringify({before:before,after:coverage}));
    return {coverage:coverage};
  });
}
function bookingEligible_(t,b,service) {
  if(b.areaVersion==='KECAMATAN_V1')return eligible_(t,b.city,b.area,service);
  // Hanya pesanan yang sudah tersimpan dengan lokasi lama menggunakan aturan lama.
  return t.status==='APPROVED'&&partnershipReady_(t)&&bool_(t.available)&&t.city===b.city&&list_(t.areas).indexOf(b.area)>=0&&list_(t.skills).indexOf(service.skill||service.name)>=0&&(!service.requiresCredential||bool_(t.physioVerified));
}
