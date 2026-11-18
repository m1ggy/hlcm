const $ = (id) => document.getElementById(id);
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

async function answer(decision) {
  $("yes").disabled = $("no").disabled = true;
  await window.hclm.invoke("idle:answer", decision);
}

window.hclm.invoke("idle:get").then((idle) => {
  if (!idle) return;
  const minutes = Math.round((idle.end - idle.start) / 60000);
  $("range").textContent = `No keyboard or mouse activity from ${time(idle.start)} to ${time(idle.end)} (${minutes} min).`;
  const deadline = Date.now() + idle.timeoutMs;
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    $("countdown").textContent = `No answer in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} counts as No.`;
  };
  tick();
  setInterval(tick, 1000);
});

$("yes").addEventListener("click", () => answer("KEPT"));
$("no").addEventListener("click", () => answer("DISCARDED"));
