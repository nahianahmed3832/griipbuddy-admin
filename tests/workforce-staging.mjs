// Uses the staging backend and synthetic cases. No model is connected.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = 'https://dev.griipbuddy.com';
const root = origin + '/operations-preview';
const work = '/desk/operations/work';
const evidence = process.env.GRIIP_OPERATIONS_EVIDENCE;
const source = JSON.parse(await readFile(join(evidence, 'staging-source-events.json'), 'utf8'));
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.GRIIP_BRAVE_EXECUTABLE, headless: true });
const navigate = (page, path) => page.goto(root + path, { waitUntil: 'networkidle' });
const save = (page, name) => page.screenshot({ path: join(evidence, name + '.png'), fullPage: true, animations: 'disabled' });
const response = page => page.waitForResponse(res => res.request().method() === 'POST' && res.url().includes('/api/operations/work/'));
const expectPost = async (page, button) => {
  const [result] = await Promise.all([response(page), button.click()]);
  const body = await result.json();
  assert.equal(result.status(), 200, body.message);
  return body.data;
};
const post = (page, suffix, body) => page.request.post(root + '/api/operations/work/' + suffix + '?region=BD', {
  data: body, headers: { Origin: origin, 'Content-Type': 'application/json' },
});
async function login(role, phone) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const secret = process.env['GRIIP_OPS_STAGE_' + role.toUpperCase() + '_PASSWORD'];
  assert.match(secret ?? '', /^[a-f0-9]{48}$/);
  await navigate(page, '/sign-in');
  await page.getByLabel('Staff email or phone number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(root + '/desk/operations');
  return page;
}

