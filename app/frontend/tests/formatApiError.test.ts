import { describe, it, expect } from "vitest";
import { ApiError, formatApiError } from "../app/services/api";

describe("formatApiError", () => {
  it("handles ApiError with object detail (message & code)", () => {
    const detail = { message: "Username already exists", code: "username_exists" };
    const err = new ApiError("ignored", 400, detail);
    const out = formatApiError(err);
    expect(out.message).toBe("Username already exists");
    expect(out.code).toBe("username_exists");
    expect(out.detail).toEqual(detail);
  });

  it("handles ApiError with string detail", () => {
    const err = new ApiError("ignored top", 401, "Invalid token");
    const out = formatApiError(err);
    expect(out.message).toBe("Invalid token");
    expect(out.code).toBeUndefined();
    expect(out.detail).toBe("Invalid token");
  });

  it("falls back to ApiError.message when detail is missing", () => {
    const err = new ApiError("Top-level message", 500, undefined);
    const out = formatApiError(err);
    expect(out.message).toBe("Top-level message");
    expect(out.detail).toBeUndefined();
  });

  it("handles plain structured server object { message, code }", () => {
    const payload = { message: "Email already registered", code: "email_exists" };
    const out = formatApiError(payload);
    expect(out.message).toBe("Email already registered");
    expect(out.code).toBe("email_exists");
    expect(out.detail).toEqual(payload);
  });

  it("handles plain server object with error key", () => {
    const payload = { error: "Something went wrong" };
    const out = formatApiError(payload);
    expect(out.message).toBe("Something went wrong");
    expect(out.code).toBeUndefined();
    expect(out.detail).toEqual(payload);
  });

  it("string inputs return message as-is", () => {
    const out = formatApiError("Just a plain string");
    expect(out.message).toBe("Just a plain string");
    expect(out.code).toBeUndefined();
    expect(out.detail).toBeUndefined();
  });

  it("non-string primitives are stringified", () => {
    const out = formatApiError(12345);
    expect(out.message).toBe("12345");
  });

  it("object without known keys is stringified as JSON", () => {
    const payload = { foo: "bar", baz: 1 };
    const out = formatApiError(payload);
    // message will be JSON.stringify(payload) per implementation fallback
    expect(out.message).toBe(JSON.stringify(payload));
    expect(out.detail).toEqual(payload);
  });

  it("preserves nested detail for ApiError.detail objects", () => {
    const nested = { message: "Nested", code: "nested_code", info: { a: 1 } };
    const err = new ApiError("ignored", 400, nested);
    const out = formatApiError(err);
    expect(out.message).toBe("Nested");
    expect(out.code).toBe("nested_code");
    expect(out.detail).toEqual(nested);
  });
});
