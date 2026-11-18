import { NextRequest } from 'next/server';
import { api, ApiError, canWrite, mongoId, obj, requestApi, sameOrigin, session, str, type RecordData, type Session } from '@/lib/api';
import { expenseId, expenseStatuses, expenseTypes, expenseViews, ledgerStatuses, paymentMethods, type ExpenseView } from '@/lib/finance-records';
import { has } from '@/lib/sections';
import { expenseAttachmentPath } from '@/lib/finance-attachment';

const headers = { 'Cache-Control': 'private, no-store' };
const reject = (status: number, message: string) => new Response(message, { status, headers });
const reference = (value: unknown) => str(obj(value)._id) || str(value);

function field(body: RecordData, name: string, max: number) {
  const value = str(body[name]).trim();
  if (value.length > max) throw new ApiError(400, 'A value is too long.');
  return value;
}

async function choice(auth: Session, path: string, id: string) {
  if (!mongoId(id)) throw new ApiError(400, 'Choose a valid accounting record.');
  const record = obj(await api(path + '/' + id, auth.token));
  if (!record._id || record.is_Deleted === true) throw new ApiError(400, 'The selected accounting record is unavailable.');
  return record;
}

async function expenseValues(auth: Session, body: RecordData) {
  const title = field(body, 'title', 140);
  const amount = field(body, 'amount', 12);
  const expense_date = field(body, 'expense_date', 10);
  const payment_method = field(body, 'payment_method', 20);
  if (!title || !/^\d{1,8}(\.\d{1,2})?$/.test(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(expense_date) ||
      !Number.isFinite(Date.parse(expense_date)) || new Date(expense_date).toISOString().slice(0, 10) !== expense_date || !paymentMethods.includes(payment_method)) {
    throw new ApiError(400, 'Enter a title, amount, valid date and payment method.');
  }
  const refs = {
    category: field(body, 'category', 24), subcategory: field(body, 'subcategory', 24),
    sales_channel: field(body, 'sales_channel', 24), payment_source: field(body, 'payment_source', 24),
  };
  const [category, subcategory] = await Promise.all([
    choice(auth, '/expense-category', refs.category), refs.subcategory ? choice(auth, '/expense-subcategory', refs.subcategory) : obj(undefined),
    refs.sales_channel ? choice(auth, '/sales-channel', refs.sales_channel) : {},
    refs.payment_source ? choice(auth, '/payment-source', refs.payment_source) : {},
  ]);
  if (refs.subcategory && reference(subcategory.category) !== refs.category) throw new ApiError(400, 'Choose a subcategory in the selected category.');
  if ((category.type === 'ADs' || subcategory.type === 'ADs') && !refs.sales_channel) throw new ApiError(400, 'Choose the sales channel for this advertising expense.');
  const attachments = field(body, 'attachments', 5000).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (attachments.length > 10 || attachments.some(line => {
    if (expenseAttachmentPath(line)) return false;
    try { const target = new URL(line); return target.protocol !== 'https:' || !!(target.username || target.password); }
    catch { return true; }
  })) throw new ApiError(400, 'Enter up to ten HTTPS attachment links.');
  return {
    title, amount: Number(amount), expense_date, payment_method, ...refs, attachments,
    description: field(body, 'description', 1000), voucher_no: field(body, 'voucher_no', 100), account_details: field(body, 'account_details', 500),
  };
}

async function lookupValues(auth: Session, view: ExpenseView, body: RecordData) {
  const nameKey = expenseViews[view].name;
  const name = field(body, nameKey, 140);
  const status = str(body.status);
  if (!name || !ledgerStatuses.includes(status)) throw new ApiError(400, 'Enter a name and status.');
  const payload = { [nameKey]: name, status,
    ...(Object.hasOwn(body, 'notes') && { notes: field(body, 'notes', 1000) }),
  };
  if (view === 'expense-categories' || view === 'expense-subcategories') {
    const type = str(body.type);
    if (!expenseTypes.includes(type)) throw new ApiError(400, 'Choose an expense type.');
    payload.type = type;
  }
  if (view === 'expense-subcategories') {
    const category = field(body, 'category', 24);
    await choice(auth, '/expense-category', category);
    payload.category = category;
  }
  return payload;
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return reject(403, 'Origin denied.');
  const auth = await session();
  if (!auth) return reject(401, 'Sign in required.');
  const view = req.nextUrl.searchParams.get('view') as ExpenseView;
  const region = req.nextUrl.searchParams.get('region');
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const action = req.nextUrl.searchParams.get('action') ?? 'save';
  if (!Object.hasOwn(expenseViews, view) || !['save', 'delete', 'note', 'status', 'approve'].includes(action) || (action !== 'save' && !id) ||
      (id && !(view === 'expenses' ? expenseId(id) : mongoId(id))) || (view !== 'expenses' && ['note', 'approve'].includes(action))) {
    return reject(400, 'Invalid finance request.');
  }
  const write = action === 'delete' ? 'delete' : action === 'approve' ? 'approval' : id ? 'update' : 'create';
  if (region !== 'BD' || !canWrite(auth.staff) || !has(auth.staff, 'expense.view') || !has(auth.staff, 'expense.' + write)) return reject(403, 'Access restricted.');
  let body: RecordData = {};
  if (action !== 'delete') {
    if (!req.headers.get('content-type')?.startsWith('application/json') || Number(req.headers.get('content-length')) > 12000) return reject(400, 'Invalid finance details.');
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 12000) return reject(413, 'Finance details are too large.');
    try { body = obj(JSON.parse(raw)); } catch { return reject(400, 'Invalid finance details.'); }
  }
  const config = expenseViews[view];
  let path = config.endpoint + (id ? '/' + id : '');
  try {
    let payload: unknown;
    switch (action) {
      case 'save': payload = view === 'expenses' ? await expenseValues(auth, body) : await lookupValues(auth, view, body); break;
      case 'note': {
        const note = field(body, 'note', 1000);
        if (!note) throw new ApiError(400, 'Enter a note.');
        payload = { note }; path += '/notes'; break;
      }
      case 'status': {
        const status = str(body.status);
        if (!(view === 'expenses' ? expenseStatuses : ledgerStatuses).includes(status)) throw new ApiError(400, 'Choose a valid status.');
        payload = { status }; path += '/status'; break;
      }
      case 'approve': {
        if (typeof body.approved !== 'boolean') throw new ApiError(400, 'Choose an approval state.');
        payload = { is_approved: body.approved }; path += '/toggle-approval'; break;
      }
    }
    const response = await requestApi(path, auth.token, { method: action === 'delete' ? 'DELETE' : id ? 'PATCH' : 'POST',
      ...(payload !== undefined && { body: JSON.stringify(payload) }) });
    const result = obj(await response.json());
    if (!response.ok || result.success !== true) return reject(response.status >= 400 ? response.status : 502, 'The finance service did not complete the change. Check the selected records and try again.');
    const record = obj(result.data);
    return Response.json({ id: id || str(view === 'expenses' ? record.expense_id : record._id) }, { headers });
  } catch (error) {
    if (error instanceof ApiError) return reject(error.status, error.message);
    throw error;
  }
}
