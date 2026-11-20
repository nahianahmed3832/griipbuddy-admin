import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { fixturePassword } from './fixture-password';

const admin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const storefront = process.env.GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN!;
const product = process.env.GRIIP_HOMEPAGE_TEST_PRODUCT ?? 'Homepage fixture case';
const publicUrl = `${storefront}/api/storefront/homepage?market=bd&lang=en-BD`;

test('existing Homepage route previews and publishes scoped changes and restores a previous release', async ({ page }) => {
  const title = `Homepage fixture ${randomUUID().slice(0, 8)}`;
  const updated = `${title} updated`;
  await page.route('**/*', route => [admin, storefront].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill('01000000001');
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
  await page.goto('/admin/dashboard/homepage/shop-by-category');
  await expect(page).toHaveURL(/\/admin\/dashboard\/homepage(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Homepage merchandising' })).toBeVisible();
  const scope = page.getByLabel('Market and language');
  await scope.selectOption('bd:en-BD');
  await page.getByRole('button', { name: 'Open template' }).click();
  await expect(page).toHaveURL(/scope=bd%3Aen-BD/);
  await expect(page.locator('header time')).not.toHaveText('...');
  const form = page.getByRole('region', { name: 'Shopping sections' });
  const add = form.getByRole('button', { name: 'Add section', exact: true });
  await add.focus();
  await add.press('Enter');
  const row = form.getByRole('group', { name: 'Untitled section' });
  await expect(row.getByLabel('Section type').getByRole('option')).toHaveText([
    'Shop by category', 'Category and collection tiles', 'Featured product selection', 'Featured collections', 'Category spotlight',
    'New arrivals', 'Genuine offers or budget picks',
  ]);
  await row.getByLabel('Section type').selectOption('CURATED');
  await row.getByLabel('Display order').fill('2');
  await row.getByLabel('Section title').fill(title);
  const selected = form.getByRole('group', { name: title, exact: true });
  await selected.getByLabel('Starts in market local time').fill('2025-01-01T09:00');
  await selected.getByRole('button', { name: 'Choose products', exact: true }).click();
  await selected.getByRole('searchbox', { name: 'Search products', exact: true }).fill(product);
  await selected.getByRole('button', { name: `Select ${product}`, exact: true }).click();
  await selected.getByRole('button', { name: 'Close picker', exact: true }).click();
  await selected.getByLabel('Section destination').selectOption('products');
  await selected.getByRole('button', { name: 'Choose destination product page', exact: true }).click();
  await selected.getByRole('searchbox', { name: 'Search destination product page', exact: true }).fill(product);
  await selected.getByRole('button', { name: `Select ${product}`, exact: true }).click();
  await expect(selected.getByLabel('Destination label')).toHaveValue(product);
  await add.click();
  await selected.getByRole('button', { name: 'Move section down', exact: true }).click();
  await expect(selected.getByLabel('Display order')).toHaveValue('3');
  await row.getByRole('button', { name: 'Remove section', exact: true }).click();
  await selected.getByLabel('Display order').fill('2');
  const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: `#${title.slice(-6)}` } }).png().toBuffer();
  await selected.getByLabel('Upload section image').setInputFiles({ name: 'homepage.png', mimeType: 'image/png', buffer: image });
  const alt = `${title} artwork`;
  await selected.getByLabel('Image alternative text').fill(alt);
  await expect(selected.getByRole('img', { name: alt })).toBeVisible();
  await expect.poll(() => selected.getByRole('img', { name: alt }).evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(form.getByText('Draft saved. Preview or publish when ready.')).toBeVisible();
  const preview = page.getByRole('region', { name: 'Draft preview' });
  await preview.getByLabel(/Preview date and time/).fill('2025-01-01T08:59');
  await preview.getByRole('button', { name: 'Preview saved draft' }).click();
  await expect(preview.getByText(/Draft preview ·/)).toBeVisible();
  await expect(preview.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  await preview.getByLabel(/Preview date and time/).fill('');
  await preview.getByRole('button', { name: 'Preview saved draft' }).click();
  await expect(preview.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(preview.getByText(product, { exact: true }).first()).toBeVisible();
  expect(await preview.getByRole('link').count()).toBe(0);
  await expect.poll(async () => (await page.request.get(publicUrl)).status()).toBe(200);
  expect(JSON.stringify(await (await page.request.get(publicUrl)).json())).not.toContain(title);
  const publish = page.getByRole('button', { name: 'Publish saved draft', exact: true });
  page.on('dialog', dialog => dialog.accept());
  await publish.click();
  await expect(form.getByText('Homepage publication updated.')).toBeVisible();
  await expect.poll(async () => JSON.stringify(await (await page.request.get(publicUrl)).json())).toContain(title);
  const published = await (await page.request.get(publicUrl)).json() as { sections: { title: string; destination: { href: string; label: string } }[] };
  const destination = published.sections.find(section => section.title === title)?.destination;
  expect(destination?.label).toBe(product);
  expect(destination?.href).toMatch(/\/products\/[a-z0-9-]+/);

  await page.reload();
  const readBack = form.getByRole('group', { name: title, exact: true });
  await expect(readBack).toBeVisible();
  await readBack.getByLabel('Section title').fill(updated);
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(form.getByText('Draft saved. Preview or publish when ready.')).toBeVisible();
  await publish.click();
  await expect.poll(async () => JSON.stringify(await (await page.request.get(publicUrl)).json())).toContain(updated);
  await page.getByRole('button', { name: 'Restore version', exact: true }).first().click();
  await expect.poll(async () => JSON.stringify(await (await page.request.get(publicUrl)).json())).not.toContain(updated);
  await page.getByRole('button', { name: 'Use inherited content', exact: true }).click();
  await expect.poll(async () => JSON.stringify(await (await page.request.get(publicUrl)).json())).not.toContain(title);
  const savedRow = form.getByRole('group', { name: updated, exact: true });
  await savedRow.getByRole('button', { name: 'Remove section', exact: true }).click();
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(form.getByText('Draft saved. Preview or publish when ready.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('showcase tiles keep catalog order and switch to the mobile image in a protected draft', async ({ page }) => {
  const fixtureCategory = process.env.GRIIP_HOMEPAGE_TEST_CATEGORY;
  test.skip(!fixtureCategory, 'Supply a visible category from the disposable Homepage fixture.');
  const title = `Showcase ${randomUUID().slice(0, 8)}`;
  await page.route('**/*', route => [admin, storefront].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill('01000000001');
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
  await page.goto('/admin/dashboard/homepage?scope=bd%3Aen-BD');
  const editor = page.getByRole('region', { name: 'Shopping sections' });
  await editor.getByRole('button', { name: 'Add section', exact: true }).click();
  const initial = editor.getByRole('group', { name: 'Untitled section' });
  await initial.getByLabel('Section type').selectOption('TILES');
  await initial.getByLabel('Section title').fill(title);
  const section = editor.getByRole('group', { name: title, exact: true });
  await section.getByLabel('Tile layout').selectOption('DISCOVERY');
  await section.getByRole('button', { name: 'Add tile', exact: true }).click();
  const tiles = section.locator('.homepage-tile-editor');
  const categoryTile = tiles.nth(0);
  await categoryTile.getByRole('button', { name: 'Choose tile category destination', exact: true }).click();
  await categoryTile.getByRole('searchbox', { name: 'Search tile category destination' }).fill(fixtureCategory!);
  await categoryTile.getByRole('button', { name: `Select ${fixtureCategory}`, exact: true }).click();
  await categoryTile.getByLabel('Tile label').fill('Browse accessories');
  await categoryTile.getByLabel('Action label').fill('View accessories');
  await categoryTile.getByLabel('Desktop horizontal focus (%)').fill('28');
  await categoryTile.getByLabel('Mobile vertical focus (%)').fill('77');
  const mobileImage = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#654331' } }).png().toBuffer();
  await categoryTile.getByLabel('Upload mobile image').setInputFiles({ name: 'mobile.png', mimeType: 'image/png', buffer: mobileImage });
  await categoryTile.getByLabel('Mobile image alternative text').fill('Accessories shown in a portrait crop');

  await section.getByRole('button', { name: 'Add tile', exact: true }).click();
  const productTile = tiles.nth(1);
  await productTile.getByLabel('Destination type').selectOption('PRODUCT');
  await productTile.getByRole('button', { name: 'Choose tile product destination', exact: true }).click();
  await productTile.getByRole('searchbox', { name: 'Search tile product destination' }).fill(product);
  await productTile.getByRole('button', { name: `Select ${product}`, exact: true }).click();
  await productTile.getByRole('button', { name: 'Move tile 2 up' }).click();
  await expect(tiles.locator('legend')).toHaveText([product, 'Browse accessories']);
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(editor.getByText('Draft saved. Preview or publish when ready.')).toBeVisible();

  const preview = page.getByRole('region', { name: 'Draft preview' });
  await preview.getByRole('button', { name: 'Preview saved draft' }).click();
  const result = preview.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(result.locator('strong')).toHaveText([product, 'Browse accessories']);
  await expect(result.getByRole('img', { name: 'Accessories shown in a portrait crop' })).toHaveCount(0);
  await preview.getByRole('button', { name: 'Mobile', exact: true }).click();
  const photo = result.getByRole('img', { name: 'Accessories shown in a portrait crop' });
  await expect(photo).toHaveCSS('object-position', '50% 77%');
  await expect.poll(async () => photo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(result.getByRole('link')).toHaveCount(0);
  expect(JSON.stringify(await (await page.request.get(publicUrl)).json())).not.toContain(title);

  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Publish saved draft', exact: true }).click();
  await expect.poll(async () => {
    const { sections } = await (await page.request.get(publicUrl)).json();
    return sections.find((section: { title: string }) => section.title === title);
  }).toMatchObject({ tileLayout: 'DISCOVERY', tiles: [
    { kind: 'PRODUCT', title: product, href: expect.stringContaining('variant=') },
    { kind: 'CATEGORY', title: 'Browse accessories', ctaLabel: 'View accessories',
      focalPoint: { x: 28, y: 50 }, mobileFocalPoint: { x: 50, y: 77 } },
  ] });
  await page.getByRole('button', { name: 'Use inherited content', exact: true }).click();
  await expect.poll(async () => JSON.stringify(await (await page.request.get(publicUrl)).json())).not.toContain(title);
  await section.getByRole('button', { name: 'Remove section', exact: true }).click();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(editor.getByText('Draft saved. Preview or publish when ready.')).toBeVisible();
});
