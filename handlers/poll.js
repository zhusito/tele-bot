const { Markup } = require('telegraf');
const { POOL_CHAT_ID } = require('../config');

const flows = new Map();
const cancelKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('❌ Batal', 'poll:cancel')],
]);

function flowKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function validateQuestion(question) {
  const value = question.trim();
  if (!value || value.length > 255) return { error: 'Pertanyaan harus 1-255 karakter.' };
  return { value };
}

function validateOption(option, options) {
  const value = option.trim();
  if (!value || value.length > 100) return { error: 'Pilihan harus 1-100 karakter.' };
  if (options.length >= 10) return { error: 'Polling maksimal memiliki 10 pilihan.' };
  if (options.some((existing) => existing.toLocaleLowerCase() === value.toLocaleLowerCase())) {
    return { error: 'Pilihan polling tidak boleh duplikat.' };
  }
  return { value };
}

function optionsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Selesai, buat polling', 'poll:finish')],
    [Markup.button.callback('❌ Batal', 'poll:cancel')],
  ]);
}

async function isGroupAdmin(ctx) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    console.error('[poll] gagal memeriksa admin grup:', err.message);
    return null;
  }
}

function adminCheckError(ctx, result) {
  return ctx.reply(
    result === null
      ? '❌ Tidak bisa memeriksa izin admin. Pastikan bot masih menjadi anggota grup.'
      : 'Hanya admin grup yang boleh membuat polling.'
  );
}

async function updateOptionsPrompt(ctx, flow) {
  const optionList = flow.options.map((option, index) => `${index + 1}. ${option}`).join('\n');
  const text =
    `Pertanyaan: ${flow.question}\n\n` +
    `Pilihan (${flow.options.length}/10):\n${optionList || 'Belum ada'}\n\n` +
    'Tambahkan pilihan dengan membalas pesan ini. Minimal 2 pilihan.';
  await ctx.telegram.editMessageText(
    flow.chatId,
    flow.promptMessageId,
    undefined,
    text,
    optionsKeyboard()
  );
}

function register(bot) {
  bot.command('poll', async (ctx) => {
    if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type)) {
      return ctx.reply('Perintah polling hanya bisa dipakai di grup pool.');
    }
    if (ctx.chat.id !== POOL_CHAT_ID) {
      return ctx.reply('Polling hanya bisa dibuat di grup pool yang terdaftar.');
    }
    const admin = await isGroupAdmin(ctx);
    if (admin !== true) return adminCheckError(ctx, admin);

    const key = flowKey(ctx.chat.id, ctx.from.id);
    const message = await ctx.reply(
      'Pilih jenis polling yang ingin dibuat:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🔒 Anonim', 'poll:type:anon'),
          Markup.button.callback('👤 Nama terlihat', 'poll:type:named'),
        ],
        [Markup.button.callback('❌ Batal', 'poll:cancel')],
      ])
    );
    flows.set(key, {
      chatId: ctx.chat.id,
      userId: ctx.from.id,
      stage: 'type',
      promptMessageId: message.message_id,
    });
  });

  bot.action(/^poll:type:(anon|named)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const key = flowKey(ctx.chat.id, ctx.from.id);
    const flow = flows.get(key);
    if (!flow || flow.stage !== 'type' || flow.promptMessageId !== ctx.callbackQuery.message.message_id) {
      return;
    }
    const admin = await isGroupAdmin(ctx);
    if (admin !== true) {
      flows.delete(key);
      return adminCheckError(ctx, admin);
    }

    flow.isAnonymous = ctx.match[1] === 'anon';
    flow.stage = 'question';
    const message = await ctx.reply(
      'Balas pesan ini dengan pertanyaan polling (maks. 255 karakter).',
      cancelKeyboard
    );
    flow.promptMessageId = message.message_id;
    await ctx.editMessageReplyMarkup(undefined);
  });

  bot.action('poll:finish', async (ctx) => {
    await ctx.answerCbQuery();
    const key = flowKey(ctx.chat.id, ctx.from.id);
    const flow = flows.get(key);
    if (!flow || flow.stage !== 'options' || flow.promptMessageId !== ctx.callbackQuery.message.message_id) {
      return;
    }
    const admin = await isGroupAdmin(ctx);
    if (admin !== true) {
      flows.delete(key);
      return adminCheckError(ctx, admin);
    }
    if (flow.options.length < 2) {
      return ctx.reply('Tambahkan minimal 2 pilihan sebelum membuat polling.');
    }

    try {
      await ctx.telegram.sendPoll(ctx.chat.id, flow.question, flow.options, {
        is_anonymous: flow.isAnonymous,
      });
      flows.delete(key);
      await ctx.editMessageReplyMarkup(undefined);
    } catch (err) {
      console.error('[poll] gagal mengirim polling:', err.message);
      return ctx.reply('❌ Polling gagal dikirim. Coba lagi nanti.');
    }
  });

  bot.action('poll:cancel', async (ctx) => {
    await ctx.answerCbQuery();
    const key = flowKey(ctx.chat.id, ctx.from.id);
    const flow = flows.get(key);
    if (!flow || flow.promptMessageId !== ctx.callbackQuery.message.message_id) return;
    flows.delete(key);
    await ctx.editMessageReplyMarkup(undefined);
    return ctx.reply('Pembuatan polling dibatalkan.');
  });

  bot.on('text', async (ctx, next) => {
    if (!ctx.chat || ctx.chat.id !== POOL_CHAT_ID || !['group', 'supergroup'].includes(ctx.chat.type)) {
      return next();
    }

    const flow = flows.get(flowKey(ctx.chat.id, ctx.from.id));
    if (
      !flow ||
      !ctx.message.reply_to_message ||
      ctx.message.reply_to_message.message_id !== flow.promptMessageId ||
      ctx.message.text.startsWith('/')
    ) {
      return next();
    }
    if (!(await isGroupAdmin(ctx))) {
      flows.delete(flowKey(ctx.chat.id, ctx.from.id));
      return ctx.reply('Hanya admin grup yang boleh membuat polling.');
    }

    if (flow.stage === 'question') {
      const { error, value } = validateQuestion(ctx.message.text);
      if (error) return ctx.reply(error);
      flow.question = value;
      flow.options = [];
      flow.stage = 'options';
      const message = await ctx.reply(
        'Balas pesan ini dengan satu pilihan per pesan. Tambahkan minimal 2 pilihan, lalu tekan Selesai.',
        optionsKeyboard()
      );
      flow.promptMessageId = message.message_id;
      return;
    }

    if (flow.stage === 'options') {
      const result = validateOption(ctx.message.text, flow.options);
      if (result.error) return ctx.reply(result.error);
      flow.options.push(result.value);
      return updateOptionsPrompt(ctx, flow);
    }

    return next();
  });
}

module.exports = { register, validateQuestion, validateOption };
