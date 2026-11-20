# Editable production admin parity

Reference is extracted Next.js build `euAYl85haEyQ5Bfnz2vP3`. It contains 98 dashboard route patterns and four supporting entries. The dashboard includes 23 patterns that require a record ID, slug or report ID. The [route mapping](../src/lib/legacy-destinations.ts) provides an editable destination for every dashboard pattern. A mapped destination marks prior functional correspondence. Unchecked rows still require full design and workflow verification.

Each dashboard path is relative to the application host. Verify the original bookmark, query values, page state and permitted actions, including deployments that mount the app under `/admin`. The editable destinations identify reusable code and its current route. The scope covers the surfaces and states the production reference actually exposes, including hidden routes, without adding dev-only product features.

- Compare the candidate and extracted reference against the same disposable fixture dataset, roles, fonts, timezone and viewport. Review desktop at 1440 × 960 and mobile at 390 × 844, including responsive navigation, populated and empty tables, errors, loading, disabled controls, dialogs and permission-dependent states.
- Check routes and rendered screenshots or DOM, then execute the applicable actions and compare the persisted result. For exports compare rows, totals, formats, filters and role-specific fields. For writes check validation, permissions, stock and financial side effects, and retries where applicable.
- Use owner, operations, inventory, finance, customer service and restricted fixture accounts where relevant. Exercise allowed and denied permissions and Bangladesh and international record access at direct URLs, through forms and in exports.
- Compare courier, payment settlement, messaging and media against configured test integrations when available. Label fixture, provider sandbox and verified provider results distinctly. A simulated response leaves real provider effects unverified.
- Build and run the candidate from a clean checkout with the extracted build absent. The comparison harness may launch it as a separate reference. Candidate screens, styles, actions and deployment must come from editable source. Original brand assets may be retained. Adapt the [existing comparator](../tests/original-admin-parity.mjs) to compare behavior, rendered output and retained assets without requiring identical hashes for independently compiled JavaScript and CSS.

## Latest verification

- The [isolated route sweep](editable-production-route-audit.json) checked 111 concrete paths across all 102 manifest patterns, using seeded records for every dynamic path. All HTTP statuses matched the captured production reference, and the 107 concrete dashboard paths rendered successfully at their original URLs.
- The source production build, type checks and lint passed. Browser tests covered website order creation and eligible editing, invoice printing, calendar selection, All pagination, country CRUD, product creation and editing, stock PDF and Excel exports, stock access restrictions, purchase and barcode controls, all ten reports and both export types, and the simulated courier response.
- A focused desktop comparison still found visual and accessibility-tree differences on the report index and both subscription pages. Keep the entries open until the differences are resolved. Other remaining areas include production discounts and edit eligibility, the full product variant and media flows, stock movements, purchase editing, staff and content workflows, and sandbox verification of provider side effects.

## Shared foundation and supporting entries

- The editable sign-in form matched the reference at 1440 × 960 and 390 × 844. Isolated browser checks covered empty fields, rejected credentials, accepted credentials and the staff cookie.
- The editable shared shell has passed the first interaction checks on desktop and mobile. The full dashboard rendering and role and region combinations remain on the checklist.
- The production build compiled from source and passed desktop and mobile browser checks at the mounted `/admin` routes. The Overview loaded all six sections and applied period, location and comparison settings against the isolated API. The zero-data chart, metric accents and spacing still differ from the reference.
- Website Orders displayed dated fixture rows and passed search, status and date filters, opening row actions, numeric pagination and XLSX export. The production calendar and the All page-size option remain open. Provider actions still need acceptance against test integrations.


| Done | Production pattern | Editable correspondence | Verification |
| --- | --- | --- | --- |
| ☐ | `/` | `/`, `/sign-in`, `/api/session` | Compare the original sign-in form, password visibility, validation, failed and successful sign-in, redirects, logout and state after expiry. Verify the shared header, menus, sidebar, region selection and responsive layout after sign-in. |
| ☐ | `/_not-found` | Next.js not-found handling | Open an unknown route and invalid direct links as signed-out and signed-in users. Compare the visible error and recovery links. |
| ☐ | `/api/fraud-check` | `/api/website-orders?action=fraud-check&region=BD` | Check method and response compatibility on the production path. Test a valid synthetic number, invalid input, role denial, timeout and provider results. |
| ☑ | `/favicon.ico` | App icon metadata | Mounted fixture returned `image/x-icon` and the bytes matched the production artifact. |

