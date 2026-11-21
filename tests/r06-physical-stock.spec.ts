import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const target = process.env.GRIIP_ADMIN_R06_STOCK_ORIGIN ?? '';
if (target && !/^http:\/\/127\.0\.0\.1:\d{4,5}(?:\/admin)?$/.test(target)) {
  throw new Error('Set GRIIP_ADMIN_R06_STOCK_ORIGIN to the disposable loopback Admin fixture.');
}
test.skip(!target, 'Use a disposable loopback Admin and recovered backend fixture.');
const warehouse = '000000000000000000000007';
const origin = target && new URL(target).origin;
const stockUrl = target + '/dashboard/inventory/physical-stock?region=BD&location=' + warehouse + '&q=FIXTURE-BD-BLUE';
const damageEndpoint = /\/api\/physical-stock\?/;

async function signIn(page: Page) {
  await page.goto(target + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill('01000000001');
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard\/overview(?:\?|$)/);
}

async function writeOff(page: Page, reason: string) {
  const form = page.getByRole('form', { name: 'Record warehouse damage' });
  const stockLot = form.getByLabel('Stock lot');
  const lot = await stockLot.locator('option').filter({ hasText: /^FIXTURE-LOT · / }).getAttribute('value');
  expect(lot).toBeTruthy();
  await stockLot.selectOption(lot!);
  await form.getByLabel('Damaged units').fill('1');
  await form.getByLabel('Reason').fill(reason);
  await form.getByRole('button', { name: 'Post damage', exact: true }).click();
}

for (const width of [1440, 390]) {
  test(`scoped warehouse detail and damage recovery at ${width} CSS pixels`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 920 });
    await signIn(page);
    await page.goto(stockUrl);
    await expect(page.getByRole('heading', { name: 'Physical warehouse stock' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'FIXTURE-BD-BLUE' })).toHaveCount(1);
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Export CSV', exact: true }).click();
    const file = await download;
    const csv = await readFile(await file.path(), 'utf8');
    expect(csv).toContain('FIXTURE-BD-BLUE');
    expect(csv).toContain('"Owner"');
    expect(csv).not.toMatch(/FIXTURE-INT|Cost|Supplier/i);

    await page.getByRole('link', { name: 'View lots and movements' }).click();
    await expect(page.getByRole('heading', { name: 'FIXTURE-BD-BLUE' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Shared SKU pool' })).toContainText('reserved');
    await expect(page.getByRole('heading', { name: 'Lots and bins' })).toBeVisible();
    const threshold = page.getByRole('form', { name: 'Set reorder threshold' });
    await threshold.getByLabel('Warning units').fill(width === 1440 ? '10' : '11');
    await threshold.getByRole('button', { name: 'Save threshold' }).click();
    await expect(page.getByText('Threshold saved.', { exact: true })).toBeVisible();

    const reason = 'Synthetic R06 damage review at ' + width;
    let originalId = '';
    let originalKey = '';
    await page.route(damageEndpoint, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      originalKey = (await route.request().allHeaders())['idempotency-key'];
      originalId = (await response.json()).id;
      await route.abort();
    });
    await writeOff(page, reason);
    await expect(page.getByText('If the result is uncertain, retry with the same details.', { exact: false })).toBeVisible();
    expect(originalId).toBeTruthy();
    expect(originalKey).toBeTruthy();
    await page.unroute(damageEndpoint);
    await page.reload();
    const confirmed = page.waitForResponse(response => damageEndpoint.test(response.url()) && response.request().method() === 'POST');
    await writeOff(page, reason);
    const replay = await confirmed;
    expect(replay.status()).toBe(201);
    expect((await replay.json()).id).toBe(originalId);
    expect((await replay.request().allHeaders())['idempotency-key']).toBe(originalKey);
    await expect(page.getByText('Damage posted to inventory history.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Damaged units')).toHaveValue('');
    const entry = page.getByRole('listitem').filter({ hasText: reason });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText('-1 units stock change');
    await expect(entry).toContainText('1 units recorded as damaged');
    await expect(entry).toContainText(originalId);
    expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
    await page.screenshot({ path: info.outputPath(`warehouse-stock-and-history-${width}.png`), fullPage: true });
  });
}

test('posts one warehouse transfer and adjustment through their existing Admin forms', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  await signIn(page);
  const location = await page.request.post(target + '/api/locations?region=BD', {
    headers: { Origin: origin },
    data: {
      name: 'Synthetic R06 stock destination ' + Date.now(), type: 'WAREHOUSE',
      address: { local_address: 'Synthetic address', division: '', district: '', thana: '', zip_code: '' },
      manager_name: '', contact_numbers: [],
    },
  });
  expect(location.status()).toBe(201);
  const destination = (await location.json()).id as string;

  await page.goto(target + '/dashboard/stock-transfer/create');
  await page.getByRole('combobox', { name: 'From', exact: true }).selectOption(warehouse);
  await page.getByRole('combobox', { name: 'To', exact: true }).selectOption(destination);
  await page.getByRole('textbox', { name: 'Search for Products', exact: true }).fill('FIXTURE-BD-BLUE');
  await page.getByRole('button', { name: 'Add FIXTURE-BD-BLUE', exact: true }).click();
  const transferPost = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/stock-changes?mode=transfer'));
  await page.getByRole('button', { name: 'Record stock transfer', exact: true }).click();
  const transfer = await transferPost;
  expect(transfer.status()).toBe(201);
  await expect(page.getByText('Stock transfer recorded.', { exact: true })).toBeVisible();
  const transferredId = (await transfer.json()).id;
  const transferReplay = await page.request.post(transfer.url(), { headers: { Origin: origin }, data: transfer.request().postDataJSON() });
  expect(transferReplay.status()).toBe(201);
  expect((await transferReplay.json()).id).toBe(transferredId);

  await page.goto(target + '/dashboard/stock-adjustment/create');
  await page.getByRole('combobox', { name: 'Business Location', exact: true }).selectOption(destination);
  await page.getByRole('textbox', { name: 'Search for Products/Stocks', exact: true }).fill('FIXTURE-BD-BLUE');
  await page.getByRole('button', { name: 'Add FIXTURE-BD-BLUE', exact: true }).click();
  const reason = 'Synthetic R06 count correction';
  await page.getByLabel('Reason', { exact: true }).fill(reason);
  const adjustmentPost = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/stock-changes?mode=adjustment'));
  await page.getByRole('button', { name: 'Record stock adjustment', exact: true }).click();
  const adjustment = await adjustmentPost;
  expect(adjustment.status()).toBe(201);
  await expect(page.getByText('Stock adjustment recorded.', { exact: true })).toBeVisible();
  const adjustmentId = (await adjustment.json()).id;
  const adjustmentReplay = await page.request.post(adjustment.url(), { headers: { Origin: origin }, data: adjustment.request().postDataJSON() });
  expect(adjustmentReplay.status()).toBe(201);
  expect((await adjustmentReplay.json()).id).toBe(adjustmentId);

  await page.goto(stockUrl.replace(warehouse, destination));
  await page.getByRole('link', { name: 'View lots and movements' }).click();
  const history = page.getByRole('region', { name: 'Movement history' });
  await expect(history.getByRole('listitem').filter({ hasText: transferredId })).toHaveCount(1);
  const correction = history.getByRole('listitem').filter({ hasText: adjustmentId });
  await expect(correction).toHaveCount(1);
  await expect(correction).toContainText(reason);
  await expect(correction).toContainText('Operator ID');
});
