export const expenseViews = {
  expenses: { title: 'Expenses', label: 'expense', endpoint: '/expense', name: 'title' },
  'expense-categories': { title: 'Expense categories', label: 'expense category', endpoint: '/expense-category', name: 'title' },
  'expense-subcategories': { title: 'Expense subcategories', label: 'expense subcategory', endpoint: '/expense-subcategory', name: 'title' },
  channels: { title: 'Sales channels', label: 'sales channel', endpoint: '/sales-channel', name: 'name' },
  sources: { title: 'Payment sources', label: 'payment source', endpoint: '/payment-source', name: 'name' },
} as const;
export type ExpenseView = keyof typeof expenseViews;
export type FinanceView = ExpenseView | 'expense-report';
export const isFinanceView = (value: string): value is FinanceView => value === 'expense-report' || Object.hasOwn(expenseViews, value);
export const financePath = (view: FinanceView) => '/desk/payments/' + view;
export const expenseStatuses = ['pending', 'paid', 'rejected'];
export const ledgerStatuses = ['active', 'draft'];
export const expenseTypes = ['GENERAL', 'ADs'];
export const paymentMethods = ['cash', 'bank', 'mobile_banking', 'cheque'];
export const expenseLabel = (value: string) => value === 'ADs' ? 'Advertising' : value.replaceAll('_', ' ').toLowerCase().replace(/^./, char => char.toUpperCase());
export const expenseId = (value: string) => /^EXP-\d{1,16}$/i.test(value);
export type FinanceChoice = { id: string; name: string; parent?: string; type?: string };
export type FinanceChoices = { category: FinanceChoice[]; subcategory: FinanceChoice[]; sales_channel: FinanceChoice[]; payment_source: FinanceChoice[] };
