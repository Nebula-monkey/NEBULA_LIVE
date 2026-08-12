// TCP 多路复用器：解决中国方向线路仅放行 443 端口的问题。
// 原理：nginx stream 在 443 上用 ssl_preread 区分 TLS（网站流量）与
// WebRTC-over-TCP 流量，后者被转发到本服务（127.0.0.1:4430）。
// 本服务解析首个 STUN 包中的 USERNAME 属性（含 mediasoup transport 的
// iceUsernameFragment），据此把连接管道转发到对应 transport 的真实 TCP 端口。
const net = require('net');

const LISTEN_PORT = Number(process.env.WEBRTC_MUX_PORT || 4430);

// ufrag -> transport 真实 TCP 端口
const ufragMap = new Map();

function register(ufrag, port) {
  if (ufrag && port) ufragMap.set(ufrag, port);
}

function unregister(ufrag) {
  if (ufrag) ufragMap.delete(ufrag);
}

// 从 RFC4571 帧 + STUN 报文中提取本地 ufrag
// 帧格式：2字节大端长度 + STUN 消息
// STUN 头：type(2) length(2) magic(4) txnid(12)，属性：type(2) length(2) value(填充4字节对齐)
// USERNAME 属性类型 = 0x0006，值格式 "接收方ufrag:发送方ufrag"
function extractUfrag(buf) {
  if (buf.length < 2) return null;
  const frameLen = buf.readUInt16BE(0);
  const stun = buf.slice(2);
  if (stun.length < 20 || stun.length < frameLen) return null;
  const msgType = stun.readUInt16BE(0);
  if (msgType !== 0x0001) return null; // 仅处理 Binding Request
  const attrLen = stun.readUInt16BE(2);
  let offset = 20;
  const end = Math.min(20 + attrLen, stun.length);
  while (offset + 4 <= end) {
    const attrType = stun.readUInt16BE(offset);
    const len = stun.readUInt16BE(offset + 2);
    if (attrType === 0x0006) {
      const username = stun.slice(offset + 4, offset + 4 + len).toString('utf8');
      return username.split(':')[0] || null;
    }
    offset += 4 + Math.ceil(len / 4) * 4;
  }
  return null;
}

function start() {
  if (process.env.MEDIASOUP_FORCE_TCP !== '1') return;

  const server = net.createServer((clientSocket) => {
    clientSocket.setTimeout(30000);
    let resolved = false;
    let buffered = Buffer.alloc(0);

    const fail = () => {
      if (!resolved) clientSocket.destroy();
    };

    clientSocket.on('timeout', fail);
    clientSocket.on('error', () => {});

    clientSocket.once('readable', function onData() {
      buffered = Buffer.concat([buffered, clientSocket.read() || Buffer.alloc(0)]);
      if (buffered.length < 4) return;

      const ufrag = extractUfrag(buffered);
      if (!ufrag) {
        if (buffered.length > 2048) return fail(); // 数据异常，放弃
        return; // 继续等更多数据
      }

      const port = ufragMap.get(ufrag);
      if (!port) return fail();

      resolved = true;
      clientSocket.removeListener('readable', onData);

      const upstream = net.connect(port, '127.0.0.1', () => {
        upstream.write(buffered);
        buffered = Buffer.alloc(0);
        clientSocket.pipe(upstream);
        upstream.pipe(clientSocket);
      });
      upstream.on('error', () => clientSocket.destroy());
      clientSocket.on('close', () => upstream.destroy());
    });
  });

  server.listen(LISTEN_PORT, '127.0.0.1', () => {
    console.log(`WebRTC TCP 多路复用器已启动: 127.0.0.1:${LISTEN_PORT}`);
  });
}

module.exports = { start, register, unregister };
