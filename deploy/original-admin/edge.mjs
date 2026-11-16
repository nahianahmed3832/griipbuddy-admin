import { connect, createServer } from 'node:net';

createServer(browser => {
  const app = connect(4318, 'original-admin');
  app.setTimeout(120_000, () => app.destroy());
  app.on('error', () => browser.destroy());
  browser.on('error', () => app.destroy());
  app.on('close', () => browser.destroy());
  browser.on('close', () => app.destroy());
  browser.pipe(app).pipe(browser);
}).listen(4359, '0.0.0.0');
