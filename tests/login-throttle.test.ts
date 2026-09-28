import { describe, expect, it } from "vitest";
import { clearLoginFailures, isLoginThrottled, recordLoginFailure } from "@/lib/login-throttle";

// Brute-force protection for sign-in (counts failures, per IP and per account).

describe("login throttle", () => {
  it("locks an account after 8 failures, whatever the IP, until a success clears it", () => {
    for (let i = 0; i < 8; i++) {
      expect(isLoginThrottled(`10.0.0.${i}`, "org1", "Ann@x.test")).toBe(false);
      recordLoginFailure(`10.0.0.${i}`, "org1", "ann@x.test");
    }
    expect(isLoginThrottled("10.9.9.9", "org1", "ann@x.test")).toBe(true);
    expect(isLoginThrottled("10.9.9.9", "org2", "ann@x.test")).toBe(false); // same email, other workspace
    clearLoginFailures("org1", "ANN@x.test");
    expect(isLoginThrottled("10.9.9.9", "org1", "ann@x.test")).toBe(false);
  });

  it("locks an IP after 30 failures across different accounts", () => {
    for (let i = 0; i < 30; i++) recordLoginFailure("203.0.113.7", "org1", `user${i}@x.test`);
    expect(isLoginThrottled("203.0.113.7", "org1", "fresh@x.test")).toBe(true);
    expect(isLoginThrottled("203.0.113.8", "org1", "fresh@x.test")).toBe(false);
  });
});
