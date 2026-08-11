const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const next = require('next');

const config = require('./config');
const db = require('./db');
const mediasoupService = require('./services/mediasoup');
const { createSocketIO } = require('./services/socket');

async function start() {
  await db.init();
  await mediasoupService.init();

  const nextApp = next({
    dev: false,
    dir: path.join(__dirname, '..', 'live-stream-platform')
  });
  const nextHandler = nextApp.getRequestHandler();
  await nextApp.prepare();

  const app = express();
  const server = http.createServer(app);

  app.use(cors({
    origin: '*',
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadDir));

  const io = createSocketIO(server, '*');
  app.set('io', io);

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/rooms', require('./routes/rooms'));
  app.use('/api/gifts', require('./routes/gifts'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/finance', require('./routes/withdrawals'));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  app.use('/api/socket.io', (req, res) => {
    res.status(404).json({ error: 'Socket.IO is handled at server level' });
  });

  // API 全局错误处理：把未捕获的异常转成带详细原因的 JSON，避免前端只看到一个 500
  app.use('/api', (err, req, res, next) => {
    console.error(`[API 错误] ${req.method} ${req.originalUrl}:`, err);

    // multer 文件上传类错误：给出具体原因
    if (err && err.name === 'MulterError') {
      const messages = {
        LIMIT_FILE_SIZE: '上传的图片过大（上限 5MB），请压缩后重试',
        LIMIT_UNEXPECTED_FILE: '上传字段名不正确',
        LIMIT_FILE_COUNT: '上传文件数量超限'
      };
      return res.status(400).json({ error: messages[err.code] || `文件上传失败：${err.message}` });
    }
    if (err && /只支持图片上传/.test(err.message)) {
      return res.status(400).json({ error: '只支持图片格式（jpg/png/gif/webp），请重新选择文件' });
    }
    // SQLite 数据库错误：附上表/列名等具体原因
    if (err && /no such column|no such table|UNIQUE constraint|FOREIGN KEY/.test(err.message || '')) {
      return res.status(500).json({ error: `数据库操作失败：${err.message}`, detail: '服务器内部数据结构异常，请联系管理员' });
    }
    // JSON 解析失败（请求体格式错误）
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: '请求数据格式错误，请刷新页面后重试' });
    }

    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: err.message || '服务器内部错误',
      detail: status === 500 ? '服务器内部异常，错误已记录，请稍后重试' : undefined
    });
  });

  app.all('*', (req, res) => {
    return nextHandler(req, res);
  });

  const PORT = config.port;
  // 省略 host 参数时 Node 绑定 ::（双栈），同时接受 IPv4 和 IPv6 连接，
  // 这样家庭宽带公网 IPv6 用户可以直接访问
  server.listen(PORT, () => {
    console.log('========================================');
    console.log('  直播平台已启动！');
    console.log('  本地访问: http://localhost:' + PORT);
    console.log('  IPv6 访问: http://[你的公网IPv6地址]:' + PORT);
    console.log('  Next.js: 生产模式');
    console.log('  mediasoup Worker: 就绪');
    console.log('  数据库: 已初始化');
    console.log('========================================');
  });

  process.on('SIGTERM', () => {
    db.save();
    server.close(() => {
      nextApp.close().then(() => {
        console.log('服务器已关闭');
        process.exit(0);
      });
    });
  });

  process.on('SIGINT', () => {
    db.save();
    server.close(() => {
      nextApp.close().then(() => {
        console.log('服务器已关闭');
        process.exit(0);
      });
    });
  });
}

start().catch(err => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});