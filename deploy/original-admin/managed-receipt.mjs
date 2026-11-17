function ManagedReceipt({ paymentId, hooks, element }) {
  const [current, setCurrent] = hooks.useState(null);
  const [message, setMessage] = hooks.useState('');
  const [saving, setSaving] = hooks.useState(false);
  const path = '/admin/api/v1/global/admin/payments/' + encodeURIComponent(paymentId);
  hooks.useEffect(() => {
    const controller = new AbortController();
    setCurrent(null);
    setMessage('');
    fetch(path, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not load payment details.');
      setCurrent(result.data);
    }).catch(error => {
      if (error.name !== 'AbortError') setMessage(error.message);
    });
    return () => controller.abort();
  }, [path]);

  const payment = current?.payment;
  const pending = payment?.status === 'pending' && ['manual', 'cod'].includes(payment.provider);
  const format = payment && new Intl.NumberFormat('en', { style: 'currency', currency: payment.currency });
  const decimals = format?.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** decimals;
  const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-foreground';
  const button = 'rounded-md bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50';
  async function review(event) {
    event.preventDefault();
    if (saving || !pending) return;
    const form = new FormData(event.currentTarget);
    const decision = event.nativeEvent.submitter?.value;
    if (!['approve', 'reject'].includes(decision)) return;
    const input = { decision, reason: String(form.get('reason') || '').trim() };
    if (!input.reason) return setMessage('Enter a review note.');
    if (decision === 'approve' && payment.provider === 'manual') {
      const reference = String(form.get('reference') || '').trim();
      const amount = String(form.get('amount') || '').trim();
      const verifiedAmount = Math.round(Number(amount) * scale);
      if (!reference || !amount || !Number.isSafeInteger(verifiedAmount) || Number(amount) !== verifiedAmount / scale) {
        return setMessage('Enter the receipt reference and exact amount.');
      }
      input.verifiedReference = reference;
      input.verifiedAmount = verifiedAmount;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(path + '/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not update the payment.');
      setCurrent({ ...current, payment: result.data });
      setMessage(decision === 'approve' ? 'Payment approved.' : 'Payment rejected.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return element('div', {
    className: 'text-sm font-medium border bg-accent text-primary p-2 flex flex-col gap-1 print:hidden',
    children: [
      element('p', { className: 'text-foreground', children: 'Payment Info:' }, 'heading'),
      payment && element('p', { children: 'Payment Amount: ' + format.format(payment.amount / scale) }, 'amount'),
      payment && element('p', { children: 'Transaction Status: ' + payment.status }, 'status'),
      current?.evidence?.reference && element('p', { children: 'Receipt Reference: ' + current.evidence.reference }, 'reference'),
      payment?.evidenceSubmitted && element('a', {
        className: 'underline', href: path + '/receipt', children: 'Download receipt',
      }, 'receipt'),
      pending && element('form', {
        className: 'flex flex-col gap-2 pt-2', onSubmit: review,
        children: [
          payment.provider === 'manual' && element('label', { children: [
            'Verified receipt reference', element('input', { name: 'reference', className: field, maxLength: 128 }, 'input'),
          ] }, 'verify-reference'),
          payment.provider === 'manual' && element('label', { children: [
            'Verified amount (' + payment.currency + ')', element('input', {
              name: 'amount', type: 'number', min: '0', step: String(1 / scale), className: field,
            }, 'input'),
          ] }, 'verify-amount'),
          element('label', { children: [
            'Review note', element('input', { name: 'reason', required: true, className: field, maxLength: 500 }, 'input'),
          ] }, 'note'),
          element('div', { className: 'flex gap-2', children: [
            element('button', {
              type: 'submit', className: button, value: 'approve',
              disabled: saving || (payment.provider === 'manual' && !payment.evidenceSubmitted), children: 'Approve payment',
            }, 'approve'),
            element('button', {
              type: 'submit', className: 'rounded-md border px-3 py-2', value: 'reject',
              disabled: saving, children: 'Reject payment',
            }, 'reject'),
          ] }, 'actions'),
        ],
      }, 'review'),
      message && element('p', { role: 'status', children: message }, 'message'),
    ],
  });
}

export function patchManagedReceipt(source, server) {
  const order = server ? 'y' : 'H';
  const jsx = server ? 'd' : 'a';
  const hooks = server ? 'j' : 'o';
  const declaration = /let \w+=\["Product","Quantity","Unit Price","Amount"\],/g;
  const oldCard = (server ? 'y?.payment_info' : '(null==H?void 0:H.payment_info)') +
    '&&(0,' + jsx + '.jsxs)("div",{className:"text-sm font-medium border bg-accent text-primary p-2 flex flex-col gap-1 print:hidden"';
  if ([...source.matchAll(declaration)].length !== 1 || source.split(oldCard).length !== 2) {
    throw new Error('Unexpected preserved Order Details payment markup');
  }
  const receipt = order + '?.managed_payment_id&&(0,' + jsx + '.jsx)(ManagedReceipt,{paymentId:' +
    order + '.managed_payment_id,hooks:' + hooks + ',element:' + jsx + '.jsx}),';
  return source.replace(declaration, match => ManagedReceipt.toString() + '\n' + match)
    .replace(oldCard, receipt + '!' + order + '?.managed_payment_id&&' + oldCard);
}
