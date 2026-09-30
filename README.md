# Workend

Platform pekerjaan khusus Sabtu dan Minggu. Frost UI dengan warna putih natural, warm gold, light/dark mode, serta layout responsif.

## Menjalankan

Gunakan Node.js 22.13 atau lebih baru. Instal dependency saat pertama kali menyiapkan proyek:

```sh
npm install
npm start
```

Buka portal yang sesuai:

- Pencari kerja: http://localhost:3000/
- Employer: http://localhost:3000/employer

Keduanya memiliki halaman, navigasi, formulir daftar/masuk, dan cookie sesi berbeda. **Satu akun/email dan kata sandi dapat digunakan di kedua portal**, termasuk akun lama. Peran aktif mengikuti portal tempat masuk; tidak perlu mendaftar ulang. Portal Employer tetap memerlukan verifikasi email, termasuk untuk akun yang awalnya mendaftar sebagai pekerja. Satu browser dapat masuk sebagai pekerja dan Employer bersamaan, dan logout di satu portal tidak mengeluarkan akun dari portal lainnya. Setiap sesi dibatasi ke portalnya; mengganti nama cookie tidak memberikan akses ke portal lain. Link lama `/company` otomatis dialihkan ke `/employer`.

Data akun pribadi (nama, email, telepon, dan profil) digunakan bersama. Data perusahaan, lowongan yang dipasang, serta lamaran sebagai pekerja tetap memiliki fungsi dan tampilan terpisah. Pengguna tidak dapat melamar lowongan perusahaannya sendiri. Pergantian email akun berlaku untuk kedua portal dan mencabut sesi lama.

Profil pekerja menggunakan kartu ringkasan dan indikator kelengkapan, navigasi antarbagian, serta formulir informasi pribadi, deskripsi diri, pengalaman, minat, keahlian, dan sertifikat. Indikator dihitung dari data yang sudah disimpan; bagian tambahan tetap opsional. Isian yang diperlukan ditandai bintang merah dengan label aksesibel.

Employer wajib mendaftarkan perusahaan sebelum menerbitkan atau membuka kembali lowongan. Data wajib: jenis usaha, nama perusahaan/usaha, bidang usaha, jumlah karyawan, kota, alamat kantor lengkap, email perusahaan, telepon, dan deskripsi; website dan logo opsional. Akun penanggung jawab dan profil perusahaan disimpan terpisah. Validasi diterapkan pada UI dan API. Pendaftaran data perusahaan ini bukan verifikasi legal atau persetujuan admin.

- PT/CV: gunakan nama legal perusahaan sesuai NPWP. Formulir memberi panduan nama; tidak meminta unggahan NPWP.
- Pribadi/individual: gunakan nama akun bisnis online (Instagram, seller Shopee) atau nama toko. Alamat kantor/operasional usaha tetap wajib.
- Jumlah karyawan: Solopreneur, 1–10, 11–50, 51–200, 201–500, 501–1000, 1001–5000, atau 5001+.
- Logo: PNG/JPG/WebP maksimal 2 MB, dengan pratinjau dan pilihan hapus. Logo tersimpan di database dan tersedia publik untuk kartu/detail lowongan serta daftar lamaran. Tanpa logo, UI menggunakan inisial. Mengubah data perusahaan tanpa memilih file mempertahankan logo lama.

Akun lama juga harus melengkapi jenis usaha dan jumlah karyawan sebelum memasang atau membuka kembali lowongan. Data perusahaan, logo, lowongan, dan riwayat lamaran tetap tersimpan. Lowongan yang sudah aktif pada perusahaan yang telah didaftarkan tetap tersedia di pencarian.

Untuk tes: `node --test tests/*.test.js` (atau `npm.cmd test` di PowerShell).

## Fitur

