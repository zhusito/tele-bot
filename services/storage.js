const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

class Storage {
  static async open(filename) {
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file),
    });
    return new Storage(filename, SQL);
  }

  constructor(filename, SQL) {
    this.filename = filename;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const database = fs.existsSync(filename)
      ? new SQL.Database(fs.readFileSync(filename))
      : new SQL.Database();
    this.db = database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cooldowns (
        kind TEXT NOT NULL,
        user_id TEXT NOT NULL,
        sent_at INTEGER NOT NULL,
        PRIMARY KEY (kind, user_id)
      );
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'received'
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reminder_subscribers (
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        PRIMARY KEY (chat_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS reminder_drafts (
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        prompt_message_id INTEGER NOT NULL,
        send_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS scheduled_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        text TEXT NOT NULL,
        send_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      );
    `);
    const reportColumns = new Set(
      this.db.exec('PRAGMA table_info(reports)')[0].values.map((column) => column[1])
    );
    if (!reportColumns.has('type_key')) {
      this.db.exec("ALTER TABLE reports ADD COLUMN type_key TEXT NOT NULL DEFAULT 'unknown'");
    }
    if (!reportColumns.has('created_at')) {
      this.db.exec('ALTER TABLE reports ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
    }
    this.db.run(
      `UPDATE scheduled_reminders SET status = 'pending'
       WHERE status = 'sending'`
    );
    this.persist();
  }

  persist() {
    const temporaryFile = `${this.filename}.tmp`;
    fs.writeFileSync(temporaryFile, Buffer.from(this.db.export()));
    fs.renameSync(temporaryFile, this.filename);
  }

  sessionQuery(key) {
    const statement = this.db.prepare('SELECT data FROM sessions WHERE key = ?');
    try {
      statement.bind([key]);
      if (!statement.step()) return undefined;
      const session = JSON.parse(statement.getAsObject().data);
      if (session.report?.sending) session.report.sending = false;
      return session;
    } finally {
      statement.free();
    }
  }

  get sessions() {
    return {
      get: (key) => this.sessionQuery(key),
      set: (key, value) => {
        this.db.run(
          'INSERT INTO sessions (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data',
          [key, JSON.stringify(value)]
        );
        this.persist();
      },
      delete: (key) => {
        this.db.run('DELETE FROM sessions WHERE key = ?', [key]);
        this.persist();
      },
    };
  }

  cooldownRemaining(kind, userId, cooldownMs, now = Date.now()) {
    const statement = this.db.prepare(
      'SELECT sent_at FROM cooldowns WHERE kind = ? AND user_id = ?'
    );
    try {
      statement.bind([kind, String(userId)]);
      if (!statement.step()) return 0;
      const { sent_at: sentAt } = statement.getAsObject();
      return Math.max(0, sentAt + cooldownMs - now);
    } finally {
      statement.free();
    }
  }

  recordSend(kind, userId, sentAt = Date.now()) {
    this.db.run(
      `INSERT INTO cooldowns (kind, user_id, sent_at) VALUES (?, ?, ?)
       ON CONFLICT(kind, user_id) DO UPDATE SET sent_at = excluded.sent_at`,
      [kind, String(userId), sentAt]
    );
    this.persist();
  }

  recordReport(id, userId, typeKey, createdAt = Date.now()) {
    this.db.run(
      'INSERT INTO reports (id, user_id, status, type_key, created_at) VALUES (?, ?, ?, ?, ?)',
      [
        id,
        String(userId),
        'received',
        typeKey,
        createdAt,
      ]
    );
    this.persist();
  }

  getReport(id) {
    const statement = this.db.prepare('SELECT id, user_id, status FROM reports WHERE id = ?');
    try {
      statement.bind([id]);
      return statement.step() ? statement.getAsObject() : undefined;
    } finally {
      statement.free();
    }
  }

  getReportForUser(id, userId) {
    const report = this.getReport(id);
    return report && report.user_id === String(userId) ? report : undefined;
  }

  updateReportStatus(id, status) {
    this.db.run('UPDATE reports SET status = ? WHERE id = ?', [status, id]);
    const updated = this.db.getRowsModified() > 0;
    if (updated) this.persist();
    return updated;
  }

  deleteReport(id) {
    this.db.run('DELETE FROM reports WHERE id = ?', [id]);
    this.persist();
  }

  monthlyReportCounts(start, end) {
    const statement = this.db.prepare(`
      SELECT status, type_key, COUNT(*) AS count
      FROM reports
      WHERE created_at >= ? AND created_at < ?
      GROUP BY status, type_key
    `);
    try {
      statement.bind([start, end]);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }

  getSetting(key) {
    const statement = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    try {
      statement.bind([key]);
      return statement.step() ? statement.getAsObject().value : undefined;
    } finally {
      statement.free();
    }
  }

  setSetting(key, value) {
    this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, String(value)]
    );
    this.persist();
  }

  registerReminderSubscriber(chatId, user) {
    this.db.run(
      `INSERT INTO reminder_subscribers (chat_id, user_id, first_name, last_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET
         first_name = excluded.first_name,
         last_name = excluded.last_name`,
      [
        String(chatId),
        String(user.id),
        user.first_name || '',
        user.last_name || '',
      ]
    );
    this.persist();
  }

  unregisterReminderSubscriber(chatId, userId) {
    this.db.run('DELETE FROM reminder_subscribers WHERE chat_id = ? AND user_id = ?', [
      String(chatId),
      String(userId),
    ]);
    const removed = this.db.getRowsModified() > 0;
    if (removed) this.persist();
    return removed;
  }

  getReminderSubscribers(chatId) {
    const statement = this.db.prepare(
      `SELECT user_id, first_name, last_name
       FROM reminder_subscribers
       WHERE chat_id = ?
       ORDER BY user_id`
    );
    try {
      statement.bind([String(chatId)]);
      const users = [];
      while (statement.step()) users.push(statement.getAsObject());
      return users;
    } finally {
      statement.free();
    }
  }

  setReminderDraft(chatId, userId, promptMessageId, sendAt) {
    this.db.run(
      `INSERT INTO reminder_drafts (chat_id, user_id, prompt_message_id, send_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET
         prompt_message_id = excluded.prompt_message_id,
         send_at = excluded.send_at`,
      [String(chatId), String(userId), promptMessageId, sendAt]
    );
    this.persist();
  }

  getReminderDraft(chatId, userId) {
    const statement = this.db.prepare(
      `SELECT prompt_message_id, send_at
       FROM reminder_drafts WHERE chat_id = ? AND user_id = ?`
    );
    try {
      statement.bind([String(chatId), String(userId)]);
      return statement.step() ? statement.getAsObject() : undefined;
    } finally {
      statement.free();
    }
  }

  deleteReminderDraft(chatId, userId) {
    this.db.run('DELETE FROM reminder_drafts WHERE chat_id = ? AND user_id = ?', [
      String(chatId),
      String(userId),
    ]);
    this.persist();
  }

  createScheduledReminder(chatId, userId, text, sendAt) {
    this.db.run(
      `INSERT INTO scheduled_reminders (chat_id, created_by, text, send_at, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [String(chatId), String(userId), text, sendAt]
    );
    const result = this.db.exec('SELECT last_insert_rowid() AS id');
    const id = result[0].values[0][0];
    this.persist();
    return id;
  }

  getScheduledReminders(chatId) {
    const statement = this.db.prepare(
      `SELECT id, created_by, text, send_at, status
       FROM scheduled_reminders
       WHERE chat_id = ? AND status IN ('pending', 'sending', 'failed')
       ORDER BY send_at`
    );
    try {
      statement.bind([String(chatId)]);
      const reminders = [];
      while (statement.step()) reminders.push(statement.getAsObject());
      return reminders;
    } finally {
      statement.free();
    }
  }

  deleteScheduledReminder(chatId, id) {
    this.db.run(
      `DELETE FROM scheduled_reminders
       WHERE chat_id = ? AND id = ? AND status IN ('pending', 'failed')`,
      [String(chatId), id]
    );
    const removed = this.db.getRowsModified() > 0;
    if (removed) this.persist();
    return removed;
  }

  getDueScheduledReminders(now = Date.now()) {
    const statement = this.db.prepare(
      `SELECT id, chat_id, text
       FROM scheduled_reminders
       WHERE status = 'pending' AND send_at <= ?
       ORDER BY send_at, id`
    );
    try {
      statement.bind([now]);
      const reminders = [];
      while (statement.step()) reminders.push(statement.getAsObject());
      return reminders;
    } finally {
      statement.free();
    }
  }

  claimScheduledReminder(id) {
    this.db.run(
      `UPDATE scheduled_reminders SET status = 'sending'
       WHERE id = ? AND status = 'pending'`,
      [id]
    );
    const claimed = this.db.getRowsModified() > 0;
    if (claimed) this.persist();
    return claimed;
  }

  finishScheduledReminder(id, status) {
    if (!['sent', 'failed'].includes(status)) throw new Error('Invalid reminder status');
    this.db.run('UPDATE scheduled_reminders SET status = ? WHERE id = ?', [status, id]);
    this.persist();
  }

  close() {
    this.db.close();
  }
}

module.exports = Storage;
