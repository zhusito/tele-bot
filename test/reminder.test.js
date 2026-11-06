const assert = require('node:assert/strict');
const test = require('node:test');
const {
  register,
  reminderMessages,
  nextScheduledTime,
} = require('../handlers/reminder');
const { POOL_CHAT_ID } = require('../config');

function getHandlers(storage) {
  const handlers = new Map();
  register({
    command: (name, callback) => handlers.set(name, callback),
    on: () => {},
  }, storage);
  return handlers;
}

function context({ text, status = 'administrator', userId = 123, sendMessage = async () => {} }) {
  const replies = [];
  return {
    ctx: {
      chat: { id: POOL_CHAT_ID, type: 'supergroup' },
      from: { id: userId, first_name: 'A & B', last_name: '<Admin>' },
      message: { text },
      telegram: {
        getChatMember: async () => ({ status }),
        sendMessage,
      },
      reply: (message) => replies.push(message),
    },
    replies,
  };
}

function createStorage(subscribers = []) {
  return {
    registered: [],
    removed: [],
    registerReminderSubscriber(chatId, user) {
      this.registered.push({ chatId, user });
    },
    unregisterReminderSubscriber(chatId, userId) {
      this.removed.push({ chatId, userId });
      return true;
    },
    getReminderSubscribers() {
      return subscribers;
    },
  };
}

test('a group member can opt in to reminder mentions', async () => {
  const storage = createStorage();
  const handlers = getHandlers(storage);
  const { ctx, replies } = context({ text: '/daftar' });
  await handlers.get('daftar')(ctx);

  assert.deepEqual(storage.registered, [{ chatId: POOL_CHAT_ID, user: ctx.from }]);
  assert.match(replies[0], /terdaftar/);
  assert.match(replies[0], /\/keluar/);
});

test('a group member can opt out of reminder mentions', async () => {
  const storage = createStorage();
  const handlers = getHandlers(storage);
  const { ctx, replies } = context({ text: '/keluar' });
  await handlers.get('keluar')(ctx);

  assert.deepEqual(storage.removed, [{ chatId: POOL_CHAT_ID, userId: 123 }]);
  assert.match(replies[0], /berhenti/);
});

test('group admin reminder mentions only registered users', async () => {
  const sent = [];
  const storage = createStorage([
    { user_id: '456', first_name: 'Member <One>', last_name: '' },
    { user_id: '789', first_name: 'Second', last_name: 'Member' },
  ]);
  const handlers = getHandlers(storage);
  const { ctx, replies } = context({
    text: '/reminder Rapat pukul 19.00',
    sendMessage: async (...args) => sent.push(args),
  });
  await handlers.get('reminder')(ctx);

  assert.deepEqual(replies, []);
  assert.equal(sent.length, 1);
  assert.match(sent[0][1], /Rapat pukul 19\.00/);
  assert.match(sent[0][1], /tg:\/\/user\?id=456/);
  assert.match(sent[0][1], /Member <One>/);
  assert.match(sent[0][1], /tg:\/\/user\?id=789/);
  assert.deepEqual(sent[0][2], { parse_mode: 'Markdown' });
});

test('unregistered members are not included in reminder mentions', async () => {
  const sent = [];
  const handlers = getHandlers(createStorage());
  const { ctx } = context({
    text: '/reminder Rapat pukul 19.00',
    sendMessage: async (...args) => sent.push(args),
  });
  await handlers.get('reminder')(ctx);
  assert.equal(sent.length, 1);
  assert.match(sent[0][1], /Belum ada anggota yang mendaftar/);
});

test('non-admin cannot post a reminder', async () => {
  const handlers = getHandlers(createStorage());
  const { ctx, replies } = context({ text: '/reminder Jangan kirim ini', status: 'member' });
  await handlers.get('reminder')(ctx);
  assert.deepEqual(replies, ['Hanya admin grup yang boleh mengirim reminder.']);
});

test('scheduled reminder time uses Jakarta time and selects the next valid date', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  assert.equal(nextScheduledTime(7, 19, 0, now), Date.parse('2026-11-07T12:00:00Z'));
  assert.equal(nextScheduledTime(6, 11, 0, now), Date.parse('2026-12-06T04:00:00Z'));
  assert.equal(nextScheduledTime(31, 19, 0, now), Date.parse('2026-12-31T12:00:00Z'));
  assert.equal(nextScheduledTime(32, 19, 0, now), undefined);
});

test('reminder text and names are safely escaped in mention messages', () => {
  const [message] = reminderMessages('Rapat *penting*', [
    { user_id: '456', first_name: 'Member [One]', last_name: '' },
  ]);
  assert.ok(message.includes('Rapat \\*penting\\*'));
  assert.ok(message.includes('Member \\[One\\]'));
  assert.match(message, /tg:\/\/user\?id=456/);
});
