// Definisi jenis report. Ubah/tambah di sini kalau ada jenis baru.
// askName   : bot minta nama pelapor (dan namanya tampil di grup pool)
// askTarget : bot minta nama pihak yang dilaporkan
// askArea   : bot tanya bug ada di bot atau web organisasi
// anonymous : pelapor tampil "Anonim" di grup pool
const REPORT_TYPES = {
  member: {
    label: 'Report Anggota',
    askName: true, askTarget: true, askArea: false, anonymous: false,
    targetLabel: 'anggota',
  },
  admin: {
    label: 'Report Admin/Sentinel',
    askName: true, askTarget: true, askArea: false, anonymous: false,
    targetLabel: 'admin/sentinel',
  },
  member_anon: {
    label: 'Report Anggota (Anonim)',
    askName: false, askTarget: true, askArea: false, anonymous: true,
    targetLabel: 'anggota',
  },
  admin_anon: {
    label: 'Report Admin/Sentinel (Anonim)',
    askName: false, askTarget: true, askArea: false, anonymous: true,
    targetLabel: 'admin/sentinel',
  },
  bug: {
    label: 'Report Bug',
    askName: false, askTarget: false, askArea: true, anonymous: true,
    targetLabel: '',
  },
};

// Susunan tombol menu utama
const MENU_LAYOUT = [
  ['member', 'member_anon'],
  ['admin', 'admin_anon'],
  ['bug'],
];

const AREAS = {
  bot: 'Bot',
  web: 'Web Organisasi',
};

const LIMITS = {
  name: { min: 2, max: 50 },
  target: { min: 2, max: 80 },
  reason: { min: 20, max: 500 }, // dibatasi karena caption Telegram maks 1024 karakter
};

const COOLDOWN_MS = 60 * 1000; // jeda antar report per user

const TEXT = {
  welcome:
    '👋 Halo! Ini bot report organisasi.\n\n' +
    'Semua report <b>wajib</b> disertai alasan yang jelas dan bukti berupa <b>foto atau video</b>. ' +
    'Report tanpa bukti tidak akan diproses.\n\n' +
    'Pilih jenis report:',
  anonNotice:
    '🔒 <b>Mode anonim</b>\n' +
    'Identitasmu disembunyikan dari grup dan admin lain. ' +
    'tidak ada orang lain yang bisa melihat nama, username, atau ID Telegram-mu.\n\n',
  namedNotice:
    'ℹ️ Nama yang kamu ketik akan tampil di grup. Username dan data akun lainnya tidak ditampilkan.',
  noSession: 'Belum ada report yang sedang dibuat. Ketik /start untuk mulai.',
};

module.exports = { REPORT_TYPES, MENU_LAYOUT, AREAS, LIMITS, COOLDOWN_MS, TEXT };
