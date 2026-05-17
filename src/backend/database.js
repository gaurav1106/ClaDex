const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const initSqlJs = require('sql.js');

let SQL;

async function loadSql() {
  if (!SQL) SQL = await initSqlJs();
  return SQL;
}

class LocalDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    const SQLRuntime = await loadSql();
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    try {
      const bytes = await fs.readFile(this.dbPath);
      this.db = new SQLRuntime.Database(bytes);
    } catch {
      this.db = new SQLRuntime.Database();
    }
    this.migrate();
    await this.persist();
  }

  migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(chat_id) REFERENCES chats(id)
      );
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        folder_path TEXT NOT NULL DEFAULT '',
        files_json TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.tryRun('ALTER TABLE chats ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
    this.tryRun("ALTER TABLE projects ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''");
    this.tryRun("ALTER TABLE projects ADD COLUMN files_json TEXT NOT NULL DEFAULT '[]'");
    this.tryRun('ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  }

  tryRun(sql) {
    try {
      this.db.run(sql);
    } catch {
      // Column already exists in older local databases.
    }
  }

  async persist() {
    await fs.writeFile(this.dbPath, Buffer.from(this.db.export()));
  }

  all(sql, params = []) {
    const statement = this.db.prepare(sql, params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    return rows;
  }

  get(sql, params = []) {
    return this.all(sql, params)[0] || null;
  }

  async run(sql, params = []) {
    this.db.run(sql, params);
    await this.persist();
  }

  listChats() {
    return this.all('SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC');
  }

  getChat(chatId) {
    return {
      chat: this.get('SELECT * FROM chats WHERE id = ?', [chatId]),
      messages: this.all('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC', [chatId])
    };
  }

  async createChat(title = 'New chat') {
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.run('INSERT INTO chats (id, title, pinned, created_at, updated_at) VALUES (?, ?, 0, ?, ?)', [id, title, now, now]);
    return this.get('SELECT * FROM chats WHERE id = ?', [id]);
  }

  async addMessage(chatId, role, content) {
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.run('INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)', [id, chatId, role, content, now]);
    await this.run('UPDATE chats SET updated_at = ?, title = CASE WHEN title = ? THEN ? ELSE title END WHERE id = ?', [
      now,
      'New chat',
      String(content || 'New chat').slice(0, 48),
      chatId
    ]);
    return this.get('SELECT * FROM messages WHERE id = ?', [id]);
  }

  async updateMessage(messageId, content) {
    await this.run('UPDATE messages SET content = ? WHERE id = ?', [content, messageId]);
    return this.get('SELECT * FROM messages WHERE id = ?', [messageId]);
  }

  async deleteChat(chatId) {
    await this.run('DELETE FROM messages WHERE chat_id = ?', [chatId]);
    await this.run('DELETE FROM chats WHERE id = ?', [chatId]);
    return this.listChats();
  }

  async toggleChatPin(chatId) {
    await this.run('UPDATE chats SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END WHERE id = ?', [chatId]);
    return this.listChats();
  }

  async deleteMessagesAfter(chatId, messageId) {
    const message = this.get('SELECT * FROM messages WHERE id = ? AND chat_id = ?', [messageId, chatId]);
    if (!message) return [];
    await this.run('DELETE FROM messages WHERE chat_id = ? AND created_at > ?', [chatId, message.created_at]);
    return this.all('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC', [chatId]);
  }

  listProjects() {
    return this.all('SELECT * FROM projects ORDER BY pinned DESC, updated_at DESC');
  }

  async createProject(name, description = '', folderPath = '', files = []) {
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.run('INSERT INTO projects (id, name, description, folder_path, files_json, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)', [
      id,
      String(name || 'New project').trim() || 'New project',
      String(description || '').trim(),
      String(folderPath || ''),
      JSON.stringify(files || []),
      now,
      now
    ]);
    return this.get('SELECT * FROM projects WHERE id = ?', [id]);
  }

  async deleteProject(projectId) {
    await this.run('DELETE FROM projects WHERE id = ?', [projectId]);
    return this.listProjects();
  }

  async toggleProjectPin(projectId) {
    await this.run('UPDATE projects SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END WHERE id = ?', [projectId]);
    return this.listProjects();
  }
}

module.exports = {
  LocalDatabase
};
