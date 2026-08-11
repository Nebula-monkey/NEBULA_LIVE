const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

router.get('/', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status === 'live') {
    rows = db.prepare(`
      SELECT lr.*, u.username, u.nickname, u.avatar
      FROM live_rooms lr
      JOIN users u ON lr.user_id = u.id
      WHERE lr.status = 'live'
      ORDER BY lr.viewer_count DESC, lr.started_at DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT lr.*, u.username, u.nickname, u.avatar
      FROM live_rooms lr
      JOIN users u ON lr.user_id = u.id
      ORDER BY lr.created_at DESC
      LIMIT 50
    `).all();
  }
  res.json({ rooms: rows });
});

router.get('/:id', (req, res) => {
  const room = db.prepare(`
    SELECT lr.*, u.username, u.nickname, u.avatar
    FROM live_rooms lr
    JOIN users u ON lr.user_id = u.id
    WHERE lr.id = ?
  `).get(req.params.id);

  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const recentGifts = db.prepare(`
    SELECT gr.*, u.nickname as sender_nickname
    FROM gift_records gr
    JOIN users u ON gr.sender_id = u.id
    WHERE gr.room_id = ?
    ORDER BY gr.created_at DESC
    LIMIT 20
  `).all(req.params.id);

  res.json({ room, recentGifts });
});

router.post('/', authenticate, (req, res) => {
  const { title, description } = req.body;
  const userId = req.user.id;

  const totalRooms = db.prepare(
    'SELECT COUNT(*) as count FROM live_rooms WHERE user_id = ?'
  ).get(userId);

  if (totalRooms.count >= config.maxRoomsPerUser) {
    return res.status(400).json({ error: `最多只能创建${config.maxRoomsPerUser}个直播间` });
  }

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: '请输入直播标题' });
  }

  const streamKey = uuidv4();
  const timestamp = Date.now();

  const info = db.prepare(`
    INSERT INTO live_rooms (user_id, title, description, status, stream_key, viewer_count, created_at)
    VALUES (?, ?, ?, 'ended', ?, 0, ?)
  `).run(userId, title.trim(), description || '', streamKey, timestamp);

  const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(info.lastInsertRowid);
  res.json({ room });
});

router.post('/:id/start', authenticate, (req, res) => {
  const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (room.user_id !== req.user.id) {
    return res.status(403).json({ error: '只能开播自己的直播间' });
  }

  db.prepare("UPDATE live_rooms SET status = 'live', started_at = ? WHERE id = ?").run(Date.now(), room.id);
  const updated = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(room.id);

  const io = req.app.get('io');
  if (io) {
    io.emit('room:started', { roomId: room.id });
  }

  res.json({ room: updated });
});

router.post('/:id/end', authenticate, (req, res) => {
  const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (room.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权结束此直播间' });
  }

  db.prepare("UPDATE live_rooms SET status = 'ended', ended_at = ? WHERE id = ?").run(Date.now(), room.id);
  const updated = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(room.id);

  const io = req.app.get('io');
  if (io) {
    io.emit('room:ended', { roomId: room.id });
  }

  res.json({ room: updated });
});

router.delete('/:id', authenticate, (req, res) => {
  const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (room.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权删除此直播间' });
  }
  if (room.status === 'live') {
    return res.status(400).json({ error: '直播中无法删除，请先结束直播' });
  }

  db.prepare('DELETE FROM live_rooms WHERE id = ?').run(room.id);
  res.json({ message: '直播间已删除' });
});

router.put('/:id/viewer-count', (req, res) => {
  const { count } = req.body;
  if (typeof count !== 'number' || count < 0) {
    return res.status(400).json({ error: '无效的观看人数' });
  }
  db.prepare('UPDATE live_rooms SET viewer_count = ? WHERE id = ?').run(count, req.params.id);
  res.json({ count });
});

router.get('/mine/list', authenticate, (req, res) => {
  const rooms = db.prepare(`
    SELECT * FROM live_rooms WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ rooms });
});

router.get('/:id/stream-key', authenticate, (req, res) => {
  const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (room.user_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此直播密钥' });
  }
  res.json({ streamKey: room.stream_key });
});

module.exports = router;