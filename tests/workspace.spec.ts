import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resources } from '../src/lib/sections';
import { workflowRoutes } from '../src/lib/workflows';
import { fixturePassword } from './fixture-password';

async function signIn(page: Page, suffix: string, root = '') {
  await page.goto(root+'/sign-in');
  await page.getByLabel('Staff email or phone number').fill('0100000000'+suffix);
  await page.getByLabel('Password',{exact:true}).fill(fixturePassword());
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(/\/desk\/overview$/);
}

test('super admin opens every registered native view and the full preserved route inventory',async ({page}) => {
  await signIn(page,'1');
  await expect(page.getByRole('heading',{name:'Commerce overview'})).toBeVisible();
  await expect(page.getByRole('link', { name: /Orders to confirm/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Payments to verify/ })).toBeVisible();
  for (const [section, views] of Object.entries(resources)) {
    for (const [id, view] of Object.entries(views)) {
      await page.goto('/desk/'+section+'/'+id);
      const title = id === 'barcodes' ? /^All Barcodes \([\d,]+\)$/ : view.title;
      await expect(page.getByRole('heading',{name:title,exact:true,level:1}),section+'/'+id).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), section+'/'+id).toBe(true);
    }
  }
  const keys = ['manage-permissions','overview.view','order.view','pre_order.view','product.view','faq.view','review.view','defaults.purchase',
    'barcode.view','business_locations.view','supplier.view','purchase.view','stock.view','user.view','expense.view','coupon.view','cms.view','pos.view','role.view',
    'pre_order.update','order.update','product.update','faq.create','barcode.generate','business_locations.update','stock.create','purchase.update','supplier.update',
    'coupon.update','expense.update','user.update','role.update','pos.update','report.order_status.view',
    'pre_order.create','order.create','product.create','barcode.assign.stock','business_locations.create','stock.transfer',
    'supplier.create','coupon.create','expense.create','user.create','role.create','pos.create'];
  const expected = readFileSync('evidence/legacy-routes.txt','utf8').split(/\r?\n/).filter(path=>path.startsWith('/dashboard/'));
  expect(workflowRoutes({id:'fixture',name:'Fixture',role:'SUPER_ADMIN',permissions:keys})).toHaveLength(expected.length);
  await page.goto('/desk/workflows?q=barcode');
  await expect(page.getByText('barcodes/receive',{exact:true})).toBeVisible();
  await expect(page.getByText('barcodes/logs',{exact:true})).toBeVisible();
  await expect(page.getByText('Provider access blocked')).toHaveCount(0);
});

test('all ten reports render and export CSV and XLSX through the same staff policy',async ({page}) => {
  await signIn(page,'1');
  await page.goto('/desk/reports');
  const links = await page.locator('.report-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')!));
  expect(links).toHaveLength(10);
  for (const link of links) {
    await page.goto(link);
    await expect(page.getByRole('link',{name:'CSV',exact:true})).toBeVisible();
    for (const label of ['CSV','Excel']) {
      const href = await page.getByRole('link',{name:label,exact:true}).getAttribute('href');
      const res = await page.request.get(href!);
      expect(res.status(),link+' '+label).toBe(200);
      expect(res.headers()['content-disposition']).toContain('attachment');
      if (label === 'CSV') expect((await res.text()).length).toBeGreaterThan(25);
      else expect((await res.body()).subarray(0,2).toString()).toBe('PK');
    }
  }
  await page.goto('/desk/reports/stock-valuation');
  await page.getByLabel('Search product or SKU').fill('NO-SUCH-SKU');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: 'No records in this view' })).toBeVisible();
  const filtered = await page.getByRole('link', { name: 'CSV', exact: true }).getAttribute('href');
  expect(filtered).toContain('search=NO-SUCH-SKU');
  expect(await (await page.request.get(filtered!)).text()).not.toContain('FIXTURE-BD-BLUE');
});

