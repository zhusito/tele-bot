// SATU-SATUNYA tempat yang menentukan apa yang dikirim ke grup pool dan ke owner.
// Kalau ada masalah soal anonim, cek file ini dulu.
//
// Bukti dikirim ulang lewat file_id + caption buatan bot sendiri (bukan forward/copy),
// jadi tidak ada metadata pengirim yang ikut terbawa ke grup.
const crypto = require('crypto');
const { OWNER_ID, POOL_CHAT_ID } = require('../config');
const { buildPoolCaption, buildOwnerCaption } = require('../utils/format');

function newReportId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function sendMedia(telegram, chatId, evidence, caption) {
  const opts = { caption, parse_mode: 'HTML' };
  return evidence.type === 'photo'
    ? telegram.sendPhoto(chatId, evidence.fileId, opts)
    : telegram.sendVideo(chatId, evidence.fileId, opts);
}

async function sendReport(telegram, { id, typeKey, data, evidence, user }) {
  const [owner, pool] = await Promise.allSettled([
    sendMedia(telegram, OWNER_ID, evidence, buildOwnerCaption(id, typeKey, data, user)),
    sendMedia(telegram, POOL_CHAT_ID, evidence, buildPoolCaption(id, typeKey, data)),
  ]);

  if (owner.status === 'rejected') {
    console.error(`[sender] gagal kirim ke owner (#${id}):`, owner.reason?.message);
  }
  if (pool.status === 'rejected') {
    console.error(`[sender] gagal kirim ke pool (#${id}):`, pool.reason?.message);
  }

  return {
    ownerOk: owner.status === 'fulfilled',
    poolOk: pool.status === 'fulfilled',
  };
}

async function sendSuggestion(telegram, text, user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '-';
  const username = user.username ? `@${user.username}` : '-';
  const message =
    `💡 Saran anonim\n\n${text}\n\n` +
    '🔒 Identitas pengirim (hanya untuk owner):\n' +
    `Nama Telegram: ${fullName}\nUsername: ${username}\nID: ${user.id}`;

  try {
    await telegram.sendMessage(OWNER_ID, message);
    return true;
  } catch (err) {
    console.error('[sender] gagal kirim saran anonim ke owner:', err.message);
    return false;
  }
}

module.exports = { newReportId, sendReport, sendSuggestion };