## 1. Sales, catalog and customers

45 dashboard route patterns.

| Done | Production pattern | Current editable destination | Workflow and fixtures for acceptance |
| --- | --- | --- | --- |
| ☐ | `/dashboard/orders` | `/desk/orders/orders` | Search by order ID, phone, tracking code and SKU, combine date and status filters, paginate and export Excel. Compare single and bulk courier sync effects. |
| ☐ | `/dashboard/create-order` | `/desk/orders/create` | Select products and quantities, enter customer and delivery details, apply payment type or advance and attach proof. Save once and reconcile order totals and stock. |
| ☐ | `/dashboard/order-details/[id]` | `/desk/orders/orders/[id]` | Fixtures are website orders in open, assigned, in-transit, delivered and returned states, with COD and advance payment. Check tabs, payment evidence, notes, timeline, staff assignment, barcode picking, courier and return controls. |
| ☐ | `/dashboard/orders/edit/[id]` | `/desk/orders/orders/[id]?draft=1` | Fixtures are an editable Bangladesh order, an order with payment proof, and a locked or dispatched order. Edit lines, address, charges and permitted payment fields. Verify retries, blocked edits and preserved totals and stock. |
| ☐ | `/dashboard/assigned-orders` | `/desk/orders/assigned` | Filter assignments and exercise role-specific actions. Use assigned and unassigned orders to compare picking, packing, courier handover and return actions where enabled. |
| ☐ | `/dashboard/sales-executive` | `/desk/orders/sales-executive` | Compare the executive view with assigned and non-assigned staff. Check date or staff controls, shown metrics and drill-downs where available. |
| ☐ | `/dashboard/fraud-checker` | `/desk/orders/fraud-check` | Validate phone input, loading, provider rows, empty results and errors using a synthetic phone. Compare real provider response mapping against a configured test account where available. |
| ☐ | `/dashboard/pre-orders` | `/desk/orders/preorders` | Search, filter dates, statuses and action queue, paginate and export. Exercise individual and bulk lifecycle actions exposed for eligible records. |
| ☐ | `/dashboard/pre-orders/create` | `/desk/orders/preorders/create` | Enter multiple product references, customer details, quote and advance fields. Save and verify reference, amounts and initial status. |
| ☐ | `/dashboard/pre-orders/[id]` | `/desk/orders/preorders/[id]` | Fixtures cover quoted, paid and courier-ready pre-orders. Verify product and payment evidence, notes, permissible status changes, handoff and notification outcomes. |
| ☐ | `/dashboard/pre-orders/[id]/edit` | `/desk/orders/preorders/[id]?edit=1` | Fixtures are a draft with several items and an ineligible completed record. Modify editable items, quote and delivery or payment data. Verify validation, persistence and protected fields. |
| ☐ | `/dashboard/pos/all` | `/desk/pos/sales` | Filter and page through sales with recorded returns and payment events. Verify UI actions, links and totals for a populated and empty register. |
| ☐ | `/dashboard/pos/create` | `/desk/pos/editor` | Create a multi-line sale at an outlet, exercise item and sale discounts and available payment methods, then reconcile receipt, payment and inventory. |
| ☐ | `/dashboard/pos/edit/[id]` | `/desk/pos/editor/[id]` | Fixtures are an editable outlet sale and a completed or returned sale. Check populated products, pricing and payment, saved changes, locked operations and stock reconciliation. |
| ☐ | `/dashboard/pos/report` | `/desk/pos/report` | Compare period and outlet filters, sales totals and any print or export actions with a ledger containing sales and returns. |
| ☐ | `/dashboard/products` | `/desk/catalog/products` | Search by name and SKU, combine supported filters, paginate and open details or edit. Compare enabled or disabled products and allowed row actions. |
| ☐ | `/dashboard/create-product` | `/desk/catalog/products/new` | Exercise hierarchy, English and Bangla fields, media, attributes, variant matrix, per-currency pricing, destination availability, Save and Save & Open Stock. |
| ☐ | `/dashboard/update-product/[slug]` | `/desk/catalog/products/[slug]?mode=edit&lookup=slug` | Fixtures are a product with multiple variants, media, warranty settings and regional prices, plus an unavailable slug. Edit fields, currency prices and variants; preserve stable SKU, slug and data outside the edit. |
| ☐ | `/dashboard/product-details/[id]` | `/desk/catalog/products/[id]` | Fixture is a product with variant, stock, media and pricing records. Verify details, visible price and stock, SKU copy and edit links where present. |
| ☐ | `/dashboard/categories` | `/desk/catalog/categories` | Browse or search parent categories, compare hierarchy, pagination, status and create or edit entry points. Test referenced and unreferenced records where deletion is offered. |
| ☐ | `/dashboard/add-new-category` | `/desk/catalog/categories?mode=create` | Create a category with English and Bangla labels, description and image, and verify required-field validation and its appearance in catalog selectors. |
| ☐ | `/dashboard/update-category/[slug]` | `/desk/catalog/categories/[slug]?mode=edit` | Fixtures are a root category with children and products, plus an unknown slug. Verify prefilled fields, media, status and preservation of descendants and references. |
| ☐ | `/dashboard/sub-categories` | `/desk/catalog/subcategories` | Browse or search the nested category list. Exercise parent filters, status controls, pagination and allowed row actions. |
| ☐ | `/dashboard/add-new-sub-category` | `/desk/catalog/subcategories?mode=create-child` | Choose an eligible parent, add bilingual labels and media, and verify sort or placement and the resulting selector hierarchy. |
| ☐ | `/dashboard/update-sub-category/[slug]` | `/desk/catalog/subcategories/[slug]?mode=edit` | Fixtures are nested categories with distinct parents and product references. Check prefill, permitted reparenting, validation and affected product selectors. |
| ☐ | `/dashboard/all-brands` | `/desk/catalog/brands` | Search, paginate, verify status and actions, and open create or edit for a populated brand list. |
| ☐ | `/dashboard/create-brand` | `/desk/catalog/brands/new` | Enter and validate brand fields and media when offered. Save and verify the brand appears in catalog selectors. |
| ☐ | `/dashboard/update-brand/[id]` | `/desk/catalog/brands/[id]` | Fixtures are an enabled brand linked to products and a disabled one. Check prefill, status and edited fields, and preserve product links. |
| ☐ | `/dashboard/product-reviews` | `/desk/catalog/reviews` | Compare search, pagination and review status, and the links or moderation actions shown for each role. |
| ☐ | `/dashboard/product-reviews/[id]` | `/desk/catalog/reviews/[id]` | Fixtures are pending and published reviews with a rating, text and optional attachment or reply. Check moderation, persistence and displayed product or author relationships. |
| ☐ | `/dashboard/product-faqs` | `/desk/catalog/faqs` | Search and page through product FAQs and check product links, visibility, and create and edit actions. |
| ☐ | `/dashboard/product-faqs/add-new-faq` | `/desk/catalog/faqs/new` | Select the linked product, validate question and answer, and verify the saved entry and publication state. |
| ☐ | `/dashboard/product-faqs/[slug]` | `/desk/catalog/faqs/[slug]` | Fixture is an existing product-linked FAQ. Check prefilled content, status, validation and save, then confirm its list and product placement. |
| ☐ | `/dashboard/return-policies` | `/desk/catalog/policies` | Browse policy list, compare linked products, status, search and create or update actions. |
| ☐ | `/dashboard/add-new-return-policy` | `/desk/catalog/policies/new` | Enter the name, duration and policy content, validate required fields, and verify the policy is offered in product selection. |
| ☐ | `/dashboard/update-return-policy/[id]` | `/desk/catalog/policies/[id]` | Fixtures are an active policy linked to a product and an inactive policy. Check the populated fields, save edited duration or terms, and verify product links. |
| ☐ | `/dashboard/all-countries` | `/desk/markets/countries` | Compare country, currency and status rows, enabled controls and creation or editing. Verify changing a market affects only its intended catalog and fulfillment scope. |
| ☐ | `/dashboard/create-country` | `/desk/markets/countries/new` | Exercise country, currency and region inputs including duplicates and status. Verify the created market in the table and header selector when eligible. |
| ☐ | `/dashboard/update-country/[id]` | `/desk/markets/countries/[id]` | Fixtures are active and inactive countries with different currencies. Check prefill, status changes and whether the header and price coverage respond as expected. |
| ☐ | `/dashboard/customers` | `/desk/customers/customers` | Search by supported name or phone fields, paginate, export authorized columns, and compare registered and repeat customer rows. |
| ☐ | `/dashboard/create-customer` | `/desk/customers/create` | Enter customer details using a synthetic identity. Verify validation, duplicate handling, save, search and account linkage. |
| ☐ | `/dashboard/password-change-customer/[id]` | `/desk/customers/customers/[id]?action=password` | Fixtures are a synthetic registered account and an account outside the staff member's scope. Check validation, password change, subsequent login and denial behavior. |
| ☐ | `/dashboard/coupons` | `/desk/marketing/coupons` | Search, filter, paginate and toggle eligible coupons. Compare active, expired and inactive entries. |
| ☐ | `/dashboard/create-coupon` | `/desk/marketing/coupons/new` | Exercise code uniqueness, fixed and percent discounts, date windows, limits, and eligible user or product scopes. Verify save and redemption in fixtures. |
| ☐ | `/dashboard/coupons/[id]` | `/desk/marketing/coupons/[id]` | Fixtures are an unused coupon and a coupon with redemption history. Verify prefill, changes to remaining eligibility, preserved usage and correct discount calculation. |

