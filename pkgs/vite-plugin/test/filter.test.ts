import { describe, it, expect } from "vitest";
import { defaultFilter } from "../src/index.js";

describe("defaultFilter", () => {
  it("includes normal schema names", () => {
    expect(defaultFilter("User")).toBe(true);
    expect(defaultFilter("user")).toBe(true);
    expect(defaultFilter("UserSchema")).toBe(true);
    expect(defaultFilter("API_RESPONSE")).toBe(true);
    expect(defaultFilter("createUser")).toBe(true);
  });

  it("excludes names starting with $", () => {
    expect(defaultFilter("$internal")).toBe(false);
    expect(defaultFilter("$helper")).toBe(false);
    expect(defaultFilter("$")).toBe(false);
  });

  it("excludes names ending with Type", () => {
    expect(defaultFilter("UserType")).toBe(false);
    expect(defaultFilter("ResponseType")).toBe(false);
    expect(defaultFilter("Type")).toBe(false);
  });

  it("includes names containing but not ending with Type", () => {
    expect(defaultFilter("TypedUser")).toBe(true);
    expect(defaultFilter("UserTypeSchema")).toBe(true);
    expect(defaultFilter("TypeGuard")).toBe(true);
  });

  it("handles edge cases", () => {
    expect(defaultFilter("")).toBe(true);
    expect(defaultFilter("a")).toBe(true);
    expect(defaultFilter("$Type")).toBe(false); // Both conditions
  });
});
