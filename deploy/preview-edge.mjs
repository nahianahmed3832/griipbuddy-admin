import http from 'node:http';

const port = [14819, 14829].find(port => String(port) === process.env.GRIIP_EDGE_PORT) ?? 14811;
const objectId = '[0-9a-f]{24}';
const safeReads = [
  /^\/(user|assigned-orders|category|sub-category|review|return-policy|stocks)$/,
  /^\/(category\/published\/all|brand\/(all|admin\/all)|faq\/admin\/all|country\/(all|admin\/all|currencies))$/,
  /^\/(product(\/top-sale|\/admin\/(all|variants))?|cms\/(site-content|admin\/top-bar-messages|hero-section|banners))$/,
  /^\/(analytics\/overview\/(sales|fulfilment|inventory|finance|actions|preorders)|analytics\/reports(\/stock-valuation(\/export)?)?)$/,
  /^\/(stocks\/(adjustment|admin\/transfer-history)|commerce\/market\/[A-Z]{2})$/,
  new RegExp('^/(order|country)(/' + objectId + ')?$'),
  new RegExp('^/(review|sub-category/by-category/published|product/(admin/products|variant/single)|stocks/variant|storefront/product|storefront-reviews/product)/' + objectId + '$'),
  new RegExp('^/(stocks/' + objectId + '/' + objectId + '|storefront-reviews/media/' + objectId + '/[0-3])$'),
  /^\/product\/slug\/(?:[\w.-]|%[0-9a-f]{2})+$/i,
];

http.createServer((request, response) => {
  if (request.headers.host !== '127.0.0.1:' + port || !/^\/api\/v1(?:\/|$)/.test(request.url ?? '')) {
    response.writeHead(404).end();
    return;
  }
  if (port === 14829) {
    const path = request.url.split('?')[0].slice('/api/v1'.length);
    if (!['GET', 'HEAD'].includes(request.method) || !safeReads.some(pattern => pattern.test(path))) {
      response.writeHead(404).end();
      return;
    }
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
