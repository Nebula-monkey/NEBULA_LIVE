const mediasoup = require('mediasoup');
const config = require('../config');
const tcpmux = require('./tcpmux');

let worker;
let router;

async function init() {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: config.mediasoup.rtcMinPort,
    rtcMaxPort: config.mediasoup.rtcMaxPort,
  });

  worker.on('died', () => {
    console.error('mediasoup Worker died, exiting...');
    process.exit(1);
  });

  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000
        }
      }
    ]
  });

  console.log('mediasoup Worker and Router initialized');
}

function getRouter() {
  return router;
}

async function createWebRtcTransport(listenIp) {
  // announcedIp 必须是客户端可达的地址：
  // 公网部署时设置 MEDIASOUP_ANNOUNCED_IP/PUBLIC_IP 为服务器公网 IP，
  // 本地测试时保持 127.0.0.1 即可
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || process.env.PUBLIC_IP || config.node_ip;
  // 中国方向线路对 UDP 媒体流干扰严重（ICE 可连通但 DTLS 握手失败），
  // 设置 MEDIASOUP_FORCE_TCP=1 时只给客户端下发 TCP candidate（媒体经 443 隘道中转）。
  // 注意：UDP 监听必须保留——新版 mediasoup 纯 TCP transport 返回的 tuple 为空，
  // 库内部 parseTuple 未判空会直接抛错
  const forceTcp = process.env.MEDIASOUP_FORCE_TCP === '1';
  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: listenIp || config.node_ip,
        announcedIp
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferTcp: true,
    maxIncomingBitrate: 2500000
  });

  // 隘道模式：客户端网络只放行 443 端口时，由 nginx stream + tcpmux
  // 把 443 上的 WebRTC-over-TCP 流量分流到真实端口（candidate 端口在信令发送时改写）
  const tunnelPort = Number(process.env.MEDIASOUP_TUNNEL_PORT || 0);
  if (forceTcp && tunnelPort) {
    const ufrag = transport.iceParameters.usernameFragment;
    // 真实监听端口从 TCP candidate 中取（新版 mediasoup 的 tuple 在 ICE 选中前为空）
    const tcpCandidate = transport.iceCandidates.find(c => c.protocol === 'tcp') || transport.iceCandidates[0];
    const realPort = tcpCandidate?.port;
    if (ufrag && realPort) {
      tcpmux.register(ufrag, realPort);
      transport.on('close', () => tcpmux.unregister(ufrag));
    }
  }

  return transport;
}

// 隘道模式下只给客户端下发 TCP candidate，并把端口改写为隘道端口（443）
function tunnelizeCandidates(candidates) {
  const tunnelPort = Number(process.env.MEDIASOUP_TUNNEL_PORT || 0);
  if (process.env.MEDIASOUP_FORCE_TCP === '1' && tunnelPort) {
    return candidates
      .filter(c => c.protocol === 'tcp')
      .map(c => ({ ...c, port: tunnelPort }));
  }
  return candidates;
}

module.exports = { init, getRouter, createWebRtcTransport, tunnelizeCandidates, getWorker: () => worker };