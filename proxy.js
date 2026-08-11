const http = require('http');

const PORT = 3002;
const API_TARGET = 'http://localhost:3001';
const NEXT_TARGET = 'http://localhost:3000';

const server = http.createServer((clientReq, clientRes) => {
  const isApi = clientReq.url.startsWith('/api/') || 
                clientReq.url.startsWith('/socket.io/') || 
                clientReq.url.startsWith('/uploads/');
  
  const target = isApi ? API_TARGET : NEXT_TARGET;
  const targetUrl = new URL(clientReq.url, target);

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: targetUrl.host }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    clientRes.statusCode = 502;
    clientRes.end('Bad Gateway');
  });

  clientReq.pipe(proxyReq);
});

server.on('upgrade', (clientReq, socket, head) => {
  const isApi = clientReq.url.startsWith('/socket.io/');
  
  const target = isApi ? API_TARGET : NEXT_TARGET;
  const targetUrl = new URL(clientReq.url, target);

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    headers: clientReq.headers
  };

  const proxyReq = http.request(options);
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    clientReq.emit('upgrade', proxyRes, socket, proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on('response', (proxyRes) => {
    socket.write('HTTP/1.1 ' + proxyRes.statusCode + ' ' + proxyRes.statusMessage + '\r\n');
    Object.entries(proxyRes.headers).forEach(([key, value]) => {
      socket.write(key + ': ' + value + '\r\n');
    });
    socket.write('\r\n');
    proxyRes.pipe(socket);
  });
  proxyReq.on('error', (err) => {
    console.error('WebSocket proxy error:', err.message);
    socket.destroy();
  });
  proxyReq.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('  直播平台代理已启动！');
  console.log('  公网入口: http://localhost:' + PORT);
  console.log('  前端端口: 3000');
  console.log('  API端口:  3001');
  console.log('========================================');
});