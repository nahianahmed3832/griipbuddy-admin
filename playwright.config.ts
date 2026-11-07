import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const key = randomBytes(32).toString('hex');
const base = 'http://127.0.0.1:4318';
const checkout = 'http://127.0.0.1:4326';
const fixture = 'http://127.0.0.1:4327';
const integratedStorefront = 'http://127.0.0.1:4328';
const storefrontDir = process.env.GRIIP_ADMIN_TEST_STOREFRONT_DIR ?? '../griipbuddy-web';
const env = { GRIIP_ADMIN_CHECKOUT_KEY:key, GRIIP_ADMIN_CHECKOUT_TARGET:'fixture', GRIIP_ADMIN_PUBLIC_ORIGIN:'' };
export default defineConfig({
  testDir:'./tests',
  timeout:90000,
  workers:2,
  reporter:'list',
  use:{baseURL:base,browserName:'chromium',trace:'retain-on-failure'},
  webServer:[
    {command:'npm run start',url:base,reuseExistingServer:false,env:{...env,GRIIP_ADMIN_TARGET:'fixture'}},
    {command:'npx next start --hostname 127.0.0.1 --port 4327',url:fixture,reuseExistingServer:false,
      env:{...env,GRIIP_ADMIN_TARGET:'fixture',GRIIP_ADMIN_FIXTURE_WRITES:'1',
        GRIIP_ADMIN_FIXTURE_PARITY_WRITES:process.env.GRIIP_ADMIN_TEST_FIXTURE_PARITY === '1' ? '1' : '',
        GRIIP_ADMIN_FIXTURE_WORKSPACE:process.env.GRIIP_ADMIN_TEST_WORKSPACE === '1' ? '1' : ''}},
    {command:'npm run start -- --port 4326',cwd:storefrontDir,url:checkout,reuseExistingServer:false,env:{
      GRIIPBUDDY_CHECKOUT:'synthetic',GRIIPBUDDY_FIXTURES:'1',GRIIPBUDDY_CHECKOUT_ADMIN_ENABLED:'1',GRIIPBUDDY_CHECKOUT_OPERATOR_SECRET:key,
      GRIIPBUDDY_STRIPE_SIM_SECRET:randomBytes(32).toString('hex'),GRIIPBUDDY_PAYPAL_SIM_SECRET:randomBytes(32).toString('hex'),
      GRIIPBUDDY_CHECKOUT_DIR:mkdtempSync(join(tmpdir(),'griipbuddy-step8-test-')), GRIIPBUDDY_CATALOG_API:'',
    }},
    ...(process.env.GRIIP_ADMIN_INTEGRATED === '1' ? [{
      command:'npm run start -- --port 4328', cwd:storefrontDir, url:integratedStorefront, reuseExistingServer:false,
      env:{ GRIIPBUDDY_CHECKOUT:'integrated', GRIIPBUDDY_CATALOG_API:'http://127.0.0.1:38100/api/v1',
        GRIIPBUDDY_CHECKOUT_DIR:mkdtempSync(join(tmpdir(),'griipbuddy-step9-integrated-test-')) },
    }] : []),
  ],
});
