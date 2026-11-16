export const currencies = ['BDT', 'USD', 'EUR', 'AUD'] as const;
export type Choice = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  kind?: 'text' | 'long' | 'number' | 'boolean' | 'choice' | 'lines' | 'url' | 'json';
  required?: boolean;
  defaultValue?: string;
  choices?: readonly Choice[];
  max?: number;
};
export type EditorFields = readonly Field[];

export const statusOptions = (values: readonly string[]) => values.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
const active: Field = { name: 'is_active', label: 'Active', kind: 'boolean', defaultValue: 'true' };
export const registries = {
  brands: { title: 'Brand', fields: [
    { name: 'name', label: 'Brand name', required: true }, { name: 'tags', label: 'Tags', kind: 'lines' }, active,
  ] },
  faqs: { title: 'FAQ', fields: [
    { name: 'product', label: 'Product', required: true }, { name: 'question', label: 'Question', required: true },
    { name: 'answer', label: 'Answer', kind: 'long', required: true, max: 5000 },
    { name: 'status', label: 'Status', kind: 'choice', choices: statusOptions(['active', 'pending', 'inactive']), defaultValue: 'active' },
  ] },
  reviews: { title: 'Review', fields: [
    { name: 'rating', label: 'Rating', kind: 'choice', choices: statusOptions(['1', '2', '3', '4', '5']), required: true },
    { name: 'title', label: 'Title', max: 100 }, { name: 'content', label: 'Review', kind: 'long', required: true, max: 5000 },
  ] },
  policies: { title: 'Return policy', fields: [
    { name: 'title', label: 'Title', required: true }, { name: 'description', label: 'Description', kind: 'long', required: true, max: 5000 },
    { name: 'return_period_days', label: 'Return period (days)', kind: 'number', required: true, defaultValue: '7' },
    { name: 'conditions', label: 'Conditions', kind: 'lines' }, active,
  ] },
  countries: { title: 'Country', fields: [
    { name: 'name', label: 'Country name', required: true }, { name: 'code', label: 'Country code', required: true, max: 3 },
    { name: 'currency', label: 'Currency', kind: 'choice', required: true, choices: currencies.map(value => ({value, label:value})) },
    { name: 'currency_symbol', label: 'Currency symbol', max: 12 }, { name: 'flag_emoji', label: 'Flag emoji', max: 16 },
    { name: 'serial', label: 'Display order', kind: 'number' }, active,
  ] },
} satisfies Record<string, { title: string; fields: EditorFields }>;
export type Registry = keyof typeof registries;
export const registryKind = (value: string): value is Registry => Object.hasOwn(registries, value);

export const productFields: EditorFields = [
  { name: 'name', label: 'Product name', required: true }, { name: 'sku', label: 'Product SKU', required: true },
  { name: 'description', label: 'Description', kind: 'long', required: true, max: 30000 },
  { name: 'thumbnail', label: 'Thumbnail URL', kind: 'url' }, { name: 'slider_images', label: 'Gallery image URLs', kind: 'lines' },
  { name: 'short_videos', label: 'Short video URLs', kind: 'lines' },
  { name: 'approximately_delivery_time', label: 'Delivery estimate', required: true },
  { name: 'min_order_qty', label: 'Minimum order quantity', kind: 'number', defaultValue: '1' },
  { name: 'max_order_qty', label: 'Maximum order quantity', kind: 'number', defaultValue: '100' },
  { name: 'shipping_cost', label: 'Shipping cost', kind: 'number', defaultValue: '80' },
  { name: 'shipping_cost_per_unit', label: 'Shipping cost per unit', kind: 'number', defaultValue: '0' },
  { name: 'coin_per_order', label: 'Coins per order', kind: 'number', defaultValue: '0' },
  { name: 'is_free_delivery', label: 'Free delivery', kind: 'boolean' },
  { name: 'warranty', label: 'Warranty', defaultValue: '0' },
  { name: 'search_tags', label: 'Search tags', kind: 'lines' }, { name: 'offer_tags', label: 'Offer tags', kind: 'lines' },
  { name: 'facebook', label: 'Facebook URL', kind: 'url' }, { name: 'instagram', label: 'Instagram URL', kind: 'url' },
  { name: 'youtube', label: 'YouTube URL', kind: 'url' }, { name: 'tiktok', label: 'TikTok URL', kind: 'url' },
  { name: 'dynamic_specs', label: 'Specifications (JSON)', kind: 'json', max: 12000 },
  { name: 'website', label: 'Website', kind: 'boolean', defaultValue: 'true' },
  { name: 'pos', label: 'Point of sale', kind: 'boolean' },
  { name: 'is_published', label: 'Published', kind: 'boolean' },
];
