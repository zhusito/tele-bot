const { POOL_CHAT_ID } = require('../config');
const { Markup } = require('telegraf');

const TIME_ZONE = 'Asia/Jakarta';
const MAX_REMINDER_LENGTH = 1000;

function escapeMarkdown(text) {
  return String(text).replace(/([_*[\]`])/g, '\\$1');
}

function mention(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 64) || 'anggota';
  return `[${escapeMarkdown(name)}](tg://user?id=${user.user_id})`;
}

function reminderMessages(text, subscribers) {
  const header = `📢 Pengingat\n\n${escapeMarkdown(text)}\n\n`;
  const messages = [];
  let current = header;

  for (const subscriber of subscribers) {
    const tag = `${mention(subscriber)} `;
    if (current.length + tag.length > 3900 && current.trimEnd() !== header.trimEnd()) {
      messages.push(current.trimEnd());
      current = '📢 Pengingat untuk anggota terdaftar\n\n';
    }
    current += tag;
  }

  if (subscribers.length === 0) {
    current += 'Belum ada anggota yang mendaftar dengan /daftar.';
  }
  messages.push(current.trimEnd());
  return messages;
}

function nextScheduledTime(day, hour, minute, now = Date.now()) {
  if (
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }

  const jakartaNow = new Date(now + 7 * 60 * 60 * 1000);
  const currentYear = jakartaNow.getUTCFullYear();
  const currentMonth = jakartaNow.getUTCMonth();
  for (let offset = 0; offset <= 12; offset += 1) {
    const firstOfMonth = new Date(Date.UTC(currentYear, currentMonth + offset, 1));
    const year = firstOfMonth.getUTCFullYear();
    const month = firstOfMonth.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    if (day > daysInMonth) continue;

    const candidate = Date.UTC(year, month, day, hour - 7, minute);
    if (candidate > now) return candidate;
  }
  return undefined;
}

function formatScheduledTime(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: TIME_ZONE,
  }).format(new Date(timestamp));
}

async function isPoolAdmin(ctx) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return ['creator', 'administrator'].includes(member.status) ? true : false;
  } catch (err) {
    console.error('[reminder] gagal memeriksa admin grup:', err.message);
    return null;
  }
}

async function handleScheduleCommand(ctx, storage) {
  if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type)) {
    return ctx.reply('Perintah jadwal reminder hanya bisa dipakai di grup pool.');
  }
  if (ctx.chat.id !== POOL_CHAT_ID) {
    return ctx.reply('Jadwal reminder hanya bisa dibuat di grup pool yang terdaftar.');
  }

  const admin = await isPoolAdmin(ctx);
  if (admin !== true) {
    return ctx.reply(
      admin === null
        ? '❌ Tidak bisa memeriksa izin admin. Pastikan bot masih menjadi anggota grup.'
        : 'Hanya admin grup yang boleh menjadwalkan reminder.'
    );
  }

  const args = ctx.message.text.replace(/^\/reminder_jadwal(?:@\w+)?\s*/, '').trim();
  const match = /^(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(args);
  if (!match) {
    return ctx.reply(
      'Format: /reminder_jadwal DD HH:mm\nContoh: /reminder_jadwal 10 19:00 (WIB)'
    );
  }

  const sendAt = nextScheduledTime(Number(match[1]), Number(match[2]), Number(match[3]));
  if (!sendAt) {
    return ctx.reply('Tanggal atau waktu tidak valid.');
  }

  const prompt = await ctx.reply(
    `Balas pesan ini dengan isi reminder untuk ${formatScheduledTime(sendAt)} WIB (maks. ${MAX_REMINDER_LENGTH} karakter).`,
    Markup.forceReply()
  );
  storage.setReminderDraft(ctx.chat.id, ctx.from.id, prompt.message_id, sendAt);
}

