import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resources } from '../src/lib/sections';
import { workflowRoutes } from '../src/lib/workflows';
import { fixturePassword } from './fixture-password';

async function signIn(page: Page, suffix: string, root = '') {
  await page.goto(root+'/sign-in');
  await page.getByLabel('Staff email or phone number').fill('0100000000'+suffix);
  const stagingPassword = suffix === '1' ? process.env.GRIIP_ADMIN_TEST_STAGING_PASSWORD : undefined;
  await page.getByLabel('Password',{exact:true}).fill(stagingPassword ?? fixturePassword());
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(/\/desk\/overview$/);
}

test('super admin opens every registered native view and the full preserved route inventory',async ({page}) => {
  await signIn(page,'1');
  await expect(page.getByRole('heading',{name:'Commerce overview'})).toBeVisible();
  for (const [section, views] of Object.entries(resources)) {
    for (const [id, view] of Object.entries(views)) {
      await page.goto('/desk/'+section+'/'+id);
      await expect(page.getByRole('heading',{name:view.title,exact:true,level:1}),section+'/'+id).toBeVisible();
    }
  }
  const keys = ['manage-permissions','overview.view','order.view','pre_order.view','product.view','faq.view','review.view','defaults.purchase',
    'barcode.view','business_locations.view','supplier.view','purchase.view','stock.view','user.view','expense.view','coupon.view','cms.view','pos.view','role.view',
    'pre_order.update','order.update','product.update','faq.create','barcode.generate','business_locations.update','stock.create','purchase.update','supplier.update',
    'coupon.update','expense.update','user.update','role.update','pos.update','report.order_status.view'];
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
});

test('warehouse can inspect lots and stock, with cost, reports and international scope enforced',async ({page}) => {
  await signIn(page,'4');
  await page.goto('/desk/inventory/stock');
  await expect(page.getByRole('heading',{name:'Stock',exact:true,level:1})).toBeVisible();
  await page.getByRole('table').getByRole('link',{name:/Fixture domestic case/}).click();
  await expect(page.getByRole('heading',{name:'Stock lots'})).toBeVisible();
  await expect(page.getByText('FIXTURE-LOT',{exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Cost per unit'})).toHaveCount(0);
  await page.goto('/desk/orders');
  await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  await page.goto('/desk/inventory/stock?region=INTERNATIONAL');
  await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  const csv = await page.request.get('/api/download?id=stock-valuation&format=csv');
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
  await expect(page.getByRole('table').getByText('In transit',{exact:true})).toBeVisible();
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
      await page.getByRole('button',{name:'Open navigation'}).click();
      await expect(page.getByRole('navigation',{name:'Primary navigation'})).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox',{name:'Search workspace'}).fill('warehouse');
    await expect(page.getByRole('link',{name:'Inventory'}).last()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({path:testInfo.outputPath('overview-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/desk/catalog/products');
  const { violations } = await new AxeBuilder({page}).analyze();
  expect(violations.filter(rule=>rule.impact==='serious'||rule.impact==='critical')).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('catalog-desktop.png'),fullPage:true});
});
