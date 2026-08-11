const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let SQL = null;
let db = null;
let saveTimer = null;
const DB_PATH = path.join(__dirname, 'data', 'platform.sqlite');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function init() {
  SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const data = fs.readFileSync(DB_PATH);
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
  }

  db.run(`PRAGMA foreign_keys = ON`);

  createTables();
  seedData();
  scheduleSave();
}

function scheduleSave() {
  if (saveTimer) clearInterval(saveTimer);
  saveTimer = setInterval(() => {
    save();
  }, 5000);
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      avatar TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      points INTEGER NOT NULL DEFAULT 0,
      frozen INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS live_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      cover_image TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ended',
      stream_key TEXT UNIQUE NOT NULL,
      viewer_count INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      ended_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      points_cost INTEGER NOT NULL,
      icon TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gift_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      gift_id INTEGER NOT NULL,
      gift_name TEXT NOT NULL,
      gift_icon TEXT NOT NULL,
      points INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      points INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      cash_amount INTEGER NOT NULL,
      qr_code TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      image_url TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}

function seedData() {
  const adminExists = prepare('SELECT id FROM users WHERE username = ?').get('管理员');
  if (!adminExists) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('win112233', 10);
    const now = Date.now();
    prepare('INSERT INTO users (username, password_hash, nickname, role, points, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run('管理员', hash, '系统管理员', 'admin', now, now);
  }

  const giftCount = prepare('SELECT COUNT(*) as count FROM gifts').get();
  if (giftCount.count === 0) {
    const now = Date.now();
    const gifts = [
      ['鲜花', 10, '🌸', '送一束鲜花'],
      ['棒棒糖', 20, '🍭', '送一个棒棒糖'],
      ['爱心', 50, '❤️', '表达爱意'],
      ['玫瑰', 99, '🌹', '送99朵玫瑰'],
      ['咖啡', 100, '☕', '请主播喝杯咖啡'],
      ['蛋糕', 200, '🎂', '生日蛋糕'],
      ['烟花', 520, '🎆', '绚烂烟花'],
      ['跑车', 1000, '🏎️', '送一辆跑车'],
      ['钻戒', 5200, '💍', '永恒钻戒'],
      ['皇冠', 10000, '👑', '尊贵皇冠']
    ];
    const insert = prepare('INSERT INTO gifts (name, points_cost, icon, description, created_at) VALUES (?, ?, ?, ?, ?)');
    gifts.forEach(g => {
      insert.run(...g, now);
    });
  }
}

function prepare(sql) {
  return {
    sql,
    get(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      let result = null;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }
      stmt.free();
      return result;
    },
    all(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
    run(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
      const rowId = prepare('SELECT last_insert_rowid() as id').get();
      return { lastInsertRowid: rowId.id, changes: 1 };
    }
  };
}

function transaction(fn) {
  db.run('BEGIN');
  try {
    fn();
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}

module.exports = {
  init,
  prepare,
  transaction,
  save
};