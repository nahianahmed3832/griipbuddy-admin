import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_TEST_CATEGORY_ORIGIN || 'http://127.0.0.1:4327';
const categories = '/desk/catalog/categories';

async function signIn(page: Page, phone: string) {
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(origin + '/desk/overview');
}

test('create, find and edit categories in one tree on desktop and mobile', async ({ page }) => {
  const suffix = Date.now();
  const name = 'Travel essentials ' + suffix;
  const banglaName = 'অ্যাডাপ্টার ' + suffix;
  await signIn(page,'01000000001');
  await page.goto(origin + '/desk/catalog/subcategories');
  await expect(page).toHaveURL(new RegExp(categories + '\\?'));
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name:/^Tech accessories/ }).click();
  await page.getByRole('button', { name:'Edit category' }).click();
  await dialog.getByLabel('English description').fill('Browse cables, cases and chargers.');
  await dialog.getByRole('button', { name:'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Category changes saved.');

  await page.getByRole('button', { name: 'Add top level category' }).click();
  await dialog.getByLabel('English name').fill(name);
  await dialog.getByLabel('Bangla name').fill('ভ্রমণ সামগ্রী');
  await expect(dialog.getByLabel('Storefront slug')).toHaveValue(name.toLowerCase().replaceAll(' ','-'));
  await dialog.getByLabel('Navigation visibility').selectOption('visible');
  await dialog.getByRole('button', { name:'Create category' }).click();
  await expect(page.getByRole('status')).toHaveText('Category created.');
  await page.getByRole('button', { name:'Add child category' }).click();
  await dialog.getByLabel('English name').fill('Power adapters');
  await dialog.getByLabel('Bangla name').fill(banglaName);
  await dialog.getByLabel('Navigation visibility').selectOption('visible');
  await dialog.getByText('Storefront media', { exact: false }).click();
  const thumb = dialog.getByRole('group', { name:'Category thumbnail · 1:1' });
  const image = await sharp({ create: { width:80, height:80, channels:3, background:'#6841ac' } }).png().toBuffer();
  await thumb.getByLabel('Upload image').setInputFiles({ name:'adapters.png', mimeType:'image/png', buffer:image });
  await expect(thumb.getByLabel('Image URL')).toHaveValue(/media\.fixture\.invalid.*\.webp$/);
  await thumb.getByLabel('Video URL').fill('https://media.fixture.invalid/power.mp4');
  await dialog.getByRole('button', { name:'Create category' }).click();
  await expect(page.getByRole('heading', { name:'Power adapters' })).toBeVisible();
  await expect(page.getByRole('navigation', { name:'Category path' })).toContainText(name);

  await page.getByRole('navigation', { name:'Category path' }).getByRole('button', { name }).click();
  await page.getByRole('button', { name:'Add child category' }).click();
  await dialog.getByLabel('English name').fill('Cable organizers');
  await dialog.getByLabel('Bangla name').fill('কেবল সংগঠক');
  await dialog.getByRole('button', { name:'Create category' }).click();
  await expect(page.getByRole('heading', { name:'Cable organizers' })).toBeVisible();
  await page.getByRole('button', { name:'Move earlier' }).click();
  await expect(page.getByRole('status')).toHaveText('Category order saved.');
  const siblingRows = page.locator('.category-node').filter({ hasText:/Cable organizers|Power adapters/ });
  await expect(siblingRows).toHaveText([/Cable organizers/, /Power adapters/]);
  await page.getByRole('button', { name:/Power adapters/ }).click();
  await page.getByRole('button', { name:'Edit category' }).click();
  await dialog.getByLabel('English name').fill('Travel adapters');
  await dialog.getByLabel('Navigation visibility').selectOption('hidden');
  await dialog.getByRole('button', { name:'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Category changes saved.');
  await page.reload();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('searchbox', { name:'Search categories' }).fill(banglaName);
  await page.getByLabel('Filter by visibility').selectOption('Hidden');
  await expect(page.getByText('1 match', { exact: true })).toBeVisible();
  await page.getByRole('button', { name:/Travel adapters/ }).click();
  const detail = page.getByRole('region', { name:'Category details' });
  await expect(detail.getByRole('heading', { name:'Travel adapters' })).toBeVisible();
  await expect(detail.getByText('power-adapters', { exact: true })).toBeVisible();
  await expect(detail.getByText('Hidden', { exact: true })).toBeVisible();
  await expect(detail.getByText('1:1 · Image + Video', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.category-workspace').withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('read-only staff can browse but cannot save, and cross-origin requests are denied', async ({ page }) => {
  await signIn(page,'01000000006');
  await page.goto(origin + categories);
  await expect(page.getByRole('heading', { name:'Category tree' })).toBeVisible();
  await expect(page.getByText(/read-only mode/)).toBeVisible();
  await expect(page.getByRole('button', { name:'Edit category' })).toHaveCount(0);
  const url = origin + '/api/categories';
  expect((await page.request.post(url, { headers:{ origin }, data:{ depth:0 } })).status()).toBe(403);
  expect((await page.request.post(url, { headers:{ origin:'https://other.example' }, data:{ depth:0 } })).status()).toBe(403);
});
