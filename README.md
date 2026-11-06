# Bot Report

Bot Telegram (Node.js + Telegraf) untuk report anggota, admin/sentinel (masing-masing ada versi anonim), bug bot/web organisasi, dan kotak saran anonim. Sesi, report yang sedang dibuat, dan cooldown disimpan di SQLite.

## Cara jalan
1. `npm install`
2. `cp .env.example .env`, lalu isi:
   - `BOT_TOKEN` dari @BotFather
   - `OWNER_ID` ID Telegram kamu (cek lewat @userinfobot)
   - `POOL_CHAT_ID` ID grup pool: masukkan bot ke grup, ketik `/id` di grup itu
3. Buka chat dengan bot dan tekan `/start` (wajib, supaya bot boleh kirim DM ke owner)
4. `npm start`
5. `npm test` untuk menjalankan tes otomatis

Di VPS: `pm2 start index.js --name bot-report`

## Alur report
Pelapor chat bot lewat DM: pilih jenis, isi nama (kalau tidak anonim), nama terlapor, alasan (min 20 karakter), lalu satu foto/video sebagai bukti, dan konfirmasi.
Hasilnya dikirim ke dua tempat dengan ID report yang sama:
- **Owner**: lengkap dengan identitas asli pelapor (termasuk yang anonim)
- **Grup pool**: tanpa username/ID pelapor. Non-anonim hanya menampilkan nama yang diketik pelapor, anonim menampilkan "Anonim"

Report bug (bot / web organisasi) diperlakukan seperti anonim di grup pool, dan identitasnya sampai ke owner.

## Cek status report
Setelah report dikirim, pelapor bisa mengirim `/status ID_REPORT` di DM bot, misalnya `/status A1B2C3`. Status yang tersedia: **Diterima**, **Ditinjau**, **Selesai**, dan **Ditolak**. Owner mengubah status lewat tombol di pesan report yang masuk ke DM owner. ID report hanya bisa dicek oleh akun pelapor.

## Polling grup
Admin grup pool bisa membuat polling dengan mengirim `/poll`, memilih jenis polling lewat tombol, lalu membalas prompt bot dengan pertanyaan dan satu pilihan per pesan. Tekan **Selesai, buat polling** setelah mengirim minimal dua pilihan. Bisa memilih polling anonim atau polling dengan identitas pemilih terlihat.

Polling mendukung 2-10 pilihan. Bot harus ada di grup pool dan dapat memeriksa status admin anggota. Balasan harus menggunakan fitur Reply ke prompt bot.

Perintah `/help` menampilkan panduan command dan fitur hanya di grup pool. Di chat pribadi, gunakan `/start` untuk membuka menu bot.

## Rekap bulanan
Owner bisa mengirim `/rekap` lewat DM bot untuk mem-posting rekap bulan berjalan ke grup pool. Rekap otomatis aktif secara default dan dikirim tanggal 10 setiap bulan pukul 19.00 WIB. Owner dapat mengaturnya lewat `/rekap_auto_on` atau `/rekap_auto_off`. Rekap hanya berisi jumlah laporan per status dan jenis, tanpa identitas atau deskripsi laporan.

## Reminder grup
Anggota grup pool bisa mengirim `/daftar` untuk setuju menerima mention saat ada reminder, dan `/keluar` untuk berhenti. Admin bisa mengirim `/reminder isi pengingat` untuk mengirim langsung, atau `/reminder DD HH:mm` (WIB) untuk menjadwalkan sekali; balas prompt bot dengan isi pesannya. Contoh: `/reminder 10 19:00`. Jika waktu hari itu sudah lewat, jadwal dibuat untuk tanggal tersebut di bulan berikutnya yang memiliki tanggal itu.

Jadwal tersimpan di SQLite dan tetap dijalankan setelah bot restart. Admin dapat melihat jadwal dengan `/reminder_jadwal_list`, menghapus jadwal tertunda dengan `/reminder_jadwal_hapus ID`, atau membatalkan draft dengan `/reminder_jadwal_batal`. Bot mention anggota terdaftar saja, bukan seluruh grup; mention dikirim dalam beberapa pesan jika diperlukan.

## FAQ
Kirim `/faq` untuk membaca panduan singkat tentang penggunaan bot dan privasi report.

## Kotak saran anonim
Pilih **Saran Anonim** dari menu utama, lalu kirim saran 10-1000 karakter. Saran dikirim pribadi ke owner dan tidak diposting ke grup pool atau ditampilkan ke pengguna lain. **Owner tetap melihat nama, username, dan ID Telegram pengirim.** Saran dibatasi satu kali per menit per akun; sesi dan batas waktu tersimpan di SQLite sehingga tetap berlaku setelah bot restart.

## Struktur
- `index.js` entry point
- `config.js` baca .env
- `constants.js` jenis report, batas panjang, dan semua teks bot
- `handlers/start.js` menu utama
- `handlers/help.js` panduan command khusus grup
- `handlers/faq.js` FAQ bot
- `handlers/recap.js` rekap manual dan otomatis
- `handlers/reminder.js` pengumuman pengingat grup
- `handlers/report.js` alur pertanyaan sampai konfirmasi
- `handlers/poll.js` perintah polling khusus grup pool
- `services/sender.js` pengiriman report ke grup pool dan owner
- `utils/format.js` pembuat caption

## Catatan
- Session percakapan disimpan di SQLite, jadi progres report bertahan saat bot restart.
- Database SQLite tersimpan di `data/bot-report.sqlite` (bisa diubah dengan `DATABASE_PATH`).
- Jeda 60 detik antar report dan saran per user tetap berlaku setelah restart.
- Owner menerima notifikasi saat bot mulai dan saat berhenti dengan SIGINT/SIGTERM. Bot tidak bisa mengirim notifikasi jika mati mendadak atau server kehilangan koneksi/daya.
- Perintah `/id` boleh dihapus dari `index.js` setelah setup selesai.
