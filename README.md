# Simple Shop

A small, complete e-commerce assignment built with **React + Express/Node.js + MongoDB**, running in three Docker Compose services. Customers sign in, collect products in a persistent bag, and submit an order with a private payment-slip image. An operator reviews payments through a local command.

The application runs at **http://localhost:8080**. This is a local classroom demonstration: no real transfer is needed. Uploading a slip creates an order awaiting review, not a verified payment.

## Read these guides

- [DOCKER_GUIDE.md](DOCKER_GUIDE.md): how the three tiers, containers, networking, and persistent data fit together.
- [CODE_GUIDE.md](CODE_GUIDE.md): where to edit the application, with worked examples.
- [GITHUB_GUIDE.md](GITHUB_GUIDE.md): upload the project yourself, step by step.
- [TEST_RESULTS.md](TEST_RESULTS.md): checks completed and their limits.

## Start the shop

Docker Desktop must be running. In Terminal:

```bash
cd "/Users/shine/Desktop/Coding/E-commerce"
./scripts/setup-env.sh
docker compose -f compose.yaml -f compose.compass.yaml up --build -d
docker compose ps
```

Wait for all three services to be healthy, then open **http://localhost:8080**. The optional Compass file also exposes MongoDB to your Mac at `127.0.0.1:27018`. To keep the database private to Docker, start with only `docker compose up --build -d` instead.

`setup-env.sh` generates secrets only if `.env` is absent or empty. It preserves an existing nonempty `.env`. The script can use host Node.js or a temporary Node Docker container. You do not need to install MongoDB, React, or Express globally.

### Create an account or use a demo customer

The easiest option is **Create an account** on the sign-in page. Names need 2–80 characters; passwords need 12–128 characters.

Two customers are seeded on first startup:

- `jamie@example.com`
- `alex@example.com`

Their password is the value of `DEMO_CUSTOMER_PASSWORD` in your local `.env`. Open that file privately to copy it. The app does not display or hardcode its password. Changing this value after a customer is seeded does **not** reset that customer's password.

### Try the full flow

1. Sign in or create your own account.
2. Add a product to your bag, change its quantity, and continue to checkout.
3. In demo mode, click **Download a sample slip** on checkout.
4. Select the downloaded PNG and click **Submit my order**.
5. Open **My orders** to see the saved reference and payment-review status.
6. Use the operator commands below to approve or reject the payment.
7. Refresh the order page to see the decision.

The sample is at `frontend/public/demo/sample-slip.png` and says it is not a real payment. Quantity, prices, ownership, and file validity are independently checked by the server.

## Manual payment review

From the project root while the backend is running:

```bash
./scripts/orders.sh list
./scripts/orders.sh inspect ORDER_REFERENCE
./scripts/orders.sh review ORDER_REFERENCE CONFIRMED --reviewer "Lecturer"
./scripts/orders.sh review ORDER_REFERENCE REJECTED --reviewer "Lecturer" --reason "Please check the transferred amount."
```

Replace `ORDER_REFERENCE` with a reference printed by `list`, such as `SS-...`. Run only the decision appropriate to that order; an already-reviewed order cannot be changed again.

`inspect` prints the order snapshot and exports its slip to a private temporary folder on your Mac. It prints the file path for opening in Preview. Delete that temporary folder after reviewing it. This requires local project/Docker access; there is no admin website or public review endpoint.

For this demo, the reviewer records a simulated decision. The app does not connect to a bank, perform OCR, issue refunds, or verify transfer authenticity automatically.

## Connect MongoDB Compass

Start using both Compose files as above. Create a Compass connection with:

| Setting | Value |
| --- | --- |
| Host / port | `127.0.0.1` / `27018` |
| Authentication | Username / Password |
| Username | `shop_app` (or `MONGO_APP_USERNAME` from `.env`) |
| Password | `MONGO_APP_PASSWORD` from `.env` |
| Authentication database | `simple_shop` (or `MONGO_DB_NAME`) |
| TLS | Off for this local demonstration |

The backend uses `mongodb:27017` on Docker's private network, not the Compass host address. Use the application credentials, not the root credentials. Application collections are `users`, `products`, `carts`, `orders`, and `sessions`.

Do not hand-edit password hashes or order status in Compass. The application's registration, seed, and review commands maintain the validation rules.

## Configuration

See `.env.example` for all settings. Your `.env` is excluded from Git.

| Change | Setting |
| --- | --- |
| Browser port | Set both `APP_PORT` and the matching `APP_ORIGIN` |
| Actual receiving details | `BANK_NAME`, `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NUMBER` |
| Demo instructions | `PAYMENT_DEMO_MODE=true` by default |
| Enable real receiving instructions | Fill all bank fields and set `PAYMENT_DEMO_MODE=false` |
| Demo accounts/catalog | `SEED_DEMO_DATA=true` |
| Database image | `MONGO_IMAGE=mongo:7.0.43` |
| Local cookies | `COOKIE_SECURE=false` for HTTP; requires HTTPS if true |
| Request limits | `AUTH_RATE_LIMIT`, `ORDER_RATE_LIMIT`, `API_RATE_LIMIT` |

