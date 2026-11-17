function ManagedShipment({ order, hooks, element }) {
  const [open, setOpen] = hooks.useState(false);
  const [data, setData] = hooks.useState(null);
  const [warehouseId, setWarehouse] = hooks.useState('');
  const [saving, setSaving] = hooks.useState(false);
  const [message, setMessage] = hooks.useState('');
  const keys = hooks.useRef(new Map());
  const api = '/admin/api/v1';
  const global = api + '/global/admin';
  const orderPath = global + '/orders/' + encodeURIComponent(order._id);
  const market = order.delivery_address?.country || (order.region === 'BD' ? 'BD' : '');
  const region = order.delivery_address?.state || order.delivery_address?.district || '';
  const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-foreground';
  const button = 'rounded-md bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50';

  async function request(path, options) {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new Error(body?.message || 'Shipment request failed.');
    return body.data;
  }

  function canPlan(current, context) {
    const payment = context.payments.find(row => row.id === current.managed_payment_id);
    return current.status === 'PLACED' && !current.inventory_packed_at && !current.is_assigned_to_business_location &&
      !current.transfer_to_courier && !context.shipments.some(row => row.state !== 'cancelled') &&
      ['authorized', 'captured'].includes(payment?.status) && (payment.provider === 'cod' || payment.captured > 0) &&
      !payment.reconciliation;
  }

  async function load(signal) {
    const [current, context] = await Promise.all([
      request(api + '/order/' + encodeURIComponent(order._id), { signal }),
      request(orderPath, { signal }),
    ]);
    let warehouses = [];
    let zones = [];
    let setupMessage = '';
    if (market === 'BD' && canPlan(current, context)) {
      try {
        const [settings, locations] = await Promise.all([
          request(global + '/shipment-services/' + market, { signal }),
          request(api + '/business-location?region=BD', { signal }),
        ]);
        zones = settings.zones.filter(zone => zone.enabled && zone.provider === 'steadfast' &&
          (!zone.regions?.length || zone.regions.some(value => value.toUpperCase() === region.toUpperCase())));
        warehouses = locations.businessLocations.filter(location => !location.is_deleted && location.is_active !== false &&
          zones.some(zone => zone.origin === (location.country_code || 'BD')));
        if (!warehouses.length) setupMessage = 'No courier service is configured for this destination.';
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        setupMessage = error.message;
      }
    }
    return { ...context, current, warehouses, zones, setupMessage };
  }

  hooks.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setData(null);
    setMessage('');
    setWarehouse('');
    load(controller.signal).then(setData).catch(error => {
      if (error.name !== 'AbortError') setMessage(error.message);
    });
    return () => controller.abort();
  }, [open, orderPath]);

  const warehouse = data?.warehouses.find(row => row._id === warehouseId);
  const services = warehouse ? data.zones.filter(zone => zone.origin === (warehouse.country_code || 'BD')) : [];

  function label(name, input, key = name) {
    return element('label', { className: 'flex flex-col gap-1', children: [name, input] }, key);
  }

  function input(name, options) {
    return element('input', { name, className: field, ...options }, name);
  }

  function idempotency(path, body) {
    const signature = JSON.stringify([path, body]);
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    return keys.current.get(signature);
  }

  async function save(path, body, messageAfter) {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      await request(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setMessage(messageAfter);
      setData(await load());
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  function plan(event) {
    event.preventDefault();
    if (!data || !canPlan(data.current, data)) return;
    const form = new FormData(event.currentTarget);
    const service = form.get('service');
    const fields = { grams: 100000, length: 300, width: 300, height: 300 };
    const parcel = Object.fromEntries(Object.keys(fields).map(name => [name, Number(form.get(name))]));
    if (!warehouse || !services.some(row => row.service === service) ||
        !Object.entries(parcel).every(([name, number]) => Number.isInteger(number) && number >= 1 && number <= fields[name])) {
      setMessage('Choose a warehouse and service, then enter the measured weight and dimensions.');
      return;
    }
    const body = {
      order: order._id, warehouse: warehouse._id, service, parcels: [parcel],
      lines: data.current.products.map(line => ({ id: line._id, quantity: line.total_quantity })),
    };
    const path = global + '/shipments';
    void save(path, { ...body, key: idempotency(path, body) }, 'Shipment planned.');
  }

  function shipmentActions(row) {
    const path = global + '/shipments/' + encodeURIComponent(row._id);
    if (row.state === 'planned') {
      return element('form', {
        className: 'flex flex-col gap-2',
        onSubmit: event => {
          event.preventDefault();
          const raw = String(new FormData(event.currentTarget).get('barcodes') || '');
          const barcodes = raw.split(/\s+/).filter(Boolean);
          if (new Set(barcodes).size !== barcodes.length || barcodes.length > 200) {
            setMessage('Enter each scanned barcode once.');
            return;
          }
          void save(path + '/pick', { ...(barcodes.length && { barcodes }) }, 'Shipment picked.');
        },
        children: [
          label('Unit barcodes (for tracked stock)', element('textarea', {
            name: 'barcodes', className: field, maxLength: 6000, rows: 2,
          }, 'barcodes')),
          element('button', { type: 'submit', className: button, disabled: saving, children: 'Confirm pick' }, 'pick'),
        ],
      }, 'actions');
    }
    if (row.state === 'picked') return element('button', {
      type: 'button', className: button, disabled: saving, children: 'Mark packed',
      onClick: () => void save(path + '/pack', {}, 'Shipment packed.'),
    }, 'actions');
    const canReturn = row.state === 'exception' ||
      (row.state === 'delivered' && ['PENDING_RETURN', 'RETURN_REQUESTED'].includes(data.current.status));
    if (!canReturn || data.shipments.some(entry => entry.direction === 'return' && String(entry.parent) === String(row._id))) return null;
    return element('form', {
      className: 'flex flex-col gap-2',
      onSubmit: event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = {
          tracking: String(form.get('tracking') || '').trim(),
          evidence: String(form.get('evidence') || '').trim(),
        };
        if (!body.tracking || !body.evidence) {
          setMessage('Enter the return tracking number and handoff reference.');
          return;
        }
        const endpoint = path + '/return';
        void save(endpoint, { ...body, key: idempotency(endpoint, body) }, 'Return shipment recorded.');
      },
      children: [
        label('Return tracking number', input('tracking', { required: true, maxLength: 128 })),
        label('Verified return handoff reference', input('evidence', { required: true, maxLength: 128 })),
        element('button', { type: 'submit', className: button, disabled: saving, children: 'Record return shipment' }, 'return'),
      ],
    }, 'actions');
  }

  function receiveAction(row) {
    const outbound = data.shipments.filter(entry => entry.direction === 'outbound' && entry.state !== 'cancelled');
    if (row.receivedAt || outbound.length !== 1 || String(outbound[0]._id) !== String(row.parent) ||
        !['dispatched', 'in-transit', 'out-for-delivery', 'delivered', 'returned'].includes(row.state)) return null;
    const tracked = row.lines.some(line => line.barcodes?.length);
    return element('form', {
      className: 'flex flex-col gap-2',
      onSubmit: event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const evidence = String(form.get('evidence') || '').trim();
        const scans = String(form.get('barcodes') || '').split(/\s+/).filter(Boolean);
        if (!evidence || !form.has('sellable') || (tracked && !scans.length) || scans.length > 200 || new Set(scans).size !== scans.length) {
          setMessage('Confirm inspection, enter the warehouse receipt reference, and scan each tracked unit once.');
          return;
        }
        const path = global + '/shipments/' + encodeURIComponent(row._id) + '/receive';
        void save(path, { evidence, sellable: true, barcodes: scans }, 'Return received.');
      },
      children: [
        label('Verified warehouse receipt reference', input('evidence', { required: true, maxLength: 128 })),
        tracked && label('Returned unit barcodes', element('textarea', {
          name: 'barcodes', className: field, maxLength: 6000, rows: 2, required: true,
        }, 'barcodes')),
        label('I inspected all returned units and confirmed they are sellable.', element('input', {
          type: 'checkbox', name: 'sellable', required: true, className: 'size-4',
        }, 'sellable')),
        element('button', { type: 'submit', className: button, disabled: saving, children: 'Receive return' }, 'receive'),
      ],
    }, 'actions');
  }

  const canShowPlan = data?.warehouses.length > 0;
  return element('details', {
    className: 'bg-background rounded-lg shadow-md print:hidden',
    onToggle: event => setOpen(event.currentTarget.open),
    children: [
      element('summary', { className: 'cursor-pointer text-lg font-medium border-b px-4 lg:px-6 py-4', children: 'Shipment' }, 'heading'),
      open && element('div', {
        className: 'flex flex-col gap-4 p-4 lg:p-6 text-sm',
        children: [
          !data && !message && element('p', { role: 'status', children: 'Loading shipment…' }, 'loading'),
          data?.shipments.map(row => element('div', {
            className: 'rounded-md border p-3 flex flex-col gap-2',
            children: [
              element('p', { children: (row.direction === 'return' ? 'Return: ' : 'Shipment: ') + row.state }, 'state'),
              row.tracking && element('p', { children: 'Tracking number: ' + row.tracking }, 'tracking'),
              row.direction === 'outbound' ? shipmentActions(row) : receiveAction(row),
            ],
          }, row._id)),
          canShowPlan && element('form', {
            className: 'flex flex-col gap-3', onSubmit: plan,
            children: [
              label('Business location', element('select', {
                value: warehouseId, onChange: event => setWarehouse(event.target.value), required: true, className: field,
                children: [
                  element('option', { value: '', children: 'Select business location' }, 'empty'),
                  ...data.warehouses.map(row => element('option', {
                    value: row._id, children: row.name || row.business_location_name,
                  }, row._id)),
                ],
              }, 'warehouse')),
              label('Courier service', element('select', {
                name: 'service', required: true, className: field, disabled: !warehouse,
                children: [
                  element('option', { value: '', children: 'Select courier service' }, 'empty'),
                  ...services.map(row => element('option', { value: row.service, children: row.service }, row.service)),
                ],
              }, warehouseId)),
              element('div', {
                className: 'grid grid-cols-2 gap-2',
                children: [['grams', 'Weight (g)', 100000], ['length', 'Length (cm)', 300],
                  ['width', 'Width (cm)', 300], ['height', 'Height (cm)', 300]].map(([name, title, max]) =>
                  label(title, input(name, { type: 'number', required: true, min: 1, max, step: 1 }))),
              }, 'parcel'),
              element('button', { type: 'submit', className: button, disabled: saving || !services.length, children: 'Plan shipment' }, 'plan'),
            ],
          }, 'plan'),
          data?.setupMessage && element('p', { role: 'status', children: data.setupMessage }, 'setup'),
          data && !data.shipments.length && !canShowPlan && !data.setupMessage &&
            element('p', { children: 'No shipment has been recorded.' }, 'empty'),
          message && element('p', { role: 'status', children: message }, 'message'),
        ],
      }, 'content'),
    ],
  });
}

export function patchManagedShipment(source, server) {
  const order = server ? 'y' : 'H';
  const jsx = server ? 'd' : 'a';
  const hooks = server ? 'j' : 'o';
  const declaration = /let \w+=\["Product","Quantity","Unit Price","Amount"\],/g;
  const customer = '(0,' + jsx + '.jsxs)("div",{className:"bg-background rounded-lg shadow-md",children:[' +
    '(0,' + jsx + '.jsx)("h3",{className:"text-lg font-medium w-full border-b px-4 lg:px-6 py-4",children:"Customer Info"})';
  if ([...source.matchAll(declaration)].length !== 1 || source.split(customer).length !== 2) {
    throw new Error('Unexpected preserved Order Details shipment markup');
  }
  const shipment = order + '?.managed_checkout&&(0,' + jsx + '.jsx)(ManagedShipment,{order:' + order +
    ',hooks:' + hooks + ',element:' + jsx + '.jsx}),';
  return source.replace(declaration, match => ManagedShipment.toString() + '\n' + match)
    .replace(customer, shipment + customer);
}
