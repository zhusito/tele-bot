const assert = require('node:assert/strict');
const test = require('node:test');
const { HELP_TEXT, register } = require('../handlers/help');
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
