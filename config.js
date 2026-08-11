const config = {
  port: process.env.PORT || 3001,
  nextServerUrl: process.env.NEXT_SERVER_URL || 'http://localhost:3000',
  node_ip: process.env.NODE_IP || '127.0.0.1',
  mediasoup: {
    workerPoolSize: 2,
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    signalingPort: 3001
  },
  maxRoomsPerUser: 5,
  pointsPerYuan: 10,
  hostRevenueRate: 0.6,
  rateLimit: {
    registerPerIp: 3,
    registerWindowMs: 60000,
    loginAttempts: 5,
    loginWindowMs: 300000
  }
};

module.exports = config;