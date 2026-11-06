const { POOL_CHAT_ID } = require('../config');

const HELP_TEXT = [
  '📖 Panduan Bot Report',
  '',
  'Fitur report dan saran:',
  '• Buka chat pribadi dengan bot, lalu kirim /start untuk membuat report atau mengirim saran anonim.',
  '• Cek status report di chat pribadi: /status ID_REPORT',
  '• Batalkan proses di chat pribadi: /batal',
  '• Baca FAQ: /faq',
  '',
  'Polling di grup pool (khusus admin grup):',
  '• Kirim /poll, pilih polling anonim atau nama terlihat, lalu balas prompt bot dengan pertanyaan dan pilihan.',
  '• Daftar/berhenti dari mention reminder: /daftar atau /keluar.',
  '• Reminder langsung: /reminder isi pesan.',
  '• Jadwalkan reminder (WIB): /reminder DD HH:mm, lalu balas prompt dengan isi pesan.',
  '• Lihat/hapus jadwal: /reminder_jadwal_list dan /reminder_jadwal_hapus ID.',
  '',
  'Untuk memulai report atau cek status, lanjutkan di chat pribadi dengan bot.',
].join('\n');

function register(bot) {
  bot.command('help', (ctx) => {
    if (
      !ctx.chat ||
      !['group', 'supergroup'].includes(ctx.chat.type) ||
      ctx.chat.id !== POOL_CHAT_ID
    ) {
      return;
    }
    return ctx.reply(HELP_TEXT);
  });
}

module.exports = { register, HELP_TEXT };
