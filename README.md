# Uchumi Feedback API (backend)

Node.js + Express + Turso (hosted SQLite). This is the API only — no
customer or staff pages live here (those are the `customer-site/` and
`staff-dashboard/` folders, deployed separately). It exposes `/api/*`
endpoints and nothing else, plus a `/healthz` check and a one-line status
page at `/`.

Data lives on **Turso**, not on Render — so redeploys, restarts, or
switching Render plans never lose anything. See "Set up Turso" below.

## Set up Turso (do this first)

1. Go to [turso.tech](https://turso.tech) and sign up (free, no card
   needed).
2. Create a database — any name (e.g. `uchumi-feedback`), any nearby
   region.
3. On the database's page, find:
   - **Database URL** — starts with `libsql://...`
   - **Auth Token** — create one if none exists yet ("Create Token")
4. Keep both handy — they go into `TURSO_DATABASE_URL` and
   `TURSO_AUTH_TOKEN` below, whether running locally or on Render.

Turso's free plan covers this app comfortably: 500 databases, 5GB storage,
500 million row reads and 10 million row writes per month.

## Run it locally

```bash
npm install
cp .env.example .env      # then edit .env — see below, including Turso
npm run seed               # creates the database schema and 4 branches
npm run create-admin -- --name "Jane Wanjiru" --email jane@uchumi.co.ke --password "a-strong-password" --role ceo
npm start
```

If you leave `TURSO_DATABASE_URL` unset, the app falls back to a plain
local SQLite file at `./data/uchumi.db` — handy for quick local testing,
but **do not rely on this in production** (that's the old behavior that
caused data to vanish on every Render redeploy).

The API listens on `http://localhost:4000`. To test it against a local
copy of the frontend folders, point their `js/config.js` at
`http://localhost:4000`.

## Environment variables

| Variable             | What it's for                                                                       |
|----------------------|----------------------------------------------------------------------------------|
| `PORT`               | Port the app listens on (default `4000`)                                          |
| `JWT_SECRET`          | Long random string that signs staff login sessions — **must** be set for production |
| `NODE_ENV`            | `production` in production (enables secure cookies)                               |
| `PUBLIC_BASE_URL`     | The **customer-site's** deployed URL — used to build QR codes                     |
| `TURSO_DATABASE_URL`  | From your Turso database's Overview page — **this is where your data lives**       |
| `TURSO_AUTH_TOKEN`    | From the same page ("Create Token" if you don't have one)                          |
| `ALLOWED_ORIGINS`     | Comma-separated: the customer-site URL **and** the staff-dashboard URL             |
| `SETUP_KEY`           | Any hard-to-guess string you choose — unlocks `/setup.html`'s admin tools           |

## Deploy to Render

1. Push this folder to its own GitHub repo (see the top-level README for
   git commands if you need them).
2. On [render.com](https://render.com), **New → Web Service** (or
   **New → Blueprint** if it picks up `render.yaml` automatically), point
   it at this repo. Build command `npm install`, start command
   `npm start`, Free plan is fine — since Turso holds the data now, there's
   no need for a paid plan or a persistent disk at all.
3. Add the environment variables from the table above. `JWT_SECRET` can be
   generated with Render's "Generate" button; `TURSO_DATABASE_URL` and
   `TURSO_AUTH_TOKEN` come from Turso (see above); leave
   `PUBLIC_BASE_URL`/`ALLOWED_ORIGINS` blank for now, you'll set them in
   step 5.
4. Deploy. Once live, note the `https://<your-app>.onrender.com` URL.
5. Deploy `customer-site/` and `staff-dashboard/` (see their own READMEs),
   then come back here and set:
   - `PUBLIC_BASE_URL` = the customer-site's URL
   - `ALLOWED_ORIGINS` = both frontend URLs, comma-separated
6. Create your first CEO account by visiting
   `https://<your-app>.onrender.com/setup.html`, entering your `SETUP_KEY`
   to unlock it, then using "Create a staff account." This tool works any
   time (not just once) — also handy for resetting passwords or adding
   more staff later without needing the dashboard's own staff-management
   tab.

## Adding/editing branches

Branches (currently Lang'ata Hyper, Unicity Mall, Kitengela, Uchumi Deli)
are seeded automatically the first time the app connects to an empty
database. Edit the list in `db/init.js` before first run if it should be
different, or edit the `branches` table directly afterward — either via
Turso's own web dashboard (Data Browser) or the `turso db shell` CLI. The
API, staff dashboard, and QR codes all pick up branch changes automatically.

## Kenya Data Protection Act, 2019 — compliance notes

- Contact details (name/phone/email) on the feedback form are optional and
  only stored with explicit consent.
- Passwords are hashed (bcrypt), sessions are signed (JWT) in httpOnly
  cookies, and the public submission endpoint is rate-limited.
- Depending on Uchumi's processing volumes, registering as a data
  controller/processor with the ODPC may be required — confirm with your
  legal/compliance team.
- Decide and document a retention period for feedback containing personal
  contact details.
- Where the data actually lives matters for compliance too: Turso lets you
  pick your database's region when creating it — choose one appropriate
  for where Uchumi needs its data to reside.

None of this is legal advice — have Uchumi's compliance/legal function
review it before this goes live with real customer data.

## Project structure

```
server.js            Express app entry point (CORS, security headers, routes)
render.yaml            Render config
db/init.js            Turso/libSQL connection, schema, branch seeding
middleware/auth.js     Session verification & role checks
routes/
  branches.js          Public branch list
  feedback.js           Public feedback submission (incl. pricing follow-up)
  auth.js                Staff login/logout/session (cross-site aware)
  dashboard.js            Stats, feedback list, status updates, CSV export
  users.js                  CEO-only staff account management (in-dashboard)
  qr.js                      QR code image generation
  setup.js                    SETUP_KEY-gated admin tools API (create/rename/
                                reset-password/delete staff — works any time)
scripts/
  create-admin.js        CLI alternative to /setup.html (needs terminal access)
  seed.js                  Just creates the schema/branches, no account
public/
  index.html            Small status page shown at the API's root URL
  setup.html              Admin tools page (staff management, gated by SETUP_KEY)
  js/setup.js               Admin tools page logic
```
