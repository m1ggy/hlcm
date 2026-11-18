const $ = (id) => document.getElementById(id);

function busy(form, on) {
  for (const el of form.querySelectorAll("input, button")) el.disabled = on;
}

window.hclm.invoke("state:get").then((state) => {
  $("server").value = state.serverUrl || "";
  // A build with the address baked in (config.json defaultServerUrl) hides
  // the field; the link below brings it back, e.g. for a test server.
  if (state.serverUrl && state.serverUrlBuiltIn) {
    $("server-field").hidden = true;
    $("change-server").hidden = false;
  }
  if (state.error) $("error").textContent = state.error;
  ($("server").value ? $("email") : $("server")).focus();
});

$("change-server").addEventListener("click", (event) => {
  event.preventDefault();
  $("server-field").hidden = false;
  $("change-server").hidden = true;
  $("server").focus();
});

$("password-step").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $("error").textContent = "";
  busy(form, true);
  const result = await window.hclm.invoke("auth:login", {
    serverUrl: $("server").value,
    email: $("email").value,
    password: $("password").value,
  });
  busy(form, false);
  $("password").value = "";
  if (!result.ok) {
    $("error").textContent = result.error;
    return;
  }
  if (result.mfaRequired) {
    form.hidden = true;
    $("mfa-step").hidden = false;
    $("otp").focus();
  }
});

$("mfa-step").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $("error").textContent = "";
  busy(form, true);
  const result = await window.hclm.invoke("auth:mfa", { otp: $("otp").value });
  busy(form, false);
  if (!result.ok) {
    $("error").textContent = result.error;
    $("otp").value = "";
    if (/again/i.test(result.error)) {
      form.hidden = true;
      $("password-step").hidden = false;
    }
  }
});
