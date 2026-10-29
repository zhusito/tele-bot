const { REPORT_TYPES, AREAS } = require('../constants');

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function baseLines(id, typeKey, data) {
  const t = REPORT_TYPES[typeKey];
  const lines = [`🚨 <b>${esc(t.label)}</b>  #${id}`];
  lines.push(`Pelapor: ${t.askName ? esc(data.name) : 'Anonim'}`);
  if (t.askTarget) lines.push(`Terlapor (${t.targetLabel}): ${esc(data.target)}`);
  if (t.askArea) lines.push(`Area bug: ${AREAS[data.area]}`);
  lines.push('', '<b>Alasan / Deskripsi:</b>', esc(data.reason));
  return lines;
}

// Caption untuk grup pool: TIDAK ada identitas akun pelapor sama sekali.
function buildPoolCaption(id, typeKey, data) {
  return baseLines(id, typeKey, data).join('\n');
}

// Caption untuk owner: isi sama + identitas asli pelapor untuk verifikasi.
function buildOwnerCaption(id, typeKey, data, user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '-';
  const lines = baseLines(id, typeKey, data);
  lines.push(
    '',
    '🔒 <b>Identitas asli (hanya owner):</b>',
    `Nama TG: ${esc(fullName)}`,
    `Username: ${user.username ? '@' + esc(user.username) : '-'}`,
    `ID: <code>${user.id}</code>`
  );
  return lines.join('\n');
}

// Ringkasan yang ditampilkan ke pelapor sebelum dikirim.
function buildPreview(typeKey, data, evidence) {
  const t = REPORT_TYPES[typeKey];
  const lines = [`📝 <b>${esc(t.label)}</b>`];
  if (t.askName) lines.push(`Nama kamu: ${esc(data.name)}`);
  if (t.askTarget) lines.push(`Terlapor (${t.targetLabel}): ${esc(data.target)}`);
  if (t.askArea) lines.push(`Area bug: ${AREAS[data.area]}`);
  lines.push(`Bukti: ${evidence.type === 'photo' ? '🖼 foto' : '🎥 video'}`);
  lines.push('', '<b>Alasan / Deskripsi:</b>', esc(data.reason));
  lines.push('', 'Kirim report ini?');
  return lines.join('\n');
}

module.exports = { esc, buildPoolCaption, buildOwnerCaption, buildPreview };