- Daftar dan masuk sebagai pencari kerja atau Employer; password scrypt, cookie sesi HttpOnly, pembatasan percobaan autentikasi.
- Cari posisi/perusahaan, pilih lokasi, filter hari/kategori/upah, urutkan upah atau waktu.
- Pencari kerja: simpan lowongan dengan indikator gold solid di kartu dan detail, kirim lamaran, pantau status, kelola profil.
- Perkenalan lamaran opsional; CV/portofolio wajib minimal salah satu: tautan HTTP/HTTPS atau lampiran PDF maksimal 5 MB. Keduanya boleh dikirim sekaligus; jika salah satu diisi, yang lainnya opsional. Lampiran disimpan di database, hanya dapat diunduh pelamar pemilik dan Employer penerima lamaran melalui sesi masuk mereka. Lamaran lama tetap tersedia.
- Employer: daftarkan dan kelola perusahaan, terbitkan lowongan, tutup/buka kembali, lihat pelamar, perbarui status seleksi.
- Lowongan memilih satu sistem kerja: Onsite (kota dan alamat wajib) atau Remote (tanpa alamat kerja). Lokasi Remote ditetapkan otomatis oleh server.
- Upah minimum Rp50.000/hari, maksimum Rp10.000.000/hari. Input `50000` otomatis tampil `50.000`; API menerima angka maupun format ribuan Indonesia seperti `150.000`.
- Database SQLite persisten di `data/workend.sqlite`. Akun baru dibuat melalui UI, tanpa kredensial bawaan.
- Enam lowongan demo untuk eksplorasi. Demo tidak menerima lamaran dan tidak mewakili kemitraan dengan brand yang ditampilkan.

## Mencoba alur lengkap

1. Buka `/employer`, daftar akun Employer dengan nama penanggung jawab, kemudian lengkapi formulir pendaftaran perusahaan. Setelah tersimpan, terbitkan lowongan dari dashboard.
2. Buka `/` pada tab lain, daftar akun pencari kerja, dan lengkapi profil. Tidak perlu keluar dari akun Employer.
3. Cari lowongan tadi dan kirim lamaran.
4. Kembali ke portal Employer, buka dashboard dan tab Pelamar, lalu ubah status.
5. Buka Lamaran saya di portal pekerja untuk melihat pembaruan.

Kedua portal menggunakan database dan API yang sama. Lowongan aktif langsung tersedia di pencarian pekerja setelah diterbitkan; lowongan yang ditutup tidak muncul di pencarian, sedangkan riwayat lamaran tetap tersimpan. Halaman pencarian yang sudah terbuka memeriksa lowongan baru setiap 15 detik dan ketika tab kembali aktif. Pembaruan ditunda saat pengguna sedang mengisi input atau membuka dialog agar interaksi tidak terputus.

## Struktur

- `server.js`: HTTP server, API, autentikasi, SQLite, data demo.
- `public/`: antarmuka vanilla JavaScript dan CSS tanpa build step.
- `tests/api.test.js`: pengujian integrasi dengan database sementara terisolasi.
- `tests/portals.test.js`: pengujian logika navigasi, formulir per portal, dan pembaruan daftar lowongan; bukan pengujian visual browser.

## Batas versi lokal

Server hanya mendengarkan `127.0.0.1`; belum dipublikasikan ke internet atau jaringan mobile. Alur desktop dan viewport mobile 320/390 px diuji dengan Chrome headless, termasuk mode terang/gelap. Pengujian ini belum mencakup seluruh perangkat fisik atau browser. Font Google bersifat opsional dan memiliki fallback lokal.

Sebelum peluncuran publik: siapkan hosting HTTPS, domain, backup database, konfigurasi pengiriman email verifikasi, pemulihan kata sandi, kebijakan privasi operasional, moderasi/verifikasi perusahaan, penghapusan akun, serta pengujian visual dan aksesibilitas lintas perangkat. Unggahan dibatasi ke PDF dengan pemeriksaan ukuran, ekstensi, dan penanda format dasar; belum ada pemindaian malware. Email kode verifikasi bisnis tersedia jika Resend dikonfigurasi. Notifikasi email lamaran belum tersedia. Status wawancara bukan penjadwalan otomatis; perusahaan menghubungi pelamar langsung melalui kontak profil.

