import { app, shell } from "electron";
import { autoUpdater } from "electron-updater";
import type { MenuItemConstructorOptions } from "electron";

// Updates come from the Carenela workspace the app is signed in to
// (`/api/agent/updates/*`, which hands out short-lived links to the release
// files in the private bucket), so there's no separate update URL to set.
//
// The builds are not code-signed (no certificates, by decision):
// - Windows: electron-updater installs unsigned updates fine (it only checks
//   signatures when a publisherName is configured). Downloads in the
//   background and installs silently once the user isn't clocked in.
// - Mac: Squirrel.Mac refuses unsigned updates, so the app only tells the
//   user a new version exists and opens the download page.

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 30_000;

type Deps = {
  serverUrl: () => string | null;
  /** True when installing now won't interrupt tracked time. */
  canInstallNow: () => boolean;
  /** Before quitAndInstall, so the quit guard lets the app close. */
  beforeInstall: () => void;
  changed: () => void;
  log: (message: string) => void;
};

export class Updater {
  available: string | null = null;
  downloaded: string | null = null;
  private checking = false;

  constructor(private deps: Deps) {
    const write = (level: string) => (message: unknown) => deps.log(`updater ${level}: ${String(message)}`);
    autoUpdater.logger = { info: write("info"), warn: write("warn"), error: write("error"), debug: () => {} };
    autoUpdater.autoDownload = process.platform === "win32";
    autoUpdater.autoInstallOnAppQuit = process.platform === "win32";
    autoUpdater.on("update-available", (info) => {
      this.available = info.version;
      deps.changed();
    });
    autoUpdater.on("update-downloaded", (info) => {
      this.downloaded = info.version;
      deps.changed();
      this.installIfIdle();
    });
    autoUpdater.on("error", (error) => deps.log(`update check failed: ${error.message}`));
  }

  start() {
    // Only packaged builds have update metadata; `npm start` skips this.
    if (!app.isPackaged) return;
    setTimeout(() => void this.check(), FIRST_CHECK_MS);
    setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  async check() {
    const serverUrl = this.deps.serverUrl();
    if (!serverUrl || this.checking || this.downloaded) return;
    this.checking = true;
    try {
      autoUpdater.setFeedURL({ provider: "generic", url: `${serverUrl}/api/agent/updates` });
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.deps.log(`update check failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.checking = false;
    }
  }

  /** Windows: restart into the downloaded update when nothing is being tracked. */
  installIfIdle() {
    if (!this.downloaded || process.platform !== "win32" || !this.deps.canInstallNow()) return;
    this.deps.log(`installing update ${this.downloaded}`);
    this.deps.beforeInstall();
    autoUpdater.quitAndInstall(true, true);
  }

  menuItems(): MenuItemConstructorOptions[] {
    const serverUrl = this.deps.serverUrl();
    if (process.platform === "win32" && this.downloaded) {
      return [{ label: `Update ready (v${this.downloaded}): installs when you clock out`, enabled: false }];
    }
    if (process.platform === "darwin" && this.available && serverUrl) {
      return [{ label: `Download update (v${this.available})`, click: () => void shell.openExternal(`${serverUrl}/time/app`) }];
    }
    return [];
  }
}
