import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const desk = 'http://127.0.0.1:4327';
const api = 'http://127.0.0.1:38100/api/v1';
const category = '000000000000000000000001';
const subcategory = '000000000000000000000002';
const product = '000000000000000000000003';
const variant = '000000000000000000000005';

test.skip(process.env.GRIIP_ADMIN_MANAGED !== '1', 'Requires the isolated Step 7 backend profile');

test.beforeAll(async ({request}) => {
  await expect.poll(async () => {
    try { return (await request.get(api + '/growth/deals/BD',{timeout:2000})).status(); }
    catch { return 0; }
  },{timeout:20_000,message:'The isolated Step 7 API must be ready on loopback port 38100'}).toBe(200);
});

async function signIn(page: Page, staff = '1') {
  await page.goto(desk + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill('0100000000' + staff);
  await page.getByLabel('Password', {exact:true}).fill(fixturePassword());
  await page.getByRole('button', {name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/desk\/overview$/);
}

async function edit(page: Page, name: string) {
  await page.getByRole('button',{name,exact:true}).click();
  const dialog = page.getByRole('dialog',{name});
  await expect(dialog).toBeVisible();
  return dialog;
}

async function confirm(page: Page, dialog: Locator) {
  const response = page.waitForResponse(res => res.url() === desk + '/api/managed' && res.request().method() === 'POST', {timeout:10_000});
  await dialog.getByRole('button',{name:'Confirm',exact:true}).click();
  const saved = await response;
  expect(saved.status(),saved.ok() ? undefined : await saved.text()).toBe(200);
  await expect(dialog).toBeHidden();
  return (await saved.json()).id as string;
}

async function schedule(dialog: Locator) {
  await dialog.getByLabel('Starts (UTC)').fill('2026-01-01T00:00');
  await dialog.getByLabel('Ends (UTC)').fill('2099-01-01T00:00');
}

test('manage real campaigns, group tiers, collections, rewards and staff audit history', async ({page}) => {
  await signIn(page);
  await page.goto(desk + '/desk/markets/policy');
  const policyButton = page.getByRole('button',{name:/^(Configure|Edit) policy$/});
  await policyButton.click();
  const policy = page.getByRole('dialog');
  await policy.getByLabel('Enabled').selectOption('true');
  await confirm(page,policy);

  await page.goto(desk + '/desk/marketing/campaigns');
  const newCampaign = await edit(page,'New campaign');
  await newCampaign.getByLabel('Campaign name').fill('Fixture group launch');
  await newCampaign.getByLabel('Enabled').selectOption('true');
  await newCampaign.getByLabel('Exclusive').selectOption('true');
  await newCampaign.getByLabel('Group purchases only').selectOption('true');
  await newCampaign.getByLabel('Product scope').fill(JSON.stringify({variants:[variant]}));
  await newCampaign.getByLabel('Limits and promotional budget').fill('{"budgetMinor":10000}');
  await newCampaign.getByLabel('Variant allocations').fill(JSON.stringify([{variant,limit:3}]));
  await schedule(newCampaign);
  const campaign = await confirm(page,newCampaign);
  expect(campaign).toMatch(/^[a-f0-9]{24}$/);
  await page.getByRole('link',{name:'Fixture group launch'}).click();
  await page.getByRole('link',{name:'View performance'}).click();
  await expect(page.getByRole('heading',{name:'Campaign performance'})).toBeVisible();
  await expect(page.getByText('Estimated contribution')).toBeVisible();
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('checkbox',{name:'Select Fixture group launch'}).check();
  await page.getByRole('button',{name:'Export selected'}).click();
  expect((await exportDownload).suggestedFilename()).toBe('campaigns-selected.csv');

  await page.goto(desk + '/desk/marketing/groups');
  const group = await edit(page,'New group offer');
  await group.getByLabel('Product ID').fill(product);
  await group.getByLabel('Variant ID').fill(variant);
  await group.getByLabel('Participant tiers').fill(JSON.stringify([{threshold:2,campaign}]));
  await schedule(group);
  await confirm(page,group);
  await page.getByRole('link',{name:variant,exact:true}).click();
  await expect(page.getByText(/Revision 1/)).toBeVisible();
  const groupEdit = await edit(page,'Edit group offer');
  await groupEdit.getByLabel('Time limit in minutes').fill('6');
  await confirm(page,groupEdit);
  await expect(page.getByText(/Revision 2/)).toBeVisible();

  await page.goto(desk + '/desk/marketing/rewards');
  const rewards = await edit(page,'Configure policy');
  await rewards.getByLabel('Enabled').selectOption('true');
  await rewards.getByLabel('Points for a verified referral').fill('5');
  await confirm(page,rewards);
  await expect(page.getByRole('heading',{name:'Referral conversions'})).toBeVisible();
  const stale = await page.request.post(desk + '/api/managed', {headers:{origin:desk},
    data:{action:'rewards',market:'BD',values:{revision:null,enabled:true,pointsPerMajor:1,
      referralPoints:5,pointsPerCreditMinor:1,maxCreditMinor:100,tiers:[{name:'standard',earned:0}]}}});
  expect(stale.status()).toBe(409);

  await page.goto(desk + '/desk/content/collections');
  const shelf = await edit(page,'New collection');
  await shelf.getByLabel('Collection slug').fill('fixture-collection');
  await shelf.getByLabel('Collection name').fill('Fixture merchandising collection');
  await shelf.getByLabel('Ordered product IDs').fill(JSON.stringify([product]));
  await schedule(shelf);
  await confirm(page,shelf);
  await expect(page.getByRole('link',{name:'Fixture merchandising collection'})).toBeVisible();

  await page.goto(desk + '/desk/marketing/recommendations');
  const rules = await edit(page,'Edit recommendation rules');
  await rules.getByLabel('Enabled placements').fill('["home","deals"]');
  await confirm(page,rules);
  await expect(page.getByRole('heading',{name:'Placement performance'})).toBeVisible();

  await page.goto(desk + '/desk/markets/lists');
  const list = await edit(page,'New price list');
  await list.getByLabel('List slug').fill('fixture-price-list');
  await list.getByLabel('Price list name').fill('Fixture price schedule');
  await list.getByLabel('Starts (UTC)').fill('2026-01-01T00:00');
  await confirm(page,list);
  await page.getByRole('link',{name:'Fixture price schedule'}).click();
  const prices = await edit(page,'Schedule SKU prices');
  await prices.getByLabel('Price entries').fill(JSON.stringify([{product,variant,regularMinor:100000,startsAt:'2026-01-01T00:00:00Z'}]));
  await confirm(page,prices);
  await expect(page.getByRole('heading',{name:'Scheduled prices'})).toBeVisible();

  await page.goto(desk + '/desk/markets/history');
  for (const kind of ['group-offer','rewards-policy','collection']) {
    await expect(page.getByRole('cell',{name:kind,exact:true}).first()).toBeVisible();
  }
});

test('catalog drafts and supplier jobs use the catalog API and existing inventory', async ({page}) => {
  await signIn(page);
  await page.goto(desk + '/desk/catalog/listing-studio');
  const draft = await edit(page,'Create product draft');
  await draft.getByLabel('Product SKU').fill('STEP8-PRODUCT');
  await draft.getByLabel('Product name').fill('Fixture admin catalog draft');
  await draft.getByLabel('Description').fill('Synthetic description for Step 8.');
  await draft.getByLabel('Delivery estimate').fill('Five days');
  await draft.getByLabel('Category ID',{exact:true}).fill(category);
  await draft.getByLabel('Subcategory ID').fill(subcategory);
  const id = await confirm(page,draft);
  await page.goto(desk + '/desk/catalog/listing-studio?record=' + id);
  const addVariant = await edit(page,'Add variant');
  await addVariant.getByLabel('Variant SKU').fill('STEP8-PRODUCT-BLUE');
  await confirm(page,addVariant);
  const price = await edit(page,'Price STEP8-PRODUCT-BLUE');
  await price.getByLabel('Regular price').fill('1050.50');
  await confirm(page,price);
  await expect(page.getByRole('cell',{name:'1050.5',exact:true})).toBeVisible();

  const png = await sharp({create:{width:96,height:96,channels:3,background:'#aabbcc'}}).png().toBuffer();
  await page.getByLabel('Catalog image').setInputFiles({name:'gallery.png',mimeType:'image/png',buffer:png});
  await page.getByRole('button',{name:'Upload image',exact:true}).click();
  const asset = page.getByLabel('New gallery asset ID');
  await expect(asset).toHaveValue(/^[a-f0-9]{64}$/);
  const details = await edit(page,'Edit draft');
  await details.getByLabel('Gallery asset IDs').fill(JSON.stringify([await asset.inputValue()]));
  await confirm(page,details);
  const distribution = await edit(page,'Edit market coverage');
  await distribution.getByLabel('Product region').selectOption('BD');
  await distribution.getByLabel('Sales channels').fill('{"website":true,"pos":false}');
  await confirm(page,distribution);
  await confirm(page,await edit(page,'Submit'));
  await confirm(page,await edit(page,'Approve'));
  await confirm(page,await edit(page,'Publish'));
  await expect(page.getByText('published · ' + id,{exact:true})).toBeVisible();

  await page.goto(desk + '/desk/catalog/taxonomy');
  await expect(page).toHaveURL(/\/desk\/catalog\/categories\?/);
  const taxonomy = await edit(page,'Add top level category');
  await taxonomy.getByLabel('English name').fill('Fixture admin category');
  await taxonomy.getByLabel('Bangla name').fill('নমুনা বিভাগ');
  await taxonomy.getByLabel('English description').fill('Synthetic English label');
  await taxonomy.getByLabel('Bangla description').fill('নমুনা বর্ণনা');
  await expect(taxonomy.getByLabel('Storefront slug')).toHaveValue('fixture-admin-category');
  await taxonomy.getByRole('button',{name:'Create category'}).click();
  await expect(page.getByRole('status')).toHaveText('Category created.');
  const child = await edit(page,'Add child category');
  await expect(child.getByText('Under Fixture admin category')).toBeVisible();
  await child.getByRole('button',{name:'Cancel'}).click();

  const login = await page.request.post(api + '/user/admin/login',{data:{phone_number:'01000000001',password:fixturePassword()}});
  expect(login.status()).toBe(200);
  const token = (await login.json()).data.access_token;
  const supplier = await page.request.post(api + '/catalog/suppliers',{headers:{Authorization:'Bearer '+token},
    data:{name:'Fixture sourcing supplier',contact_id:8765432,profile:{country:'CN'}}});
  expect(supplier.status(),await supplier.text()).toBe(201);
  await page.goto(desk + '/desk/inventory/imports');
  await page.getByRole('link',{name:'Fixture sourcing supplier'}).click();
  await page.getByLabel('Supplier feed').setInputFiles({
    name:'step8-approved.csv',mimeType:'text/csv',
    buffer:Buffer.from('source_product_id,source_variant_id,name,product_sku,variant_sku,cost,currency\nSTEP8-BD,BLUE,Sample source,FIXTURE-BD,FIXTURE-BD-BLUE,4,CNY\n'),
  });
  await page.getByLabel('This feed is approved for this supplier').check();
  await page.getByRole('button',{name:'Queue import'}).click();
  await expect(page).toHaveURL(/record=[a-f0-9]{24}$/);
  await expect.poll(async () => {
    await page.reload();
    return page.getByRole('cell',{name:'Completed',exact:true}).count();
  },{timeout:15_000}).toBe(1);
  await expect(page.getByRole('heading',{name:'Row outcomes'})).toBeVisible();

  await page.goto(desk + '/desk/inventory/managed-stock');
  const warehouse = await edit(page,'Add warehouse');
  await warehouse.getByLabel('Warehouse name').fill('Fixture Shenzhen warehouse');
  await warehouse.getByLabel('Warehouse slug').fill('fixture-shenzhen-admin');
  await warehouse.getByLabel('Country code').fill('CN');
  await warehouse.getByLabel('Street address').fill('Synthetic warehouse address');
  await confirm(page,warehouse);
  await page.getByRole('link',{name:'Fixture Shenzhen warehouse'}).click();
  const bin = await edit(page,'Add storage bin');
  await bin.getByLabel('Bin code').fill('AISLE-2');
  await bin.getByLabel('Bin name').fill('Fixture storage bin');
  await confirm(page,bin);
  await expect(page.getByRole('cell',{name:'Fixture storage bin'})).toBeVisible();

  for (const [path, title] of [
    ['/desk/inventory/managed-purchases','Purchase orders'],
    ['/desk/shipping/sourcing','China sourcing'],
    ['/desk/shipping/shipment-desk','Shipment desk'],
    ['/desk/payments/payment-desk','Payment desk'],
    ['/desk/markets/coverage','Delivery and payments'],
    ['/desk/markets/lists','Price lists'],
  ]) {
    await page.goto(desk + path);
    await expect(page.getByRole('heading',{name:title,level:1})).toBeVisible();
  }
});

test('managed payment evidence and courier actions follow one checkout order', async ({page}) => {
  await signIn(page);
  await page.goto(desk + '/desk/markets/coverage');
  await page.getByRole('button',{name:/^(Configure|Edit) policy$/}).click();
  const coverage = page.getByRole('dialog');
  await coverage.getByLabel('Payment methods').fill(JSON.stringify({
    cod:{provider:'cod',enabled:true,mode:'sandbox'},
    manual:{provider:'manual',enabled:true,mode:'sandbox',advanceBps:2500,manualMethods:['bank-transfer']},
  }));
  await coverage.getByLabel('Shipping services').fill(JSON.stringify([
    {service:'domestic',provider:'steadfast',origin:'BD',enabled:true,base:800,perKg:0},
  ]));
  await confirm(page,coverage);

  const headers: Record<string,string> = {};
  async function post(path: string, data: object, status = 200) {
    const response = await page.request.post(api + path,{headers,data});
    expect(response.status(),await response.text()).toBe(status);
    return (await response.json()).data;
  }
  async function order() {
    delete headers['X-Cart-Token'];
    const opened = await post('/checkout/cart',{market:'BD'});
    headers['X-Cart-Token'] = opened.token;
    const response = await page.request.put(api + '/checkout/cart/items/' + variant,{headers,
      data:{cartId:opened.cart.id,revision:opened.cart.revision,product,quantity:1}});
    expect(response.status(),await response.text()).toBe(200);
    const { cart } = (await response.json()).data;
    const input = {cartId:cart.id,revision:cart.revision,delivery:{country:'BD',name:'Fixture buyer',phone:'01000000567',street:'Fixture street',city:'Dhaka',region:'Dhaka'}};
    const quote = await post('/checkout/quote',input);
    return await post('/checkout/orders',{...input,key:randomUUID(),quoteRevision:quote.quoteRevision},201);
  }
  const manual = await order();
  const reference = 'STEP8-' + randomUUID().slice(0,8).toUpperCase();
  const png = await sharp({create:{width:60,height:60,channels:3,background:'#aabbcc'}}).png().toBuffer();
  const submit = await page.request.post(api + '/global/orders/' + manual.id + '/payments',{headers,multipart:{
    key:randomUUID(),revision:String(manual.revision),method:'manual',phone:'01000000567',manualMethod:'bank-transfer',
    reference,receipt:{name:'receipt.png',mimeType:'image/png',buffer:png},
  }});
  expect(submit.status(),await submit.text()).toBe(200);
  const advance = (await submit.json()).data.payment;
  await page.goto(desk + '/desk/payments/payment-desk?order=' + manual.id + '&record=' + advance.id);
  const receipt = await page.getByRole('link',{name:'Download private receipt'}).getAttribute('href');
  const download = await page.request.get(desk + receipt);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toBe('image/jpeg');
  const review = await edit(page,'Review payment');
  await review.getByLabel('Decision').selectOption('approve');
  await review.getByLabel('Review reason').fill('Verified synthetic receipt');
  await review.getByLabel('Verified receipt reference').fill('WRONG-REF');
  await review.getByLabel('Verified receipt amount (minor units)').fill(String(advance.amount));
  await review.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(review.getByRole('alert')).toContainText('matching receipt reference');
  await review.getByLabel('Verified receipt reference').fill(reference);
  await confirm(page,review);
  await expect(page.getByRole('cell',{name:'staff_review',exact:true})).toBeVisible();

  const codOrder = await order();
  const cod = (await post('/global/orders/' + codOrder.id + '/payments',{key:randomUUID(),revision:codOrder.revision,method:'cod'})).payment;
  await page.goto(desk + '/desk/payments/payment-desk?order=' + codOrder.id + '&record=' + cod.id);
  const verify = await edit(page,'Review payment');
  await verify.getByLabel('Decision').selectOption('approve');
  await verify.getByLabel('Review reason').fill('Verified synthetic COD');
  await confirm(page,verify);

  await page.goto(desk + '/desk/shipping/shipment-desk?order=' + codOrder.id);
  const booking = await edit(page,'Plan shipment');
  await booking.getByLabel('Warehouse ID').fill('000000000000000000000007');
  await booking.getByLabel('Configured shipping service').fill('domestic');
  await booking.getByLabel('Order lines').fill(JSON.stringify([{id:codOrder.lines[0].id,quantity:1}]));
  const shipment = await confirm(page,booking);
  await page.getByRole('link',{name:shipment,exact:true}).click();
  await confirm(page,await edit(page,'Pick shipment'));
  await confirm(page,await edit(page,'Pack shipment'));
  await confirm(page,await edit(page,'Dispatch shipment'));
  await confirm(page,await edit(page,'Sync Steadfast tracking'));
  await expect(page.getByRole('heading',{name:'Tracking history'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'Delivered',exact:true}).first()).toBeVisible();
});

test('managed writes deny restricted staff, missing sessions, cross-origin callers and unsupported actions', async ({page,request}) => {
  const data = {action:'rewards',market:'BD',values:{}};
  const anonymous = await request.post(desk + '/api/managed',{headers:{origin:desk},data});
  expect(anonymous.status()).toBe(401);
  await signIn(page,'4');
  await page.goto(desk + '/desk/marketing/campaigns');
  await expect(page.getByRole('heading',{name:'Access restricted'})).toBeVisible();
  const denied = await page.request.post(desk + '/api/managed',{headers:{origin:desk},data});
  expect(denied.status()).toBe(403);
  const receipt = await page.request.get(desk + '/api/managed?receipt=000000000000000000000003');
  expect(receipt.status()).toBe(403);

  await page.context().clearCookies();
  await signIn(page);
  const crossSite = await page.request.post(desk + '/api/managed',{headers:{origin:'https://cross-origin.invalid'},data});
  expect(crossSite.status()).toBe(403);
  const unsupported = await page.request.post(desk + '/api/managed',{headers:{origin:desk},data:{...data,action:'proxy'}});
  expect(unsupported.status()).toBe(400);
  const providerMode = await page.request.post(desk + '/api/managed',{headers:{origin:desk},data:{
    action:'coverage',market:'BD',values:{revision:null,methods:{stripe:{provider:'stripe',enabled:true,mode:'production'}},zones:[]},
  }});
  expect(providerMode.status()).toBe(422);
});
