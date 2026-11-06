const { Markup } = require('telegraf');
const { REPORT_TYPES, MENU_LAYOUT, TEXT } = require('../constants');

function menuKeyboard() {
  const rows = MENU_LAYOUT.map((row) =>
    row.map((key) => Markup.button.callback(REPORT_TYPES[key].label, `type:${key}`))
  );
  rows.push([Markup.button.callback('💡 Saran Anonim', 'suggestion')]);
  return Markup.inlineKeyboard(rows);
}

function showMenu(ctx) {
  return ctx.reply(TEXT.welcome, { parse_mode: 'HTML', ...menuKeyboard() });
}

function register(bot) {
  bot.start(showMenu);
}

module.exports = { register, showMenu };
