const { REPORT_TYPES } = require('../constants');
const { REPORT_STATUSES } = require('./sender');

const TIME_ZONE = 'Asia/Jakarta';
const STATUS_ORDER = ['received', 'reviewing', 'resolved', 'rejected'];

function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}`;
}

function monthRange(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid month key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month key: ${key}`);
  const jakartaOffset = 7 * 60 * 60 * 1000;
  return {
    start: Date.UTC(year, month - 1, 1) - jakartaOffset,
    end: Date.UTC(year, month, 1) - jakartaOffset,
  };
}

function formatMonthlyRecap(storage, key = monthKey()) {
  const { start, end } = monthRange(key);
  const rows = storage.monthlyReportCounts(start, end);
  const statuses = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
  const types = new Map();
  let total = 0;

  for (const row of rows) {
    const count = Number(row.count);
    statuses[row.status] = (statuses[row.status] || 0) + count;
    const label = REPORT_TYPES[row.type_key]?.label || 'Jenis lain';
    types.set(label, (types.get(label) || 0) + count);
    total += count;
  }

  const [year, month] = key.split('-').map(Number);
  const label = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
  const lines = [
    `📊 Rekap laporan — ${label}`,
    '',
    `Total: ${total}`,
    ...STATUS_ORDER.map((status) => `${REPORT_STATUSES[status]}: ${statuses[status]}`),
    '',
    'Berdasarkan jenis:',
  ];

  if (types.size) {
    for (const [type, count] of types) lines.push(`• ${type}: ${count}`);
  } else {
    lines.push('Belum ada laporan pada periode ini.');
  }

  return lines.join('\n');
}

function isAfterMonthlySendTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Number(values.day) >= 10 && Number(values.hour) * 60 + Number(values.minute) >= 19 * 60;
}

module.exports = { monthKey, monthRange, formatMonthlyRecap, isAfterMonthlySendTime };