function register(bot, storage) {
  bot.command('daftar', (ctx) => {
    if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type) || ctx.chat.id !== POOL_CHAT_ID) {
      return ctx.reply('Perintah /daftar hanya bisa dipakai di grup pool.');
    }
    storage.registerReminderSubscriber(ctx.chat.id, ctx.from);
    return ctx.reply(
      '✅ Kamu terdaftar untuk menerima mention pada reminder grup. Kirim /keluar kapan saja untuk berhenti.'
    );
  });

  bot.command('keluar', (ctx) => {
    if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type) || ctx.chat.id !== POOL_CHAT_ID) {
      return ctx.reply('Perintah /keluar hanya bisa dipakai di grup pool.');
    }
    const removed = storage.unregisterReminderSubscriber(ctx.chat.id, ctx.from.id);
    return ctx.reply(
      removed
        ? '✅ Kamu sudah berhenti menerima mention reminder.'
        : 'Kamu belum terdaftar untuk mention reminder.'
    );
  });

  bot.command('reminder', async (ctx) => {
    if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type)) {
      return ctx.reply('Perintah /reminder hanya bisa dipakai di grup pool.');
    }
    if (ctx.chat.id !== POOL_CHAT_ID) {
      return ctx.reply('Reminder hanya bisa dikirim ke grup pool yang terdaftar.');
    }

    const args = ctx.message.text.replace(/^\/reminder(?:@\w+)?\s*/, '').trim();
    if (/^\d{1,2}\s+\d{1,2}:\d{2}$/.test(args)) {
      return handleScheduleCommand(ctx, storage);
    }

    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
      if (!['creator', 'administrator'].includes(member.status)) {
        return ctx.reply('Hanya admin grup yang boleh mengirim reminder.');
      }
    } catch (err) {
      console.error('[reminder] gagal memeriksa admin grup:', err.message);
      return ctx.reply('❌ Tidak bisa memeriksa izin admin. Pastikan bot masih menjadi anggota grup.');
    }

    const text = args;
    if (!text || text.length > MAX_REMINDER_LENGTH) {
      return ctx.reply('Tulis isi reminder (1-1000 karakter). Contoh: /reminder Rapat mulai pukul 19.00');
    }

    const subscribers = storage.getReminderSubscribers(ctx.chat.id);
    for (const message of reminderMessages(text, subscribers)) {
      try {
        await ctx.telegram.sendMessage(ctx.chat.id, message, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('[reminder] gagal mengirim reminder langsung:', err.message);
        return ctx.reply('❌ Reminder gagal dikirim. Coba lagi nanti.');
      }
    }
    return undefined;
  });

  bot.command('reminder_jadwal', (ctx) => handleScheduleCommand(ctx, storage));

  bot.command('reminder_jadwal_list', async (ctx) => {
    if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type) || ctx.chat.id !== POOL_CHAT_ID) {
      return ctx.reply('Perintah ini hanya bisa dipakai di grup pool.');
    }
    const admin = await isPoolAdmin(ctx);
    if (admin !== true) return ctx.reply('Hanya admin grup yang boleh melihat jadwal reminder.');

    const reminders = storage.getScheduledReminders(ctx.chat.id);
    if (!reminders.length) return ctx.reply('Belum ada jadwal reminder aktif.');
    const lines = reminders.map((reminder) => {
      const state = reminder.status === 'failed' ? ' — gagal terkirim' : '';
      return `#${reminder.id} — ${formatScheduledTime(reminder.send_at)} WIB${state}\n${reminder.text}`;
    });
    return ctx.reply(lines.join('\n\n'));
  });

  bot.command('reminder_jadwal_hapus', async (ctx) => {
    if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type) || ctx.chat.id !== POOL_CHAT_ID) {
      return ctx.reply('Perintah ini hanya bisa dipakai di grup pool.');
    }
    const admin = await isPoolAdmin(ctx);
    if (admin !== true) return ctx.reply('Hanya admin grup yang boleh menghapus jadwal reminder.');

    const id = Number(ctx.message.text.replace(/^\/reminder_jadwal_hapus(?:@\w+)?\s*/, '').trim());
    if (!Number.isSafeInteger(id) || id < 1) {
      return ctx.reply('Format: /reminder_jadwal_hapus ID');
    }
    return ctx.reply(
      storage.deleteScheduledReminder(ctx.chat.id, id)
        ? `✅ Jadwal #${id} dihapus.`
        : 'Jadwal tidak ditemukan, sudah diproses, atau tidak dapat dihapus.'
    );
  });

  bot.command('reminder_jadwal_batal', (ctx) => {
    if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type) || ctx.chat.id !== POOL_CHAT_ID) {
      return ctx.reply('Perintah ini hanya bisa dipakai di grup pool.');
    }
    storage.deleteReminderDraft(ctx.chat.id, ctx.from.id);
    return ctx.reply('Pembuatan jadwal reminder dibatalkan.');
  });

  bot.on('text', async (ctx, next) => {
    if (
      !ctx.chat ||
      !['group', 'supergroup'].includes(ctx.chat.type) ||
      ctx.chat.id !== POOL_CHAT_ID ||
      ctx.message.text.startsWith('/') ||
      !ctx.message.reply_to_message
    ) {
      return next();
    }

    const draft = storage.getReminderDraft(ctx.chat.id, ctx.from.id);
    if (!draft || draft.prompt_message_id !== ctx.message.reply_to_message.message_id) {
      return next();
    }
    const admin = await isPoolAdmin(ctx);
    if (admin !== true) {
      storage.deleteReminderDraft(ctx.chat.id, ctx.from.id);
      return ctx.reply(
        admin === null
          ? '❌ Tidak bisa memeriksa izin admin. Pastikan bot masih menjadi anggota grup.'
          : 'Hanya admin grup yang boleh membuat jadwal reminder.'
      );
    }

    const text = ctx.message.text.trim();
    if (!text || text.length > MAX_REMINDER_LENGTH) {
      return ctx.reply(`Isi reminder harus 1-${MAX_REMINDER_LENGTH} karakter. Balas prompt bot lagi.`);
    }
    const id = storage.createScheduledReminder(ctx.chat.id, ctx.from.id, text, draft.send_at);
    storage.deleteReminderDraft(ctx.chat.id, ctx.from.id);
    return ctx.reply(
      `✅ Reminder dijadwalkan (#${id}) untuk ${formatScheduledTime(draft.send_at)} WIB.`
    );
  });
}

function startReminderScheduler(bot, storage) {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      for (const reminder of storage.getDueScheduledReminders()) {
        if (!storage.claimScheduledReminder(reminder.id)) continue;
        try {
          const subscribers = storage.getReminderSubscribers(reminder.chat_id);
          for (const message of reminderMessages(reminder.text, subscribers)) {
            await bot.telegram.sendMessage(reminder.chat_id, message, {
              parse_mode: 'Markdown',
            });
          }
          storage.finishScheduledReminder(reminder.id, 'sent');
          console.log(`[reminder] jadwal #${reminder.id} terkirim`);
        } catch (err) {
          storage.finishScheduledReminder(reminder.id, 'failed');
          console.error(`[reminder] gagal mengirim jadwal #${reminder.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[reminder] gagal memeriksa jadwal:', err.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(check, 15_000);
  timer.unref();
  check();
  return () => clearInterval(timer);
}

module.exports = {
  register,
  reminderMessages,
  nextScheduledTime,
  startReminderScheduler,
};
