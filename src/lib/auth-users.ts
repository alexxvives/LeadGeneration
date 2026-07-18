/**
 * Per-user password accounts (Auth.js `users` table + local file fallback).
 * Production uses D1; `npm run dev` uses data/auth-users.json when AUTH_SECRET
 * is set so signup can be exercised without Workers.
 *
 * Platform admin is a normal hashed user with `is_admin = 1` (not env secrets).
 */

import { getD1Binding } from "@/lib/cf";
import type { D1Database } from "@/lib/db/d1-store";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";

export type AuthUserRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  isAdmin: boolean;
};

/** First-boot operator — created only when no admin exists yet. Change after login. */
export const BOOTSTRAP_ADMIN_EMAIL = "admin@tryhermesmail.com";
const BOOTSTRAP_ADMIN_PASSWORD = "password";

type FileDb = { users: AuthUserRecord[] };

const FILE_PATH = "data/auth-users.json";

async function readFileDb(): Promise<FileDb> {
  const { readFile, mkdir } = await import("fs/promises");
  const { dirname } = await import("path");
  try {
    const raw = await readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as { users?: Partial<AuthUserRecord>[] };
    const users = (Array.isArray(parsed.users) ? parsed.users : []).map((u) => ({
      id: String(u.id ?? ""),
      email: String(u.email ?? "").toLowerCase(),
      name: u.name ?? null,
      passwordHash: u.passwordHash ?? null,
      isAdmin: Boolean(u.isAdmin),
    }));
    return { users: users.filter((u) => u.id && u.email) };
  } catch {
    await mkdir(dirname(FILE_PATH), { recursive: true }).catch(() => undefined);
    return { users: [] };
  }
}

async function writeFileDb(db: FileDb): Promise<void> {
  const { writeFile, mkdir } = await import("fs/promises");
  const { dirname } = await import("path");
  await mkdir(dirname(FILE_PATH), { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify(db, null, 2), "utf8");
}

function rowToUser(row: {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash?: string | null;
  isAdmin?: number | boolean | null;
}): AuthUserRecord | null {
  if (!row.email) return null;
  return {
    id: row.id,
    email: row.email.toLowerCase(),
    name: row.name,
    passwordHash: row.passwordHash ?? null,
    isAdmin: Boolean(row.isAdmin),
  };
}

async function d1GetByEmail(
  db: D1Database,
  email: string,
): Promise<AuthUserRecord | null> {
  try {
    const row = await db
      .prepare(
        `SELECT id, email, name, password_hash AS passwordHash, is_admin AS isAdmin
         FROM users WHERE lower(email) = ? LIMIT 1`,
      )
      .bind(email)
      .first<{
        id: string;
        email: string | null;
        name: string | null;
        passwordHash: string | null;
        isAdmin: number | null;
      }>();
    return row ? rowToUser(row) : null;
  } catch {
    // Migrations 0017/0018 not applied yet.
    try {
      const row = await db
        .prepare(
          `SELECT id, email, name, password_hash AS passwordHash
           FROM users WHERE lower(email) = ? LIMIT 1`,
        )
        .bind(email)
        .first<{
          id: string;
          email: string | null;
          name: string | null;
          passwordHash: string | null;
        }>();
      return row ? rowToUser({ ...row, isAdmin: 0 }) : null;
    } catch {
      const row = await db
        .prepare(`SELECT id, email, name FROM users WHERE lower(email) = ? LIMIT 1`)
        .bind(email)
        .first<{ id: string; email: string | null; name: string | null }>();
      return row ? rowToUser({ ...row, passwordHash: null, isAdmin: 0 }) : null;
    }
  }
}

async function d1HasAdmin(db: D1Database): Promise<boolean> {
  try {
    const row = await db
      .prepare(`SELECT id FROM users WHERE is_admin = 1 LIMIT 1`)
      .first<{ id: string }>();
    return Boolean(row?.id);
  } catch {
    return false;
  }
}

async function fileGetByEmail(email: string): Promise<AuthUserRecord | null> {
  const db = await readFileDb();
  return db.users.find((u) => u.email === email) ?? null;
}

export async function findAuthUserByEmail(
  email: string,
): Promise<AuthUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const d1 = await getD1Binding();
  if (d1) return d1GetByEmail(d1, normalized);
  return fileGetByEmail(normalized);
}

export type PasswordUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
};

/**
 * Verify email+password against stored hash. Returns Auth.js-shaped user or null.
 */
