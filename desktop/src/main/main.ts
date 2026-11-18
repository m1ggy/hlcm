import os from "node:os";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Notification,
  powerMonitor,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import { ApiClient, ApiError, NetworkError, SignedOutError, type ClockState, type DeviceInfo, type Me, type StoredAuth } from "./api";
import { UploadQueue, type QueueItem } from "./queue";
import { Tracker } from "./tracker";
import { trayIcon, type IconState } from "./icon";
import { Updater } from "./updater";
import { clearAuth, defaultServerUrl, loadAuth, loadSettings, log, queueKey, saveAuth, saveSettings } from "./store";

// HCLM Tracker: tray app for office staff. Clock in/out here; while
// clocked in it records the window in front and screenshots (see
// tracker.ts), clocks out after 2 hours with no input, and
// uploads them through an encrypted offline queue (queue.ts). The server
// is the source of truth for the clock: every action and the once-a-minute
// heartbeat return the current state, and tracking follows it.

const HEARTBEAT_MS = 60_000;
const RENDERER = path.join(__dirname, "..", "..", "src", "renderer");
const PRELOAD = path.join(__dirname, "..", "..", "src", "preload.js");

type ClockAction = "in" | "out" | "break-start" | "break-end" | "break-end-day";

let api: ApiClient | null = null;
let me: Me | null = null;
let online = true;
let lastError: string | null = null;
let lastScreenshotAt: number | null = null;
let updater: Updater;
let mfaChallenge: { serverUrl: string; challenge: string } | null = null;
let pendingAutoOut: number | null = null;
let quitting = false;

let tray: Tray | null = null;
const windows: Partial<Record<"login" | "consent" | "panel", BrowserWindow>> = {};

const deviceInfo: DeviceInfo = {
  name: os.hostname().slice(0, 100),
  os: process.platform === "darwin" ? "darwin" : "win32",
  appVersion: app.getVersion(),
};

let queue: UploadQueue;
let tracker: Tracker;

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function openWindow(name: keyof typeof windows, options: { width: number; height: number; alwaysOnTop?: boolean; closable?: boolean }) {
  const existing = windows[name];
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }
  const win = new BrowserWindow({
    width: options.width,
    height: options.height,
    resizable: false,
    maximizable: false,
    minimizable: name === "panel",
    alwaysOnTop: options.alwaysOnTop ?? false,
    closable: options.closable ?? true,
    title: "HCLM Tracker",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenu(null);
  win.loadFile(path.join(RENDERER, `${name}.html`));
  win.once("ready-to-show", () => win.show());
  // External links open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://localhost")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  if (name === "panel") {
    // Closing the panel just hides it; the app keeps running in the tray.
    win.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        win.hide();
      }
    });
  }
  win.on("closed", () => delete windows[name]);
  windows[name] = win;
  return win;
}

function closeWindow(name: keyof typeof windows) {
  const win = windows[name];
  if (win && !win.isDestroyed()) {
    win.setClosable(true);
    win.destroy();
  }
  delete windows[name];
}