test('report shortcuts, period settings, location scope and server sorting match the exports', async ({page},testInfo) => {
  await signIn(page,'1');
  await page.goto('/desk/reports');
  const nav = page.getByRole('navigation',{name:'Primary navigation'});
  await nav.getByRole('link',{name:'Sales Summary',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Period',exact:true})).toHaveValue('30');
  await expect(page.locator('.report-metric').getByText('Previous period',{exact:false}).first()).toBeVisible();
  await expect(page.locator('tfoot')).toContainText('Total');
  await page.getByRole('combobox',{name:'Period',exact:true}).selectOption('7');
  await page.getByRole('combobox',{name:'Group by'}).selectOption('week');
  await page.getByLabel('Compare with previous period').uncheck();
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page).toHaveURL(/groupBy=week/);
  await expect(page.locator('.report-metric').getByText('Previous period',{exact:false})).toHaveCount(0);
  const salesCsv = new URL((await page.getByRole('link',{name:'CSV',exact:true}).getAttribute('href'))!, 'http://127.0.0.1');
  expect(salesCsv.searchParams.get('compare')).toBe('none');
  expect(salesCsv.searchParams.get('groupBy')).toBe('week');

  await nav.getByRole('link',{name:'Stock Valuation',exact:true}).click();
  await expect(page.getByRole('columnheader',{name:/Sort by On hand/})).toHaveAttribute('aria-sort','descending');
  await page.getByRole('link',{name:'Sort by Avg unit cost ascending'}).click();
  await expect(page.getByRole('columnheader',{name:/Sort by Avg unit cost/})).toHaveAttribute('aria-sort','ascending');
  await page.locator('.overview-locations summary').click();
  await page.getByRole('checkbox',{name:'Fixture warehouse',exact:true}).check();
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
  const csv = new URL((await page.getByRole('link',{name:'CSV',exact:true}).getAttribute('href'))!, 'http://127.0.0.1');
  expect(csv.searchParams.get('locations')).toBe('000000000000000000000007');
  expect(csv.searchParams.get('sort')).toBe('avgCost');
  expect(csv.searchParams.get('order')).toBe('asc');
  const refresh = await page.getByRole('link',{name:'Refresh',exact:true}).getAttribute('href');
  expect(refresh).toContain('refresh=1');
  expect(refresh).toContain('sort=avgCost');
  await page.screenshot({path:testInfo.outputPath('stock-valuation.png'),fullPage:true});

  await nav.getByRole('link',{name:'Low Stock & Reorder',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Low stock and reorder',level:1})).toBeVisible();
  await page.getByRole('combobox',{name:'Show',exact:true}).selectOption('all');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page).toHaveURL(/status=all/);
  await expect(page.getByText('Suggested reorder covers',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Fixture domestic case',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:testInfo.outputPath('low-stock-mobile.png'),fullPage:true});
});

test('warehouse can inspect lots and stock, with cost, reports and international scope enforced',async ({page}) => {
  await signIn(page,'4');
  await page.goto('/desk/inventory/stock');
  await expect(page.getByRole('heading',{name:'Stock',exact:true,level:1})).toBeVisible();
  await page.getByRole('table').getByRole('row').filter({hasText:'Fixture warehouse'})
    .getByRole('link',{name:'Fixture domestic case',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Stock lots'})).toBeVisible();
  await expect(page.getByText('FIXTURE-LOT',{exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Cost per unit'})).toHaveCount(0);
  await page.goto('/desk/orders');
  await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  await page.goto('/desk/inventory/stock?region=INTERNATIONAL');
  await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  await page.goto('/desk/reports/stock-valuation?sort=avgCost&order=asc');
  await expect(page.getByRole('columnheader',{name:/Sort by On hand/})).toHaveAttribute('aria-sort','descending');
  await expect(page.getByRole('columnheader',{name:/Avg unit cost|Value at cost|Potential margin/})).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Sales Summary',exact:true})).toHaveCount(0);
  const csv = await page.request.get('/api/download?id=stock-valuation&format=csv&sort=avgCost&order=asc');
  expect(csv.status()).toBe(200);
  expect(await csv.text()).not.toMatch(/Value at cost|Avg unit cost|Potential margin/);
  expect((await page.request.get('/api/download?id=sales-summary&format=xlsx')).status()).toBe(403);
});

test('finance can export permitted valuation and expense views, with staff controls denied',async ({page}) => {
  await signIn(page,'5');
  await page.goto('/desk/payments/expenses');
  await expect(page.getByRole('heading',{name:'Expenses',exact:true,level:1})).toBeVisible();
  const csv = await page.request.get('/api/download?id=stock-valuation&format=csv');
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toMatch(/Value at cost|Avg unit cost|Potential margin/i);
  await page.goto('/desk/staff');
  await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
});

test('customer service works with orders, status filters and exports while checkout controls remain private',async ({page}) => {
  await signIn(page,'6');
  await page.goto('/desk/orders/orders');
  await page.getByLabel('Order status').selectOption('IN_TRANSIT');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.getByRole('table').getByText('In transit',{exact:true}).first()).toBeVisible();
  await page.getByRole('checkbox',{name:'Select all visible records'}).check();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button',{name:'Export selected'}).click();
  expect((await downloaded).suggestedFilename()).toBe('orders-selected.csv');
  await page.goto('/desk/payments/checkout');
  await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  expect((await page.request.get('/api/checkout?receipt=123')).status()).toBe(403);
  expect((await page.request.post('/api/checkout',{headers:{Origin:'http://127.0.0.1:4318'},data:{action:'settings'}})).status()).toBe(403);
});

test('restricted staff and anonymous sessions receive no commerce records',async ({page,request}) => {
  expect((await request.get('/api/download?id=stock-valuation&format=csv')).status()).toBe(401);
  await page.goto('/desk/catalog');
  await expect(page).toHaveURL(/sign-in$/);
  await signIn(page,'3');
  await expect(page.getByText('Your account has no module permissions assigned.')).toBeVisible();
  for (const url of ['/desk/catalog','/desk/inventory','/desk/staff','/desk/reports','/desk/payments']) {
    await page.goto(url);
    await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  }
});

test('desktop, tablet and phone render without document overflow and support keyboard navigation',async ({page},testInfo) => {
  await signIn(page,'1');
  for (const [width,height] of [[1440,1000],[900,1000],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.goto('/desk/overview');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width <= 850) {
      const menu = page.getByRole('button',{name:'Open navigation'});
      await menu.click();
      await expect(page.getByRole('button',{name:'Close navigation'})).toBeFocused();
      await expect(page.getByRole('navigation',{name:'Primary navigation'})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
    }
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox',{name:'Search workspace'}).fill('warehouse');
    await expect(page.getByRole('link',{name:'Inventory'}).last()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({path:testInfo.outputPath('overview-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/desk/catalog/products');
  await expect(page.getByRole('columnheader',{name:'Actions'})).toHaveCount(0);
  const { violations } = await new AxeBuilder({page}).analyze();
  expect(violations.filter(rule=>rule.impact==='serious'||rule.impact==='critical')).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('catalog-desktop.png'),fullPage:true});
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox',{name:'Search workspace'}).fill('FIXTURE-BD');
  await page.getByRole('link',{name:/Search product SKUs/}).click();
  await expect(page.getByLabel('Search records')).toHaveValue('FIXTURE-BD');
  await expect(page.getByRole('table').getByText('FIXTURE-BD',{exact:true})).toBeVisible();
  await page.goto('/desk/markets/pricing');
  await page.getByLabel('Operating region: Bangladesh').click();
  await page.getByRole('link', { name: 'International', exact: true }).click();
  await expect(page).toHaveURL(/\/desk\/markets\/pricing\?region=INTERNATIONAL$/);
  await expect(page.getByRole('heading', { name: 'Regional prices', level: 1 })).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('market-pricing-desktop.png'),fullPage:true});
  await page.goto('/desk/inventory/stock');
  await page.getByLabel('Search records').fill('FIXTURE-BD-BLUE');
  await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption({ label: 'Fixture warehouse' });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('table').getByText('FIXTURE-BD-BLUE', { exact: true })).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('stock-desktop.png'),fullPage:true});
});
