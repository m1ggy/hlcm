const $ = (id) => document.getElementById(id);

function busy(form, on) {
  for (const el of form.querySelectorAll("input, button")) el.disabled = on;
}

window.hclm.invoke("state:get").then((state) => {
  $("workspace").value = state.workspace || "";
  $("workspace").placeholder = state.rootDomain ? "yourcompany" : "https://";
  // The part of the address before .carenela.com, as in the browser.
  $("workspace-hint").textContent = state.rootDomain ? `The name in your web address: yourcompany.${state.rootDomain}` : "";
  if (state.error) $("error").textContent = state.error;
  ($("workspace").value ? $("email") : $("workspace")).focus();
});

$("password-step").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $("error").textContent = "";
  busy(form, true);
  const result = await window.hclm.invoke("auth:login", {
    workspace: $("workspace").value,
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
