import http from 'node:http';

const port = process.env.GRIIP_EDGE_PORT === '14819' ? 14819 : 14811;

http.createServer((request, response) => {
  if (request.headers.host !== '127.0.0.1:' + port || !/^\/api\/v1(?:\/|$)/.test(request.url ?? '')) {
    response.writeHead(404).end();
    return;
  }
  const upstream = http.request({ hostname:'api', port:38100, path:request.url, method:request.method,
    headers:{ ...request.headers, host:'api:38100' } }, reply => {
    response.writeHead(reply.statusCode, reply.headers);
    reply.pipe(response);
  });
  upstream.setTimeout(25_000, () => upstream.destroy());
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
}).listen(port, '0.0.0.0');
