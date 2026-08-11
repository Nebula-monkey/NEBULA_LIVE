const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const config = require('../config');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片上传'));
    }
  }
});

router.get('/stats', authenticate, requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalRooms = db.prepare('SELECT COUNT(*) as count FROM live_rooms').get().count;
  const liveRooms = db.prepare("SELECT COUNT(*) as count FROM live_rooms WHERE status = 'live'").get().count;
  const totalGifts = db.prepare('SELECT COUNT(*) as count FROM gift_records').get().count;
  const totalPoints = db.prepare('SELECT SUM(points) as total FROM transactions WHERE type = "recharge" AND status = "completed"').get().total || 0;
  const pendingWithdrawals = db.prepare("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'").get().count;
  const pendingRecharges = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE type = 'recharge' AND status = 'pending'").get().count;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const todayRecharges = db.prepare('SELECT COALESCE(SUM(points), 0) as total FROM transactions WHERE type = "recharge" AND status = "completed" AND created_at >= ?').get(todayStart).total;
  const todayGifts = db.prepare('SELECT COUNT(*) as count FROM gift_records WHERE created_at >= ?').get(todayStart).count;

  res.json({
    totalUsers,
    totalRooms,
    liveRooms,
    totalGifts,
    totalPoints,
    pendingWithdrawals,
    pendingRecharges,
    todayRecharges,
    todayGifts
  });
});

router.get('/users', authenticate, requireAdmin, (req, res) => {
  const { page = 1, pageSize = 20, search, role } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let where = '1=1';
  const params = [];

  if (search) {
    where += ' AND (username LIKE ? OR nickname LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (role) {
    where += ' AND role = ?';
    params.push(role);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM users WHERE ${where}`).get(...params).count;
  const users = db.prepare(`
    SELECT id, username, nickname, role, points, frozen, avatar, created_at
    FROM users WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  res.json({ total, users, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.put('/users/:id/freeze', authenticate, requireAdmin, (req, res) => {
  const { frozen } = req.body;
  db.prepare('UPDATE users SET frozen = ? WHERE id = ?').run(frozen ? 1 : 0, req.params.id);
  res.json({ message: frozen ? '用户已冻结' : '用户已解冻' });
});

router.put('/users/:id/role', authenticate, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: '无效的角色' });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ message: '角色已更新' });
});

router.put('/users/:id/points', authenticate, requireAdmin, (req, res) => {
  const { points } = req.body;
  if (typeof points !== 'number') {
    return res.status(400).json({ error: '积分必须是数字' });
  }
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(points, req.params.id);
  const user = db.prepare('SELECT points FROM users WHERE id = ?').get(req.params.id);
  res.json({ points: user.points });
});