try {
  const owner = await login('owner', '01000000001');
  const support = await login('support', '01000000012');
  const packer = await login('pack', '01000000011');
  await packer.getByRole('heading', { name: 'Packing queue', exact: true }).waitFor();
  assert.equal(await packer.getByRole('link', { name: 'AI work', exact: true }).count(), 0);
  assert.equal((await post(packer, 'queue', { issue: source.source })).status(), 403);
  assert.equal((await owner.request.post(root + '/api/operations/work/pause', { data: {}, headers: { Origin: 'https://example.invalid' } })).status(), 403);
  await navigate(owner, work);
  await owner.getByRole('heading', { name: 'AI work', exact: true }).waitFor();
  await owner.getByText('Background runner online', { exact: true }).waitFor();
  await owner.getByText(/Model generation unavailable/).waitFor();
  await save(owner, 'work-queue');
  console.log('PASS authenticated owner work queue, active background runner, and packing permissions');

  const inventoryLink = owner.getByRole('link', { name: 'Open Restock review ' + source.calculatedSku });
  const href = await inventoryLink.getAttribute('href');
  assert.ok(href);
  await owner.goto(new URL(href, origin).toString(), { waitUntil: 'networkidle' });
  await owner.getByText('Source facts current', { exact: true }).waitFor();
  const facts = owner.locator('.ops-two').first().locator('.ops-work-facts').filter({ hasText: 'Quantity for review' });
  for (const [caption, value] of [['Sellable units', '3'], ['Reserved units', '3'], ['Verified incoming', '6'], ['Approved target', '15'], ['Quantity for review', '6']]) {
    assert.equal((await facts.locator('div').filter({ hasText: caption }).locator('dd').innerText()).trim(), value);
  }
  if (await owner.getByRole('option', { name: 'Approve result' }).count()) {
    await save(owner, 'restock-review');
    await owner.getByLabel('Review action').selectOption('accept');
    await owner.getByLabel('Decision reason').fill('Checked the staged target, stock ledger and incoming purchase.');
    const approved = await expectPost(owner, owner.getByRole('button', { name: 'Save review action' }));
    assert.equal(approved.reviewState, 'approved');
    assert.equal(approved.outcome, undefined);
  }
  await owner.getByText('No action recorded', { exact: true }).waitFor();
  await owner.getByRole('heading', { name: 'Review history', exact: true }).waitFor();
  await save(owner, 'restock-approved');
  await support.goto(new URL(href, origin).toString(), { waitUntil: 'networkidle' });
  assert.equal(await support.getByRole('heading', { name: 'Restock review', exact: true }).count(), 0);
  await navigate(owner, work);
  const missing = owner.getByRole('link', { name: 'Open Restock review ' + source.incompleteSku });
  const missingHref = await missing.getAttribute('href');
  assert.ok(missingHref);
  await owner.goto(new URL(missingHref, origin).toString(), { waitUntil: 'networkidle' });
  await owner.getByRole('heading', { name: 'Restock review', exact: true }).waitFor();
  await owner.getByLabel('Review action').waitFor();
  if (await owner.getByRole('option', { name: 'Requeue work' }).count()) {
    await owner.getByLabel('Review action').selectOption('retry');
    await owner.getByLabel('Decision reason').fill('The synthetic SKU record is now available for the missing-input review.');
    await expectPost(owner, owner.getByRole('button', { name: 'Save review action' }));
  }
  await owner.getByText('Approved reorder target is missing or expired.', { exact: true }).waitFor();
  const unknown = owner.locator('.ops-two').first().locator('.ops-work-facts').filter({ hasText: 'Quantity for review' });
  assert.equal((await unknown.locator('div').filter({ hasText: 'Quantity for review' }).locator('dd').innerText()).trim(), 'Unavailable');
  await owner.getByRole('option', { name: 'Approve result' }).waitFor({ state: 'attached' });
  await save(owner, 'restock-missing-inputs');
  console.log('PASS both restock packets, owner approval, no business action, and support cannot open inventory work');

  await navigate(support, work + '/' + source.support);
  await support.getByRole('heading', { name: 'Support reply draft', exact: true }).waitFor();
  await support.getByText('An approved model connection is required to generate a response draft.', { exact: true }).waitFor();
  const one = await post(support, 'queue', { issue: source.source });
  const two = await post(support, 'queue', { issue: source.source });
  assert.equal(one.status(), 200);
  assert.equal(two.status(), 200);
  assert.equal((await one.json()).data._id, source.support);
  assert.equal((await two.json()).data._id, source.support);
  assert.equal((await post(support, 'pause', { revision: 1, role: 'all', paused: true })).status(), 403);
  await save(support, 'support-provider-blocked');
  console.log('PASS support task replay, recorded blocked attempt, no live or simulated draft in staged UI');

  await navigate(owner, work);
  const paused = await expectPost(owner, owner.getByRole('button', { name: 'Pause all work' }));
  assert.equal(paused.paused, true);
  await owner.getByRole('button', { name: 'Resume all work' }).waitFor();
  await save(owner, 'worker-controls');
  const resumed = await expectPost(owner, owner.getByRole('button', { name: 'Resume all work' }));
  assert.equal(resumed.paused, false);
  const role = owner.getByRole('button', { name: 'Pause inventory' });
  const rolePaused = await expectPost(owner, role);
  assert.equal(rolePaused.roles.includes('inventory'), true);
  const roleResumed = await expectPost(owner, owner.getByRole('button', { name: 'Resume inventory' }));
  assert.equal(roleResumed.roles.includes('inventory'), false);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    storageState: await owner.context().storageState() });
  const page = await mobile.newPage();
  await navigate(page, work);
  await page.getByRole('heading', { name: 'AI work', exact: true }).waitFor();
  await save(page, 'work-mobile');
  const widths = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return { width, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('main > *, .ops-stack > *, .topbar')]
      .filter(node => node.getBoundingClientRect().right > width).map(node => node.className) };
  });
  assert.equal(widths.width >= widths.scroll, true, JSON.stringify(widths));
  console.log('PASS pause and resume for all workers and one role, plus mobile review');
} finally {
  await browser.close();
}