export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<PasswordUser | null> {
  await ensureBootstrapAdmin();
  const user = await findAuthUserByEmail(email);
  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
  };
}

/**
 * Ensure one hashed admin exists (first boot). Idempotent — no-op if any
 * `is_admin` user is already present. Password is the legacy default; rotate
 * by updating `users.password_hash` in D1 (or re-register after clearing).
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const d1 = await getD1Binding();
  if (d1) {
    if (await d1HasAdmin(d1)) return;
    const passwordHash = await hashPassword(BOOTSTRAP_ADMIN_PASSWORD);
    const existing = await d1GetByEmail(d1, BOOTSTRAP_ADMIN_EMAIL);
    if (existing) {
      try {
        await d1
          .prepare(
            `UPDATE users SET password_hash = ?, is_admin = 1, name = COALESCE(name, 'Admin')
             WHERE id = ?`,
          )
          .bind(passwordHash, existing.id)
          .run();
      } catch {
        // Column missing — migrate first.
      }
      return;
    }
    const id = crypto.randomUUID();
    try {
      await d1
        .prepare(
          `INSERT INTO users (id, name, email, emailVerified, image, password_hash, is_admin)
           VALUES (?, 'Admin', ?, NULL, NULL, ?, 1)`,
        )
        .bind(id, BOOTSTRAP_ADMIN_EMAIL, passwordHash)
        .run();
    } catch {
      // Migrations not applied yet.
    }
    return;
  }

  const file = await readFileDb();
  if (file.users.some((u) => u.isAdmin)) return;
  const passwordHash = await hashPassword(BOOTSTRAP_ADMIN_PASSWORD);
  const idx = file.users.findIndex((u) => u.email === BOOTSTRAP_ADMIN_EMAIL);
  if (idx >= 0) {
    file.users[idx] = {
      ...file.users[idx]!,
      passwordHash,
      isAdmin: true,
      name: file.users[idx]!.name ?? "Admin",
    };
  } else {
    file.users.push({
      id: crypto.randomUUID(),
      email: BOOTSTRAP_ADMIN_EMAIL,
      name: "Admin",
      passwordHash,
      isAdmin: true,
    });
  }
  await writeFileDb(file);
}

export type RegisterResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; error: string; status: number };

/**
 * Create a password account, or set a password on an existing magic-link user
 * that has no password yet. Rejects if a password is already set.
 * Never grants admin — that is bootstrap / D1-only.
 */
export async function registerWithPassword(
  email: string,
  password: string,
): Promise<RegisterResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    return { ok: false, error: "Enter a valid email address.", status: 400 };
  }
  const strength = validatePasswordStrength(password);
  if (strength) return { ok: false, error: strength, status: 400 };

  const passwordHash = await hashPassword(password);
  const existing = await findAuthUserByEmail(normalized);
  if (existing?.passwordHash) {
    return {
      ok: false,
      error: "An account with this email already exists. Sign in instead.",
      status: 409,
    };
  }

  const d1 = await getD1Binding();
  if (d1) {
    if (existing) {
      await d1
        .prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
        .bind(passwordHash, existing.id)
        .run();
      return { ok: true, userId: existing.id, created: false };
    }
    const id = crypto.randomUUID();
    const name = normalized.split("@")[0] || null;
    try {
      await d1
        .prepare(
          `INSERT INTO users (id, name, email, emailVerified, image, password_hash, is_admin)
           VALUES (?, ?, ?, NULL, NULL, ?, 0)`,
        )
        .bind(id, name, normalized, passwordHash)
        .run();
    } catch {
      await d1
        .prepare(
          `INSERT INTO users (id, name, email, emailVerified, image, password_hash)
           VALUES (?, ?, ?, NULL, NULL, ?)`,
        )
        .bind(id, name, normalized, passwordHash)
        .run();
    }
    return { ok: true, userId: id, created: true };
  }

  const file = await readFileDb();
  if (existing) {
    const i = file.users.findIndex((u) => u.id === existing.id);
    if (i >= 0) {
      file.users[i] = { ...file.users[i]!, passwordHash };
      await writeFileDb(file);
      return { ok: true, userId: existing.id, created: false };
    }
  }
  const id = crypto.randomUUID();
  file.users.push({
    id,
    email: normalized,
    name: normalized.split("@")[0] || null,
    passwordHash,
    isAdmin: false,
  });
  await writeFileDb(file);
  return { ok: true, userId: id, created: true };
}
