// Envelope crypto round-trip tests (real WebCrypto, no fakes).
// Run with: npx vitest run supabase/functions/__tests__/crypto.test.ts

import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  decryptApiKey,
  encryptApiKey,
  generateDataKeyBytes,
  loadMasterKey,
  unwrapDataKey,
  wrapDataKey,
} from "../_shared/crypto.ts";
import { AppError } from "../_shared/errors.ts";
import type { EdgeEnv } from "../_shared/supabaseAdmin.ts";

function randomMasterKeyB64(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Encode(bytes);
}

export function makeEnv(overrides: Partial<EdgeEnv> = {}): EdgeEnv {
  return {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    MASTER_ENCRYPTION_KEY: randomMasterKeyB64(),
    MASTER_ENCRYPTION_KEY_ID: "v1",
    FRONTEND_ORIGIN: "http://localhost:5173",
    ...overrides,
  };
}

describe("envelope encryption", () => {
  it("round-trips a data key through master-key wrap/unwrap", async () => {
    const env = makeEnv();
    const masterKey = await loadMasterKey(env);
    const dataKeyBytes = generateDataKeyBytes();
    const wrapped = await wrapDataKey(masterKey, dataKeyBytes);

    expect(wrapped.wrappedDataKey).not.toBe(dataKeyBytes);
    // base64 ciphertext must not contain the raw key bytes
    expect(base64Decode(wrapped.wrappedDataKey)).not.toEqual(dataKeyBytes);

    const unwrapped = await unwrapDataKey(masterKey, wrapped.wrappedDataKey, wrapped.wrapIv);
    const encrypted = await encryptApiKey(unwrapped, "sk-secret-123");
    const decrypted = await decryptApiKey(unwrapped, encrypted.encryptedKey, encrypted.iv);
    expect(decrypted).toBe("sk-secret-123");
  });

  it("uses a fresh IV per encryption and produces distinct ciphertexts", async () => {
    const env = makeEnv();
    const masterKey = await loadMasterKey(env);
    const dataKey = await unwrapDataKey(
      masterKey,
      ...(await (async () => {
        const k = generateDataKeyBytes();
        const w = await wrapDataKey(masterKey, k);
        return [w.wrappedDataKey, w.wrapIv] as const;
      })()),
    );

    const a = await encryptApiKey(dataKey, "same-plaintext");
    const b = await encryptApiKey(dataKey, "same-plaintext");
    expect(a.iv).not.toBe(b.iv);
    expect(a.encryptedKey).not.toBe(b.encryptedKey);
    expect(await decryptApiKey(dataKey, a.encryptedKey, a.iv)).toBe("same-plaintext");
  });

  it("fails closed when the master key has the wrong size", async () => {
    const shortKey = base6EncodeSafe(16);
    await expect(loadMasterKey(makeEnv({ MASTER_ENCRYPTION_KEY: shortKey }))).rejects.toThrow(
      AppError,
    );
  });

  it("raises decryption_failed (no crypto internals) for tampered ciphertext", async () => {
    const env = makeEnv();
    const masterKey = await loadMasterKey(env);
    const bytes = generateDataKeyBytes();
    const wrapped = await wrapDataKey(masterKey, bytes);
    const dataKey = await unwrapDataKey(masterKey, wrapped.wrappedDataKey, wrapped.wrapIv);
    const encrypted = await encryptApiKey(dataKey, "sk-value");

    const tampered = base64Encode(
      Uint8Array.from(base64Decode(encrypted.encryptedKey), (b, i) =>
        i === 0 ? b ^ 0xff : b,
      ),
    );
    const error = await decryptApiKey(dataKey, tampered, encrypted.iv).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("decryption_failed");
  });

  it("cross-user isolation: another user's data key cannot decrypt", async () => {
    const env = makeEnv();
    const masterKey = await loadMasterKey(env);

    const wrap = async () => {
      const k = generateDataKeyBytes();
      const w = await wrapDataKey(masterKey, k);
      return unwrapDataKey(masterKey, w.wrappedDataKey, w.wrapIv);
    };
    const keyA = await wrap();
    const keyB = await wrap();

    const encrypted = await encryptApiKey(keyA, "sk-user-a");
    const error = await decryptApiKey(keyB, encrypted.encryptedKey, encrypted.iv).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("decryption_failed");
  });
});

function base6EncodeSafe(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Encode(bytes);
}
