import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceLabel, workspaceUrl } from "./workspace";

test("a short name is a workspace on the root domain", () => {
  assert.equal(workspaceUrl("CTK", "carenela.com"), "https://ctk.carenela.com");
  assert.equal(workspaceUrl(" sunrise-care ", "carenela.com"), "https://sunrise-care.carenela.com");
  assert.equal(workspaceUrl("bad_name", "carenela.com"), null);
  assert.equal(workspaceUrl("ctk", ""), null);
});

test("an address or URL is used as given, https only (http for local testing)", () => {
  assert.equal(workspaceUrl("ctk.carenela.com", "carenela.com"), "https://ctk.carenela.com");
  assert.equal(workspaceUrl("https://ctk.carenela.com/login", "carenela.com"), "https://ctk.carenela.com");
  assert.equal(workspaceUrl("http://ctk.carenela.com", "carenela.com"), null);
  assert.equal(workspaceUrl("http://ctk.localhost:3000", "carenela.com"), "http://ctk.localhost:3000");
  assert.equal(workspaceUrl("", "carenela.com"), null);
});

test("the field shows the short name for the root domain", () => {
  assert.equal(workspaceLabel("https://ctk.carenela.com", "carenela.com"), "ctk");
  assert.equal(workspaceLabel("http://ctk.localhost:3000", "carenela.com"), "http://ctk.localhost:3000");
});
