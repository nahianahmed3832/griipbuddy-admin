import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const adminOrigin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const catalogApi = '/admin/api/connected-catalog';
const browserCatalogApi = '**' + catalogApi;
const sellerId = '00000000-0000-4000-8000-000000000001';
const shared = { src: '/catalog/phone-stand.webp', alt: 'Shared fixture image' };
const detail = { src: '/catalog/headphones-black.webp', alt: 'Issued variant thumbnail' };
const alternate = { src: '/catalog/headphones-taupe.webp', alt: 'Retained alternate image' };
const nextImage = { src: '/catalog/tote-oat.webp', alt: 'Current fixture image' };
const newImage = { src: '/catalog/speaker.webp', alt: 'New fixture image' };

type Image = { src: string; alt: string };
type Gallery = (Image & { isPrimary: boolean; position: number; variantId: string })[];
type Workspace = { shared: { revision: number; variants: { id: string; images: Gallery }[] } };

async function command<T>(page: Page, request: object, region = 'BD'): Promise<T> {
  const response = await page.request.post(catalogApi, {
    headers: { Origin: adminOrigin }, data: { region, request },
  });
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return payload.data as T;
}

function expectedImages(variantId: string, ...images: Image[]): Gallery {
  return images.map((image, position) => ({ ...image, variantId, position, isPrimary: position === 0 }));
}

