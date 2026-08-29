// ============================================================================
// _shared/crypto.ts
// Envelope encryption for user API keys.
//
//   master key (env secret, AES-256)
//     └── wraps a random per-user data key (AES-256-GCM)
//           └── encrypts each API key (AES-256-GCM, fresh 12-byte IV)
//
// Storage encoding is base64. Base64 is only a representation — the
// security comes from AES-GCM. WebCrypto's AES-GCM ciphertext output
// already includes the authentication tag, so no separate tag column
// is needed.
// ============================================================================

import { appError } from "./errors.ts";
import type { EdgeEnv } from "./supabaseAdmin.ts";

const ALGORITHM = "AES-GCM";
const KEY_BITS = 256;
const IV_BYTES = 12;

export const STORAGE_ALGORITHM = "A256GCM";

// --- base64 helpers ---------------------------------------------------------

export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- master key ---------------------------------------------------------------

/**
 * Import the master key from its base64 env value.
 * The master key must be exactly 32 bytes. Misconfiguration fails closed.
 */
export async function loadMasterKey(env: EdgeEnv): Promise<CryptoKey> {
  const rawB64 = env.MASTER_ENCRYPTION_KEY;
  if (!rawB64) {
    throw appError("internal_error", "Server is misconfigured.", {
      internalMessage: "MASTER_ENCRYPTION_KEY is not set",
    });
  }
  let raw: Uint8Array;
  try {
    raw = base64Decode(rawB64.trim());
  } catch {
    throw appError("internal_error", "Server is misconfigured.", {
      internalMessage: "MASTER_ENCRYPTION_KEY is not valid base64",
    });
  }
  if (raw.length !== KEY_BITS / 8) {
    throw appError("internal_error", "Server is misconfigured.", {
      internalMessage: "MASTER_ENCRYPTION_KEY must be 32 bytes",
    });
  }
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export function getMasterKeyId(env: EdgeEnv): string {
  return env.MASTER_ENCRYPTION_KEY_ID || "v1";
}

// --- per-user data key ---------------------------------------------------------

export function generateDataKeyBytes(): Uint8Array {
  const bytes = new Uint8Array(KEY_BITS / 8);
  crypto.getRandomValues(bytes);
  return bytes;
}

export interface WrappedDataKey {
  wrappedDataKey: string;
  wrapIv: string;
}

/** Wrap (encrypt) a per-user data key with the master key. */
export async function wrapDataKey(
  masterKey: CryptoKey,
  dataKeyBytes: Uint8Array,
): Promise<WrappedDataKey> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    masterKey,
    dataKeyBytes as BufferSource,
  );
  return {
    wrappedDataKey: base64Encode(new Uint8Array(ciphertext)),
    wrapIv: base64Encode(iv),
  };
}

/** Unwrap a stored per-user data key into a usable CryptoKey. */
export async function unwrapDataKey(
  masterKey: CryptoKey,
  wrappedDataKeyB64: string,
  wrapIvB64: string,
): Promise<CryptoKey> {
  try {
    const raw = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: base64Decode(wrapIvB64) as BufferSource },
      masterKey,
      base64Decode(wrappedDataKeyB64) as BufferSource,
    );
    return crypto.subtle.importKey("raw", raw, { name: ALGORITHM }, false, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    throw appError("decryption_failed", "The stored key could not be decrypted.", {
      internalMessage: "failed to unwrap per-user data key",
    });
  }
}

// --- API key encryption ---------------------------------------------------------

export interface EncryptedApiKey {
  encryptedKey: string;
  iv: string;
  algorithm: string;
}

export async function encryptApiKey(
  dataKey: CryptoKey,
  plaintext: string,
): Promise<EncryptedApiKey> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    dataKey,
    encoded as BufferSource,
  );
  return {
    encryptedKey: base64Encode(new Uint8Array(ciphertext)),
    iv: base64Encode(iv),
    algorithm: STORAGE_ALGORITHM,
  };
}

export async function decryptApiKey(
  dataKey: CryptoKey,
  encryptedKeyB64: string,
  ivB64: string,
): Promise<string> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: base64Decode(ivB64) as BufferSource },
      dataKey,
      base64Decode(encryptedKeyB64) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw appError("decryption_failed", "The stored key could not be decrypted.");
  }
}

/**
 * Convenience: unwrap the user's data key from a vault row, ready to
 * decrypt that user's API keys.
 */
export async function loadDataKeyFromVault(
  env: EdgeEnv,
  vault: { wrapped_data_key: string; wrap_iv: string },
): Promise<CryptoKey> {
  const masterKey = await loadMasterKey(env);
  return unwrapDataKey(masterKey, vault.wrapped_data_key, vault.wrap_iv);
}
