const { Markup } = require('telegraf');
const { REPORT_TYPES, AREAS, LIMITS, COOLDOWN_MS, TEXT } = require('../constants');
const { buildPreview } = require('../utils/format');
const { newReportId, sendReport } = require('../services/sender');

const cancelKb = Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'cancel')]]);
const lastSent = new Map(); // userId -> timestamp report terakhir (in-memory, tanpa database)

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

async function onText(ctx) {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return ctx.reply('Perintah tidak dikenal. Ketik /start atau /batal.');

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

async function onConfirm(ctx) {
  await ctx.answerCbQuery();
  const r = ctx.session.report;
  if (!r || currentStep(ctx) !== 'confirm' || r.sending) return;

  const wait = (lastSent.get(ctx.from.id) || 0) + COOLDOWN_MS - Date.now();
  if (wait > 0) {
    return ctx.reply(`Tunggu ${Math.ceil(wait / 1000)} detik lagi sebelum kirim report berikutnya.`);
  }

  r.sending = true;
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});

  const id = newReportId();
  const { ownerOk, poolOk } = await sendReport(ctx.telegram, {
    id,
    typeKey: r.typeKey,
    data: r.data,
    evidence: r.evidence,
    user: ctx.from,
  });

  if (ownerOk && poolOk) {
    lastSent.set(ctx.from.id, Date.now());
    ctx.session.report = null;
    return ctx.reply(`✅ Report terkirim. ID report kamu: <b>#${id}</b>\nTerima kasih sudah melapor.`, {
      parse_mode: 'HTML',
    });
  }

  if (ownerOk || poolOk) {
    lastSent.set(ctx.from.id, Date.now());
    ctx.session.report = null;
    return ctx.reply(
      `⚠️ Report <b>#${id}</b> baru terkirim sebagian. Hubungi owner dan sebutkan ID ini.`,
      { parse_mode: 'HTML' }
    );
  }

  r.sending = false;
  return ctx.reply('❌ Report gagal terkirim. Coba lagi beberapa saat lagi lewat tombol Kirim di atas atau /start ulang.');
}

async function onCancel(ctx) {
  await ctx.answerCbQuery();
  ctx.session.report = null;
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  return ctx.reply('Report dibatalkan. Ketik /start kalau mau membuat report lagi.');
}

function register(bot) {
  bot.command('batal', (ctx) => {
    ctx.session.report = null;
    return ctx.reply('Report dibatalkan. Ketik /start kalau mau membuat report lagi.');
  });

  bot.action(/^type:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    if (!REPORT_TYPES[key]) return;
    return startFlow(ctx, key);
  });
  bot.action(/^area:(bot|web)$/, onArea);
  bot.action('confirm', onConfirm);
  bot.action('cancel', onCancel);

  bot.on('text', onText);
  bot.on(['photo', 'video'], onMedia);
  bot.on('message', (ctx) =>
    ctx.reply('Jenis pesan ini tidak didukung. Kirim foto atau video sebagai bukti ya.')
  );
}

module.exports = { register };