router.get('/transactions', authenticate, requireAdmin, (req, res) => {
  const { page = 1, pageSize = 20, type, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let where = '1=1';
  const params = [];

  if (type) { where += ' AND type = ?'; params.push(type); }
  if (status) { where += ' AND status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE ${where}`).get(...params).count;
  const transactions = db.prepare(`
    SELECT t.*, u.username, u.nickname
    FROM transactions t
    JOIN users u ON t.user_id = u.id
    WHERE ${where}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  res.json({ total, transactions, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.put('/transactions/:id/status', authenticate, requireAdmin, (req, res) => {
  const { status, adminNote } = req.body;
  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: '交易记录不存在' });
  }

  if (status === 'completed' && transaction.status !== 'completed') {
    if (transaction.type === 'recharge') {
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(transaction.points, transaction.user_id);
    }
  } else if (status === 'rejected' && transaction.status === 'completed') {
    if (transaction.type === 'recharge') {
      db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(transaction.points, transaction.user_id);
    }
  }

  db.prepare('UPDATE transactions SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?')
    .run(status, adminNote || '', Date.now(), req.params.id);

  res.json({ message: '状态已更新' });
});

// 驳回充值申请：不增加积分，仅把待处理申请置为 rejected 并记录驳回原因
router.put('/transactions/:id/reject', authenticate, requireAdmin, (req, res) => {
  const { adminNote } = req.body;
  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: '交易记录不存在' });
  }
  if (transaction.status !== 'pending') {
    return res.status(400).json({ error: '该申请已处理，无法驳回' });
  }

  db.prepare('UPDATE transactions SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?')
    .run('rejected', adminNote ? `驳回原因：${adminNote}` : '已驳回', Date.now(), req.params.id);

  res.json({ message: '申请已驳回' });
});

router.get('/withdrawals', authenticate, requireAdmin, (req, res) => {
  const { page = 1, pageSize = 20, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let where = '1=1';
  const params = [];
  if (status) { where += ' AND status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM withdrawals WHERE ${where}`).get(...params).count;
  const withdrawals = db.prepare(`
    SELECT w.*, u.username, u.nickname
    FROM withdrawals w
    JOIN users u ON w.user_id = u.id
    WHERE ${where}
    ORDER BY w.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  res.json({ total, withdrawals, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.put('/withdrawals/:id/approve', authenticate, requireAdmin, (req, res) => {
  const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
  if (!withdrawal) {
    return res.status(404).json({ error: '提现记录不存在' });
  }
  if (withdrawal.status !== 'pending') {
    return res.status(400).json({ error: '该提现申请已处理' });
  }

  const user = db.prepare('SELECT points FROM users WHERE id = ?').get(withdrawal.user_id);
  if (user.points < withdrawal.points) {
    return res.status(400).json({ error: '用户积分不足' });
  }

  const now = Date.now();
  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(withdrawal.points, withdrawal.user_id);
    db.prepare(`INSERT INTO transactions (user_id, type, amount, points, status, admin_note, created_at, updated_at)
      VALUES (?, 'withdrawal', ?, ?, 'completed', ?, ?, ?)`)
      .run(withdrawal.user_id, withdrawal.cash_amount, -withdrawal.points, '管理员已扫码转账', now, now);
    db.prepare('UPDATE withdrawals SET status = ?, updated_at = ? WHERE id = ?').run('completed', now, withdrawal.id);
  });
  transaction();

  res.json({ message: '提现已批准' });
});

router.put('/withdrawals/:id/reject', authenticate, requireAdmin, (req, res) => {
  const { adminNote } = req.body;
  const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
  if (!withdrawal) {
    return res.status(404).json({ error: '提现记录不存在' });
  }
  if (withdrawal.status !== 'pending') {
    return res.status(400).json({ error: '该提现申请已处理' });
  }

  const now = Date.now();
  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(withdrawal.points, withdrawal.user_id);
    db.prepare(`INSERT INTO transactions (user_id, type, amount, points, status, admin_note, created_at, updated_at)
      VALUES (?, 'withdrawal_reject', 0, ?, 'completed', ?, ?, ?)`)
      .run(withdrawal.user_id, withdrawal.points, adminNote || '提现被拒绝，积分已退回', now, now);
    db.prepare('UPDATE withdrawals SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?')
      .run('rejected', adminNote || '', now, withdrawal.id);
  });
  transaction();

  res.json({ message: '提现已拒绝，积分已退回' });
});

router.post('/qr-codes', authenticate, requireAdmin, upload.single('image'), (req, res) => {
  const { type, description } = req.body;
  if (!req.file) {
    return res.status(400).json({ error: '请上传图片' });
  }
  if (!['recharge', 'withdrawal'].includes(type)) {
    return res.status(400).json({ error: '无效的二维码类型' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  const now = Date.now();

  db.prepare('UPDATE qr_codes SET is_active = 0 WHERE type = ?').run(type);

  const info = db.prepare(`
    INSERT INTO qr_codes (type, image_url, description, is_active, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(type, imageUrl, description || '', now);

  const qr = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(info.lastInsertRowid);
  res.json({ qr });
});

router.get('/qr-codes', authenticate, requireAdmin, (req, res) => {
  const { type } = req.query;
  let qrs;
  if (type) {
    qrs = db.prepare('SELECT * FROM qr_codes WHERE type = ? ORDER BY created_at DESC').all(type);
  } else {
    qrs = db.prepare('SELECT * FROM qr_codes ORDER BY created_at DESC').all();
  }
  res.json({ qrs });
});

router.delete('/qr-codes/:id', authenticate, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM qr_codes WHERE id = ?').run(req.params.id);
  res.json({ message: '二维码已删除' });
});

router.post('/gifts', authenticate, requireAdmin, (req, res) => {
  const { name, pointsCost, icon, description } = req.body;
  if (!name || !pointsCost || !icon) {
    return res.status(400).json({ error: '礼物信息不完整' });
  }
  const now = Date.now();
  const info = db.prepare(`INSERT INTO gifts (name, points_cost, icon, description, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(name, pointsCost, icon, description || '', now);
  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(info.lastInsertRowid);
  res.json({ gift });
});

router.put('/gifts/:id', authenticate, requireAdmin, (req, res) => {
  const { name, pointsCost, icon, description } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (pointsCost !== undefined) { updates.push('points_cost = ?'); values.push(pointsCost); }
  if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (updates.length === 0) return res.json({ message: '没有需要更新的内容' });
  values.push(req.params.id);
  db.prepare(`UPDATE gifts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id);
  res.json({ gift });
});

router.delete('/gifts/:id', authenticate, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM gifts WHERE id = ?').run(req.params.id);
  res.json({ message: '礼物已删除' });
});

// 直播间列表（管理员查看，支持按状态筛选）
router.get('/rooms', authenticate, requireAdmin, (req, res) => {
  const { page = 1, pageSize = 20, status, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let where = '1=1';
  const params = [];
  if (status) { where += ' AND r.status = ?'; params.push(status); }
  if (search) {
    where += ' AND (r.title LIKE ? OR u.nickname LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM live_rooms r JOIN users u ON r.user_id = u.id WHERE ${where}`).get(...params).count;
  const rooms = db.prepare(`
    SELECT r.*, u.nickname as host_nickname, u.username as host_username
    FROM live_rooms r
    JOIN users u ON r.user_id = u.id
    WHERE ${where}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  res.json({ total, rooms, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 删除单个直播间（不允许删除正在直播的房间）
router.delete('/rooms/:id', authenticate, requireAdmin, (req, res) => {
  const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '直播间不存在' });
  }
  if (room.status === 'live') {
    return res.status(400).json({ error: '该直播间正在直播中，无法删除' });
  }
  db.prepare('DELETE FROM live_rooms WHERE id = ?').run(req.params.id);
  res.json({ message: '直播间已删除' });
});

// 批量清理旧直播间：删除 N 天前已结束的直播间记录
router.post('/rooms/cleanup', authenticate, requireAdmin, (req, res) => {
  const days = parseInt(req.body.days) || 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const info = db.prepare("DELETE FROM live_rooms WHERE status = 'ended' AND ended_at IS NOT NULL AND ended_at < ?").run(cutoff);
  res.json({ message: `已清理 ${info.changes} 个 ${days} 天前结束的直播间`, deleted: info.changes });
});

router.get('/gift-records', authenticate, requireAdmin, (req, res) => {
  const { page = 1, pageSize = 20, roomId } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = '1=1';
  const params = [];
  if (roomId) { where += ' AND gr.room_id = ?'; params.push(roomId); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM gift_records gr WHERE ${where}`).get(...params).count;
  const records = db.prepare(`
    SELECT gr.*, u1.nickname as sender_nickname, u2.nickname as receiver_nickname
    FROM gift_records gr
    JOIN users u1 ON gr.sender_id = u1.id
    JOIN users u2 ON gr.receiver_id = u2.id
    WHERE ${where}
    ORDER BY gr.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  res.json({ total, records, page: parseInt(page), pageSize: parseInt(pageSize) });
});

module.exports = router;