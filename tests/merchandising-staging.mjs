import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const host = 'https://dev.griipbuddy.com/operations-preview';
const work = '/desk/operations/work';
const task = process.env.GRIIP_MERCHANDISING_TASK;
const evidence = process.env.GRIIP_MERCHANDISING_EVIDENCE;
assert.match(task ?? '', /^[a-f0-9]{64}$/);
assert.ok(evidence);
const browser = await chromium.launch({ executablePath: process.env.GRIIP_BRAVE_EXECUTABLE, headless: true });

async function signIn(phone, role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const secret = process.env['GRIIP_OPS_STAGE_' + role + '_PASSWORD'];
  assert.match(secret ?? '', /^[a-f0-9]{48}$/);
  await page.goto(host + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(host + '/desk/operations');
  return page;
}

try {
  const owner = await signIn('01000000001', 'OWNER');
  await owner.goto(host + work);
  await owner.getByText('Background runner online').waitFor();
  await owner.getByRole('link', { name: 'Open Catalog listing proposal Staging Ceramic Mug' }).waitFor();
  const click = async (name) => {
    const [response] = await Promise.all([
      owner.waitForResponse(result => result.url().includes('/api/operations/work/pause') && result.request().method() === 'POST'),
      owner.getByRole('button', { name, exact: true }).click(),
    ]);
    assert.equal(response.status(), 200);
    return (await response.json()).data;
  };
  let paused = false;
  try {
    paused = (await click('Pause merchandising')).roles.includes('merchandising');
    assert.equal(paused, true);
  } finally {
    if (paused) assert.equal((await click('Resume merchandising')).roles.includes('merchandising'), false);
  }
  await owner.goto(host + work + '/' + task);
  await owner.getByRole('heading', { name: 'Catalog listing proposal' }).waitFor();
  const link = owner.getByRole('link', { name: 'Review catalog candidate' });
  assert.match(await link.getAttribute('href'), /staff\/catalog\/merchandising\/[a-f0-9]{64}\?market=bd/);
  await owner.getByText('An approved model connection is required to generate a catalog draft.').waitFor();
  await owner.evaluate(() => document.fonts.ready);
  await owner.screenshot({ path: join(evidence, 'operations-worker.png'), animations: 'disabled' });
  const support = await signIn('01000000012', 'SUPPORT');
  await support.goto(host + work + '/' + task);
  assert.equal(await support.getByRole('heading', { name: 'Catalog listing proposal' }).count(), 0);
  console.log('PASS owner task, catalog link, pause, resume and support exclusion in Brave.');
} finally {
  await browser.close();
}
