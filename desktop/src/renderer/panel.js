const $ = (id) => document.getElementById(id);
let state = null;

const BUTTONS = {
  CLOCKED_OUT: [["in", "Clock in", true]],
  CLOCKED_IN: [
    ["break-start", "Take a break", false],
    ["out", "Clock out", true],
  ],
  ON_BREAK: [
    ["break-end", "End break", true],
    ["break-end-day", "Done for the day", false],
  ],
};

function time(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function elapsed(fromIso) {
  const total = Math.max(0, Math.floor((Date.now() - Date.parse(fromIso)) / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function renderTimer() {
  if (!state) return;
  const from = state.status === "CLOCKED_IN" ? state.clockIn : state.status === "ON_BREAK" ? state.breakStart : null;
  $("timer").textContent = from ? elapsed(from) : "0:00:00";
}

function render(next) {
  state = next;
  const labels = { CLOCKED_IN: "Clocked in", ON_BREAK: "On break", CLOCKED_OUT: "Clocked out" };
  $("status").textContent = labels[state.status];
  $("dot").className = `dot ${state.status === "CLOCKED_IN" && state.trackedHere ? "tracking" : state.status === "ON_BREAK" ? "paused" : ""}`;
  $("since").textContent =
    state.status === "CLOCKED_IN" ? `Since ${time(state.clockIn)}` : state.status === "ON_BREAK" ? `Break since ${time(state.breakStart)}` : " ";
  $("offline").hidden = state.online;
  $("elsewhere").hidden = !(state.status === "CLOCKED_IN" && !state.trackedHere);
  $("consent").hidden = !state.consentNeeded;
  $("error").textContent = state.online ? state.error || "" : "";
  $("shot").textContent = state.lastScreenshotAt ? `Last screenshot ${time(new Date(state.lastScreenshotAt).toISOString())}` : "";
  $("uploads").textContent = state.pendingUploads ? `${state.pendingUploads} waiting to upload` : "";
  $("who").textContent = state.user ? state.user.name : "";

  const buttons = $("buttons");
  buttons.replaceChildren(
    ...(BUTTONS[state.status] || []).map(([action, label, primary]) => {
      const button = document.createElement("button");
      button.textContent = label;
      if (primary) button.className = "primary";
      button.addEventListener("click", async () => {
        for (const b of buttons.querySelectorAll("button")) b.disabled = true;
        const result = await window.hclm.invoke("clock:run", action);
        if (!result.ok) $("error").textContent = result.error;
        for (const b of buttons.querySelectorAll("button")) b.disabled = false;
      });
      return button;
    })
  );
  renderTimer();
}

window.hclm.onState(render);
window.hclm.invoke("state:get").then(render);
setInterval(renderTimer, 1000);
$("web").addEventListener("click", () => window.hclm.invoke("app:openWeb"));
$("signout").addEventListener("click", () => window.hclm.invoke("app:signOut"));