## 2. Stock, purchasing and finance

33 dashboard route patterns.

| Done | Production pattern | Current editable destination | Workflow and fixtures for acceptance |
| --- | --- | --- | --- |
| ☐ | `/dashboard/check-outlet-stocks` | `/desk/inventory/stock` | Filter location, SKU, name, barcode and quantity, sort and page. Compare PDF print or Excel filters, row totals and role-restricted cost columns. |
| ☐ | `/dashboard/stock-adjustment/all` | `/desk/inventory/adjustments` | Filter adjustment history with add and deduct events. Verify sorting, status or reason, resulting quantities and any drill-downs. |
| ☐ | `/dashboard/stock-adjustment/create` | `/desk/inventory/adjustments/create` | Select location and several variants, record directions or quantities and reasons, and verify validation, aggregate balances and history. |
| ☐ | `/dashboard/stock-transfer/all` | `/desk/inventory/transfers` | Search and filter transfers with open and completed examples. Compare both locations, costs, totals and history controls. |
| ☐ | `/dashboard/stock-transfer/create` | `/desk/inventory/transfers/create` | Move several variants between eligible locations and record costs. Check insufficiency, retries, source and target counts, lots, movements and barcode location. |
| ☐ | `/dashboard/inventory/transfer-history` | `/desk/inventory/transfers` | Compare legacy history filters and entries with stock transfer records and available detail links. |
| ☐ | `/dashboard/inventory/view/outlet` | `/desk/inventory/warehouses?type=OUTLET` | Select an outlet and exercise available SKU filters, stock and lot details, sorting or export as exposed. Use stock at two outlets. |
| ☐ | `/dashboard/inventory/view/warehouse` | `/desk/inventory/warehouses?type=WAREHOUSE` | Select a warehouse and exercise available SKU filters, stock and lot details, sorting or export as exposed. Use stock at two warehouses. |
| ☐ | `/dashboard/inventory/outlet-update` | `/desk/inventory/outlet-update` | Use an authorized outlet user and staged variant stock. Check allowed updates, invalid amounts and consistency with outlet inventory and history. |
| ☐ | `/dashboard/inventory/warehouse-update` | `/desk/inventory/warehouse-update` | Use an authorized warehouse user and staged variant stock. Check allowed updates, invalid amounts and consistency with warehouse inventory and history. |
| ☐ | `/dashboard/outlets-and-warehouse` | `/desk/inventory/warehouses` | Compare location lists by outlet or warehouse, shown stock, available location actions and permission differences. |
| ☐ | `/dashboard/business-location/all` | `/desk/inventory/warehouses` | Search locations, compare type, region and status, and navigate to create or edit as permitted. |
| ☐ | `/dashboard/business-location/create` | `/desk/inventory/warehouses/create` | Create a fixture outlet and warehouse with region and location details. Verify validation and downstream selectors. |
| ☐ | `/dashboard/business-location/edit/[id]` | `/desk/inventory/warehouses/[id]?edit=1` | Fixtures are a warehouse and an outlet with linked stock and assignments. Verify prefill, allowed status or address changes and preserved inventory relationships. |
| ☐ | `/dashboard/barcodes` | `/desk/inventory/barcodes` | Search by SKU or barcode; filter location, status and condition, paginate and print labels. Verify label data and distinct barcode identity. |
| ☐ | `/dashboard/barcodes/generate` | `/desk/inventory/generate-barcodes` | Select eligible variants and counts, generate labels and compare print and registration. Reconcile uniqueness and reject invalid quantities. |
| ☐ | `/dashboard/barcodes/receive` | `/desk/inventory/scan-to-receive` | Select location and date, scan multiple barcodes and submit. Check duplicates, eligible and invalid scans and resulting stock and movements. |
| ☐ | `/dashboard/barcodes/logs` | `/desk/inventory/barcode-logs` | Look up a fixture barcode with several events. Compare timestamps, event labels and location or status history after receipts and transfers. |
| ☐ | `/dashboard/barcodes/default-rate` | `/desk/inventory/rates/new` | Select supplier and products and save line rates. Verify duplicate handling, validation and market or supplier scope. |
| ☐ | `/dashboard/barcodes/default-rate/all` | `/desk/inventory/rates` | Filter seeded default rates by supplier, product or SKU. Compare prices and any change or pagination controls. |
| ☐ | `/dashboard/purchase/all` | `/desk/inventory/purchases` | Filter purchases by available supplier, date and state fields. Verify totals, pagination, record links and permission-dependent controls. |
| ☐ | `/dashboard/purchase/edit/[id]` | `/desk/inventory/purchases/[id]?edit=1` | Fixtures are an editable purchase and an already received purchase containing items and payment data. Verify edits, protected fields and balances or stock consequences. |
| ☐ | `/dashboard/suppliers/all` | `/desk/inventory/suppliers` | Search, filter and page suppliers. Compare summary fields and role-specific create or edit access. |
| ☐ | `/dashboard/suppliers/create` | `/desk/inventory/suppliers/new` | Enter supplier type, terms, contact and address. Verify validation and its presence in purchase and rate selectors. |
| ☐ | `/dashboard/update-supplier/[id]` | `/desk/inventory/suppliers/[id]?edit=1` | Fixtures are a supplier linked to purchases and rates and an inactive counterpart. Verify prefill, changed details and preserved relationships. |
| ☐ | `/dashboard/expenses` | `/desk/payments/expenses` | Filter by date, status, category, channel and payment sources as exposed. Compare approval actions, paging, links and totals. |
| ☐ | `/dashboard/create-expense` | `/desk/payments/expenses/new` | Enter amounts, method, date, category and linked records, including evidence if offered. Verify required fields, save and approval state. |
| ☐ | `/dashboard/update-expense/[id]` | `/desk/payments/expenses/[id]` | Fixtures are a draft and an approved expense with category, channel and source. Check prefill, allowed edits, approval controls and totals after save. |
| ☐ | `/dashboard/expense-report` | `/desk/payments/expense-report` | Compare period or category filters, totals by expense status, and exports where offered. Seed approved, pending and excluded expenses. |
| ☐ | `/dashboard/expense-categories` | `/desk/payments/expense-categories` | Compare list and allowed create, edit, sort or enable actions. Verify existing expense links after changing a category. |
| ☐ | `/dashboard/expense-subcategories` | `/desk/payments/expense-subcategories` | Exercise parent filters and permitted add or edit actions. Verify parent validation and preservation of linked expense records. |
| ☐ | `/dashboard/sales-channels` | `/desk/payments/channels` | Compare channels and permitted changes. Verify updated selectors and the effect on payment or expense reporting. |
| ☐ | `/dashboard/payment-sources` | `/desk/payments/sources` | Compare methods and permitted accounting source changes. Verify what appears in source selectors and finance reports. |

