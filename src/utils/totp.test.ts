import { describe, expect, it } from "vitest";
import { base32Encode, hotp, totpCode, verifyTotp } from "./totp";

describe("totp", () => {
  it("matches RFC 6238 SHA1 vectors", () => {
    const key = Buffer.from("12345678901234567890", "ascii");
    expect(hotp(key, Math.floor(59 / 30))).toBe("287082");
    expect(hotp(key, Math.floor(1111111109 / 30))).toBe("081804");
    expect(hotp(key, Math.floor(1111111111 / 30))).toBe("050471");
    expect(hotp(key, Math.floor(1234567890 / 30))).toBe("005924");
    expect(hotp(key, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("round-trips a base32 secret and accepts the current code", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
    const at = 59_000;
    const code = totpCode(secret, at);
    expect(code).toBe("287082");
    expect(verifyTotp(secret, code, at)).toBe(true);
    expect(verifyTotp(secret, "000000", at)).toBe(false);
    expect(verifyTotp(secret, "abc", at)).toBe(false);
  });
});
