import { describe, expect, it } from "vitest";
import { returnPathFromCallback, safeSwitchPath, switchBackPath } from "@/lib/workspace-switch";

// Signing in again after a timeout in a client workspace goes through the
// home workspace and back to the page that was open (src/lib/linked-home.ts).
// These paths end up in redirects, so they must stay on the workspace's own pages.

describe("safeSwitchPath", () => {
  it("allows pages of the app", () => {
    expect(safeSwitchPath("/")).toBe("/");
    expect(safeSwitchPath("/work")).toBe("/work");
    expect(safeSwitchPath("/work/abc123?task=xyz")).toBe("/work/abc123?task=xyz");
    expect(safeSwitchPath("/clients/cm123/services/cm456")).toBe("/clients/cm123/services/cm456");
    expect(safeSwitchPath("/applications?view=board&q=a%20b")).toBe("/applications?view=board&q=a%20b");
  });

  it("refuses other sites and odd paths", () => {
    for (const bad of ["", "work", "//evil.com", "/\\evil.com", "https://evil.com/work", "/work/../api", "/work#x", "/a b", "/work?x=<script>"]) {
      expect(safeSwitchPath(bad)).toBeNull();
    }
    expect(safeSwitchPath(null)).toBeNull();
    expect(safeSwitchPath(`/${"a".repeat(600)}`)).toBeNull();
  });

  it("refuses the API and the sign-in pages", () => {
    for (const bad of ["/api/files/1", "/login", "/login?workspace=x", "/switch/to?workspace=x", "/switch/enter", "/support/enter", "/set-password", "/_next/static/x"]) {
      expect(safeSwitchPath(bad)).toBeNull();
    }
    expect(safeSwitchPath("/loginhelp")).toBe("/loginhelp");
  });
});

describe("returnPathFromCallback", () => {
  it("keeps the path of the proxy's callbackUrl, not its host", () => {
    expect(returnPathFromCallback("http://localhost:3000/clients/cm1?tab=files")).toBe("/clients/cm1?tab=files");
    expect(returnPathFromCallback("https://acme.carenela.com/work/p1")).toBe("/work/p1");
    expect(returnPathFromCallback("/work/p1")).toBe("/work/p1");
  });

  it("drops anything unsafe or missing", () => {
    expect(returnPathFromCallback(undefined)).toBeNull();
    expect(returnPathFromCallback("https://acme.carenela.com/api/x")).toBeNull();
    expect(returnPathFromCallback("https://acme.carenela.com/login")).toBeNull();
  });
});

describe("switchBackPath", () => {
  it("builds the home workspace's switch-back address", () => {
    expect(switchBackPath("acme", "/work/p1?task=t1")).toBe("/switch/to?workspace=acme&next=%2Fwork%2Fp1%3Ftask%3Dt1");
    expect(switchBackPath("acme", null)).toBe("/switch/to?workspace=acme");
    expect(switchBackPath("acme", "//evil.com")).toBe("/switch/to?workspace=acme");
  });
});
