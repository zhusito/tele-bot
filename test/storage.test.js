const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Storage = require('../services/storage');
const { formatMonthlyRecap } = require('../services/recap');

function temporaryDatabase(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-report-'));
  const filename = path.join(directory, 'bot.sqlite');
  return {
    filename,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

test('sessions survive reopening the SQLite database', async (t) => {
  const { filename, cleanup } = temporaryDatabase(t);
  let active;
  t.after(() => {
    if (active) active.close();
    cleanup();
  });

  active = await Storage.open(filename);
  active.sessions.set('123:123', {
    report: { typeKey: 'member', sending: true },
    suggestion: false,
  });
  active.close();

  active = await Storage.open(filename);
  assert.deepEqual(active.sessions.get('123:123'), {
    report: { typeKey: 'member', sending: false },
    suggestion: false,
  });
  active.sessions.delete('123:123');
  assert.equal(active.sessions.get('123:123'), undefined);
});

test('cooldowns survive reopening and expire after the configured duration', async (t) => {
  const { filename, cleanup } = temporaryDatabase(t);
  let active;
  t.after(() => {
    if (active) active.close();
    cleanup();
  });

  active = await Storage.open(filename);
  active.recordSend('report', 123, 1_000);
  active.close();

  active = await Storage.open(filename);
  assert.equal(active.cooldownRemaining('report', 123, 60_000, 30_000), 31_000);
  assert.equal(active.cooldownRemaining('report', 123, 60_000, 61_000), 0);
  assert.equal(active.cooldownRemaining('suggestion', 123, 60_000, 30_000), 0);
});

test('report status is persistent and visible only to the reporting user', async (t) => {
  const { filename, cleanup } = temporaryDatabase(t);
  let active;
  t.after(() => {
    if (active) active.close();
    cleanup();
  });

  active = await Storage.open(filename);
  active.recordReport('A1B2C3', 123, 'member', Date.parse('2026-05-10T12:00:00Z'));
  assert.equal(active.updateReportStatus('A1B2C3', 'resolved'), true);
  assert.equal(active.getReportForUser('A1B2C3', 456), undefined);
  active.close();

  active = await Storage.open(filename);
  assert.equal(active.getReportForUser('A1B2C3', 123).status, 'resolved');
  assert.equal(active.updateReportStatus('FFFFFF', 'resolved'), false);
});

test('monthly recap counts reports by status and type without exposing report details', async (t) => {
  const { filename, cleanup } = temporaryDatabase(t);
  const storage = await Storage.open(filename);
  t.after(() => {
    storage.close();
    cleanup();
  });

  storage.recordReport('A1B2C3', 123, 'member', Date.parse('2026-05-10T12:00:00Z'));
  storage.recordReport('A1B2C4', 456, 'bug', Date.parse('2026-05-20T12:00:00Z'));
  storage.recordReport('A1B2C5', 789, 'member', Date.parse('2026-06-01T00:00:00Z'));
  storage.updateReportStatus('A1B2C3', 'resolved');

  const recap = formatMonthlyRecap(storage, '2026-05');
  assert.match(recap, /Mei 2026/);
  assert.match(recap, /Total: 2/);
  assert.match(recap, /Selesai: 1/);
  assert.match(recap, /Report Anggota: 1/);
  assert.match(recap, /Report Bug: 1/);
  assert.doesNotMatch(recap, /A1B2C3|123|456/);
});

test('reminder registrations persist and can be removed', async (t) => {
  const { filename, cleanup } = temporaryDatabase(t);
  let storage = await Storage.open(filename);
  t.after(() => {
    if (storage) storage.close();
    cleanup();
  });

  storage.registerReminderSubscriber(-100123, {
    id: 456,
    first_name: 'Example',
    last_name: 'Member',
  });
  storage.close();
  storage = await Storage.open(filename);
  assert.deepEqual(storage.getReminderSubscribers(-100123), [
    { user_id: '456', first_name: 'Example', last_name: 'Member' },
  ]);
  assert.equal(storage.unregisterReminderSubscriber(-100123, 456), true);
  assert.deepEqual(storage.getReminderSubscribers(-100123), []);
});

test('scheduled reminders survive database reopen and can be claimed exactly once', async (t) => {
  const { filename, cleanup } = temporaryDatabase(t);
  let storage = await Storage.open(filename);
  t.after(() => {
    if (storage) storage.close();
    cleanup();
  });

  const sendAt = Date.parse('2026-12-10T12:00:00Z');
  const id = storage.createScheduledReminder(-100123, 456, 'Rapat pukul 19.00', sendAt);
  storage.close();
  storage = await Storage.open(filename);

  assert.equal(storage.getDueScheduledReminders(sendAt - 1).length, 0);
  assert.equal(storage.getDueScheduledReminders(sendAt)[0].id, id);
  assert.equal(storage.claimScheduledReminder(id), true);
  assert.equal(storage.claimScheduledReminder(id), false);
  assert.equal(storage.getScheduledReminders(-100123)[0].status, 'sending');
  storage.finishScheduledReminder(id, 'sent');
  assert.deepEqual(storage.getScheduledReminders(-100123), []);
});
