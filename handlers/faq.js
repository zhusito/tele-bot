const FAQ_TEXT = [
  '❓ FAQ Bot Report',
  '',
  '• Mulai report atau kirim saran: buka chat pribadi bot lalu kirim /start.',
  '• Cek status: kirim /status ID_REPORT di chat pribadi bot.',
  '• Membatalkan proses yang sedang berjalan: kirim /batal di chat pribadi.',
  '• Report anonim menyembunyikan identitas dari grup, tetapi owner tetap dapat melihat identitas pengirim.',
  '• Report wajib menyertakan alasan dan satu foto atau video sebagai bukti.',
  '• Polling dibuat oleh admin grup pool dengan /poll.',
  '• Kirim /daftar di grup pool untuk menerima mention pada reminder. /keluar untuk berhenti.',
  '• Admin: /reminder isi pesan untuk mengirim sekarang, atau /reminder DD HH:mm untuk menjadwalkan (WIB). Balas prompt bot dengan isi pesan.',
  '• Lihat/hapus jadwal: /reminder_jadwal_list dan /reminder_jadwal_hapus ID.',
  '',
  'Gunakan /help di grup pool untuk melihat daftar command.',
].join('\n');

function register(bot) {
  bot.command('faq', (ctx) => ctx.reply(FAQ_TEXT));
}

module.exports = { register, FAQ_TEXT };
