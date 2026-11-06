require('dotenv').config();
const path = require('path');

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Env ${name} belum diisi. Cek file .env`);
    process.exit(1);
  }
  return value;
}

function requiredNumber(name) {
  const n = Number(required(name));
  if (!Number.isFinite(n)) {
    console.error(`[config] Env ${name} harus berupa angka`);
    process.exit(1);
  }
  return n;
}

module.exports = {
  BOT_TOKEN: required('BOT_TOKEN'),
  OWNER_ID: requiredNumber('OWNER_ID'),
  POOL_CHAT_ID: requiredNumber('POOL_CHAT_ID'),
  DATABASE_PATH: process.env.DATABASE_PATH || path.join(__dirname, 'data', 'bot-report.sqlite'),
};
