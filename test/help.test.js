const assert = require('node:assert/strict');
const test = require('node:test');
const { HELP_TEXT, register } = require('../handlers/help');
const { register: registerStart } = require('../handlers/start');
const { POOL_CHAT_ID } = require('../config');

function getHelpHandler() {
  let handler;
  register({
    command: (name, callback) => {
      assert.equal(name, 'help');
      handler = callback;
    },
  });
  return handler;
}

test('/help displays the feature commands in group chats only', async () => {
  const handler = getHelpHandler();
  let reply;
  await handler({
    chat: { type: 'supergroup', id: POOL_CHAT_ID },
    reply: (message) => {
      reply = message;
    },
  });
  assert.equal(reply, HELP_TEXT);
  assert.match(reply, /\/status ID_REPORT/);
  assert.match(reply, /\/poll/);
  assert.match(reply, /polling anonim atau nama terlihat/);
});

test('/help does not respond in private chats', async () => {
  const handler = getHelpHandler();
  let replied = false;
  await handler({
    chat: { type: 'private' },
    reply: () => {
      replied = true;
    },
  });
  assert.equal(replied, false);
});

test('/help does not respond in other groups', async () => {
  const handler = getHelpHandler();
  let replied = false;
  await handler({
    chat: { type: 'supergroup', id: POOL_CHAT_ID + 1 },
    reply: () => {
      replied = true;
    },
  });
  assert.equal(replied, false);
});

function getStartHandler() {
  let handler;
  registerStart({
    start: (callback) => {
      handler = callback;
    },
  });
  return handler;
}

test('/start can be used in group chats too', async () => {
  const handler = getStartHandler();
  let reply;
  let options;

  await handler({
    chat: { type: 'supergroup', id: POOL_CHAT_ID },
    reply: (message, extra) => {
      reply = message;
      options = extra;
    },
  });

  assert.match(reply, /Pilih jenis report:/);
  assert.equal(options.parse_mode, 'HTML');
  assert.ok(options.reply_markup.inline_keyboard.length >= 2);
});
