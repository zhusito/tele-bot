const { OWNER_ID, POOL_CHAT_ID } = require('../config');
const { formatMonthlyRecap, monthKey, isAfterMonthlySendTime } = require('../services/recap');

async function sendRecap(bot, storage, key = monthKey()) {
  await bot.telegram.sendMessage(POOL_CHAT_ID, formatMonthlyRecap(storage, key));
}

function register(bot, storage) {
  bot.command(['rekap', 'recap'], async (ctx) => {
    if (ctx.from.id !== OWNER_ID || ctx.chat.type !== 'private') {
      return ctx.reply('Perintah rekap hanya bisa digunakan owner lewat chat pribadi dengan bot.');
    }

    try {
      await sendRecap(bot, storage);
      return ctx.reply('✅ Rekap bulan ini sudah dikirim ke grup pool.');
    } catch (err) {
      console.error('[recap] gagal mengirim rekap manual:', err.message);
      return ctx.reply('❌ Rekap gagal dikirim ke grup pool. Coba lagi nanti.');
    }
  });

  bot.command(['rekap_auto_on', 'rekap_auto_off'], (ctx) => {
    if (ctx.from.id !== OWNER_ID || ctx.chat.type !== 'private') {
      return ctx.reply('Pengaturan rekap otomatis hanya bisa digunakan owner lewat chat pribadi.');
    }

    const enabled = ctx.message.text.split(/\s/)[0].split('@')[0] === '/rekap_auto_on';
    storage.setSetting('monthly_recap_enabled', enabled ? '1' : '0');
    return ctx.reply(`Rekap bulanan otomatis ${enabled ? 'diaktifkan' : 'dimatikan'}.`);
  });
}

function startMonthlyRecap(bot, storage) {
  let sending = false;
  const check = async () => {
    const key = monthKey();
    if (
      sending ||
      storage.getSetting('monthly_recap_enabled') === '0' ||
      storage.getSetting('monthly_recap_sent') === key ||
      !isAfterMonthlySendTime()
    ) {
      return;
    }

    sending = true;
    try {
      await sendRecap(bot, storage, key);
      storage.setSetting('monthly_recap_sent', key);
      console.log(`[recap] rekap otomatis ${key} terkirim`);
    } catch (err) {
      console.error(`[recap] gagal mengirim rekap otomatis ${key}:`, err.message);
    } finally {
      sending = false;
    }
  };

  const timer = setInterval(check, 30_000);
  timer.unref();
  check();
  return () => clearInterval(timer);
}

module.exports = { register, sendRecap, startMonthlyRecap };
