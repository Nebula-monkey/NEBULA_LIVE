const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authenticate, requireAdmin } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

const loginAttempts = new Map();
const registerAttempts = new Map();

router.post('/register', (req, res) => {
  const { username, password, nickname } = req.body;
  const ip = req.ip;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度应在3-20个字符之间' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  const regKey = `${ip}:${username}`;
  const regAttempts = registerAttempts.get(regKey) || [];
  const now = Date.now();
  const recentAttempts = regAttempts.filter(t => now - t < config.rateLimit.registerWindowMs);
  if (recentAttempts.length >= config.rateLimit.registerPerIp) {
    return res.status(429).json({ error: '注册尝试过于频繁，请稍后再试' });
  }
  registerAttempts.set(regKey, [...recentAttempts, now]);

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: '用户名已存在' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const timestamp = Date.now();

  const info = db.prepare(
    'INSERT INTO users (username, password_hash, nickname, role, points, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  ).run(username, hash, nickname || username, 'user', timestamp, timestamp);

  const user = db.prepare('SELECT id, username, nickname, role, points, avatar FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken({ id: user.id, username: user.username, role: user.role });

  res.json({ user, token });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const loginKey = `${ip}:${username}`;
  const attempts = loginAttempts.get(loginKey) || [];
  const now = Date.now();
  const recentAttempts = attempts.filter(t => now - t < config.rateLimit.loginWindowMs);
  if (recentAttempts.length >= config.rateLimit.loginAttempts) {
    return res.status(429).json({ error: '登录尝试过于频繁，请30分钟后再试' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    loginAttempts.set(loginKey, [...recentAttempts, now]);
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (user.frozen) {
    return res.status(403).json({ error: '账号已被冻结，请联系管理员' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    loginAttempts.set(loginKey, [...recentAttempts, now]);
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  loginAttempts.set(loginKey, recentAttempts.filter(t => now - t < config.rateLimit.loginWindowMs));

  const token = signToken({ id: user.id, username: user.username, role: user.role });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      points: user.points,
      avatar: user.avatar
    },
    token
  });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, nickname, role, points, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user });
});

router.put('/profile', authenticate, (req, res) => {
  const { nickname, avatar } = req.body;
  const updates = [];
  const values = [];

  if (nickname !== undefined) {
    updates.push('nickname = ?');
    values.push(nickname);
  }
  if (avatar !== undefined) {
    updates.push('avatar = ?');
    values.push(avatar);
  }

  if (updates.length === 0) {
    return res.json({ message: '没有需要更新的内容' });
  }

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(req.user.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const user = db.prepare('SELECT id, username, nickname, role, points, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

module.exports = router;