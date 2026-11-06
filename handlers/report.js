const { Markup } = require('telegraf');
const { REPORT_TYPES, AREAS, LIMITS, COOLDOWN_MS, TEXT } = require('../constants');
const { buildPreview } = require('../utils/format');
const {
  newReportId,
  sendReport,
  sendSuggestion,
  REPORT_STATUSES,
  statusKeyboard,
} = require('../services/sender');
const { OWNER_ID } = require('../config');

const cancelKb = Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'cancel')]]);

function stepsFor(typeKey) {
  const t = REPORT_TYPES[typeKey];
  const steps = [];
  if (t.askArea) steps.push('area');
  if (t.askName) steps.push('name');
  if (t.askTarget) steps.push('target');
  steps.push('reason', 'evidence', 'confirm');
  return steps;
}

function currentStep(ctx) {
  const r = ctx.session.report;
  return r ? r.steps[r.index] : null;
}

async function prompt(ctx) {
  const r = ctx.session.report;
  const t = REPORT_TYPES[r.typeKey];
  const step = r.steps[r.index];

  switch (step) {
    case 'area':
      return ctx.reply(
        'Bug-nya ada di mana?',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('🤖 ' + AREAS.bot, 'area:bot'),
            Markup.button.callback('🌐 ' + AREAS.web, 'area:web'),
          ],
          [Markup.button.callback('❌ Batal', 'cancel')],
        ])
      );
    case 'name':
      return ctx.reply('Ketik <b>nama kamu</b>:', { parse_mode: 'HTML', ...cancelKb });
    case 'target':
      return ctx.reply(`Ketik <b>nama ${t.targetLabel}</b> yang kamu laporkan:`, {
        parse_mode: 'HTML',
        ...cancelKb,
      });
    case 'reason':
      return ctx.reply(
        t.askArea
          ? `Jelaskan bug-nya dengan jelas (min ${LIMITS.reason.min} karakter):`
          : `Tulis <b>alasan report</b> dengan jelas (min ${LIMITS.reason.min} karakter):`,
        { parse_mode: 'HTML', ...cancelKb }
      );
    case 'evidence':
      return ctx.reply(
        '📎 Kirim <b>satu foto atau video</b> sebagai bukti.' +
          (t.askArea ? ' (screenshot atau rekaman layar)' : ''),
        { parse_mode: 'HTML', ...cancelKb }
      );
    case 'confirm':
      return ctx.reply(buildPreview(r.typeKey, r.data, r.evidence), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Kirim', 'confirm'),
            Markup.button.callback('❌ Batal', 'cancel'),
          ],
        ]),
      });
  }
}

function advance(ctx) {
  ctx.session.report.index += 1;
  return prompt(ctx);
}

function inRange(text, { min, max }) {
  return text.length >= min && text.length <= max;
}

async function startFlow(ctx, typeKey) {
  const t = REPORT_TYPES[typeKey];
  ctx.session.suggestion = false;
  ctx.session.report = {
    typeKey,
    steps: stepsFor(typeKey),
    index: 0,
    data: {},
    evidence: null,
    mediaGroupId: null,
    sending: false,
  };
  await ctx.reply(t.anonymous ? TEXT.anonNotice : TEXT.namedNotice, { parse_mode: 'HTML' });
  return prompt(ctx);
}

async function onText(ctx, storage) {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return ctx.reply('Perintah tidak dikenal. Ketik /start atau /batal.');

  if (ctx.session.suggestion) {
    if (text.length < LIMITS.suggestion.min || text.length > LIMITS.suggestion.max) {
      return ctx.reply(
        `Saran harus ${LIMITS.suggestion.min}-${LIMITS.suggestion.max} karakter. Coba lagi.`
      );
    }

    const wait = storage.cooldownRemaining('suggestion', ctx.from.id, COOLDOWN_MS);
    if (wait > 0) {
      return ctx.reply(`Tunggu ${Math.ceil(wait / 1000)} detik sebelum mengirim saran lagi.`);
    }

    const sent = await sendSuggestion(ctx.telegram, text, ctx.from);
    if (!sent) {
      return ctx.reply('❌ Saran gagal terkirim. Coba lagi beberapa saat lagi.');
    }

    storage.recordSend('suggestion', ctx.from.id);
    ctx.session.suggestion = false;
    return ctx.reply('✅ Saranmu sudah dikirim secara pribadi. Identitasmu hanya terlihat oleh owner. Terima kasih!');
  }

  const r = ctx.session.report;
  if (!r) return ctx.reply(TEXT.noSession);

  const step = currentStep(ctx);
  if (step === 'name') {
    if (!inRange(text, LIMITS.name)) {
      return ctx.reply(`Nama harus ${LIMITS.name.min}-${LIMITS.name.max} karakter. Coba lagi.`);
    }
    r.data.name = text;
  } else if (step === 'target') {
    if (!inRange(text, LIMITS.target)) {
      return ctx.reply(`Nama harus ${LIMITS.target.min}-${LIMITS.target.max} karakter. Coba lagi.`);
    }
    r.data.target = text;
  } else if (step === 'reason') {
    if (text.length < LIMITS.reason.min) {
      return ctx.reply(`Alasan terlalu singkat (min ${LIMITS.reason.min} karakter). Jelaskan lebih jelas ya.`);
    }
    if (text.length > LIMITS.reason.max) {
      return ctx.reply(`Alasan terlalu panjang (maks ${LIMITS.reason.max} karakter, sekarang ${text.length}). Ringkas dulu ya.`);
    }
    r.data.reason = text;
  } else if (step === 'evidence') {
    return ctx.reply('Bukti harus berupa foto atau video, bukan teks.');
  } else {
    return ctx.reply('Pilih lewat tombol di atas ya.');
  }
  return advance(ctx);
}

