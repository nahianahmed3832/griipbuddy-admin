import { ApiError, arr, mongoId, obj, str, type RecordData } from './api';

import { couponAmounts, couponScopes } from './promotion-fields';

const invalid = (message: string): never => { throw new ApiError(400, message); };
const formText = (value: unknown, max: number) => str(value).trim().slice(0, max);
function references(value: unknown, label: string) {
  const ids = [...new Set((Array.isArray(value) ? arr(value).map(str) : str(value).split(/[\s,]+/))
    .filter(Boolean).map(id => id.toLowerCase()))];
  if (ids.length > 100 || ids.some(id => !mongoId(id))) invalid('Enter up to 100 valid references for ' + label + '.');
  return ids;
}
function numeric(value: unknown, label: string, min: number, max: number, whole = false) {
  const raw = typeof value === 'number' ? String(value) : str(value).trim();
  const number = Number(raw);
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || number < min || number > max || (whole && !Number.isInteger(number))) invalid('Enter a valid ' + label.toLowerCase() + '.');
  return number;
}
function date(value: unknown, label: string) {
  const text = str(value).trim();
  const stamp = Date.parse(text);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text) || !Number.isFinite(stamp)) invalid('Enter a valid ' + label + '.');
  return new Date(stamp).toISOString();
}
export function couponPayload(values: RecordData) {
  const code = str(values.code).trim().toUpperCase();
  if (!/^[A-Z\d_-]{1,40}$/.test(code)) invalid('Enter a coupon code using letters, numbers, dashes or underscores.');
  const discountType = values.discountType;
  if (discountType !== 'PERCENTAGE' && discountType !== 'FLAT') invalid('Choose a discount type.');
  const amounts: Record<string, number | null> = {};
  for (const [key, label] of couponAmounts) {
    amounts[key] = key !== 'discountValue' && (values[key] === '' || values[key] == null) ? null
      : numeric(values[key], label, key === 'discountValue' ? 0.01 : 0, key === 'discountValue' && discountType === 'PERCENTAGE' ? 100 : 99999999, key.startsWith('usage'));
  }
  const startAt = values.startAt ? date(values.startAt, 'start date') : null;
  const expireAt = values.expireAt ? date(values.expireAt, 'expiry date') : null;
  if (startAt && expireAt && expireAt <= startAt) invalid('The expiry must be after the start.');
  if (amounts.usagePerUser && amounts.usageLimit && amounts.usagePerUser > amounts.usageLimit) invalid('Per customer usage cannot exceed the total limit.');
  if (discountType === 'FLAT' && amounts.maxDiscountAmount !== null && amounts.maxDiscountAmount < (amounts.discountValue ?? 0)) invalid('The cap cannot be lower than the flat discount.');
  return { code, description: formText(values.description, 500), discountType, ...amounts, startAt, expireAt,
    ...Object.fromEntries(couponScopes.map(([key, label]) => [key, references(values[key], label)])), firstOrderOnly: values.firstOrderOnly === true };
}
export function offerPayload(values: RecordData) {
  const discountPercentage = numeric(values.discountPercentage, 'Discount percentage', 0, 100);
  const freeDelivery = values.freeDelivery === true;
  if (!discountPercentage && !freeDelivery) invalid('Set a discount or enable free delivery.');
  const applied_subcategory = references(values.applied_subcategory, 'offer subcategories');
  if (!applied_subcategory.length) invalid('Select at least one subcategory.');
  const header = obj(values.header);
  const mode = values.mode;
  if (mode !== 'countdown' && mode !== '12h_timer' && mode !== '24h_timer') invalid('Choose a timer mode.');
  function required(value: unknown, label: string, max: number) {
    return formText(value, max) || invalid('Enter ' + label + '.');
  }
  return {
    offer_start_date: date(values.offer_start_date, 'offer start date'),
    validFor: numeric(values.validFor, 'Offer duration', 1, 3650, true),
    discountPercentage, freeDelivery, specialSaleActive: values.specialSaleActive === true,
    navbar_label: required(values.navbar_label, 'a navigation label', 20), applied_subcategory,
    pageConf: { title: required(values.title, 'an offer title', 150),
      header: { label: required(header.label, 'a header label', 80), title_1: required(header.title_1, 'the first heading', 120),
        title_2: required(header.title_2, 'the second heading', 120), description: required(header.description, 'a description', 500),
        button_label: required(header.button_label, 'a button label', 80) },
      timer_config: { mode, show_timer: values.show_timer === true } },
  };
}
