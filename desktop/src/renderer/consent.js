const $ = (id) => document.getElementById(id);
let version = null;

window.hclm.invoke("consent:get").then((policy) => {
  if (!policy) {
    $("text").textContent = "Couldn't load the notice. Check your connection and reopen the tracker.";
    return;
  }
  version = policy.version;
  $("text").textContent = policy.text;
  $("accept").disabled = false;
});

$("accept").addEventListener("click", async () => {
  $("accept").disabled = true;
  $("error").textContent = "";
  const result = await window.hclm.invoke("consent:accept", { version });
  if (!result.ok) {
    $("error").textContent = result.error;
    $("accept").disabled = false;
  }
});
