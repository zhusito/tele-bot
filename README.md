# Bot Report

Bot Telegram (Node.js + Telegraf) untuk report anggota, admin/sentinel (masing-masing ada versi anonim), bug bot/web organisasi, dan kotak saran anonim. Tanpa database.

## Cara jalan
1. `npm install`
2. `cp .env.example .env`, lalu isi:
   - `BOT_TOKEN` dari @BotFather
   - `OWNER_ID` ID Telegram kamu (cek lewat @userinfobot)
   - `POOL_CHAT_ID` ID grup pool: masukkan bot ke grup, ketik `/id` di grup itu
3. Buka chat dengan bot dan tekan `/start` (wajib, supaya bot boleh kirim DM ke owner)
4. `npm start`

Di VPS: `pm2 start index.js --name bot-report`

## Alur report
Pelapor chat bot lewat DM: pilih jenis, isi nama (kalau tidak anonim), nama terlapor, alasan (min 20 karakter), lalu satu foto/video sebagai bukti, dan konfirmasi.
Hasilnya dikirim ke dua tempat dengan ID report yang sama:
- **Owner**: lengkap dengan identitas asli pelapor (termasuk yang anonim)
- **Grup pool**: tanpa username/ID pelapor. Non-anonim hanya menampilkan nama yang diketik pelapor, anonim menampilkan "Anonim"

Report bug (bot / web organisasi) diperlakukan seperti anonim di grup pool, dan identitasnya sampai ke owner.

## Kotak saran anonim
Pilih **Saran Anonim** dari menu utama, lalu kirim saran 10-1000 karakter. Saran dikirim pribadi ke owner dan tidak diposting ke grup pool atau ditampilkan ke pengguna lain. **Owner tetap melihat nama, username, dan ID Telegram pengirim.** Saran dibatasi satu kali per menit per akun (in-memory). Seperti fitur bot lainnya, sesi dan batas waktu kembali kosong setelah bot restart.

## Struktur
- `index.js` entry point
- `config.js` baca .env
- `constants.js` jenis report, batas panjang, dan semua teks bot
- `handlers/start.js` menu utama
- `handlers/report.js` alur pertanyaan sampai konfirmasi
- `services/sender.js` **satu-satunya tempat yang menentukan apa yang dikirim ke grup dan owner**
- `utils/format.js` pembuat caption

## Catatan
- Session percakapan disimpan di memori. Kalau bot restart di tengah proses, pelapor mulai ulang.
- Jeda 60 detik antar report per user (in-memory, hilang saat restart).
- Perintah `/id` boleh dihapus dari `index.js` setelah setup selesai.
