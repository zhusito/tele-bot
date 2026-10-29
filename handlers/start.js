const { Markup } = require('telegraf');
const { REPORT_TYPES, MENU_LAYOUT, TEXT } = require('../constants');

function menuKeyboard() {
  return Markup.inlineKeyboard(
    MENU_LAYOUT.map((row) =>
      row.map((key) => Markup.button.callback(REPORT_TYPES[key].label, `type:${key}`))
    )
  );
}

function showMenu(ctx) {
  return ctx.reply(TEXT.welcome, { parse_mode: 'HTML', ...menuKeyboard() });
}

function register(bot) {
  bot.start(showMenu);
  bot.help(showMenu);
}

module.exports = { register, showMenu };
