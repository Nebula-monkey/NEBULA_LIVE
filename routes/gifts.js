const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

// 各礼物的四字诗意描述（评论区系统消息用）
const GIFT_POEMS = {
  '鲜花': '繁花似锦',
  '棒棒糖': '甜入心扉',
  '爱心': '心心相印',
  '玫瑰': '情定今生',
  '咖啡': '暖意相伴',
  '蛋糕': '甜蜜时光',
  '烟花': '绚烂星河',
  '跑车': '风驰电掣',
  '钻戒': '霜火长明',
  '皇冠': '此身为炬'
};

router.get('/', (req, res) => {
  const gifts = db.prepare('SELECT * FROM gifts ORDER BY points_cost ASC').all();
  res.json({ gifts });
});

router.post('/send', authenticate, (req, res) => {
  const { roomId, receiverId, giftId } = req.body;
  const senderId = req.user.id;

  if (!roomId || !receiverId || !giftId) {
    return res.status(400).json({ error: '参数不完整' });
  }

  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(giftId);
  if (!gift) {
    return res.status(404).json({ error: '礼物不存在' });
  }

  const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(roomId);
  if (!room) {
    return res.status(404).json({ error: '直播间不存在' });
  }

  const receiver = db.prepare('SELECT * FROM users WHERE id = ?').get(receiverId);
  if (!receiver) {
    return res.status(404).json({ error: '接收者不存在' });
  }

  if (senderId === receiverId) {
    return res.status(400).json({ error: '不能给自己送礼' });
  }

  const sender = db.prepare('SELECT * FROM users WHERE id = ?').get(senderId);
  if (sender.points < gift.points_cost) {
    return res.status(400).json({ error: '积分不足，请先充值' });
  }

  const now = Date.now();
  const hostEarnings = Math.floor(gift.points_cost * config.hostRevenueRate);

  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(gift.points_cost, senderId);
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(hostEarnings, receiverId);

    db.prepare(`
      INSERT INTO gift_records (room_id, sender_id, receiver_id, gift_id, gift_name, gift_icon, points, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(roomId, senderId, receiverId, giftId, gift.name, gift.icon, gift.points_cost, now);

    db.prepare(`
      INSERT INTO transactions (user_id, type, amount, points, status, created_at, updated_at)
      VALUES (?, 'gift_spend', 0, ?, 'completed', ?, ?)
    `).run(senderId, -gift.points_cost, now, now);

    db.prepare(`
      INSERT INTO transactions (user_id, type, amount, points, status, created_at, updated_at)
      VALUES (?, 'gift_earning', 0, ?, 'completed', ?, ?)
    `).run(receiverId, hostEarnings, now, now);
  });

  transaction();

  // 扣款已提交，以下环节做容错：即使查询/广播出错也返回成功，
  // 避免出现"已扣分但前端报 500、看不到特效"的情况
  let senderPoints = null;
  let receiverPoints = null;
  try {
    senderPoints = db.prepare('SELECT points FROM users WHERE id = ?').get(senderId)?.points ?? null;
    receiverPoints = db.prepare('SELECT points FROM users WHERE id = ?').get(receiverId)?.points ?? null;
  } catch (e) {
    console.error('Gift points query error:', e);
  }

  try {
    const io = req.app.get('io');
    if (io) {
      io.to(`room:${roomId}`).emit('gift:sent', {
        giftId,
        giftName: gift.name,
        giftIcon: gift.icon,
        points: gift.points_cost,
        senderId,
        senderNickname: sender.nickname,
        receiverId,
        hostEarnings,
        timestamp: now
      });
      // 同步在评论区插入一条系统消息
      const poem = GIFT_POEMS[gift.name] || '情意满满';
      io.to(`room:${roomId}`).emit('chat:message', {
        id: now + 1,
        roomId,
        userId: 0,
        username: '系统',
        content: `${sender.nickname} 送出了 ${gift.name}，${poem}`,
        createdAt: now
      });
    }
  } catch (e) {
    console.error('Gift broadcast error:', e);
  }

  res.json({
    success: true,
    senderPoints,
    receiverPoints,
    gift: { name: gift.name, icon: gift.icon, points: gift.points_cost },
    hostEarnings
  });
});

router.get('/records', authenticate, (req, res) => {
  const { type, limit } = req.query;
  const userId = req.user.id;
  let records;

  if (type === 'sent') {
    records = db.prepare(`
      SELECT gr.*, u.nickname as receiver_nickname, lr.title as room_title
      FROM gift_records gr
      JOIN users u ON gr.receiver_id = u.id
      JOIN live_rooms lr ON gr.room_id = lr.id
      WHERE gr.sender_id = ?
      ORDER BY gr.created_at DESC
      LIMIT ?
    `).all(userId, parseInt(limit) || 50);
  } else if (type === 'received') {
    records = db.prepare(`
      SELECT gr.*, u.nickname as sender_nickname, lr.title as room_title
      FROM gift_records gr
      JOIN users u ON gr.sender_id = u.id
      JOIN live_rooms lr ON gr.room_id = lr.id
      WHERE gr.receiver_id = ?
      ORDER BY gr.created_at DESC
      LIMIT ?
    `).all(userId, parseInt(limit) || 50);
  } else {
    records = db.prepare(`
      SELECT gr.*, u1.nickname as sender_nickname, u2.nickname as receiver_nickname, lr.title as room_title
      FROM gift_records gr
      JOIN users u1 ON gr.sender_id = u1.id
      JOIN users u2 ON gr.receiver_id = u2.id
      JOIN live_rooms lr ON gr.room_id = lr.id
      WHERE gr.sender_id = ? OR gr.receiver_id = ?
      ORDER BY gr.created_at DESC
      LIMIT ?
    `).all(userId, userId, parseInt(limit) || 50);
  }

  res.json({ records });
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const { name, pointsCost, icon, description } = req.body;
  if (!name || !pointsCost || !icon) {
    return res.status(400).json({ error: '礼物信息不完整' });
  }

  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO gifts (name, points_cost, icon, description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, pointsCost, icon, description || '', now);

  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(info.lastInsertRowid);
  res.json({ gift });
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { name, pointsCost, icon, description } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (pointsCost !== undefined) { updates.push('points_cost = ?'); values.push(pointsCost); }
  if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }

  if (updates.length === 0) {
    return res.json({ message: '没有需要更新的内容' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE gifts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id);
  res.json({ gift });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id);
  if (!gift) {
    return res.status(404).json({ error: '礼物不存在' });
  }
  db.prepare('DELETE FROM gifts WHERE id = ?').run(req.params.id);
  res.json({ message: '礼物已删除' });
});

module.exports = router;