async function onMedia(ctx) {
  const r = ctx.session.report;
  if (!r) return ctx.reply(TEXT.noSession);

  // Album: Telegram kirim tiap file sebagai update terpisah. Cukup ambil yang pertama.
  const groupId = ctx.message.media_group_id;
  if (groupId && r.mediaGroupId === groupId) return;

  if (currentStep(ctx) !== 'evidence') {
    return ctx.reply('Bukti hanya diminta di langkah bukti, dan cukup satu per report.');
  }

  if (ctx.message.photo) {
    const photos = ctx.message.photo;
    r.evidence = { type: 'photo', fileId: photos[photos.length - 1].file_id };
  } else {
    r.evidence = { type: 'video', fileId: ctx.message.video.file_id };
  }
  r.mediaGroupId = groupId || null;
  return advance(ctx);
}

async function onArea(ctx) {
  await ctx.answerCbQuery();
  if (currentStep(ctx) !== 'area') return;
  ctx.session.report.data.area = ctx.match[1];
  return advance(ctx);
}

async function onConfirm(ctx, storage) {
  await ctx.answerCbQuery();
  const r = ctx.session.report;
  if (!r || currentStep(ctx) !== 'confirm' || r.sending) return;

  const wait = storage.cooldownRemaining('report', ctx.from.id, COOLDOWN_MS);
  if (wait > 0) {
    return ctx.reply(`Tunggu ${Math.ceil(wait / 1000)} detik lagi sebelum kirim report berikutnya.`);
  }

  r.sending = true;
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});

  const id = newReportId();
  storage.recordReport(id, ctx.from.id, r.typeKey);
  const { ownerOk, poolOk } = await sendReport(ctx.telegram, {
    id,
    typeKey: r.typeKey,
    data: r.data,
    evidence: r.evidence,
    user: ctx.from,
  });

  if (ownerOk && poolOk) {
    storage.recordSend('report', ctx.from.id);
    ctx.session.report = null;
    return ctx.reply(`✅ Report terkirim. ID report kamu: <b>#${id}</b>\nTerima kasih sudah melapor.`, {
      parse_mode: 'HTML',
    });
  }

  if (ownerOk || poolOk) {
    storage.recordSend('report', ctx.from.id);
    ctx.session.report = null;
    return ctx.reply(
      `⚠️ Report <b>#${id}</b> baru terkirim sebagian. Hubungi owner dan sebutkan ID ini.`,
      { parse_mode: 'HTML' }
    );
  }

  storage.deleteReport(id);
  r.sending = false;
  return ctx.reply('❌ Report gagal terkirim. Coba lagi beberapa saat lagi lewat tombol Kirim di atas atau /start ulang.');
}

async function onCancel(ctx) {
  await ctx.answerCbQuery();
  ctx.session.report = null;
  ctx.session.suggestion = false;
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  return ctx.reply('Proses dibatalkan. Ketik /start untuk kembali ke menu.');
}

function register(bot, storage) {
  bot.command('status', (ctx) => {
    const id = ctx.message.text.trim().split(/\s+/)[1]?.replace(/^#/, '').toUpperCase();
    if (!id || !/^[0-9A-F]{6}$/.test(id)) {
      return ctx.reply('Format: /status ID_REPORT\nContoh: /status A1B2C3');
    }

    const report = storage.getReportForUser(id, ctx.from.id);
    if (!report) return ctx.reply('Report tidak ditemukan. Pastikan ID benar dan report ini milikmu.');
    return ctx.reply(`Status report #${id}: <b>${REPORT_STATUSES[report.status]}</b>`, {
      parse_mode: 'HTML',
    });
  });

  bot.action(/^report-status:([0-9A-F]{6}):(received|reviewing|resolved|rejected)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.from.id !== OWNER_ID) {
      return ctx.reply('Hanya owner yang dapat mengubah status report.');
    }

    const [, id, status] = ctx.match;
    if (!storage.updateReportStatus(id, status)) {
      return ctx.reply('Report tidak ditemukan atau statusnya sudah tidak tersedia.');
    }
    await ctx.editMessageReplyMarkup(statusKeyboard(id, status).reply_markup);
    return ctx.reply(`Status report #${id} diperbarui menjadi ${REPORT_STATUSES[status]}.`);
  });

  bot.command('batal', (ctx) => {
    ctx.session.report = null;
    ctx.session.suggestion = false;
    return ctx.reply('Proses dibatalkan. Ketik /start untuk kembali ke menu.');
  });

  bot.action('suggestion', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.report = null;
    ctx.session.suggestion = true;
    return ctx.reply(TEXT.suggestionNotice, {
      parse_mode: 'HTML',
      ...cancelKb,
    });
  });

  bot.action(/^type:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    if (!REPORT_TYPES[key]) return;
    return startFlow(ctx, key);
  });
  bot.action(/^area:(bot|web)$/, onArea);
  bot.action('confirm', (ctx) => onConfirm(ctx, storage));
  bot.action('cancel', onCancel);

  bot.on('text', (ctx) => onText(ctx, storage));
  bot.on(['photo', 'video'], onMedia);
  bot.on('message', (ctx) =>
    ctx.reply('Jenis pesan ini tidak didukung. Kirim foto atau video sebagai bukti ya.')
  );
}

module.exports = { register };
