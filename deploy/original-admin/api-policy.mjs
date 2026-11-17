const prefix = '/api/v1/';
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

// Route families used by the preserved admin's browser bundle.
const originalFamilies = new Set([
  'analytics', 'assigned-orders', 'barcode', 'brand', 'business-location',
  'category', 'cms', 'country', 'coupon', 'expense', 'expense-category',
  'expense-subcategory', 'faq', 'order', 'payment-source', 'permissions',
  'pos', 'pre-order', 'product', 'purchase', 'repeat-customer', 'report',
  'return-policy', 'review', 'roles', 'sales-channel', 'stocks',
  'sub-category', 'supplier', 'upload', 'user',
]);

// The isolated API also serves the storefront and newer staff workspace.
const outsideAdmin = {
  'business-location': /^(?:public|workspace)(?:\/|$)/,
  cms: /^(?:site-content|admin\/workspace)(?:\/|$)/,
  coupon: /^(?:validate|public)(?:\/|$)/,
  faq: /^public(?:\/|$)/,
  order: /^(?:customer|track|track-by-sl|user|workspace)(?:\/|$)/,
  'pre-order': /^(?:track|upload-image|workspace)(?:\/|$)/,
  product: /^(?:public|recommended|search-by)(?:\/|$)/,
  review: /^(?:public(?:\/|$)|[^/]+\/helpful$)/,
  stocks: /^(?:manual(?:\/|$)|debug-|workspace(?:\/|$))/,
  user: /^(?:register|verify-otp|login|admin\/register|customer\/favorite|update\/log-in-user-info)(?:\/|$)/,
};

const mutationPermissions = {
  POST: [
    [/^(?:brand|country)$/, 'product.create'],
    [/^country\/seed\/defaults$/, 'product.view'],
  ],
  PATCH: [
    [/^(?:product\/(?:variant\/)?|(?:brand|category|country)\/)[^/]+$/, 'product.update'],
    [/^sub-category\/(?:sub-subcategory\/|third-subcategory\/)?[^/]+$/, 'product.update'],
    [/^return-policy\/[^/]+$/, 'product.create'],
    [/^(?:product\/admin\/publish\/[^/]+|return-policy\/[^/]+\/toggle-status)$/, 'product.view'],
  ],
  DELETE: [
    [/^(?:product|brand|category|country|return-policy)\/[^/]+$/, 'product.view'],
    [/^sub-category\/(?:sub-subcategory\/|third-subcategory\/)?[^/]+$/, 'product.view'],
  ],
};

function originalRoute(path) {
  if (!path.startsWith(prefix)) return;
  try {
    return decodeURIComponent(path.slice(prefix.length)).toLowerCase().replace(/\/$/, '');
  } catch {
    return;
  }
}

export function allowedOriginalApiPath(path, method) {
  const original = originalRoute(path);
  if (!original || !methods.has(method)) return false;

  const [family, ...parts] = original.split('/');
  const route = parts.join('/');
  if (family === 'global') {
    const payment = /^admin\/payments\/[a-f0-9]{24}(?:\/receipt)?$/;
    const review = /^admin\/payments\/[a-f0-9]{24}\/review$/;
    return ((method === 'GET' || method === 'HEAD') && payment.test(route)) ||
      (method === 'POST' && review.test(route));
  }
  if (!originalFamilies.has(family) || outsideAdmin[family]?.test(route)) return false;

  if (family === 'user' && route === 'admin/login') return method === 'POST';
  if (family === 'upload') return method === 'POST' && /^(?:video\/)?(?:single|multiple)$/.test(route);
  if (family === 'analytics' || family === 'report') return method === 'GET' || method === 'HEAD';
  // The admin submits new orders and pre-orders through the /admin action.
  if ((family === 'order' || family === 'pre-order') && !route && method === 'POST') return false;

  return true;
}

export function requiredOriginalMutationPermission(path, method) {
  const route = originalRoute(path);
  if (!route) return;
  return mutationPermissions[method]?.find(([pattern]) => pattern.test(route))?.[1];
}
