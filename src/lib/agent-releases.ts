import { readStoredFile, signedReadUrl } from "@/lib/storage";

// Desktop app release files live in the private bucket under agent-releases/
// (uploaded by hand, see desktop/RELEASING.md). They're served through
// /api/agent/updates/<file> as short-lived signed links, which is also the
// feed URL the app's auto-updater uses.

export const RELEASE_PREFIX = "agent-releases/";

// Only files electron-builder produces; anything else 404s.
const RELEASE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(yml|exe|dmg|zip|blockmap)$/;

export function isReleaseFile(name: string) {
  return RELEASE_FILE.test(name);
}

export async function releaseFileUrl(name: string) {
  return signedReadUrl(`${RELEASE_PREFIX}${name}`, 10 * 60 * 1000);
}

export type Release = { version: string; files: string[] };

/** Version + file names from an electron-builder latest*.yml, or null when it isn't uploaded yet. */
async function readManifest(name: string): Promise<Release | null> {
  try {
    const text = (await readStoredFile(`${RELEASE_PREFIX}${name}`)).toString("utf8");
    const version = /^version:\s*['"]?([^'"\s]+)/m.exec(text)?.[1];
    const files = [...text.matchAll(/^\s*-?\s*url:\s*['"]?([^'"\s]+)/gm)].map((m) => m[1]);
    return version ? { version, files: [...new Set(files)] } : null;
  } catch {
    return null;
  }
}

export type Downloads = {
  windows: { version: string; file: string } | null;
  macArm: { version: string; file: string } | null;
  macIntel: { version: string; file: string } | null;
};

/** The newest installers, read from the update manifests so a new release needs no config change. */
export async function latestDownloads(): Promise<Downloads> {
  if (!process.env.GCS_BUCKET) return { windows: null, macArm: null, macIntel: null };
  const [win, mac] = await Promise.all([readManifest("latest.yml"), readManifest("latest-mac.yml")]);
  const pick = (release: Release | null, test: (f: string) => boolean) => {
    const file = release?.files.find(test);
    return release && file ? { version: release.version, file } : null;
  };
  // The Mac manifest lists the zips; the matching dmg has the same name.
  const dmg = (f: string | undefined) => f?.replace(/\.zip$/, ".dmg");
  const arm = pick(mac, (f) => f.endsWith("-arm64.zip"));
  const intel = pick(mac, (f) => f.endsWith("-x64.zip"));
  return {
    windows: pick(win, (f) => f.endsWith(".exe")),
    macArm: arm && { version: arm.version, file: dmg(arm.file)! },
    macIntel: intel && { version: intel.version, file: dmg(intel.file)! },
  };
}
