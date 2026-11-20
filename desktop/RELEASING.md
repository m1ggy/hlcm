# Releasing the Carenela desktop app

The builds are **not code-signed** (no Windows certificate or Apple Developer
account, by decision). What that means for users is explained on the
download page (`/time/app`):

- **Windows:** the first install shows "Windows protected your PC"; they click
  More info → Run anyway. Updates then install automatically when they're
  clocked out. On a Windows 11 PC with **Smart App Control** switched on,
  unsigned apps are blocked outright with no override; those PCs need Smart
  App Control turned off (Windows Security → App & browser control).
- **Mac:** the first open is blocked; they allow it under System Settings →
  Privacy & Security → Open Anyway. macOS won't auto-install unsigned
  updates, so the tray menu shows "Download update" and they reinstall the
  same way. Each new build has a new ad-hoc signature, so macOS may ask for
  Screen Recording and Accessibility permission again after an update.

## One-time setup

1. `config.json` holds the product's domain (`{ "rootDomain": "carenela.com" }`).
   Sign-in asks for the workspace's short name and signs in to
   `<name>.carenela.com`; a full address (e.g. `http://ctk.localhost:3000`)
   still works for testing.

   Usually nobody types that: the download page's **Connect the app** button
   opens `carenela://connect?server=…&code=…` (registered by the installer,
   app 0.4.0 and later) and the app signs in with that one-time code
   (`/api/agent/pair`). The app only accepts links to `*.<rootDomain>`
   (plus localhost when run with `npm start`) and always asks before
   connecting.

2. Screenshot retention backstop on the bucket. The app server already deletes
   screenshots older than 90 days every day (`src/lib/activity-retention.ts`);
   this lifecycle rule catches anything it misses, including old versions
   (the bucket has Object Versioning on).

   `gcloud storage buckets update --lifecycle-file` **replaces** the bucket's
   whole lifecycle config, so check for existing rules first:

   ```sh
   gcloud storage buckets describe gs://$GCS_BUCKET --format="default(lifecycle_config)"
   ```

   If that prints nothing, apply ours:

   ```sh
   gcloud storage buckets update gs://$GCS_BUCKET --lifecycle-file=desktop/gcs-lifecycle.json
   ```

   If it prints rules, merge them into a copy of `gcs-lifecycle.json` first.

## Each release: in the cloud (GitHub Actions)

`.github/workflows/agent-release.yml` builds Windows and Mac on GitHub's
machines, so no Mac is needed.

1. Bump `version` in `package.json` and commit.
2. Tag and push the tag (it must match the version, or the build stops):

   ```sh
   git tag agent-v0.2.1
   git push origin agent-v0.2.1
   ```

3. The workflow runs the tests, builds both platforms and creates a GitHub
   Release `agent-v0.2.1` with every installer, `.blockmap` and `latest*.yml`.
4. The workflow then publishes the files to the bucket's `agent-releases/`
   folder (`scripts/upload-agent-release.sh`, through the droplet with the
   deploy secrets), so the download page and auto-update pick it up. To hold
   a build back, delete the Release's tag before that job runs, or cancel it.

Running the workflow by hand from the Actions tab (no tag) only builds; the
files are kept as run artifacts for 14 days instead of a Release.

## Each release: on your own machines

1. Bump `version` in `package.json` (the updater only offers a higher version).
2. `npm test`.
3. Windows (on Windows): `npm run dist:win`. Produces in `release/`:
   `Carenela-Setup-<version>.exe`, its `.blockmap`, and `latest.yml`.
4. Mac (must be built on a Mac; dmg can't be built on Windows):
   `npm ci && npm run dist:mac`. Produces `Carenela-<version>-arm64.dmg`,
   `-x64.dmg`, the matching `.zip` files, `.blockmap`s and `latest-mac.yml`.
5. Upload to the private bucket under `agent-releases/` (installers first,
   manifests last, so no app sees a version before its files exist). The
   script does it through the droplet's app container, which already has
   the bucket credentials:

   ```sh
   SSH_OPTS="-i ~/.ssh/hclm_deploy" scripts/upload-agent-release.sh desktop/release root@<droplet>
   ```

The app server serves these through `/api/agent/updates/<file>` (short-lived
signed links). The download page reads the manifests to link the newest
installers, and the apps check that same path every 6 hours. Nothing in the
web app needs changing for a new release.

If you only build one platform, upload just its files; the other platform
keeps its previous version.
