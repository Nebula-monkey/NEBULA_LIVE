const mediasoup = require('mediasoup');
const config = require('../config');

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
  return await router.createWebRtcTransport({
    listenIps: [
      {
        ip: listenIp || config.node_ip,
        announcedIp
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 2500000
  });
}

module.exports = { init, getRouter, createWebRtcTransport, getWorker: () => worker };