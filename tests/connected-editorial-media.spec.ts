import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { fixturePassword } from './fixture-password';

const admin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const storefront = process.env.GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN!;

test('keyboard-created categories publish the uploaded editorial image after saving', async ({ page }) => {
  const slug = `editorial-fixture-${randomUUID().slice(0, 8)}`;
  const title = `Editorial fixture ${slug.slice(-8)}`;
  const alt = 'Original category fixture image';
  await page.route('**/*', route => [admin, storefront].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill('01000000001');
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
  await page.goto('/admin/dashboard/categories');
  const create = page.getByRole('link', { name: 'New category', exact: true });
  await create.focus();
  await create.press('Enter');

  const submit = page.getByRole('button', { name: 'Create category' });
  const form = page.locator('form').filter({ has: submit });
  await form.getByLabel('Name', { exact: true }).fill(title);
  await form.getByLabel('Short name', { exact: true }).fill('Editorial fixture');
  await form.getByLabel('Slug', { exact: true }).fill(slug);
  await form.getByRole('combobox', { name: 'Level', exact: true }).selectOption('DEPARTMENT');
  await form.getByRole('combobox', { name: 'State', exact: true }).selectOption('ACTIVE');
  const path = form.getByLabel('Category image path');
  await path.fill('/catalog/phone-stand.webp');
  await form.getByLabel('Category image alternative text').fill(alt);

  let categorySaves = 0;
  let releaseUpload!: () => void;
  const uploadHeld = new Promise<void>(resolve => { releaseUpload = resolve; });
  await page.route('**/admin/api/connected-catalog', async route => {
    const action = route.request().postDataJSON()?.request?.action;
    if (action === 'media.upload') await uploadHeld;
    if (action === 'category.save') categorySaves++;
    await route.continue();
  });
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: `#${slug.slice(-6)}` } }).png().toBuffer();
  try {
    await form.getByLabel('Upload category image', { exact: true }).setInputFiles({ name: 'editorial.png', mimeType: 'image/png', buffer: png });
    await expect(form.getByRole('status')).toHaveText('Uploading image…');
    await submit.click();
    expect(await path.evaluate(input => (input as HTMLInputElement).validationMessage)).toBe('Wait for the image to finish uploading.');
    expect(categorySaves).toBe(0);
  } finally { releaseUpload(); }

  await expect(path).toHaveValue(/^\/media\/[a-f0-9]{64}$/);
  const src = await path.inputValue();
  const publicAsset = `${storefront}${src}?market=bd`;
  expect((await page.request.get(publicAsset)).status()).toBe(404);
  await submit.click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect(categorySaves).toBe(1);

  const detail = await page.request.get(`${storefront}/api/catalog/categories/${slug}?market=bd`);
  expect(detail.status()).toBe(200);
  expect((await detail.json()).category.image).toEqual({ src: `${src}?market=bd`, alt });
  const asset = await page.request.get(publicAsset);
  expect(asset.status()).toBe(200);
  expect(asset.headers()['content-type']).toBe('image/webp');
});
