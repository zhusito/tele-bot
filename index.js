const { Telegraf, session } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const start = require('./handlers/start');
const report = require('./handlers/report');

const bot = new Telegraf(BOT_TOKEN);

// Bantuan setup: cek ID grup pool. Boleh dihapus setelah POOL_CHAT_ID sudah diisi.
bot.command('id', (ctx) => ctx.reply(`Chat ID: ${ctx.chat.id}`));

// Bot hanya melayani chat pribadi. Grup diabaikan.
bot.use((ctx, next) => (ctx.chat && ctx.chat.type === 'private' ? next() : undefined));

// Session in-memory untuk melacak langkah percakapan (tanpa database).
bot.use(session({ defaultSession: () => ({ report: null }) }));

start.register(bot);
report.register(bot);

bot.catch((err, ctx) => {
  console.error(`[bot] error pada update ${ctx.update.update_id}:`, err.message);
});

bot.launch().then(() => console.log('[bot] berjalan'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
