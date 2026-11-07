# GriipBuddy commerce admin

Step 8 adds a Next.js workspace around the recovered staff API. The route inventory in [evidence](evidence/legacy-routes.txt) records all 102 preserved build entries, including 98 dashboard routes. The workflow library links through the private legacy admin tunnel and identifies dynamic and provider-bound routes. The legacy admin performs its own login and authorization.

## Run locally

Use Node 20.20.2. In the recovered backend, run `npm start` with MongoDB and Redis available on `PATH`. It starts a fresh, network restricted fixture at `127.0.0.1:38100`. Run `npm ci`, `npm run build`, then `GRIIP_ADMIN_TARGET=fixture npm start` here. This opens the private fixture workspace at [127.0.0.1:4318](http://127.0.0.1:4318).

Build the adjacent storefront checkout (or set `GRIIP_ADMIN_TEST_STOREFRONT_DIR` to its path) and run the full browser suite on a fresh fixture:

```sh
export GRIIP_ADMIN_TEST_BACKEND_DIR=/path/to/griipbuddy/backend
export GRIIPBUDDY_TEST_FIXTURE_PASSWORD="$(node -p 'require(process.env.GRIIP_ADMIN_TEST_BACKEND_DIR + "/recovery/fixture.cjs").login.password')"
GRIIP_ADMIN_TEST_FIXTURE_PARITY=1 GRIIP_ADMIN_TEST_WORKSPACE=1 npm test -- --workers=1
```

Playwright starts two local admin processes and a disposable checkout simulator. It uses the fixture role grants and exercises edits on the dedicated replica. No tunnel or hosted account is needed.

### Managed Step 7 profile

Use backend branch `feature/step8-growth-operator` at `829c530` or a compatible revision. Start its isolated recovery runner with `npm start` from the backend directory. It provisions a fresh synthetic MongoDB replica, private receipt storage stubs and isolated provider transports. Wait for the backend to report port 38100 ready.

Start this admin with the managed profile and the fixture write flag. The fixture password comes from the synthetic backend fixture.

```sh
GRIIP_ADMIN_TARGET=fixture GRIIP_ADMIN_MANAGED=1 GRIIP_ADMIN_FIXTURE_WRITES=1 \
  GRIIP_ADMIN_FIXTURE_WORKSPACE=1 npm start
```

Use the same fixture with the browser suite and include the storefront build used by Playwright's local simulator server.

```sh
export GRIIP_ADMIN_TEST_BACKEND_DIR=/path/to/step8-growth/backend
export GRIIP_ADMIN_TEST_STOREFRONT_DIR=/path/to/built/storefront
export GRIIPBUDDY_TEST_FIXTURE_PASSWORD="$(node -p 'require(process.env.GRIIP_ADMIN_TEST_BACKEND_DIR + "/recovery/fixture.cjs").login.password')"
GRIIP_ADMIN_MANAGED=1 npm test -- tests/managed.spec.ts --workers=1
```

Run the managed suite on a fresh fixture. The profile uses the same backend origin and staff identity for the recovered and managed routes. It switches off the standalone checkout simulator controls. See [Step 8 acceptance](STEP8_ACCEPTANCE.md) for coverage and release blockers. For a local-only commit on a machine with the dev release hook installed, set `GRIIPBUDDY_SKIP_DEV_DEPLOY=1` when committing.

### Managed admin with Step 9 checkout

Use the current `feature/step8-growth-operator` backend and a built Step 9 storefront. With the fixture environment above, run the combined profile test against a fresh replica.

```sh
GRIIP_ADMIN_MANAGED=1 GRIIP_ADMIN_INTEGRATED=1 npm test -- tests/step9-overview.spec.ts --workers=1
```

The test starts a Step 9 storefront on port 4328 against the same API as the admin. Managed pricing applies to Step 9 quotes. Step 9 settings and receipt review are separate views within the admin, and the cart coverage editor is read-only in this profile because creating cart coverage switches the market's checkout contract. Cart orders continue to use the managed payment and shipment desks. Overview links open the correct order or report with the current region and filters.

To capture full-page desktop and mobile screenshots, set `GRIIP_ADMIN_TEST_EVIDENCE` to an output directory when running the combined profile test. An optional `GRIIP_ADMIN_IMAGE_ORIGIN` permits dashboard thumbnails from one trusted HTTPS origin. Set it for the build and runtime.

The storefront simulator stores method availability, shipping rates, fallback selection and activity in its existing checkout ledger. It applies those settings to checkout and quote calculations. The admin receives only a privileged service response. Its UI exposes no provider secrets. Receipt downloads are authenticated, and approval requires matching the submitted reference and expected advance amount. The recovered MongoDB and the checkout simulator remain separately labeled in the workspace.

## Website Orders

Open **Website Orders → All Orders** for market-scoped filters, status counts, customer history, and Excel export. **Create Order** uses the Bangladesh catalog and the existing inventory reservation flow. Staff can record cash on delivery, an advance, or a full payment already received. New payment screenshots require an authenticated order view.

This workspace needs the paired backend with the `/api/v1/order/workspace` routes. Courier sync refreshes eligible orders on the current page. Courier and SMS use the configured providers; local fixtures simulate both. The courier fraud lookup is off until the backend is configured with `GRIIP_WEBSITE_ORDER_FRAUD_LOOKUP=1`.

## Hosted sample preview

The [admin](https://dev.griipbuddy.com/desk/overview) opens without a login and shows read-only sample data. The [storefront](https://frontend.griipbuddy.com/bd) uses the same isolated sample catalog with guest shopping and quote simulation. See `deploy/public-build.compose.yaml` and `deploy/public-build.nginx.conf` for the sample stack. Step 10 uses local fixtures and does not update either host.

The Step 8 deployment and rollback notes below describe the older isolated stack and are retained for recovery reference.

### Rollback

For an admin rollback, build the approved admin commit and replace the `admin` service with `docker compose -f deploy/compose.yaml up -d --no-deps admin`. Verify `/admin/sign-in` and the recovery API connection. For a shutdown of the full preview, use the private deployment runbook for both services and the shared dev vhost.

## Frontend preview

The frontend preview bundles the admin, storefront and private recovery backend into sibling `admin`, `storefront` and `backend` directories. Use `admin/deploy/frontend-preview.compose.yaml` with `admin/deploy/frontend-preview.nginx.conf`. It owns a separate MongoDB volume and an internal provider-stub network. Visitors can browse the storefront. The admin accepts the configured preview staff account and checks operation permissions. The recovered API is available only to the apps through loopback.

The new admin uses `/admin`, the storefront uses `/`, and checkout on this hostname is browse-only. The content editor updates the storefront without changing its canonical origin or preview indexing policy. POS records offline payments and supports several lines, item and sale discounts, accounting sources, and partial paid cash returns. Bulk courier handover records a physical handoff for already assigned consignments.

In the protected integration workspace, **Storefront content → Homepage carousel** accepts five photo or video slides. Set `GRIIP_ADMIN_CAMPAIGN_MEDIA_DIR` to a dedicated persistent directory writable by the admin container. The dev reverse proxy must serve that directory read-only at `https://frontend.griipbuddy.com/campaign-media/` and allow POST requests up to 24 MiB at `/admin/api/carousel-media`. Direct HTTPS media URLs also work.

Catalog → Categories is the shared hierarchy for all markets. Staff can search by English name, Bangla name, or slug, create a category under a selected parent, change navigation visibility, and reorder siblings. Existing category links retain their slugs. This workspace uses the isolated API's `/catalog/category-tree` endpoints; when they are unavailable in the target environment, it opens the legacy hierarchy in read-only mode. Category image uploads use the configured catalog media store.
