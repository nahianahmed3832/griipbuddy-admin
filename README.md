# GriipBuddy commerce admin

Step 8 adds a Next.js workspace around the recovered staff API. The route inventory in [evidence](evidence/legacy-routes.txt) records all 102 preserved build entries, including 98 dashboard routes. The workflow library links through the private legacy admin tunnel and identifies dynamic and provider-bound routes. The legacy admin performs its own login and authorization.

## Run locally

Use Node 20.20.2 or newer. Start the recovery tunnel described in `LOCAL_DEVELOPMENT_GUIDE.md` in the private recovery worktree. Run `npm ci`, `npm run build`, then `npm start` in this directory. The workspace binds [127.0.0.1:4318](http://127.0.0.1:4318). Its server accepts a fixed loopback staging target and creates an HTTP-only staff session after verification with the recovered API.

For disposable write tests, run `bash recovery/isolated.sh admin` from `backend` in the private recovery worktree on macOS. It seeds five synthetic roles in a fresh MongoDB replica and binds the API to 38100. Clone and build [griipbuddy-web](https://github.com/nahianahmed3832/griipbuddy-web) alongside this repository, or set `GRIIP_ADMIN_TEST_STOREFRONT_DIR` to its checkout path. Build the admin, supply the private fixture password through `GRIIPBUDDY_TEST_FIXTURE_PASSWORD`, and run `npm test` in this directory. Playwright starts both admin targets and a fresh checkout simulator. The write tests use disposable fixtures. The staging tests require the recovery tunnel on port 14801.

For the native operations suite, set `GRIIP_ADMIN_TEST_BACKEND_DIR` to the private backend checkout that started the disposable replica. Use a fresh replica for each run. To include the cash POS and explicit coupon status checks, apply private recovery commits `f779eb2` and `d880943` to a separate checkout with the admin fixture runner and set `GRIIP_ADMIN_TEST_FIXTURE_PARITY=1`. That flag enables `GRIIP_ADMIN_FIXTURE_PARITY_WRITES` on Playwright's local admin process. New native operations require the local fixture target, fixture writes, and the corresponding staff permissions.

The storefront simulator stores method availability, shipping rates, fallback selection and activity in its existing checkout ledger. It applies those settings to checkout and quote calculations. The admin receives only a privileged service response. Its UI exposes no provider secrets. Receipt downloads are authenticated, and approval requires matching the submitted reference and expected advance amount. The recovered MongoDB and the checkout simulator remain separately labeled in the workspace.

## Hosted development

The development Compose project is `griipbuddy-step8-preview`. The separate [storefront](https://dev.griipbuddy.com/) and [admin](https://dev.griipbuddy.com/admin) share a TLS hostname. See [deployment configuration](deploy) and [acceptance report](STEP8_ACCEPTANCE.md).

The admin Compose service binds port 4318 to Hostinger loopback and uses the synthetic recovery API through port 14801. The separately managed storefront listens on port 4317 and uses a private SQLite volume and simulated providers. The storefront requires a preview credential. The admin opens directly to the staff sign-in form and limits repeated sign-in requests. The TLS vhost blocks the raw recovery API and storefront operator routes. The preserved admin requires the existing local SSH tunnel for compatibility links.

Set `GRIIP_ADMIN_STAFF_EMAIL` and `GRIIP_ADMIN_STAFF_PHONE` in the hosted admin environment to let a staff member sign in by email. The alias uses the password and permissions of the matching recovery account. For staging Playwright checks, provide the rotated super admin password through `GRIIP_ADMIN_TEST_STAGING_PASSWORD`.

### Rollback

For an admin rollback, build the approved admin commit and replace the `admin` service with `docker compose -f deploy/compose.yaml up -d --no-deps admin`. Verify `/admin/sign-in` and the recovery API connection. For a shutdown of the full preview, use the private deployment runbook for both services and the shared dev vhost.
