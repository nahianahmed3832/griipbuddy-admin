export const financeAttachmentPrefix = '/api/finance-records/attachment/';
export const financeAttachmentKey = /^[a-f0-9]{32}\.png$/;
export function expenseAttachmentPath(value: string) {
  return value.startsWith(financeAttachmentPrefix) && financeAttachmentKey.test(value.slice(financeAttachmentPrefix.length));
}