## 3. Reporting, storefront and administration

20 dashboard route patterns.

| Done | Production pattern | Current editable destination | Workflow and fixtures for acceptance |
| --- | --- | --- | --- |
| ☐ | `/dashboard/overview` | `/desk/overview` | Compare demand, delivered revenue, fulfillment, returns, stock value, COD in transit and pre-orders. Exercise date, location and comparison filters, report links and the classic view. |
| ☐ | `/dashboard/reports` | `/desk/reports` | Check links, groupings and role-dependent visibility for all ten reports, including direct bookmarks. |
| ☐ | `/dashboard/reports/[reportId]` | `/desk/reports/[reportId]` | Fixtures cover each report ID below, with multiple dates and locations and finance-sensitive columns. Compare pagination, filters, totals, CSV and XLSX contents, and unauthorized access. |
| ☐ | `/dashboard/header` | `/desk/content/announcements` | Edit an announcement and visibility in a fixture. Compare validation, save, reset and what the staged storefront displays. |
| ☐ | `/dashboard/hero-section` | `/desk/content/hero` | Exercise image and video, CTA, positioning, ordering, visibility and save. Verify media round-trip and staged storefront display. |
| ☐ | `/dashboard/offer-page` | `/desk/content/offer` | Select campaign content, products and visibility. Verify preview or save, reset and public staged offer and checkout effects where applicable. |
| ☐ | `/dashboard/homepage/shop-by-category` | `/desk/content/shop-by-category` | Choose and reorder fixture categories, edit their labels or media and verify staged homepage rendering after save. |
| ☐ | `/dashboard/homepage/best-selling` | `/desk/content/best-selling` | Select and reorder best-selling items with published and unavailable fixtures. Verify save or reset and staged storefront display. |
| ☐ | `/dashboard/homepage/new-arrivals` | `/desk/content/new-arrivals` | Select and reorder applicable new arrivals, adjust visible settings and compare values on the staged storefront after save. |
| ☐ | `/dashboard/homepage/leather-section` | `/desk/content/leather-section` | Edit section content and featured products and validate media or linking controls before checking staged storefront output. |
| ☐ | `/dashboard/banner-update` | `/desk/content/banners` | Compare banner items, media and visibility controls. Exercise add, edit, reorder, clear or save where exposed and verify staged behavior. |
| ☐ | `/dashboard/featured-products` | `/desk/content/featured-products` | Compare product selection and sequence controls, then verify save and staged storefront consumption. |
| ☐ | `/dashboard/staffs` | `/desk/staff/staff` | Search and browse staff and compare visible role, assignment, status and row actions. Verify permission-limited directory browsing. |
| ☐ | `/dashboard/add-new-staff` | `/desk/staff/staff/new` | Create a synthetic staff account with selected role, location and permissions. Check password policy, validation and sign-in with the expected access. |
| ☐ | `/dashboard/update-staff/[slug]` | `/desk/staff/staff/[slug]` | Fixtures are active and disabled staff with distinct roles and locations. Test edit, password or status options where exposed, access revocation and permissible assignments. |
| ☐ | `/dashboard/role` | `/desk/staff/roles` | Compare roles, displayed permission counts and allowed actions. Use assigned and unassigned roles and verify enforced permissions match the labels. |
| ☐ | `/dashboard/add-new-role` | `/desk/staff/roles/new` | Create a fixture role with individual permissions. Check validation and verify a staff member assigned to it can perform only the intended actions. |
| ☐ | `/dashboard/update-role/[slug]` | `/desk/staff/roles/[slug]` | Fixtures are a custom role assigned to two staff members and a protected role. Change a grant, verify effective access and test restrictions. |
| ☐ | `/dashboard/current-plan` | `/desk/settings/current-plan` | Match the production “Coming Soon” screen and verify which roles can see and open it. |
| ☐ | `/dashboard/renew-subscription` | `/desk/settings/renew-subscription` | Match the production “Coming Soon” screen and verify which roles can see and open it. |

For `/dashboard/reports/[reportId]`, run `sales-summary`, `sales-by-product`, `order-status`, `pending-fulfilment`, `returns-rts`, `stock-valuation`, `low-stock`, `stock-movements`, `inventory-aging` and `data-health`. Cover positive rows plus empty and restricted scopes. The classic overview also needs comparison at `/dashboard/overview?view=classic`.

Finish each milestone with fixture IDs and test accounts by role, screenshots showing matched states, operation and export results, and any remaining differences. Mark an entry complete after both design and behavior have been verified or the owner has explicitly accepted a particular difference.