Konfigurasi: `PORT` (default 3000), `DATA_DIR` (folder database), dan `NODE_ENV=production` untuk cookie Secure; gunakan HTTPS melalui reverse proxy yang sesuai. Database SQLite memakai API bawaan Node yang pada Node 22 masih menampilkan peringatan eksperimental.


## Pembaruan jadwal, profil, kepercayaan, dan lokasi

- Employer memilih **berulang setiap akhir pekan** selama rentang tanggal (bisa beberapa bulan) atau **satu akhir pekan**. Hari Sabtu/Minggu tetap dipilih terpisah. Lowongan lama tanpa rentang menampilkan bahwa jangka waktu perlu dikonfirmasi Employer.
- Status **Profil bisnis lengkap** berbeda dari **Kontak terverifikasi**. Email akun penanggung jawab Employer diverifikasi sebelum masuk, bukan pemeriksaan legalitas. Email operasional perusahaan yang berbeda tidak otomatis terverifikasi.
- Pekerja dapat memperbarui foto PNG/JPG/WebP (2 MB), judul profil, pengalaman, bidang minat, keahlian, serta nama/penerbit/tahun dan tautan sertifikat. Sertifikat dicatat sebagai teks/tautan; unggahan dokumen sertifikat belum tersedia. Foto dan profil tersedia untuk pemilik serta Employer yang menerima lamaran, bukan profil publik.
- CV menerima tautan saja, PDF saja, atau keduanya. Tidak mengirim keduanya ditolak API.
- Employer wajib menyetujui kebijakan tanpa pungutan sebelum menerbitkan lowongan; waktu persetujuan disimpan.
- Pekerja yang masuk dapat melaporkan lowongan atau Employer dari detail lowongan. Laporan disimpan dengan status dan dapat dilihat melalui **Laporan saya** di footer. Identitas pelapor tidak tersedia bagi Employer.
- Radius pencarian menggunakan jarak garis lurus Haversine, bukan rute jalan. Masukkan 1?500 km setelah memilih lokasi. Lowongan remote atau lowongan lama tanpa koordinat tidak termasuk hasil saat radius aktif. Lokasi pekerja tidak disimpan ke akun atau dikirim kepada Employer, dan hilang setelah memuat ulang halaman.
- Lokasi perangkat membutuhkan izin browser serta HTTPS atau localhost. Jika izin ditolak, cari area secara manual. Employer memilih titik lokasi kerja saat membuat lowongan onsite; GPS perangkat hanya tepat bila sedang berada di lokasi kerja.
- Pencarian area Indonesia memakai Nominatim/OpenStreetMap: pencarian eksplisit (tanpa autocomplete), cache, dan pembatasan permintaan global. Teks area yang dicari dikirim ke penyedia. Untuk peluncuran/traffic besar gunakan layanan geocoding sesuai kapasitas dan ketentuannya; konfigurasi GEOCODER_URL harus menunjuk endpoint search yang kompatibel Nominatim.

## Mengaktifkan verifikasi email

Salin .env.example ke .env lalu isi RESEND_API_KEY dan MAIL_FROM dari domain yang sudah diverifikasi di Resend. Jangan memasukkan kunci ke frontend atau repository. Restart server setelah konfigurasi berubah.

