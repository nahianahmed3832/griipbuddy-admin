import { spawn } from 'node:child_process';
import { createGateway } from './gateway.mjs';

const appDir = process.env.GRIIP_ORIGINAL_ADMIN_APP || '/app';
const origin = new URL(process.env.GRIIP_ORIGINAL_ADMIN_ORIGIN ?? 'https://dev.griipbuddy.com');
const backend = new URL(process.env.GRIIP_ORIGINAL_ADMIN_BACKEND ?? 'http://api:38100');
const recovery = process.env.GRIIP_ORIGINAL_ADMIN_RECOVERY === '1';
const staffPhone = process.env.GRIIP_ADMIN_STAFF_PHONE;
const mediaDirectory = process.env.GRIIP_ORIGINAL_ADMIN_MEDIA ?? '/tmp/griipbuddy-admin-media';
const fraudOrigin = process.env.GRIIP_ORIGINAL_ADMIN_FRAUD_ORIGIN || undefined;

if (!['https://dev.griipbuddy.com/', 'http://127.0.0.1:4359/'].includes(origin.href) ||
    !['http://api:38100/', 'http://127.0.0.1:14801/', 'http://127.0.0.1:14803/', 'http://127.0.0.1:14819/'].includes(backend.href) ||
    (fraudOrigin && fraudOrigin !== 'http://fraud-provider:8080') ||
    (recovery && origin.protocol !== 'http:') ||
    (!recovery && !/^\d{8,16}$/.test(staffPhone ?? ''))) {
  throw new Error('The original admin requires an isolated dev origin and backend');
}

const app = new URL('http://127.0.0.1:4317');
const server = spawn(process.execPath, ['server.js'], { cwd: appDir, stdio: 'inherit',
  env: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: app.hostname, PORT: app.port } });
const gateway = createGateway({ origin, backend, app, recovery, staffPhone, mediaDirectory, fraudOrigin });
gateway.listen(origin.port === '4359' ? 4359 : 4318, process.env.GRIIP_ORIGINAL_ADMIN_LISTEN ?? '127.0.0.1');
gateway.on('error', () => server.kill());
server.on('exit', code => {
  gateway.close();
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  gateway.close();
  server.kill(signal);
});
