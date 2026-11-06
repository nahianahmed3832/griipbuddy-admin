import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const fixture = 'http://127.0.0.1:4327';
const store = 'http://127.0.0.1:4326';
const origin = { Origin:fixture };
const country = '000000000000000000000013';
async function admin(page: Page) {
  await page.goto(fixture+'/sign-in');
  await page.getByLabel('Staff email or phone number').fill('01000000001');
  await page.getByLabel('Password',{exact:true}).fill(fixturePassword());
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(fixture+'/desk/overview');
}

test('country activation and currency edit update the same recovered country record',async ({page}) => {
  await admin(page);
  await page.goto(fixture+'/desk/markets/countries/'+country);
  await page.getByRole('button',{name:'Edit market'}).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Currency').selectOption('EUR');
  await modal.getByLabel('Country status').selectOption('false');
  const response = page.waitForResponse(r=>r.url().endsWith('/api/market'));
  await modal.getByRole('button',{name:'Save changes'}).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('dd').getByText('EUR',{exact:true})).toBeVisible();
  await expect(page.locator('dd').getByText('Inactive',{exact:true})).toBeVisible();
  expect((await page.request.post(fixture+'/api/market',{headers:{Origin:'https://cross-site.invalid'},data:{id:country,currency:'USD',isActive:true}})).status()).toBe(403);
  expect((await page.request.post(fixture+'/api/market',{headers:origin,data:{id:country,currency:'USD',isActive:true}})).status()).toBe(200);
});

test('market checkout settings persist, affect the existing engine, and reject stale writes',async ({page}) => {
  await admin(page);
  await page.goto(fixture+'/desk/payments/checkout');
  const us = page.locator('.checkout-card').filter({has:page.getByRole('heading',{name:'United States',exact:true})});
  await us.getByRole('checkbox',{name:/PayPal/}).uncheck();
  const save = page.waitForResponse(r=>r.url().endsWith('/api/checkout')&&r.request().method()==='POST');
  await us.getByRole('button',{name:'Save settings'}).click();
  expect((await save).status()).toBe(200);
  await expect(page.getByText('settings updated',{exact:true})).toBeVisible();
  expect((await page.request.post(fixture+'/api/checkout',{headers:origin,data:{action:'settings',revision:0,fallback:'GB'}})).status()).toBe(409);
  await page.goto(fixture+'/desk/markets/checkout');
  const shipping = page.locator('.checkout-card').filter({has:page.getByRole('heading',{name:'United States',exact:true})});
  await shipping.getByLabel(/Shipping fee/).fill('1200');
  const setFee = page.waitForResponse(r=>r.url().endsWith('/api/checkout')&&r.request().method()==='POST');
  await shipping.getByRole('button',{name:'Save settings'}).click();
  expect((await setFee).status()).toBe(200);
  const quote = await page.request.post(store+'/api/cart/quote',{data:{market:'US',lines:[
    {productId:'fixture-form-case',variantId:'form-case-std',slug:'form-case',quantity:1},
  ]}});
  expect((await quote.json()).shipping).toEqual({status:'estimated',amount:1200});
  const unsafe = await page.request.get(store+'/api/checkout/admin');
  expect(unsafe.status()).toBe(403);
});

test('manual receipt review is private and approves only the matching evidence',async ({page},testInfo) => {
  await admin(page);
  await page.request.post(store+'/api/checkout/session');
  const lines = [{productId:'fixture-form-case',variantId:'form-case-std',slug:'form-case',quantity:1}];
  const quote = await page.request.post(store+'/api/cart/quote',{data:{market:'BD',lines}}).then(r=>r.json());
  const reference = 'STEP8-TEST-'+randomUUID();
  const image = await sharp({create:{width:20,height:12,channels:3,background:'white'}}).png().toBuffer();
  const payload = {
    key:randomUUID(),method:'manual',market:'BD',lines,reference,paymentPhone:'01000000021',
    delivery:{name:'Test Recipient',phone:'01000000021',street:'123 Fixture Avenue',city:'Dhaka',region:'Dhaka',postal:'1207'},
    review:{currency:quote.currency,total:quote.estimatedTotal,shipping:quote.shipping.amount,coupon:quote.couponDiscount,
      lines:quote.lines.map((line:{productId:string;variantId:string;quantity:number;unit:number})=>[line.productId,line.variantId,line.quantity,line.unit])},
  };
  const placed = await page.request.post(store+'/api/checkout/place',{multipart:{payload:JSON.stringify(payload),receipt:{name:'proof.png',mimeType:'image/png',buffer:image}}});
  expect(placed.status(),await placed.text()).toBe(201);
  const {order} = await placed.json();
  expect(order.status).toBe('awaiting-review');
  await page.goto(fixture+'/desk/payments/checkout');
  await page.getByRole('row').filter({hasText:order.number}).getByRole('button',{name:'Review receipt'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('01000000021',{exact:true})).toBeVisible();
  const privateHref = await dialog.getByRole('link',{name:'Download private receipt'}).getAttribute('href');
  expect((await page.request.get(fixture+privateHref)).headers()['content-type']).toBe('image/jpeg');
  await dialog.getByLabel('Verified transaction reference').fill('MISMATCH');
  await dialog.getByLabel(/Verified amount/).fill(String(order.advanceDue));
  await dialog.getByRole('button',{name:'Verify receipt'}).click();
  await expect(dialog.getByText(/does not match/)).toBeVisible();
  await dialog.getByLabel('Verified transaction reference').fill(reference);
  await dialog.getByRole('button',{name:'Verify receipt'}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('approve receipt',{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('payments-desktop.png'),fullPage:true});
  const verified = await page.request.get(store+'/api/checkout/order?id='+order.id).then(r=>r.json());
  expect(verified.order.payment).toBe('advance-verified');
});
