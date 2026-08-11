const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
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
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只支持图片上传'));
  }
});

router.get('/recharge-qr', (req, res) => {
  const qr = db.prepare("SELECT * FROM qr_codes WHERE type = 'recharge' AND is_active = 1 ORDER BY created_at DESC LIMIT 1").get();
  res.json({ qr });
});

router.post('/recharge', authenticate, upload.single('proofImage'), (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: '请输入有效金额' });
  }

  if (!req.file) {
    return res.status(400).json({ error: '请上传支付凭证' });
  }

  const proofImage = `/uploads/${req.file.filename}`;
  const points = Math.floor(amount * config.pointsPerYuan);
  const now = Date.now();

  const info = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, points, status, admin_note, created_at, updated_at)
    VALUES (?, 'recharge', ?, ?, 'pending', ?, ?, ?)
  `).run(userId, amount, points, proofImage, now, now);

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid);
  res.json({
    transaction,
    message: '充值申请已提交，请等待管理员确认'
  });
});

// 固定提现金额档位（元）
const ALLOWED_WITHDRAW_AMOUNTS = [15, 30, 100, 200, 500, 1000];

router.post('/withdraw', authenticate, upload.single('qrCode'), (req, res) => {
  const { cashAmount } = req.body;
  const userId = req.user.id;

  const amount = parseFloat(cashAmount);
  if (!ALLOWED_WITHDRAW_AMOUNTS.includes(amount)) {
    return res.status(400).json({ error: `请选择正确的提现金额（仅支持 ${ALLOWED_WITHDRAW_AMOUNTS.join('、')} 元）` });
  }

  const points = Math.floor(amount * config.pointsPerYuan);
  const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
  if (user.points < points) {
    return res.status(400).json({ error: `积分不足：提现 ${amount} 元需要 ${points} 积分，您当前只有 ${user.points} 积分` });
  }

  const existingPending = db.prepare("SELECT COUNT(*) as count FROM withdrawals WHERE user_id = ? AND status = 'pending'").get(userId);
  if (existingPending.count > 0) {
    return res.status(400).json({ error: '您已有待处理的提现申请，请等待审核完成后再提交' });
  }

  if (!req.file) {
    return res.status(400).json({ error: '请上传您的收款码图片，否则无法打款' });
  }
  const qrCode = `/uploads/${req.file.filename}`;

  const now = Date.now();

  const info = db.prepare(`
    INSERT INTO withdrawals (user_id, points, cash_amount, qr_code, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(userId, points, amount, qrCode, now, now);

  db.prepare(`INSERT INTO transactions (user_id, type, amount, points, status, admin_note, created_at, updated_at)
    VALUES (?, 'withdrawal_pending', ?, ?, 'pending', '等待管理员处理', ?, ?)`)
    .run(userId, amount, -points, now, now);

  const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(info.lastInsertRowid);
  res.json({
    withdrawal,
    message: '提现申请已提交，请等待管理员处理'
  });
});

router.get('/my-withdrawals', authenticate, (req, res) => {
  const withdrawals = db.prepare(`
    SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ withdrawals });
});

router.get('/my-transactions', authenticate, (req, res) => {
  const { type } = req.query;
  let transactions;
  if (type) {
    transactions = db.prepare(`SELECT * FROM transactions WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 100`)
      .all(req.user.id, type);
  } else {
    transactions = db.prepare(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`)
      .all(req.user.id);
  }
  res.json({ transactions });
});

module.exports = router;