test('paged variant rows and bulk galleries retain market context and persisted outcomes', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.route(url => url.origin !== adminOrigin, route => route.abort());
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill('01000000001');
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);

  const id = 'variant-gallery-' + randomUUID().slice(0, 8);
  const productUrl = '/admin/dashboard/product-details/' + id;
  const definition = id + '-option';
  const values = Array.from({ length: 10 }, (_, index) => {
    const label = 'Model ' + String(index + 1).padStart(2, '0');
    return { id: 'value-' + (index + 1), value: label, label };
  });
  const variants = values.map((value, index) => ({
    id: 'v-' + id + '-' + String(index + 1).padStart(2, '0'),
    sku: id.toUpperCase() + '-' + String(index + 1).padStart(2, '0'),
    active: true,
    selections: { [definition]: value.id },
  }));
  const [first, full, untouched, second, third] = variants;
  const ninth = variants[8];
  const last = variants[9];

  let parentId: string | null = null;
  for (const kind of ['DEPARTMENT', 'CATEGORY', 'SUBCATEGORY'] as const) {
    const categoryId = id + '-' + kind.toLowerCase();
    await command(page, { action: 'category.save', input: { id: categoryId, slug: categoryId, kind, parentId,
      state: 'ACTIVE', revision: null, position: 0, name: categoryId, shortName: kind, description: '', image: shared } });
    parentId = categoryId;
  }
  const foundation = {
    id, slug: id, name: 'Isolated variant gallery fixture', description: 'Issued physical options for catalog acceptance.',
    primaryCategoryId: parentId, publication: 'DRAFT', defaultVariantId: first.id,
    options: [{ id: definition, key: 'model', label: 'Model', values }], variants,
  };
  const created = await command<{ revision: number }>(page, { action: 'product.save', input: {
    ...foundation, expectedRevision: null,
  } });
  const archived = await command<{ revision: number }>(page, { action: 'product.save', input: {
    ...foundation, expectedRevision: created.revision,
    variants: variants.map(variant => ({ ...variant, active: variant.id !== last.id })),
  } });
  const putGallery = (revision: number, variantId: string | undefined, ...images: Image[]) =>
    command<{ revision: number }>(page, { action: 'product.gallery', input: { productId: id, revision, variantId,
      images: images.map((image, index) => ({ ...image, isPrimary: index === 0 })) } });
  let baseline = await putGallery(archived.revision, undefined, shared, nextImage, newImage);
  baseline = await putGallery(baseline.revision, first.id, alternate);
  baseline = await putGallery(baseline.revision, ninth.id, detail, alternate);
  // A separately seeded loopback fixture exercises the exact full-gallery limit without performing test uploads.
  const fullGallery = process.env.GRIIP_CONNECTED_TEST_FULL_GALLERY?.split(',').map((src, index) => ({
    src, alt: 'Full gallery fixture ' + index,
  }));
  if (fullGallery) await putGallery(baseline.revision, full.id, ...fullGallery);
  for (const offer of [
    { region: 'BD', marketId: 'bd', currency: 'BDT', amountMinor: 149900 },
    { region: 'INTERNATIONAL', marketId: 'us', currency: 'USD', amountMinor: 2499 },
  ]) {
    const { region, ...terms } = offer;
    await command(page, { action: 'offer.configure', input: { ...terms, variantId: ninth.id, sellerId,
      expectedRevision: null, publication: 'ACTIVE', eligible: false } }, region);
  }

  const read = () => command<Workspace>(page, { read: 'product', id });
  const gallery = (value: Workspace, variantId: string) => value.shared.variants.find(variant => variant.id === variantId)?.images;
  const variantGrid = page.locator('#variants');
  const nextPage = variantGrid.getByRole('button', { name: 'Next variants', exact: true });
  const find = variantGrid.getByRole('searchbox', { name: 'Find variants' });
  const row = (sku: string) => variantGrid.getByRole('row').filter({ has: page.getByRole('cell', { name: sku, exact: true }) });
  const media = page.getByRole('region', { name: 'Media', exact: true });
  const bulk = media.locator('form').filter({ has: page.getByRole('group', { name: 'Variant galleries', exact: true }) });
  const bulkResult = bulk.getByRole('status');
  const resultFor = (sku: string) => bulkResult.getByRole('listitem').filter({ hasText: sku });
  async function apply(image: Image, ...selected: { sku: string }[]) {
    await bulk.getByLabel('Existing asset path', { exact: true }).fill(image.src);
    await bulk.getByLabel('Asset alternative text', { exact: true }).fill(image.alt);
    for (const variant of selected) await bulk.getByRole('checkbox', { name: new RegExp('^' + variant.sku + ' ') }).check();
    await bulk.getByRole('button', { name: 'Apply to ' + selected.length + ' selected', exact: true }).click();
  }

  await test.step('search beyond the first page and switch the selected operating market', async () => {
    await page.goto(productUrl + '?region=BD');
    await expect(variantGrid.getByText('Page 1 of 2 · 10 results')).toBeVisible();
    await expect(row(ninth.sku)).toHaveCount(0);
    await nextPage.press('Enter');
    await expect(variantGrid.getByText('Page 2 of 2 · 10 results')).toBeVisible();
    await expect(nextPage).toBeDisabled();
    await expect(row(ninth.sku)).toContainText('Model 09');
    await expect(row(ninth.sku)).toContainText(ninth.id);
    await expect(row(ninth.sku)).toContainText('Active');
    await expect(row(ninth.sku)).toContainText('৳1,499');
    await expect(row(last.sku)).toContainText('Archived');
    const thumbnail = row(ninth.sku).getByRole('img', { name: detail.alt, exact: true });
    await expect.poll(() => thumbnail.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await expect(thumbnail).toHaveAttribute('src', /region=BD/);

    await find.fill('Model 09');
    await expect(variantGrid.getByText('Page 1 of 1 · 1 results')).toBeVisible();
    await expect(row(ninth.sku)).toBeVisible();
    await find.fill(ninth.id);
    await expect(row(ninth.sku)).toBeVisible();
    await find.fill(ninth.sku);
    await expect(row(ninth.sku)).toBeVisible();
    await find.fill('no such issued SKU');
    await expect(variantGrid.getByText('No variants match this search.')).toBeVisible();
    await find.fill('');
    await variantGrid.getByRole('combobox', { name: 'Variant status' }).selectOption('archived');
    await expect(row(last.sku)).toBeVisible();
    await expect(row(ninth.sku)).toHaveCount(0);

    if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    await page.getByRole('combobox', { name: 'Operating region' }).selectOption('INTERNATIONAL');
    await expect(page).toHaveURL(/region=INTERNATIONAL/);
    await page.reload();
    await nextPage.click();
    await expect(row(ninth.sku)).toContainText('$24.99');
    await expect(row(ninth.sku)).not.toContainText('৳1,499');
    await expect(thumbnail).toHaveAttribute('src', /region=INTERNATIONAL/);
    await expect(thumbnail).toHaveAttribute('alt', detail.alt);
    await page.goto(productUrl + '?region=BD');
  });

  await test.step('apply one existing asset to selected variants and keep other associations', async () => {
    await apply(shared, first, ...(fullGallery ? [full] : []), ninth);
    await expect(bulkResult).toContainText('2 saved');
    await expect(resultFor(first.sku)).toContainText('Primary image saved.');
    await expect(resultFor(ninth.sku)).toContainText('Primary image saved.');
    if (fullGallery) await expect(resultFor(full.sku)).toContainText('The gallery is full.');
    const saved = await read();
    expect(gallery(saved, first.id)).toEqual(expectedImages(first.id, shared, alternate));
    expect(gallery(saved, ninth.id)).toEqual(expectedImages(ninth.id, shared, detail, alternate));
    expect(gallery(saved, untouched.id)).toEqual([]);
    if (fullGallery) expect(gallery(saved, full.id)).toEqual(expectedImages(full.id, ...fullGallery));
    await page.reload();
    await media.getByRole('combobox', { name: 'Gallery', exact: true }).selectOption(ninth.id);
    await expect(media.getByLabel('Image path 1', { exact: true })).toHaveValue(shared.src);
    await expect(media.getByLabel('Image path 2', { exact: true })).toHaveValue(detail.src);
    await expect(media.getByLabel('Image path 3', { exact: true })).toHaveValue(alternate.src);
  });

  await test.step('stop at a second writer conflict and identify remaining variants for review', async () => {
    const calls: string[] = [];
    const intercept = async (route: Route) => {
      const operation = route.request().postDataJSON()?.request;
      if (operation?.action !== 'product.gallery') return route.fallback();
      const response = await route.fetch();
      calls.push(operation.input.variantId);
      if (calls.length === 1 && response.ok()) {
        const saved = await response.json();
        await putGallery(saved.data.revision, untouched.id, nextImage);
      }
      await route.fulfill({ response });
    };
    await page.route(browserCatalogApi, intercept);
    await apply(nextImage, first, second, third);
    await expect(bulkResult).toContainText('1 saved · 0 unchanged · 2 to review');
    await expect(resultFor(first.sku)).toContainText('Primary image saved.');
    await expect(resultFor(second.sku)).toContainText('This product changed');
    await expect(resultFor(third.sku)).toContainText('Skipped because the product changed');
    expect(calls).toEqual([first.id, second.id]);
    await page.unroute(browserCatalogApi, intercept);
    const saved = await read();
    expect(gallery(saved, first.id)).toEqual(expectedImages(first.id, nextImage, shared, alternate));
    expect(gallery(saved, second.id)).toEqual([]);
    expect(gallery(saved, third.id)).toEqual([]);
    expect(gallery(saved, untouched.id)).toEqual(expectedImages(untouched.id, nextImage));
  });

  await test.step('stop when a committed response is lost and reconcile from a reload', async () => {
    await page.once('dialog', dialog => dialog.accept());
    await page.reload();
    const calls: string[] = [];
    let committed: number | undefined;
    const interrupt = async (route: Route) => {
      const operation = route.request().postDataJSON()?.request;
      if (operation?.action !== 'product.gallery') return route.fallback();
      calls.push(operation.input.variantId);
      const response = await route.fetch();
      committed = response.status();
      await route.abort('failed');
    };
    await page.route(browserCatalogApi, interrupt);
    await apply(newImage, second, third);
    await expect(bulkResult).toContainText('0 saved · 0 unchanged · 2 to review');
    await expect(resultFor(second.sku)).toContainText('The response was interrupted.');
    await expect(resultFor(third.sku)).toContainText('Skipped after an unconfirmed save.');
    expect(calls).toEqual([second.id]);
    expect(committed).toBe(200);
    await page.unroute(browserCatalogApi, interrupt);
    await page.once('dialog', dialog => dialog.accept());
    await page.reload();
    await media.getByRole('combobox', { name: 'Gallery', exact: true }).selectOption(second.id);
    await expect(media.getByLabel('Image path 1', { exact: true })).toHaveValue(newImage.src);
    const saved = await read();
    expect(gallery(saved, second.id)).toEqual(expectedImages(second.id, newImage));
    expect(gallery(saved, third.id)).toEqual([]);
  });
});
