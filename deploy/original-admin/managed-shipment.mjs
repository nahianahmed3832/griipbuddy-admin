export function ManagedShipment({ order, hooks, element }) {
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

  function quantity(name, max) {
    return input(name, { type: 'number', required: true, min: 0, max, step: 1, defaultValue: 0 });
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
    const canReturn = data.current.status !== 'RETURNED' && (row.state === 'exception' ||
      (row.state === 'delivered' && ['PENDING_RETURN', 'RETURN_REQUESTED', 'PARTIAL'].includes(data.current.status)));
    const returnable = row.returnableLines?.filter(line => line.quantity > 0) || [];
    if (!canReturn || !returnable.length) return null;
    return element('form', {
      className: 'flex flex-col gap-2',
      'aria-label': 'Record return shipment',
      onSubmit: event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const selected = returnable.map(line => ({ id: line.id, quantity: Number(form.get('quantity-' + line.id)) }));
        const lines = selected.filter(line => line.quantity > 0);
        if (!lines.length || selected.some((line, index) => !Number.isInteger(line.quantity) ||
            line.quantity < 0 || line.quantity > returnable[index].quantity)) {
          setMessage('Enter the quantity to return for each applicable product.');
          return;
        }
        const body = {
          tracking: String(form.get('tracking') || '').trim(),
          evidence: String(form.get('evidence') || '').trim(),
          lines,
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
        ...returnable.map(line => label(
          'Return quantity for ' + line.sku + ' (' + line.quantity + ' available)',
          quantity('quantity-' + line.id, line.quantity), line.id
        )),
        element('button', { type: 'submit', className: button, disabled: saving, children: 'Record return shipment' }, 'return'),
      ],
    }, 'actions-' + JSON.stringify(returnable.map(line => [line.id, line.quantity])));
  }

  function receiveAction(row) {
    if (row.receivedAt || !row.lines?.length || !row.tracking ||
        !['PENDING_RETURN', 'RETURN_REQUESTED', 'IN_TRANSIT', 'DELIVERED', 'PARTIAL'].includes(data.current.status) ||
        !['dispatched', 'in-transit', 'out-for-delivery', 'delivered', 'returned'].includes(row.state)) return null;
    const reviews = new Map(row.lotReview?.map(line => [line.id, line]));

    function dispositionFields(name, sellable, damaged) {
      return [
        label('Sellable quantity', quantity('sellable-' + name, sellable)),
        label('Damaged quantity', quantity('damaged-' + name, damaged)),
      ];
    }

    function readDisposition(form, line) {
      const counts = name => ({
        sellable: Number(form.get('sellable-' + name)),
        damaged: Number(form.get('damaged-' + name)),
      });
      const review = reviews.get(line.id);
      if (review) {
        const lots = review.lots.map(lot => ({ id: lot.id, ...counts(line.id + '-' + lot.id) }));
        if (lots.some(({ sellable, damaged }, index) => {
          const lot = review.lots[index];
          return !Number.isInteger(sellable) || sellable < 0 || sellable > lot.sellableAvailable ||
            !Number.isInteger(damaged) || damaged < 0 || sellable + damaged > lot.available;
        })) return null;
        return {
          id: line.id,
          sellable: lots.reduce((total, lot) => total + lot.sellable, 0),
          damaged: lots.reduce((total, lot) => total + lot.damaged, 0),
          lots: lots.filter(lot => lot.sellable || lot.damaged),
        };
      }
      const scans = name => String(form.get(name) || '').split(/\s+/).filter(Boolean);
      return {
        id: line.id, ...counts(line.id),
        ...(line.tracked && {
          sellableBarcodes: scans('sellable-barcodes-' + line.id),
          damagedBarcodes: scans('damaged-barcodes-' + line.id),
        }),
      };
    }

    return element('form', {
      className: 'flex flex-col gap-2',
      'aria-label': 'Receive return',
      onSubmit: event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const evidence = String(form.get('evidence') || '').trim();
        const lotEvidence = String(form.get('lotEvidence') || '').trim();
        const lines = row.lines.map(line => readDisposition(form, line));
        if (reviews.size && (!lotEvidence || lines.some((line, index) =>
          reviews.has(row.lines[index].id) && (!line || line.sellable + line.damaged !== row.lines[index].quantity)))) {
          setMessage('Enter the warehouse review reason and assign all reviewed units within the available original lot quantities.');
          return;
        }
        if (!evidence || lines.some((line, index) => !Number.isInteger(line.sellable) ||
            !Number.isInteger(line.damaged) || line.sellable < 0 || line.damaged < 0 ||
            line.sellable + line.damaged !== row.lines[index].quantity)) {
          setMessage('Enter the warehouse receipt reference and classify all returned units as sellable or damaged.');
          return;
        }
        const barcodes = lines.flatMap(line => [...(line.sellableBarcodes || []), ...(line.damagedBarcodes || [])]);
        if (lines.some((line, index) => line.sellableBarcodes &&
            (line.sellableBarcodes.length !== line.sellable || line.damagedBarcodes.length !== line.damaged ||
             [...line.sellableBarcodes, ...line.damagedBarcodes].some(code => !row.lines[index].barcodes?.includes(code)))) ||
            barcodes.length > 200 || new Set(barcodes).size !== barcodes.length) {
          setMessage('Scan each tracked unit once in its matching sellable or damaged field.');
          return;
        }
        const path = global + '/shipments/' + encodeURIComponent(row._id) + '/receive';
        void save(path, { evidence, ...(reviews.size && { lotEvidence }), lines }, 'Return received.');
      },
      children: [
        label('Verified warehouse receipt reference', input('evidence', { required: true, maxLength: 128 })),
        reviews.size > 0 && label('Warehouse review reason', element('textarea', {
          'data-slot': 'textarea',
          className: 'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 ' +
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive ' +
            'dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 ' +
            'text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] ' +
            'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          name: 'lotEvidence', required: true, maxLength: 500, placeholder: 'Reason for this adjustment',
        }, 'lotEvidence')),
        ...row.lines.map(line => element('fieldset', {
          className: 'flex flex-col gap-2',
          children: [
            element('legend', { children: line.sku + ' (' + line.quantity + ' returned)' }, 'sku'),
            ...(reviews.has(line.id) ? reviews.get(line.id).lots.map(lot => element('fieldset', {
              className: 'flex flex-col gap-2',
              children: [
                element('legend', { children: 'Lot ' + lot.lotNumber + ' (' + lot.available + ' available)' }, 'lot'),
                ...dispositionFields(line.id + '-' + lot.id,
                  Math.min(line.quantity, lot.sellableAvailable), Math.min(line.quantity, lot.available)),
              ],
            }, lot.id)) : dispositionFields(line.id, line.quantity, line.quantity)),
            ...(line.tracked ? ['sellable', 'damaged'].map(disposition => {
              const name = disposition + '-barcodes-' + line.id;
              return label((disposition === 'sellable' ? 'Sellable' : 'Damaged') + ' unit barcodes', element('textarea', {
                name, className: field, rows: 2, maxLength: 26000,
              }, name));
            }) : []),
          ],
        }, line.id)),
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
              row.receiptLines?.map(line => element('p', {
                children: (row.lines?.find(item => item.id === line.id)?.sku || line.id) +
                  ': ' + line.sellable + ' sellable, ' + line.damaged + ' damaged',
              }, 'receipt-' + line.id)),
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
