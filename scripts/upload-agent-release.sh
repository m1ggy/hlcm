#!/usr/bin/env bash
# Uploads a desktop app release (desktop/RELEASING.md) to the prod bucket's
# agent-releases/ folder, through the app container on the droplet — it
# already holds the bucket credentials, so nothing else needs a Google key.
# Each file is streamed over SSH straight into the bucket. Installers go
# first and the latest*.yml manifests last, so no app ever sees a version
# before its files exist.
#
# Usage: scripts/upload-agent-release.sh <dir with the release files> <user@host>
# Env:   DEPLOY_PATH (default /opt/hclm-app), SSH_PORT (default 22),
#        SSH_OPTS (extra ssh options, e.g. "-i ~/.ssh/key").
# Used by .github/workflows/agent-release.yml after every agent-v* build.

set -euo pipefail

dir=${1:?release folder}
target=${2:?user@host}
deploy_path=${DEPLOY_PATH:-/opt/hclm-app}
port=${SSH_PORT:-22}
read -r -a ssh_opts <<<"${SSH_OPTS:-}"

# Runs inside the app container: stdin -> gs://$GCS_BUCKET/<key>, signed in
# with the app's own service-account key (GOOGLE_APPLICATION_CREDENTIALS).
# Built-in Node only: the standalone build bundles the storage library into
# the server instead of shipping it as a package.
uploader=$(base64 -w0 <<'JS'
const crypto = require("node:crypto");
const fs = require("node:fs");
const { Readable } = require("node:stream");
const [key, contentType] = process.argv.slice(1);
const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
(async () => {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/devstorage.read_write", aud: sa.token_uri, iat: now, exp: now + 3600 });
  const assertion = unsigned + "." + crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const tokenRes = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!tokenRes.ok) throw new Error("token: " + tokenRes.status + " " + (await tokenRes.text()));
  const { access_token } = await tokenRes.json();
  const url = "https://storage.googleapis.com/upload/storage/v1/b/" + encodeURIComponent(process.env.GCS_BUCKET) + "/o?uploadType=media&name=" + encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer " + access_token, "content-type": contentType },
    body: Readable.toWeb(process.stdin),
    duplex: "half",
  });
  if (!res.ok) throw new Error("upload: " + res.status + " " + (await res.text()));
  const { size } = await res.json();
  console.log("uploaded " + key + " (" + size + " bytes)");
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
JS
)

content_type() {
  case "$1" in
    *.yml) echo "text/yaml" ;;
    *.exe) echo "application/vnd.microsoft.portable-executable" ;;
    *.dmg) echo "application/x-apple-diskimage" ;;
    *.zip) echo "application/zip" ;;
    *) echo "application/octet-stream" ;;
  esac
}

upload() {
  local file=$1 name
  name=$(basename "$file")
  # Only electron-builder's own file names (the server serves nothing else).
  [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.(yml|exe|dmg|zip|blockmap)$ ]] || { echo "skipping $name"; return; }
  ssh "${ssh_opts[@]}" -p "$port" "$target" \
    "cd '$deploy_path' && docker compose exec -T app node -e \"eval(Buffer.from('$uploader','base64').toString())\" 'agent-releases/$name' '$(content_type "$name")'" \
    <"$file"
}

shopt -s nullglob
installers=("$dir"/*.exe "$dir"/*.dmg "$dir"/*.zip "$dir"/*.blockmap)
manifests=("$dir"/latest*.yml)
[ ${#installers[@]} -gt 0 ] || { echo "No installers in $dir" >&2; exit 1; }
[ ${#manifests[@]} -gt 0 ] || { echo "No latest*.yml in $dir" >&2; exit 1; }

for f in "${installers[@]}"; do upload "$f"; done
for f in "${manifests[@]}"; do upload "$f"; done
echo "Done: ${#installers[@]} files and ${#manifests[@]} manifests in agent-releases/"
