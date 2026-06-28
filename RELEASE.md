# Releasing Theia

Two artifacts ship from this one monorepo, on two independent paths:

1. **`chalkdeck`** — the engine + CLI, published to **npm**.
2. **The web app** (landing + playground + gallery + docs) — deployed to **Vercel** as a static site.

Nothing here is published or deployed automatically. CI builds and tests both on
every push/PR; going live is a deliberate, manually-triggered action that needs
secrets only you can add. This file is that checklist.

---

## 0. One-time facts

- **Package name:** the npm name `chalk` is taken (the string-styling library),
  so the CLI is published as **`chalkdeck`**. It installs both a `chalk` and a
  `chalkdeck` command.
- **License:** MIT (`LICENSE`).
- **Versioning:** [changesets](https://github.com/changesets/changesets). Only
  `chalkdeck` is publishable; the engine packages (`@chalk/*`) and the web app
  (`chalk`) are `private` and bundled/served, never published.

---

## 1. npm — publish `chalkdeck`

### Secrets you add yourself

- Create an npm **automation access token** (npmjs.com → *Access Tokens* →
  *Generate* → *Automation*; this type bypasses interactive 2FA, which CI can't do).
- Add it to GitHub: repo **Settings → Secrets and variables → Actions → New
  repository secret**, name **`NPM_TOKEN`**.
- Never commit a token. The release workflow reads it from the secret.

### Cut a release

```bash
# 1. Record what changed (pick the semver bump; commit the generated file).
npm run changeset

# 2. Apply the bump + regenerate CHANGELOG.md, then commit.
npm run version-packages
git add -A && git commit -m "Version packages"

# 3a. Publish from CI (recommended): GitHub → Actions → "Release (npm)" →
#     Run workflow → tick `publish: true`. Requires NPM_TOKEN to be set.
#
# 3b. …or publish locally:
npm login                 # interactive 2FA here, in your terminal
npm run release           # = npm run build && changeset publish
```

### Verify before going live (no publish)

```bash
npm run build
npm pack -w chalkdeck --dry-run     # inspect the file manifest
npm publish --dry-run -w chalkdeck  # same manifest, asserts auth/name/version
```

A clean-room smoke test (what an end user gets):

```bash
npm pack -w chalkdeck --pack-destination /tmp/cd
mkdir /tmp/cd/clean && cd /tmp/cd/clean && npm init -y
npm install /tmp/cd/chalkdeck-*.tgz   # installs 1 package, 0 transitive deps
echo '# Hi
@slider a [0,3] = 1
:::scene
@axes ax x:[-3,3] y:[-3,3] grid
@plot f on ax : a*x^2
:::' > demo.chalk
./node_modules/.bin/chalk build demo.chalk   # → demo.html, self-contained
```

---

## 2. Vercel — deploy the web app

The app is fully client-side: **no backend, no env vars, no serverless
functions.** Config lives in `vercel.json` (static build + SPA rewrite + asset
caching).

### Connect the project (dashboard, one-time)

1. vercel.com → **Add New… → Project** → import `AbdessamadAe/Theia`.
2. **Root Directory:** leave at the repo root (so the npm workspaces install).
3. Framework preset: **Other** (settings come from `vercel.json`):
   - Install: `npm install`
   - Build: `npm run build`
   - Output: `apps/chalk/dist`
4. No environment variables. Deploy.

After connecting, Vercel automatically gives you **preview deploys on every PR**
and **production deploys on push to `main`** — no extra config.

### Local dry-run (optional, needs your account)

```bash
npm i -g vercel
vercel link                 # links this repo to your Vercel project (auth)
vercel pull --yes           # fetch project settings
vercel build                # produces .vercel/output (the static bundle)
vercel deploy --prebuilt    # preview deploy; add --prod for production
```

> `vercel build` requires a linked, authenticated project — it can't run
> headless in this repo without your account. The produced bundle is just
> `apps/chalk/dist` (an `index.html` + hashed `/assets/*`), which `npm run build`
> already emits and CI verifies.

---

## 3. CI (already wired, no secrets needed)

`.github/workflows/ci.yml` runs on every push/PR to `main`: install → build
(engine + CLI + app) → typecheck → test (incl. the docs example-compile-check)
→ verify the `chalkdeck` package manifest. It needs no secrets.

`.github/workflows/release.yml` is **off by default** — it only runs on manual
dispatch and stays a dry-run unless you tick `publish: true` *and* `NPM_TOKEN`
is set. That is the only thing standing between the repo and a live npm publish.

---

## Secrets summary

| Secret      | Where                          | Used by                       | Required for |
| ----------- | ------------------------------ | ----------------------------- | ------------ |
| `NPM_TOKEN` | GitHub repo Actions secrets    | `release.yml`                 | npm publish  |
| (none)      | Vercel project (dashboard)     | Vercel Git integration        | web deploy   |

CI and the web build need **no** secrets. The npm publish needs **only**
`NPM_TOKEN`. Nothing is published or prod-deployed until you take the manual
steps above.
