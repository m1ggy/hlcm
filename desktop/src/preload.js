// Bridge between the sandboxed pages and the main process. Kept as a plain
// script (no import/export) so it runs in Electron's sandboxed preload,
// which has no CommonJS `exports`. Only the channels listed here exist.

const { contextBridge, ipcRenderer } = require("electron");

const INVOKE_CHANNELS = [
  "state:get",
  "auth:login",
  "auth:mfa",
  "consent:get",
  "consent:accept",
  "clock:run",
  "app:openWeb",
  "app:signOut",
];

contextBridge.exposeInMainWorld("hclm", {
  invoke: (channel, payload) => {
    if (!INVOKE_CHANNELS.includes(channel)) return Promise.reject(new Error(`Unknown channel ${channel}`));
    return ipcRenderer.invoke(channel, payload);
  },
  onState: (callback) => {
    ipcRenderer.on("state", (_event, state) => callback(state));
  },
});