function showPanel() {
  if (!api) return openWindow("login", { width: 380, height: 520 });
  return openWindow("panel", { width: 360, height: 440 });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function viewState() {
  return {
    signedIn: !!api,
    serverUrl: api?.serverUrl ?? loadSettings().serverUrl ?? defaultServerUrl(),
    serverUrlBuiltIn: (api?.serverUrl ?? loadSettings().serverUrl ?? defaultServerUrl()) === defaultServerUrl() && !!defaultServerUrl(),
    user: me?.user ?? null,
    status: me?.status ?? "CLOCKED_OUT",
    clockIn: me?.openEntry?.clockIn ?? null,
    breakStart: me?.openBreak?.breakStart ?? null,
    trackedHere: !!me?.openEntry?.trackingThisDevice,
    openSource: me?.openEntry?.source ?? null,
    consentNeeded: !!me && !me.policy.accepted,
    online,
    pendingUploads: queue?.pendingCount() ?? 0,
    lastScreenshotAt,
    error: lastError,
  };
}

function iconState(): IconState {
  if (!api || !online) return "problem";
  if (me?.status === "ON_BREAK") return "paused";
  if (tracker.tracking) return "tracking";
  return "off";
}

function statusLine() {
  if (!api) return "Signed out";
  if (!online) return "Offline: time stops counting after 15 min";
  switch (me?.status) {
    case "CLOCKED_IN":
      return me.openEntry?.trackingThisDevice ? "Clocked in, tracking" : "Clocked in elsewhere (not tracked here)";
    case "ON_BREAK":
      return "On break";
    default:
      return "Clocked out";
  }
}

function broadcast() {
  const state = viewState();
  for (const win of Object.values(windows)) if (win && !win.isDestroyed()) win.webContents.send("state", state);
  updateTray();
}

function updateTray() {
  if (!tray) return;
  tray.setImage(trayIcon(iconState()));
  tray.setToolTip(`HCLM Tracker: ${statusLine()}`);
  const status = me?.status;
  const template: Electron.MenuItemConstructorOptions[] = [];
  if (api && me) {
    template.push({ label: me.user.name, enabled: false }, { label: statusLine(), enabled: false }, { type: "separator" });
    if (status === "CLOCKED_OUT") template.push({ label: "Clock in", click: () => void runClock("in") });
    if (status === "CLOCKED_IN") {
      template.push({ label: "Take a break", click: () => void runClock("break-start") });
      template.push({ label: "Clock out", click: () => void runClock("out") });
    }
    if (status === "ON_BREAK") {
      template.push({ label: "End break", click: () => void runClock("break-end") });
      template.push({ label: "Done for the day", click: () => void runClock("break-end-day") });
    }
    template.push({ type: "separator" });
  }
  template.push({ label: api ? "Open tracker" : "Sign in", click: () => showPanel() });
  if (api) template.push({ label: "Open HCLM in browser", click: () => void shell.openExternal(api!.serverUrl) });
  if (api) template.push({ label: "Sign out", click: () => void signOut() });
  const updateItems = updater?.menuItems() ?? [];
  if (updateItems.length) template.push({ type: "separator" }, ...updateItems);
  template.push({ type: "separator" }, { label: "Quit", click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function notify(body: string) {
  if (Notification.isSupported()) new Notification({ title: "HCLM Tracker", body, silent: true }).show();
}

/** The server's word on the clock. Tracking starts/stops to match it. */
function applyClockState(state: ClockState) {
  const wasTracking = tracker.tracking;
  me = me ? { ...me, ...state } : me;
  tracker.setNoInputLimit(state.autoClockOutIdleMinutes);
  const entry = state.openEntry;
  if (entry?.trackingThisDevice) {
    tracker.start({ timeEntryId: entry.id, clockIn: Date.parse(entry.clockIn) });
  } else if (wasTracking) {
    tracker.stop();
    notify("Your clock was stopped on the server (clocked out on the web, or this computer was offline or asleep for 15+ minutes).");
  }
  broadcast();
}

function handleError(error: unknown, context: string) {
  if (error instanceof SignedOutError) {
    void forceSignedOut(error.message);
    return;
  }
  if (error instanceof NetworkError) {
    online = false;
    lastError = "Can't reach the server.";
  } else if (error instanceof ApiError) {
    lastError = error.message;
  } else {
    lastError = "Something went wrong.";
    log(`${context}: ${(error as Error).message}`);
  }
  broadcast();
}

async function loadMe() {
  if (!api) return;
  try {
    me = await api.request<Me>("/me");
    online = true;
    lastError = null;
    applyClockState(me);
    if (!me.policy.accepted) showConsent();
  } catch (error) {
    handleError(error, "me");
  }
}

async function heartbeat() {
  if (!api) return;
  try {
    const state = await api.request<ClockState>("/heartbeat", { method: "POST" });
    const cameBack = !online;
    online = true;
    if (cameBack) {
      lastError = null;
      queue.kick();
    }
    if (me) applyClockState(state);
    else await loadMe();
  } catch (error) {
    handleError(error, "heartbeat");
  }
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** macOS: no screenshots or activity without these. Windows needs nothing. */
async function ensurePermissions(): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  const screen = systemPreferences.getMediaAccessStatus("screen") === "granted";
  if (accessibility && screen) return true;
  if (!accessibility) systemPreferences.isTrustedAccessibilityClient(true);
  const missing = [!screen && "Screen Recording", !accessibility && "Accessibility"].filter(Boolean).join(" and ");
  const { response } = await dialog.showMessageBox({
    type: "warning",
    message: `HCLM Tracker needs ${missing} permission`,
    detail: `Open System Settings > Privacy & Security, turn on HCLM Tracker under ${missing}, then restart the app.`,
    buttons: ["Open System Settings", "Cancel"],
  });
  if (response === 0) {
    const pane = screen ? "Privacy_Accessibility" : "Privacy_ScreenCapture";
    void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
  }
  return false;
}

async function runClock(action: ClockAction, at?: number): Promise<{ ok: boolean; error?: string }> {
  if (!api) return { ok: false, error: "Not signed in" };
  if (action === "in" || action === "break-end") {
    if (me && !me.policy.accepted) {
      showConsent();
      return { ok: false, error: "Accept the monitoring notice first" };
    }
    if (!(await ensurePermissions())) return { ok: false, error: "Permissions needed" };
  }
  try {
    const state = await api.request<ClockState>("/clock", {
      method: "POST",
      json: at ? { action, at: new Date(at).toISOString() } : { action },
    });
    online = true;
    lastError = null;
    if (action === "out" || action === "break-start") tracker.stop(at ?? Date.now());
    applyClockState(state);
    // A downloaded update waits until tracking stops.
    if (action === "out" || action === "break-start" || action === "break-end-day") updater.installIfIdle();
    return { ok: true };
  } catch (error) {
    handleError(error, `clock ${action}`);
    return { ok: false, error: lastError ?? "Failed" };
  }
}

// ---------------------------------------------------------------------------
// No-input clock-out
// ---------------------------------------------------------------------------

/** 2 hours with no keyboard or mouse input: clock out back when input stopped, retrying while offline. */
async function autoClockOut(since: number) {
  pendingAutoOut ??= since;
  const at = pendingAutoOut;
  const result = await runClock("out", at);
  if (result.ok) {
    pendingAutoOut = null;
    notify(`Clocked out at ${new Date(at).toLocaleTimeString()}: no keyboard or mouse input for 2 hours. Clock in again to keep working.`);
  } else if (!online) {
    setTimeout(() => void autoClockOut(at), 30_000);
  } else {
    // Server refused (e.g. already clocked out elsewhere): nothing to retry.
    pendingAutoOut = null;
    tracker.stop(at);
  }
  broadcast();
}

// ---------------------------------------------------------------------------
// Sign-in / out
// ---------------------------------------------------------------------------

function normalizeServerUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function useAuth(auth: StoredAuth) {
  api = new ApiClient(auth, app.getVersion(), (next) => {
    saveAuth(next).catch((error) => log(`saving sign-in failed: ${error}`));
  });
  queue.setSender(sendItem);
}

async function completeSignIn(serverUrl: string, tokens: { deviceId: string; refreshToken: string }) {
  const auth = { serverUrl, deviceId: tokens.deviceId, refreshToken: tokens.refreshToken };
  await saveAuth(auth);
  saveSettings({ serverUrl });
  useAuth(auth);
  mfaChallenge = null;
  closeWindow("login");
  await loadMe();
  if (me?.policy.accepted) showPanel();
}

function showConsent() {
  openWindow("consent", { width: 520, height: 620 });
}

async function signOut() {
  if (me && me.status !== "CLOCKED_OUT") {
    await dialog.showMessageBox({ type: "info", message: "Clock out before signing out." });
    return;
  }
  const pending = queue.pendingCount();
  if (pending > 0) {
    const { response } = await dialog.showMessageBox({
      type: "warning",
      message: `${pending} upload(s) haven't reached the server yet`,
      detail: "Signing out now discards them. Stay signed in until you're back online to keep them.",
      buttons: ["Stay signed in", "Sign out anyway"],
    });
    if (response === 0) return;
  }
  try {
    await api?.request("/logout", { method: "POST" });
  } catch {
    // Best effort: the local sign-out below still happens.
  }
  await forceSignedOut(null);
}

async function forceSignedOut(message: string | null) {
  tracker.stop();
  queue.setSender(null);
  // Queued items were for this device's session; a new sign-in is a new
  // device the server won't accept them from.
  queue.clear();
  await clearAuth();
  api = null;
  me = null;
  lastError = message;
  closeWindow("panel");
  closeWindow("consent");
  openWindow("login", { width: 380, height: 520 });
  broadcast();
}

async function sendItem(item: QueueItem) {
  if (!api) throw new NetworkError("signed out");
  if (item.kind === "intervals") {
    await api.request("/intervals", { method: "POST", json: item.body });
  } else {
    const form = new FormData();
    form.set("meta", JSON.stringify(item.meta));
    form.set("image", new Blob([Buffer.from(item.image, "base64")], { type: "image/jpeg" }), "screen.jpg");
    form.set("thumb", new Blob([Buffer.from(item.thumb, "base64")], { type: "image/jpeg" }), "thumb.jpg");
    await api.request("/screenshots", { method: "POST", form });
  }
  broadcast();
}

// ---------------------------------------------------------------------------
// IPC (renderer -> main). Every channel is listed in preload.ts.
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle("state:get", () => viewState());

  ipcMain.handle("auth:login", async (_event, input: { serverUrl: string; email: string; password: string }) => {
    const serverUrl = normalizeServerUrl(String(input?.serverUrl ?? ""));
    if (!serverUrl) return { ok: false, error: "Enter the HCLM address, starting with https://" };
    try {
      const result = await ApiClient.login(serverUrl, {
        email: String(input.email ?? ""),
        password: String(input.password ?? ""),
        device: deviceInfo,
      });
      if ("mfaRequired" in result) {
        mfaChallenge = { serverUrl, challenge: result.challenge };
        return { ok: true, mfaRequired: true };
      }
      await completeSignIn(serverUrl, result);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Sign-in failed" };
    }
  });

  ipcMain.handle("auth:mfa", async (_event, input: { otp: string }) => {
    if (!mfaChallenge) return { ok: false, error: "Start sign-in again" };
    try {
      const result = await ApiClient.login(mfaChallenge.serverUrl, {
        challenge: mfaChallenge.challenge,
        otp: String(input?.otp ?? ""),
        device: deviceInfo,
      });
      if ("mfaRequired" in result) return { ok: false, error: "Start sign-in again" };
      await completeSignIn(mfaChallenge.serverUrl, result);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Sign-in failed" };
    }
  });

  ipcMain.handle("consent:get", () => (me ? { version: me.policy.version, text: me.policy.text } : null));

  ipcMain.handle("consent:accept", async (_event, input: { version: string }) => {
    if (!api) return { ok: false, error: "Not signed in" };
    try {
      const state = await api.request<ClockState>("/consent", { method: "POST", json: { policyVersion: String(input?.version ?? "") } });
      applyClockState(state);
      closeWindow("consent");
      showPanel();
      return { ok: true };
    } catch (error) {
      handleError(error, "consent");
      return { ok: false, error: lastError ?? "Failed" };
    }
  });

  ipcMain.handle("clock:run", (_event, action: ClockAction) => {
    const allowed: ClockAction[] = ["in", "out", "break-start", "break-end", "break-end-day"];
    if (!allowed.includes(action)) return { ok: false, error: "Unknown action" };
    return runClock(action);
  });

  ipcMain.handle("app:openWeb", () => {
    if (api) void shell.openExternal(api.serverUrl);
  });

  ipcMain.handle("app:signOut", () => signOut());
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showPanel());

  app.whenReady().then(async () => {
    if (process.platform === "darwin") app.dock?.hide();
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

    queue = new UploadQueue(path.join(app.getPath("userData"), "queue"), await queueKey(), log, () => void forceSignedOut("Signed out. Please sign in again."));
    tracker = new Tracker({
      enqueue: (item) => {
        queue.enqueue(item);
        broadcast();
      },
      noInput: (since) => void autoClockOut(since),
      screenshotTaken: (at) => {
        lastScreenshotAt = at;
        broadcast();
      },
      log,
    });
    registerIpc();

    updater = new Updater({
      serverUrl: () => api?.serverUrl ?? null,
      canInstallNow: () => !tracker.tracking,
      beforeInstall: () => {
        quitting = true;
      },
      changed: () => updateTray(),
      log,
    });
    updater.start();

    tray = new Tray(trayIcon("problem"));
    tray.on("click", () => showPanel());
    updateTray();

    const auth = await loadAuth();
    if (auth) {
      useAuth(auth);
      await loadMe();
      if (me?.policy.accepted) showPanel();
    } else {
      openWindow("login", { width: 380, height: 520 });
    }

    setInterval(() => void heartbeat(), HEARTBEAT_MS);
    // Back from sleep: catch up with the server right away.
    powerMonitor.on("resume", () => void heartbeat());
    // OS shutdown: keep what we have on disk; the server closes the session
    // at the last heartbeat.
    powerMonitor.on("shutdown", () => tracker.stop());
  });

  // Tray app: closing every window doesn't quit.
  app.on("window-all-closed", () => {});

  app.on("before-quit", (event) => {
    if (quitting) return;
    if (tracker?.tracking && api) {
      event.preventDefault();
      void (async () => {
        const { response } = await dialog.showMessageBox({
          type: "question",
          message: "You're clocked in",
          detail: "Clock out before quitting? If you quit without clocking out, the server stops your clock about 15 minutes after the app closes.",
          buttons: ["Clock out and quit", "Quit without clocking out", "Cancel"],
          defaultId: 0,
          cancelId: 2,
        });
        if (response === 2) return;
        if (response === 0) {
          const result = await runClock("out");
          if (!result.ok) {
            await dialog.showMessageBox({ type: "error", message: "Couldn't clock out", detail: result.error });
            return;
          }
        }
        tracker.stop();
        quitting = true;
        app.quit();
      })();
      return;
    }
    tracker?.stop();
    quitting = true;
  });
}