Jika kode tidak masuk, periksa konfigurasi ini terlebih dahulu. Tanpa kedua nilai tersebut, email tidak dikirim. Gunakan `MAIL_FROM` dari domain pengirim yang telah diverifikasi, bukan sekadar alamat email penerima. Mode uji Resend membatasi penerima; untuk mengirim ke pengguna lain, verifikasi domain pengirim sesuai [panduan error Resend](https://resend.com/docs/api-reference/errors). Setelah pengiriman diterima layanan, periksa status pesan di dashboard Resend serta folder spam penerima; penerimaan oleh API belum memastikan email masuk inbox. Antarmuka menampilkan kegagalan konfigurasi/izin pengiriman, kuota, atau gangguan koneksi, dan tombol kirim ulang menampilkan hitung mundur 60 detik.

Alur Employer: daftar/masuk dengan email dan kata sandi, lalu konfirmasi kode **6 angka** jika email akun belum terverifikasi. Kode dikirim otomatis dan mendukung angka 0 di awal serta paste kode. Setelah kode cocok, server baru membuat sesi masuk penuh dan mengarahkan Employer untuk melengkapi bisnis atau membuka dashboard. Akun yang sudah terverifikasi tidak diminta kode lagi setiap login. Pencari kerja tetap menggunakan alur masuk sebelumnya.

Sesi verifikasi sementara hanya dapat memeriksa, mengirim ulang, membatalkan, dan mengonfirmasi verifikasi; tidak bisa mengakses API Employer. Refresh halaman melanjutkan verifikasi selama sesi sementara (30 menit) masih berlaku. Sesi lama Employer yang belum terverifikasi juga tidak dapat mengakses API pribadi. Verifikasi bisnis lama hanya dipertahankan jika alamat yang dikonfirmasi sama persis dengan email login.

Kode berlaku 10 menit, maksimal lima percobaan, jeda kirim ulang 60 detik, maksimal 10 pengiriman per hari. Kode tidak dikembalikan melalui API atau log dan hanya dapat dipakai sekali. Tanpa konfigurasi pengirim, UI menjelaskan kegagalan pengiriman dan akun Employer belum dapat masuk; tidak ada verifikasi palsu atau bypass untuk mode lokal. Pengiriman email sungguhan perlu diuji dengan akun/domain pengirim Anda; tes otomatis memakai transport tiruan dari preload proses tes yang terpisah dari aplikasi.

Pengaturan **Maksimal jarak (km)** berada di popup **Tentukan lokasi**. Pilih titik, isi radius 1-500 km (atau kosongkan untuk tanpa batas), lalu tekan **Terapkan lokasi**. Memilih titik belum mengubah pencarian sampai dikonfirmasi. Menutup popup membatalkan perubahan; sidebar hanya menampilkan ringkasan lokasi dan jarak.

Employer dapat mengganti email login melalui **Profil saya > Ubah email**. Masukkan email baru dan kata sandi saat ini, lalu konfirmasi kode 6 angka yang dikirim ke alamat baru. Email lama dan status verifikasinya tetap aktif sampai konfirmasi berhasil. Permintaan dapat dilanjutkan setelah refresh, dibatalkan, atau dikirim ulang setelah 60 detik; kode berlaku 10 menit dengan maksimal 5 percobaan. Jika pengiriman gagal, alamat lama tidak berubah. Alamat yang sudah digunakan akun lain ditolak. Setelah berhasil, gunakan email baru untuk login; sesi perangkat lain dicabut dan perangkat yang mengonfirmasi mendapat sesi baru. Email operasional perusahaan tidak ikut diubah. Pengiriman kode tetap membutuhkan konfigurasi Resend.

Dokumentasi: https://resend.com/docs/api-reference/emails/send-email
Kebijakan geocoding: https://operations.osmfoundation.org/policies/nominatim/
Izin geolokasi: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition

## Mengaktifkan verifikasi telepon (Twilio Verify)

Profil pencari kerja, profil Employer, dan kontak perusahaan menyediakan pilihan negara beserta kode telepon. Indonesia (+62) menjadi pilihan awal. Nomor divalidasi dengan libphonenumber-js dan disimpan dalam format internasional, misalnya `081234567890` menjadi `+6281234567890`. Validasi format tidak otomatis berarti nomor terverifikasi.

1. Buat layanan **Verify** di akun Twilio. Atur **Code Length = 6**, aktifkan kanal SMS dan izin negara tujuan yang diperlukan.
2. Salin `.env.example` ke `.env` jika belum ada. Jika sudah ada, tambahkan konfigurasi berikut tanpa menimpa konfigurasi email:

   ```dotenv
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_VERIFY_SERVICE_SID=VA...
   SMS_DAILY_LIMIT=100
   ```

3. Isi kredensial dari Twilio Console, lalu restart server dengan `npm start`. Jangan memasukkan kredensial ke frontend atau repository.
4. Di halaman profil/perusahaan, pilih negara, isi nomor seluler, **Simpan perubahan**, lalu tekan **Kirim kode SMS**. Masukkan kode 6 angka yang diterima.

Status **Nomor terverifikasi** diberikan hanya setelah Twilio menyetujui kode. Nomor profil dan nomor perusahaan diverifikasi terpisah. Mengganti nomor menghapus status verifikasi dan membatalkan kode untuk nomor sebelumnya; perubahan format pada nomor yang sama mempertahankan statusnya. Verifikasi telepon tidak menggantikan verifikasi email sebelum Employer masuk.

Kode berlaku maksimal 10 menit dengan maksimal 5 percobaan. Kirim ulang memiliki jeda 60 detik dan batas 5 pengiriman per hari per akun/nomor; batas seluruh aplikasi diatur melalui `SMS_DAILY_LIMIT` (default 100). Tanpa konfigurasi Twilio, aplikasi menampilkan kegagalan pengiriman dan tidak memberikan status terverifikasi.

Pengiriman sungguhan membutuhkan akun Twilio yang dapat mengirim SMS ke negara tujuan. Akun trial hanya dapat mengirim ke nomor tujuan yang telah diverifikasi sesuai [ketentuan Twilio Verify](https://www.twilio.com/docs/verify/api/verification). Konfigurasi layanan: [Twilio Verify Service](https://www.twilio.com/docs/verify/api/service).

Tes otomatis memakai transport Twilio tiruan yang hanya dimuat oleh proses tes, dengan database dan kotak SMS sementara; tidak mengirim SMS atau mengenakan biaya. Pengiriman SMS sungguhan masih perlu diuji setelah kredensial layanan dikonfigurasi.

## Meninjau laporan (pengelola)

Versi ini menyediakan alat terminal internal, belum dashboard admin web. Jalankan dari folder proyek dengan DATA_DIR yang sama dengan server. Akses sistem operasi ke database dibatasi kepada pengelola.

- node scripts/reports.js list ? menampilkan laporan untuk peninjauan.
- node scripts/reports.js status ID Ditinjau "catatan internal minimal 10 karakter"
- node scripts/reports.js status ID Selesai "hasil pemeriksaan dan tindakan"
- node scripts/reports.js status ID Ditolak "alasan penolakan laporan"
- node scripts/reports.js close-job JOB_ID ? menutup lowongan yang melanggar setelah ditinjau.

Perubahan status terlihat pada Laporan saya. Catatan internal dan identitas pelapor tidak dibagikan kepada Employer. Tidak ada penutupan otomatis berdasarkan jumlah laporan; pengelola harus meninjau laporan secara aktif. Perintah close-job bukan penangguhan akun; Employer masih dapat membuka lowongannya kembali sehingga penegakan berulang perlu ditangani pengelola.

## Pengujian tambahan

npm test menjalankan tes API, validasi verifikasi, tanggal kerja, profil/foto, pelaporan, dan perhitungan radius. npm run test:browser menjalankan Chrome headless menggunakan profil browser dan database sementara terpisah. Set CHROME_PATH jika lokasi Chrome berbeda. Screenshot tersimpan di artifacts/ (diabaikan Git).
