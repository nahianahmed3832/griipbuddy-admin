import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const admin = 'http://127.0.0.1:4327';
const storefront = 'http://127.0.0.1:4328';
const api = 'http://127.0.0.1:38100/api/v1';
const lines = [{ productId:'000000000000000000000003', variantId:'000000000000000000000005', quantity:1 }];

test.skip(process.env.GRIIP_ADMIN_INTEGRATED !== '1' || process.env.GRIIP_ADMIN_MANAGED !== '1',
  'Requires both admin profiles and the isolated Step 9 storefront and API.');

async function signIn(page: Page, suffix = '1') {
  await page.goto(admin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill('0100000000' + suffix);
  await page.getByLabel('Password', {exact:true}).fill(fixturePassword());
  await page.getByRole('button', {name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/desk\/overview$/);
}

test('managed policy, storefront order, Overview and private receipt share one Step 9 record', async ({ page, browser, request }) => {
  await signIn(page);
  await page.goto(admin + '/desk/markets/checkout');
  const market = page.locator('form').filter({ has:page.getByRole('heading',{name:'Bangladesh · BDT'}) });
  await market.getByRole('spinbutton',{name:'Shipping in minor units'}).fill('9123');
  await market.getByRole('button',{name:'Save market checkout'}).click();
  await expect(market.getByRole('status')).toHaveText('Saved.');

  const blocked = await page.request.post(admin + '/api/managed',{headers:{origin:admin},
    data:{ action:'coverage', market:'BD', values:{ revision:null, methods:{}, zones:[] } }});
  expect(blocked.status()).toBe(403);

  await page.goto(admin + '/desk/markets/policy');
  await page.getByRole('button',{name:/^(Configure|Edit) policy$/}).click();
  const policy = page.getByRole('dialog');
  await policy.getByLabel('Enabled').selectOption('true');
  await policy.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(policy).toBeHidden();
  const quote = await request.post(api + '/commerce/quote',{data:{ market:'BD', lines }});
  expect(quote.status(),await quote.text()).toBe(200);
  const review = (await quote.json()).data;
  expect(review.shipping).toBe(9123);
  expect((await (await request.get(api + '/commerce/market/BD')).json()).data.centralPricing).toBe(true);

  const customer = await browser.newContext();
  try {
    const buyer = await customer.request.post(storefront + '/api/account/login',{data:{
      phone:'01000000002', password:fixturePassword(),
    }});
    expect(buyer.status(),await buyer.text()).toBe(200);
    const reference = 'STEP9-' + randomUUID().slice(0,8);
    const payload = { key:randomUUID(), market:'BD', method:'manual', lines, review, reference,
      paymentPhone:'01000000002', delivery:{ name:'Step 9 fixture customer', phone:'01000000002', street:'Fixture Street',
        city:'Dhaka', region:'Dhaka', postal:'' }};
    const png = await sharp({ create:{ width:32, height:32, channels:3, background:'#cef' } }).png().toBuffer();
    const place = () => customer.request.post(storefront + '/api/checkout/place',{ multipart:{
      payload:JSON.stringify(payload), receipt:{ name:'fixture-receipt.png', mimeType:'image/png', buffer:png },
    }});
    const placed = await place();
    expect(placed.status(),await placed.text()).toBe(201);
    const order = (await placed.json()).order;
    expect(order.status).toBe('awaiting-review');
    const replay = await place();
    expect(replay.status()).toBe(200);
    expect((await replay.json()).order.id).toBe(order.id);
    const cod = await customer.request.post(storefront + '/api/checkout/place',{ data:{
      key:randomUUID(), market:'BD', method:'cod', lines, review, delivery:payload.delivery,
    }});
    expect(cod.status(),await cod.text()).toBe(201);

    await page.goto(admin + '/desk/overview?period=7&refresh=1');
    for (const section of ['Needs attention','Sales','Fulfilment','Inventory','Money','Pre-orders']) {
      await expect(page.getByRole('heading',{name:section,exact:true})).toBeVisible();
    }
    await expect(page.getByRole('link',{name:'Fixture domestic case',exact:true})).toBeVisible();
    const locations = page.locator('.overview-locations');
    await locations.locator('summary').click();
    await locations.getByRole('checkbox',{name:'Fixture warehouse',exact:true}).check();
    await page.getByLabel('Compare with previous period').uncheck();
    await page.getByRole('button',{name:'Apply filters',exact:true}).click();
    await expect(page).toHaveURL(/location=/);
    await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
    await expect(page.getByText(/compared with/)).toHaveCount(0);
    await page.goto(admin + '/desk/overview?period=7&refresh=1');
    const evidence = process.env.GRIIP_ADMIN_TEST_EVIDENCE;
    if (evidence) {
      mkdirSync(evidence,{recursive:true});
      await page.setViewportSize({width:1536,height:960});
      await page.screenshot({path:join(evidence,'overview-desktop.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:join(evidence,'overview-mobile.png'),fullPage:true});
      await page.setViewportSize({width:1280,height:900});
    }
    await page.getByRole('link',{name:/Payments to verify/}).click();
    const record = page.locator('a[href$="/' + order.id + '?region=BD"]');
    await expect(record).toBeVisible();
    await record.click();
    await expect(page.getByRole('link',{name:'Manage payments'})).toHaveCount(0);
    await page.goto(admin + '/desk/payments/payment-desk?order=' + order.id);
    await expect(page.getByRole('link',{name:'Open order operations'})).toBeVisible();
    await page.getByRole('link',{name:'Review checkout receipt'}).click();
    await expect(page.getByLabel('Order record ID')).toHaveValue(order.id);
    await page.getByRole('button',{name:'Find receipt'}).click();
    await expect(page.getByText('Submitted reference ' + reference,{exact:false})).toBeVisible();
    const image = await page.request.get(admin + '/api/commerce?receipt=' + order.id);
    expect(image.headers()['content-type']).toBe('image/jpeg');

    const restricted = await browser.newPage();
    try {
      await signIn(restricted,'3');
      expect((await restricted.request.get(admin + '/api/commerce?receipt=' + order.id)).status()).toBe(403);
    } finally { await restricted.close(); }

    await page.getByLabel('Verified transaction reference').fill(reference);
    await page.getByLabel('Verified advance in minor units').fill(String(order.advanceDue));
    await page.getByRole('button',{name:'Approve advance'}).click();
    await expect(page.getByRole('status')).toHaveText('Advance verified.');
    const buyerOrder = await customer.request.get(storefront + '/api/checkout/order?id=' + order.id);
    expect((await buyerOrder.json()).order.payment).toBe('advance-verified');
    await page.goto(admin + '/desk/overview?period=7&refresh=1');
    await page.getByRole('link',{name:/Payments to verify/}).click();
    await expect(page.locator('a[href$="/' + order.id + '?region=BD"]')).toHaveCount(0);
  } finally { await customer.close(); }
});

test('pre-order search, filters and record detail use the original workflow data', async ({page,request}) => {
  const customer = 'Fixture pre-order ' + randomUUID().slice(0,8);
  const create = await request.post(api + '/pre-order',{data:{
    source_type:'EXTERNAL', reference:{product_name:'Fixture imported case'}, quantity:2,
    customer_name:customer, customer_phone:'01000000002', delivery_address:{address:'Fixture address'},
  }});
  expect(create.status(),await create.text()).toBe(201);
  const order = (await create.json()).data;
  await signIn(page);
  await page.getByRole('link',{name:/Pre-orders to act on/}).click();
  await expect(page.getByLabel('Pre-order status')).toHaveValue('ACTION_REQUIRED');
  await expect(page.getByRole('cell',{name:customer,exact:true})).toHaveCount(0);
  await page.getByLabel('Search records').fill(customer);
  await page.getByLabel('Pre-order status').selectOption('REQUESTED');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.getByRole('cell',{name:customer,exact:true})).toBeVisible();
  await page.locator('a[href$="/' + order._id + '?region=BD"]').click();
  await expect(page.getByRole('heading',{name:'Quote and delivery'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'Fixture imported case',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Pre-order activity'})).toBeVisible();
});
