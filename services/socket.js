const { Server } = require('socket.io');
const db = require('../db');
const config = require('../config');
const mediasoupService = require('./mediasoup');

function createSocketIO(server, origin) {
  const io = new Server(server, {
    cors: {
      origin: origin || '*',
      methods: ['GET', 'POST']
    }
  });

  const peers = new Map();
  const roomHosts = new Map();

  io.on('connection', (socket) => {
    socket.on('room:join', async ({ roomId, userId, username }, callback) => {
      try {
        socket.join(`room:${roomId}`);
        peers.set(socket.id, { roomId, userId, username });

        const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(roomId);
        if (!room) {
          return callback({ error: '房间不存在' });
        }

        const viewers = io.sockets.adapter.rooms.get(`room:${roomId}`);
        const count = viewers ? viewers.size : 0;

        db.prepare('UPDATE live_rooms SET viewer_count = ? WHERE id = ?').run(count, roomId);

        io.to(`room:${roomId}`).emit('viewer:update', { count });

        const hostSocketId = roomHosts.get(roomId);
        if (hostSocketId && hostSocketId !== socket.id) {
          const hostSocket = io.sockets.sockets.get(hostSocketId);
          if (hostSocket) {
            hostSocket.emit('viewer:joined', { viewerId: socket.id });
          }
        }

        if (callback) callback({ success: true, viewerCount: count });
      } catch (err) {
        console.error('Room join error:', err);
        if (callback) callback({ error: err.message });
      }
    });

    socket.on('room:leave', ({ roomId }) => {
      socket.leave(`room:${roomId}`);
      peers.delete(socket.id);

      const hostSocketId = roomHosts.get(roomId);
      if (hostSocketId) {
        const hostSocket = io.sockets.sockets.get(hostSocketId);
        if (hostSocket) {
          hostSocket.emit('viewer:left', { viewerId: socket.id });
        }
      }

      const viewers = io.sockets.adapter.rooms.get(`room:${roomId}`);
      const count = viewers ? viewers.size : 0;
      db.prepare('UPDATE live_rooms SET viewer_count = ? WHERE id = ?').run(count, roomId);
      io.to(`room:${roomId}`).emit('viewer:update', { count });
    });

    socket.on('chat:message', ({ roomId, content }, callback) => {
      const peer = peers.get(socket.id);
      if (!peer) {
        return callback?.({ error: '请先加入房间' });
      }
      if (!content || content.trim() === '') {
        return callback?.({ error: '消息不能为空' });
      }
      if (content.length > 500) {
        return callback?.({ error: '消息过长' });
      }

      const now = Date.now();
      db.prepare(`INSERT INTO chat_messages (room_id, user_id, username, content, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(roomId, peer.userId, peer.username, content.trim(), now);

      io.to(`room:${roomId}`).emit('chat:message', {
        id: now,
        roomId,
        userId: peer.userId,
        username: peer.username,
        content: content.trim(),
        createdAt: now
      });

      callback?.({ success: true });
    });

    socket.on('room:host-join', async ({ roomId, userId, username, streamKey }, callback) => {
      try {
        const room = db.prepare('SELECT * FROM live_rooms WHERE id = ?').get(roomId);
        if (!room) {
          return callback({ error: '房间不存在' });
        }
        if (room.stream_key !== streamKey) {
          return callback({ error: '无效的直播密钥' });
        }

        socket.join(`room:${roomId}`);
        roomHosts.set(roomId, socket.id);
        peers.set(socket.id, { roomId, userId, username });

        const router = mediasoupService.getRouter();

        const hostTransport = await mediasoupService.createWebRtcTransport(config.node_ip);

        hostTransport.on('connect', async ({ dtlsParameters }, callback) => {
          try {
            await hostTransport.connect({ dtlsParameters });
            callback();
          } catch (err) {
            callback(err);
          }
        });

        socket.data.roomId = roomId;
        socket.data.isHost = true;
        socket.data.hostTransport = hostTransport;
        socket.data.producers = new Map();

        callback({
          success: true,
          routerRtpCapabilities: router.rtpCapabilities,
          hostTransport: {
            id: hostTransport.id,
            iceParameters: hostTransport.iceParameters,
            iceCandidates: mediasoupService.tunnelizeCandidates(hostTransport.iceCandidates),
            dtlsParameters: hostTransport.dtlsParameters
          }
        });

        // 通知已在房间内的观众：主播已上线，可以开始拉流
        socket.to(`room:${roomId}`).emit('host:online', { hostId: socket.id });
      } catch (err) {
        console.error('Host join error:', err);
        callback({ error: err.message });
      }
    });

    socket.on('host:produce', async ({ kind, rtpParameters, appData }, callback) => {
      try {
        const hostTransport = socket.data.hostTransport;
        if (!hostTransport) {
          return callback({ error: '主播传输通道未就绪' });
        }

        const producer = await hostTransport.produce({
          kind,
          rtpParameters,
          appData: { ...appData, producerId: socket.id }
        });

        socket.data.producers.set(producer.id, producer);

        producer.on('pause', () => {
          socket.to(`room:${socket.data.roomId}`).emit('producer:paused', { producerId: producer.id });
        });
        producer.on('resume', () => {
          socket.to(`room:${socket.data.roomId}`).emit('producer:resumed', { producerId: producer.id });
        });
        producer.on('close', () => {
          socket.data.producers?.delete(producer.id);
          socket.to(`room:${socket.data.roomId}`).emit('producer:closed', { producerId: producer.id });
        });

        const roomId = socket.data.roomId;
        // 只通知观众（排除主播自己），观众收到后发起消费
        socket.to(`room:${roomId}`).emit('producer:new', {
          producerId: producer.id,
          kind: producer.kind,
          producerPaused: producer.paused
        });

        callback({ success: true, producerId: producer.id });
      } catch (err) {
        console.error('Produce error:', err);
        callback({ error: err.message });
      }
    });

    socket.on('host:close-producer', async ({ producerId }, callback) => {
      try {
        const producer = socket.data.producers?.get(producerId);
        if (producer) {
          producer.close();
          socket.data.producers.delete(producerId);
        }
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('viewer:join-room', async ({ roomId, userId, username }, callback) => {
      try {
        socket.join(`room:${roomId}`);

        const hostSocketId = roomHosts.get(roomId);
        if (!hostSocketId) {
          return callback({ error: '主播未在线' });
        }

        const hostSocket = io.sockets.sockets.get(hostSocketId);
        if (!hostSocket || !hostSocket.data.producers) {
          return callback({ error: '主播未就绪' });
        }

        socket.data.roomId = roomId;
        socket.data.isViewer = true;
        peers.set(socket.id, { roomId, userId, username });

        const members = io.sockets.adapter.rooms.get(`room:${roomId}`);
        const count = members ? members.size : 0;
        db.prepare('UPDATE live_rooms SET viewer_count = ? WHERE id = ?').run(count, roomId);
        io.to(`room:${roomId}`).emit('viewer:update', { count });

        const router = mediasoupService.getRouter();
        const viewerTransport = await mediasoupService.createWebRtcTransport(config.node_ip);

        viewerTransport.on('connect', async ({ dtlsParameters }, cb) => {
          try {
            await viewerTransport.connect({ dtlsParameters });
            cb();
          } catch (err) {
            cb(err);
          }
        });

        socket.data.roomId = roomId;
        socket.data.isViewer = true;
        socket.data.viewerTransport = viewerTransport;
        socket.data.consumers = new Map();

        // 主播可能尚未 produce（如刚开播），此时返回空列表，
        // 后续主播 produce 时会通过 producer:new 事件通知观众
        const producers = Array.from(hostSocket.data.producers.values());

        callback({
          success: true,
          routerRtpCapabilities: router.rtpCapabilities,
          viewerTransport: {
            id: viewerTransport.id,
            iceParameters: viewerTransport.iceParameters,
            iceCandidates: mediasoupService.tunnelizeCandidates(viewerTransport.iceCandidates),
            dtlsParameters: viewerTransport.dtlsParameters
          },
          producers: producers.map(p => ({
            producerId: p.id,
            kind: p.kind,
            rtpParameters: p.rtpParameters
          }))
        });
      } catch (err) {
        console.error('Viewer join error:', err);
        callback({ error: err.message });
      }
    });

    socket.on('viewer:consume', async ({ producerId, rtpCapabilities }, callback) => {
      try {
        const router = mediasoupService.getRouter();
        if (!router.canConsume({ producerId, rtpCapabilities })) {
          return callback({ error: '无法消费此生产者' });
        }

        const hostSocketId = roomHosts.get(socket.data.roomId);
        const hostSocket = io.sockets.sockets.get(hostSocketId);
        const producer = hostSocket?.data.producers?.get(producerId);

        if (!producer) {
          return callback({ error: '生产者不存在' });
        }

        const viewerTransport = socket.data.viewerTransport;
        const consumer = await viewerTransport.consume({
          producerId,
          rtpCapabilities,
          appData: { userId: socket.id }
        });

        socket.data.consumers.set(consumer.id, consumer);

        consumer.on('pause', () => {
          socket.emit('consumer:paused', { consumerId: consumer.id });
        });
        consumer.on('resume', () => {
          socket.emit('consumer:resumed', { consumerId: consumer.id });
        });
        consumer.on('close', () => {
          socket.data.consumers?.delete(consumer.id);
        });

        callback({
          success: true,
          consumer: {
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            paused: consumer.paused
          }
        });
      } catch (err) {
        console.error('Consume error:', err);
        callback({ error: err.message });
      }
    });

    socket.on('viewer:resume-consumer', async ({ consumerId }, callback) => {
      try {
        const consumer = socket.data.consumers?.get(consumerId);
        if (consumer) {
          await consumer.resume();
        }
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('transport:connect', async ({ transportId, dtlsParameters }, callback) => {
      try {
        let transport = null;
        if (socket.data.hostTransport && socket.data.hostTransport.id === transportId) {
          transport = socket.data.hostTransport;
        } else if (socket.data.viewerTransport && socket.data.viewerTransport.id === transportId) {
          transport = socket.data.viewerTransport;
        }
        if (!transport) {
          return callback({ error: '传输通道不存在' });
        }
        await transport.connect({ dtlsParameters });
        callback({ success: true });
      } catch (err) {
        callback({ error: err.message });
      }
    });

    socket.on('host:leave', async ({ roomId }, callback) => {
      try {
        roomHosts.delete(roomId);
        io.to(`room:${roomId}`).emit('host:left');
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      const peer = peers.get(socket.id);
      if (peer) {
        socket.to(`room:${peer.roomId}`).emit('viewer:leave', { userId: peer.userId });
      }

      if (socket.data.roomId && socket.data.isHost) {
        const rid = socket.data.roomId;
        const leftSocketId = socket.id;
        // 给主播 30 秒重连窗口（刷新页面/网络抖动），期间不结束直播；
        // 若主播已重新开播（roomHosts 被新连接替换）则不做任何处理
        setTimeout(() => {
          if (roomHosts.get(rid) === leftSocketId) {
            roomHosts.delete(rid);
            io.to(`room:${rid}`).emit('host:left');
            db.prepare("UPDATE live_rooms SET status = 'ended', ended_at = ? WHERE id = ?")
              .run(Date.now(), rid);
          }
        }, 30000);
      }

      if (socket.data.roomId) {
        io.to(`room:${socket.data.roomId}`).emit('peer:disconnected', { socketId: socket.id });

        const viewers = io.sockets.adapter.rooms.get(`room:${socket.data.roomId}`);
        const count = viewers ? viewers.size : 0;
        db.prepare('UPDATE live_rooms SET viewer_count = ? WHERE id = ?').run(count, socket.data.roomId);
        io.to(`room:${socket.data.roomId}`).emit('viewer:update', { count });
      }

      try {
        socket.data.hostTransport?.close();
        socket.data.viewerTransport?.close();
        socket.data.producers?.forEach(p => p.close());
        socket.data.consumers?.forEach(c => c.close());
      } catch (e) {}

      peers.delete(socket.id);
    });
  });

  return io;
}

module.exports = { createSocketIO };