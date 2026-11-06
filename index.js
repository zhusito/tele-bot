const { Telegraf, session } = require('telegraf');
const { BOT_TOKEN, OWNER_ID, DATABASE_PATH } = require('./config');
const start = require('./handlers/start');
const help = require('./handlers/help');
const faq = require('./handlers/faq');
const report = require('./handlers/report');
const poll = require('./handlers/poll');
const reminder = require('./handlers/reminder');
const recap = require('./handlers/recap');
const Storage = require('./services/storage');

async function main() {
  const storage = await Storage.open(DATABASE_PATH);
  const bot = new Telegraf(BOT_TOKEN);

  help.register(bot);
  faq.register(bot);
  reminder.register(bot, storage);
  recap.register(bot, storage);

  // Bantuan setup: cek ID grup pool. Boleh dihapus setelah POOL_CHAT_ID sudah diisi.
  bot.command('id', (ctx) => ctx.reply(`Chat ID: ${ctx.chat.id}`));
  poll.register(bot);

  // Bot hanya melayani chat pribadi. Grup diabaikan.
  bot.use((ctx, next) => (ctx.chat && ctx.chat.type === 'private' ? next() : undefined));

  // Session dan cooldown disimpan di SQLite agar bertahan setelah restart.
  bot.use(
    session({
      store: storage.sessions,
      defaultSession: () => ({ report: null, suggestion: false }),
    })
  );

  start.register(bot);
  report.register(bot, storage);

  bot.catch((err, ctx) => {
    console.error(`[bot] error pada update ${ctx.update.update_id}:`, err.message);
  });

  async function notifyOwner(message, event) {
    try {
      await bot.telegram.sendMessage(OWNER_ID, message);
    } catch (err) {
      console.error(`[bot] gagal mengirim notifikasi ${event} ke owner:`, err.message);
    }
  }

  let stopping = false;
  let stopMonthlyRecap = () => {};
  let stopReminderScheduler = () => {};
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    await notifyOwner(`🔴 Bot report berhenti (${signal}).`, 'berhenti');
    stopMonthlyRecap();
    stopReminderScheduler();
    bot.stop(signal);
    storage.close();
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await bot.launch();
    console.log('[bot] berjalan');
    stopMonthlyRecap = recap.startMonthlyRecap(bot, storage);
    stopReminderScheduler = reminder.startReminderScheduler(bot, storage);
    await notifyOwner('🟢 Bot report aktif.', 'aktif');
  } catch (err) {
    console.error('[bot] gagal dijalankan:', err.message);
    storage.close();
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[bot] gagal menyiapkan penyimpanan atau bot:', err.message);
  process.exitCode = 1;
});
