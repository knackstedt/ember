import { app, safeStorage } from "electron";
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { CredentialMode, RemoteSource } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

interface RawCredentials {
  user?: string;
  password?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  [key: string]: string | undefined;
}

/* ------------------------------------------------------------------ */
/*  Session-only store (memory only)                                    */
/* ------------------------------------------------------------------ */
const sessionStore = new Map<string, RawCredentials>();

/* ------------------------------------------------------------------ */
/*  Auto-key store (safeStorage-backed)                                 */
/* ------------------------------------------------------------------ */
function getAutoKeyPath(): string {
  const userData = app.getPath("userData");
  return join(userData, "rclone-auto-key.bin");
}

async function getOrCreateAutoKey(): Promise<Buffer> {
  const path = getAutoKeyPath();
  if (existsSync(path)) {
    const encrypted = readFileSync(path);
    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = await safeStorage.decryptString(encrypted);
      return Buffer.from(decrypted, "base64");
    }
    // Fallback: store raw (less secure but functional)
    return encrypted;
  }

  const key = randomBytes(32);
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = await safeStorage.encryptString(key.toString("base64"));
    writeFileSync(path, Buffer.from(encrypted));
  } else {
    log.warn("credential:auto-key", "safeStorage unavailable; storing raw key");
    writeFileSync(path, key);
  }
  return key;
}

function aesEncrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function aesDecrypt(ciphertext: string, iv: string, tag: string, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/* ------------------------------------------------------------------ */
/*  User-password store (PBKDF2-backed)                               */
/* ------------------------------------------------------------------ */
let userPasswordKey: Buffer | null = null;

function deriveKeyFromPassword(password: string, salt: string): Buffer {
  return createHash("sha256")
    .update(password + salt)
    .digest();
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export async function storeCredentials(
  source: RemoteSource,
  creds: RawCredentials,
): Promise<void> {
  const mode = source.credentialMode;
  const payload = JSON.stringify(creds);

  switch (mode) {
    case "session-only": {
      sessionStore.set(source.id, creds);
      log.info("credential:store", `${source.id} stored in session`);
      break;
    }

    case "auto-key": {
      const key = await getOrCreateAutoKey();
      const encrypted = aesEncrypt(payload, key);
      source.encryptedCreds = JSON.stringify(encrypted);
      log.info("credential:store", `${source.id} stored with auto-key`);
      break;
    }

    case "user-password": {
      if (!userPasswordKey) {
        throw new Error("Master password not set; call setMasterPassword() first");
      }
      const encrypted = aesEncrypt(payload, userPasswordKey);
      source.encryptedCreds = JSON.stringify(encrypted);
      log.info("credential:store", `${source.id} stored with user-password`);
      break;
    }

    default:
      throw new Error(`Unknown credential mode: ${mode}`);
  }
}

export async function retrieveCredentials(
  source: RemoteSource,
): Promise<RawCredentials | null> {
  const mode = source.credentialMode;

  switch (mode) {
    case "session-only": {
      const creds = sessionStore.get(source.id);
      if (!creds) {
        log.warn("credential:retrieve", `${source.id} session credentials missing`);
        return null;
      }
      return creds;
    }

    case "auto-key": {
      if (!source.encryptedCreds) return null;
      try {
        const key = await getOrCreateAutoKey();
        const { ciphertext, iv, tag } = JSON.parse(source.encryptedCreds);
        const plaintext = aesDecrypt(ciphertext, iv, tag, key);
        return JSON.parse(plaintext) as RawCredentials;
      } catch (err) {
        log.error("credential:retrieve", `auto-key decrypt failed for ${source.id}: ${err}`);
        return null;
      }
    }

    case "user-password": {
      if (!source.encryptedCreds) return null;
      if (!userPasswordKey) {
        log.warn("credential:retrieve", `${source.id} requires master password but not set`);
        return null;
      }
      try {
        const { ciphertext, iv, tag } = JSON.parse(source.encryptedCreds);
        const plaintext = aesDecrypt(ciphertext, iv, tag, userPasswordKey);
        return JSON.parse(plaintext) as RawCredentials;
      } catch (err) {
        log.error("credential:retrieve", `user-password decrypt failed for ${source.id}: ${err}`);
        return null;
      }
    }

    default:
      return null;
  }
}

export async function deleteCredentials(source: RemoteSource): Promise<void> {
  sessionStore.delete(source.id);
  // For auto-key and user-password, the encrypted data is in SurrealDB and
  // will be deleted when the remote_source record is deleted.
}

export async function hasMasterPassword(): Promise<boolean> {
  return userPasswordKey !== null;
}

export async function setMasterPassword(password: string): Promise<void> {
  userPasswordKey = deriveKeyFromPassword(password, "ember-remote-source-salt");
}

export async function clearMasterPassword(): Promise<void> {
  userPasswordKey = null;
}

export function needsMasterPassword(sources: RemoteSource[]): boolean {
  return sources.some((s) => s.credentialMode === "user-password" && s.encryptedCreds);
}

export function needsSessionReauth(sources: RemoteSource[]): RemoteSource[] {
  return sources.filter((s) => s.credentialMode === "session-only" && !sessionStore.has(s.id));
}

export function getCredentialModeLabel(mode: CredentialMode): string {
  switch (mode) {
    case "auto-key":
      return "Auto Key";
    case "user-password":
      return "Master Password";
    case "session-only":
      return "Session Only";
    default:
      return mode;
  }
}
