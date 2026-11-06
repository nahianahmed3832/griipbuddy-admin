# Step 8 admin reconstruction acceptance

The development candidate adds a responsive admin workspace and a separate storefront preview. The native workspace uses the recovered staff API. The workflow library retains access to the preserved admin for operations that still use its original forms. Production replacement remains blocked on workflow parity and the commerce engine gates from Step 7.

## Functionality

| Area | Status | Evidence and boundaries |
| --- | --- | --- |
| Workspace | Complete for development | Responsive sidebar, overview, staff menu, keyboard module search, regional navigation, filters, per-page and selected-row CSV export, bulk reference copying and activity panels. |
| Catalog, inventory and fulfilment | Partial | Native views cover products, variants, taxonomy, brands, reviews, FAQs, stock, lots, movements, purchasing, rates, barcodes, suppliers, transfers, locations, orders, pre-orders, assignments and returns. The workspace links through the private tunnel for preserved edits, purchasing, receiving, scanning, warehouse transfers and courier writes. |
| Customer support, promotions, CMS and POS | Partial | Native customer and repeat customer lists, coupons, announcements, banners, hero, POS list and report. The preserved workflow library covers product-linked CMS groups, offer pages, content editors, customer password changes and POS forms. Full support tooling, native CMS editing and SEO controls remain open. |
| Markets | Partial | Country currency and activation updates use the recovered country API. Product visibility and regional prices use recovered catalog records. The simulator applies configurable market shipping fees and international fallback. Country-specific inventory and promotions lack a verified unified write contract. |
| Payments and accounting | Complete in the sandbox | COD, manual advance, PayPal and Stripe enablement by market. Manual receipt approval requires the amount, currency and matching reference. Private downloads and approval history were verified. Accounting lists and order payment summaries use recovered records. |
| Production provider configuration | Blocked | The existing Step 7 engine supports simulation. Live provider onboarding, verified sandbox provider credentials, live settlement and the authoritative MongoDB reservation integration require their own acceptance. Staff can see simulator availability, and credentials stay on the server. |
| Staff and reporting | Complete for development | Existing staff identity and permissions govern menus, records and exports. Finance can export permitted cost columns. Warehouse export excludes cost and margin. Five synthetic staging identities covered super admin, finance, warehouse, customer service and restricted staff. |
| Rare and hidden workflows | Partial | The build inventory records 102 routes, including 98 dashboard routes. Dynamic routes are indexed for use from the appropriate record. Fraud, subscription and destructive tools stay outside the new UI. The route inventory establishes preservation, with full legacy workflow execution still open. |

No production collection or commerce authority was added. The new administration settings and activity live in the already-isolated Step 7 checkout ledger and affect the same simulator used by the development storefront. The recovered staging API supplies the admin's operational tables.

## Verification

- Admin lint, TypeScript and production build passed. Ten Playwright scenarios passed on local and isolated staging. They opened every registered native list view, checked the five staff roles, exercised all ten reports with CSV and Excel downloads, and covered desktop, tablet and phone layouts.
- The native country form changed and restored a disposable country record. Cross-origin edits and unauthorized payment requests were denied. Sandbox settings persisted, affected the storefront quote and rejected a stale revision. Manual receipt review refused a mismatched reference and recorded a verified advance on matching evidence.
- Storefront regression suites passed 16 fixture tests, 7 recovered API tests and 12 checkout release tests. The recovered backend passed 20 baseline checks. Admin production dependency audit reported zero advisories. Git credential scanning found no leaks.
- The initial browser run exposed an origin header problem on sign-in. Subsequent checks corrected the stock adjustment response adapter, the returns report ID and transaction-reference normalization. The final admin suite passed.

## Remaining acceptance

Test every preserved mutating workflow, including mixed POS and warehouse contention, partial returns, barcode and purchase edits, and courier reconciliation. Complete native replacements for the forms that still open the preserved admin. Verify the protected admin against a suitable scrubbed dataset with the intended operational roles before any cutover. The [Step 7 release gates](https://github.com/nahianahmed3832/griipbuddy-web/blob/main/FINAL_ACCEPTANCE_REPORT.md) still apply.

## Hosted development receipt

Source commit `4831b826b0ef` was built on Hostinger for the separate `griipbuddy-step8-preview` project. The public dev DNS record resolves to Hostinger. Let's Encrypt issued the dedicated hostname certificate, and the HTTP vhost redirects to HTTPS. Both services bind host loopback. The two protected entry points are the [development storefront](https://dev.griipbuddy.com/) and [development admin](https://dev.griipbuddy.com/admin).

Hosted Chromium verified anonymous requests were challenged, the storefront loaded and quoted a synthetic cart over HTTPS, and staff sign-in redirected under `/admin` with a secure HTTP-only cookie. Payment controls connected to the hosted simulator. The market editor and protected CSV export loaded. The raw recovery API and checkout operator and receipt endpoints returned 404 from the dev edge. The existing isolated legacy admin and the production admin edge both returned HTTP 200. The three production container IDs matched the pre-preview receipt.

The preview credential is in the owner's private GriipBuddy support folder. Staff then sign in with a synthetic account. The preserved workflows continue to use their original private tunnel.
