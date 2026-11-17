function ManagedReceipt({ paymentId, hooks, element }) {
  const [current, setCurrent] = hooks.useState(null);
  const [message, setMessage] = hooks.useState('');
  const [saving, setSaving] = hooks.useState(false);
  const refundKeys = hooks.useRef(new Map());
  const path = '/admin/api/v1/global/admin/payments/' + encodeURIComponent(paymentId);

  async function load(signal) {
    const response = await fetch(path, { signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not load payment details.');
    return result.data;
  }

  hooks.useEffect(() => {
    const controller = new AbortController();
    setCurrent(null);
    setMessage('');
    load(controller.signal).then(setCurrent).catch(error => {
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
  function amountFrom(form) {
    const input = String(form.get('amount') || '').trim();
    const value = Math.round(Number(input) * scale);
    return input && Number.isSafeInteger(value) && Number(input) === value / scale ? value : null;
  }

  async function save(action, input, messageAfter) {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(path + '/' + action, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not update the payment.');
      setCurrent(await load());
      setMessage(typeof messageAfter === 'function' ? messageAfter(result.data) : messageAfter);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

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
      const verifiedAmount = amountFrom(form);
      if (!reference || verifiedAmount === null) {
        return setMessage('Enter the receipt reference and exact amount.');
      }
      input.verifiedReference = reference;
      input.verifiedAmount = verifiedAmount;
    }
    await save('review', input, decision === 'approve' ? 'Payment approved.' : 'Payment rejected.');
  }

  async function collect(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = amountFrom(form);
    const reference = String(form.get('reference') || '').trim();
    if (!reference || !amount || amount !== current?.collection?.amount) {
      return setMessage('Enter the verified collection reference and exact balance due.');
    }
    await save('collect', { amount, reference }, 'Collection recorded.');
  }

  async function refund(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = amountFrom(form);
    const reason = String(form.get('reason') || '').trim();
    const reference = String(form.get('reference') || '').trim();
    if (!current?.refund || !amount || amount < 1 || amount > current.refund.amount || !reason ||
        (current.refund.requiresReference && !reference)) {
      return setMessage('Enter a valid refund amount, reason, and any required verified reference.');
    }
    const input = { amount, reason, ...(current.refund.requiresReference && { reference }) };
    const signature = JSON.stringify([paymentId, input]);
    if (!refundKeys.current.has(signature)) refundKeys.current.set(signature, crypto.randomUUID());
    await save('refunds', { ...input, key: refundKeys.current.get(signature) },
      result => result.state === 'refunded' ? 'Refund recorded.' : 'Refund status: ' + result.state);
  }

  function labeled(text, name, props) {
    return element('label', { className: 'flex flex-col gap-1', children: [
      text, element('input', { name, className: field, required: true, ...props }, 'input'),
    ] }, name);
  }

  function moneyField(max) {
    return labeled('Verified amount (' + payment.currency + ')', 'amount',
      { type: 'number', min: String(1 / scale), max: String(max / scale), step: String(1 / scale) });
  }

  function action(label, submit, fields) {
    return element('details', { className: 'pt-1', children: [
      element('summary', { className: 'cursor-pointer underline', children: label }, 'summary'),
      element('form', { className: 'flex flex-col gap-2 pt-2', onSubmit: submit, children: [
        ...fields,
        element('button', { type: 'submit', className: button, disabled: saving, children: label }, 'submit'),
      ] }, 'form'),
    ] }, label);
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
      current?.collection && action('Record collection', collect, [
        element('p', { children: 'Balance due: ' + format.format(current.collection.amount / scale) }, 'due'),
        moneyField(current.collection.amount),
        labeled('Verified collection reference', 'reference', { maxLength: 128 }),
      ]),
      current?.refund && action(current.refund.requiresReference ? 'Record refund' : 'Refund payment', refund, [
        element('p', { children: 'Available to refund: ' + format.format(current.refund.amount / scale) }, 'available'),
        moneyField(current.refund.amount),
        labeled('Refund reason', 'reason', { maxLength: 500 }),
        current.refund.requiresReference && labeled('Verified refund reference', 'reference', { maxLength: 128 }),
      ]),
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
