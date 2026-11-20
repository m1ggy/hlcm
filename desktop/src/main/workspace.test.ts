import { test } from "node:test";
import assert from "node:assert/strict";
import { connectLinkInArgs, parseConnectLink, workspaceLabel, workspaceUrl } from "./workspace";

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

test("a connect link names a workspace on the root domain and a code", () => {
  const link = (server: string, code = "abc") => `carenela://connect?server=${encodeURIComponent(server)}&code=${code}`;
  assert.deepEqual(parseConnectLink(link("https://ctk.carenela.com"), "carenela.com", false), {
    serverUrl: "https://ctk.carenela.com",
    code: "abc",
  });
  // Windows may hand it over with a slash after "connect".
  assert.equal(parseConnectLink(link("https://ctk.carenela.com").replace("connect?", "connect/?"), "carenela.com", false)?.code, "abc");
  // Somewhere else, plain http, a nested name or no code: refused.
  assert.equal(parseConnectLink(link("https://evil.example"), "carenela.com", false), null);
  assert.equal(parseConnectLink(link("https://evilcarenela.com"), "carenela.com", false), null);
  assert.equal(parseConnectLink(link("http://ctk.carenela.com"), "carenela.com", false), null);
  assert.equal(parseConnectLink(link("https://a.b.carenela.com"), "carenela.com", false), null);
  assert.equal(parseConnectLink(link("https://ctk.carenela.com", ""), "carenela.com", false), null);
  assert.equal(parseConnectLink("carenela://other?server=https://ctk.carenela.com&code=abc", "carenela.com", false), null);
  assert.equal(parseConnectLink("https://ctk.carenela.com/?code=abc", "carenela.com", false), null);
});

test("a local test server is only accepted when allowed", () => {
  const link = `carenela://connect?server=${encodeURIComponent("http://ctk.localhost:3000")}&code=abc`;
  assert.equal(parseConnectLink(link, "carenela.com", false), null);
  assert.equal(parseConnectLink(link, "carenela.com", true)?.serverUrl, "http://ctk.localhost:3000");
});

test("the connect link is picked out of command-line arguments", () => {
  assert.equal(connectLinkInArgs(["Carenela.exe", "--flag", "carenela://connect?code=x"]), "carenela://connect?code=x");
  assert.equal(connectLinkInArgs(["Carenela.exe"]), null);
});