After changing environment values, use `docker compose ... up -d` with your chosen Compose files so containers are recreated with the new values. `restart` alone does not load new environment values. Do not regenerate database passwords against an initialized volume. Currency is THB; changing an existing catalog's currency requires an explicit migration, not merely relabeling prices.

### MongoDB version compatibility on this machine

The initial `mongo:8.0.32` image refused to start on this machine's Docker kernel `7.0.12-linuxkit`. Its log referenced SERVER-121912. We verified the new volume was empty and selected `mongo:7.0.43`, which runs successfully here. No pre-existing database was downgraded or deleted. See [MongoDB's kernel compatibility notice](https://www.mongodb.com/community/forums/t/mongodb-8-x-and-linux-kernel-6-19/337547).

Keep this tested version for the assignment. Do not attach an existing database to a different major MongoDB version without a migration plan. Images are explicit versions/major lines; npm versions are locked in package-lock files.

## Editing and automatic reload

Start with [CODE_GUIDE.md](CODE_GUIDE.md). It maps common lecturer requests to the responsible files and includes three worked changes.

For the normal built app, rebuild after changing source:

```bash
docker compose -f compose.yaml -f compose.compass.yaml up --build -d
```

For live editing with Vite and Node watch, use:

```bash
docker compose -f compose.yaml -f compose.compass.yaml -f compose.dev.yaml up --build -d
```

The browser address remains `http://localhost:8080`. Frontend source edits reload through Vite; backend edits restart the Node process. Return to the built version with the normal command above. Newly added npm dependencies still require rebuilding the appropriate image. Development tools are an opt-in local workflow, not a deployment configuration.

## Validation

Backend tests run in a **separate Compose project, database, and volume**:

```bash
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
```

Tests refuse any database name not ending in `_test`. To remove only their disposable containers and volume after testing:

```bash
docker compose -f compose.test.yaml down -v
```

Run static checks in containers without installing dependencies on your Mac:

```bash
docker compose exec backend npm run lint
docker build --target build -t simple-shop-frontend-check frontend
docker run --rm simple-shop-frontend-check npm run lint
```

For browser tests, keep the shop running, then install the local frontend development dependencies/browser:

```bash
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
```

Browser tests create synthetic `browser-...@example.com` accounts and sample orders in the running local shop. The backend integration suite is isolated from those records and your own records. Browser tests check the full purchase journey, second-customer isolation, deep-link refresh, and a 375px viewport. See [TEST_RESULTS.md](TEST_RESULTS.md) for the implementation checks performed.

For formatting on your Mac, run `npm ci` in the root and then `npm run format`. To lint source locally, also run `npm ci` in both backend and frontend before `npm run lint` from the root.

## Everyday Docker commands

```bash
# State and logs
docker compose ps
docker compose logs --tail=80 backend

# Stop without removing any data
docker compose stop

# Resume, including Compass access
docker compose -f compose.yaml -f compose.compass.yaml up -d

# Remove containers/network, keep named data volumes
docker compose -f compose.yaml -f compose.compass.yaml down
```

The named volumes are `se-part2-shop_mongo_data` and `se-part2-shop_slip_uploads`. Preserve both together when backing up or moving the project. A database backup without its slips is incomplete. Do not copy live MongoDB data files as a backup; stop the database or use its backup tools.

**Destructive reset:** `docker compose -f compose.yaml -f compose.compass.yaml down -v` deletes all shop users, carts, orders, sessions, and slips. Use it only if you intentionally want a fresh demo. It is not needed for ordinary source edits or restarts.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Docker unavailable | Open Docker Desktop and confirm `docker info` finishes |
| Shop has not appeared | Wait for `docker compose ps` to show healthy services; inspect backend/database logs |
| Form says session expired | Refresh and use `http://localhost:8080`; the browser origin must match `APP_ORIGIN` |
| Database authentication fails | Check the original `.env` credentials; first-use scripts do not rerun on an existing volume |
| Compass cannot connect | Include `compose.compass.yaml`; use port 27018 and auth database `simple_shop` |
| Product edit does not appear | Run the explicit catalog update described in CODE_GUIDE, not only a container restart |
| Slip rejected | Use a valid single PNG/JPEG below 5 MiB and 20 megapixels; PDF/HEIC/SVG are not accepted |
| Repeated checkout request conflicts | Open the existing order returned by the error; check My orders before starting a new attempt |
| A port is busy | Choose another `APP_PORT` and matching `APP_ORIGIN`, or change only the host port in the Compass override |

## Scope and architecture

```text
Browser → React/Nginx frontend → Express API → MongoDB
                                     └──────→ private slip volume
```

The frontend never connects directly to the database. Nginx proxies `/api` to the backend on the same origin. Sessions are stored in MongoDB, passwords use Argon2id, mutating requests require a CSRF header and matching origin, and order/slip endpoints enforce ownership.

Cart versions prevent stale changes. Checkout stores immutable item prices, uses unique customer/cart-version and idempotency-key indexes, and clears the cart conditionally. Failure recovery avoids deleting a slip for an order that may have committed. Old unreferenced files are cleaned on startup after a 24-hour grace period.

Finite inventory, delivery, refunds, slip replacement, payment gateways, password recovery, and public deployment are outside this assignment. This local app provides neither automatic proof of payment nor production banking integration.
