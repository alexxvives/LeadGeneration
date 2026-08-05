/**
 * Per-outreach-profile Easy Sending identity (From + provider keys).
 * Secrets live only in workspace.profileSendSettingsJson — never in
 * outreachProfilesJson / localStorage.
 */
import type { WorkspaceEmailSettings } from "@/lib/email/sender";
import {
  normalizeEasyEmailProvider,
  type EasyEmailProvider,
  type Workspace,
} from "@/lib/types";

export type ProfileSendSettings = {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  easyEmailProvider: EasyEmailProvider;
  preferredSendPath: "easy" | "pro" | null;
  resendApiKey: string | null;
  mailerooApiKey: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
};

/** Client-safe view — never includes raw API keys / SMTP password. */
export type PublicProfileSendSettings = {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  easyEmailProvider: EasyEmailProvider;
  preferredSendPath: "easy" | "pro" | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  hasResendKey: boolean;
  hasMailerooKey: boolean;
  hasSmtpPass: boolean;
};

export type ProfileSendSettingsMap = Record<string, ProfileSendSettings>;

export function emptyProfileSendSettings(
  partial?: Partial<ProfileSendSettings>,
): ProfileSendSettings {
  return {
    fromName: partial?.fromName ?? null,
    fromEmail: partial?.fromEmail ?? null,
    replyTo: partial?.replyTo ?? null,
    physicalAddress: partial?.physicalAddress ?? null,
    easyEmailProvider: normalizeEasyEmailProvider(
      partial?.easyEmailProvider ?? "resend",
    ),
    preferredSendPath:
      partial?.preferredSendPath === "pro" || partial?.preferredSendPath === "easy"
        ? partial.preferredSendPath
        : null,
    resendApiKey: partial?.resendApiKey ?? null,
    mailerooApiKey: partial?.mailerooApiKey ?? null,
    smtpHost: partial?.smtpHost ?? null,
    smtpPort:
      typeof partial?.smtpPort === "number" && partial.smtpPort > 0
        ? partial.smtpPort
        : null,
    smtpUser: partial?.smtpUser ?? null,
    smtpPass: partial?.smtpPass ?? null,
  };
}

/** Copy legacy workspace-level From/keys into a profile entry. */
export function legacyWorkspaceToProfileSendSettings(
  ws: Pick<
    Workspace,
    | "fromName"
    | "fromEmail"
    | "replyTo"
    | "physicalAddress"
    | "easyEmailProvider"
    | "preferredSendPath"
    | "resendApiKey"
    | "mailerooApiKey"
    | "smtpHost"
    | "smtpPort"
    | "smtpUser"
    | "smtpPass"
  >,
): ProfileSendSettings {
  return emptyProfileSendSettings({
    fromName: ws.fromName,
    fromEmail: ws.fromEmail,
    replyTo: ws.replyTo,
    physicalAddress: ws.physicalAddress,
    easyEmailProvider: ws.easyEmailProvider,
    preferredSendPath: ws.preferredSendPath,
    resendApiKey: ws.resendApiKey,
    mailerooApiKey: ws.mailerooApiKey,
    smtpHost: ws.smtpHost,
    smtpPort: ws.smtpPort,
    smtpUser: ws.smtpUser,
    smtpPass: ws.smtpPass,
  });
}

export function parseProfileSendSettingsMap(
  raw: string | null | undefined,
): ProfileSendSettingsMap {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: ProfileSendSettingsMap = {};
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!id || !value || typeof value !== "object") continue;
      const v = value as Partial<ProfileSendSettings>;
      out[id] = emptyProfileSendSettings(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeProfileSendSettingsMap(
  map: ProfileSendSettingsMap,
): string {
  return JSON.stringify(map);
}

export function activeProfileIdFromJson(
  outreachProfilesJson: string | null | undefined,
): string | null {
  if (!outreachProfilesJson?.trim()) return null;
  try {
    const store = JSON.parse(outreachProfilesJson) as {
      profiles?: Array<{ id?: string }>;
      activeId?: string | null;
    };
    const profiles = Array.isArray(store.profiles) ? store.profiles : [];
    const ids = profiles
      .map((p) => (typeof p.id === "string" ? p.id : null))
      .filter((id): id is string => Boolean(id));
    if (
      store.activeId &&
      typeof store.activeId === "string" &&
      ids.includes(store.activeId)
    ) {
      return store.activeId;
    }
    return ids[0] ?? null;
  } catch {
    return null;
  }
}

export function profileIdsFromJson(
  outreachProfilesJson: string | null | undefined,
): string[] {
  if (!outreachProfilesJson?.trim()) return [];
  try {
    const store = JSON.parse(outreachProfilesJson) as {
      profiles?: Array<{ id?: string }>;
    };
    const profiles = Array.isArray(store.profiles) ? store.profiles : [];
    return profiles
      .map((p) => (typeof p.id === "string" ? p.id : null))
      .filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

export function toPublicProfileSendSettings(
  s: ProfileSendSettings,
): PublicProfileSendSettings {
  return {
    fromName: s.fromName,
    fromEmail: s.fromEmail,
    replyTo: s.replyTo,
    physicalAddress: s.physicalAddress,
    easyEmailProvider: s.easyEmailProvider,
    preferredSendPath: s.preferredSendPath,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpUser: s.smtpUser,
    hasResendKey: Boolean(s.resendApiKey?.trim()),
    hasMailerooKey: Boolean(s.mailerooApiKey?.trim()),
    hasSmtpPass: Boolean(s.smtpPass?.trim()),
  };
}

export function profileSendSettingsToWorkspaceEmail(
  s: ProfileSendSettings,
  ws: Pick<Workspace, "connectedMailbox">,
): WorkspaceEmailSettings {
  return {
    fromName: s.fromName,
    fromEmail: s.fromEmail,
    replyTo: s.replyTo,
    physicalAddress: s.physicalAddress,
    resendApiKey: s.resendApiKey,
    mailerooApiKey: s.mailerooApiKey,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpUser: s.smtpUser,
    smtpPass: s.smtpPass,
    easyEmailProvider: s.easyEmailProvider,
    preferredSendPath: s.preferredSendPath,
    connectedMailbox: ws.connectedMailbox,
  };
}

/**
 * Resolve send identity for the active (or given) profile.
 * Falls back to legacy workspace columns when that profile has no entry yet.
 */
export function resolveProfileSendSettings(
  ws: Workspace,
  profileId?: string | null,
): { profileId: string | null; settings: ProfileSendSettings } {
  const map = parseProfileSendSettingsMap(ws.profileSendSettingsJson);
  const id =
    (profileId && profileId.trim()) ||
    activeProfileIdFromJson(ws.outreachProfilesJson);
  if (id && map[id]) {
    return { profileId: id, settings: map[id]! };
  }
  // Map already has other profiles — don't show legacy (another brand's) From.
  if (id && Object.keys(map).length > 0) {
    return { profileId: id, settings: emptyProfileSendSettings() };
  }
  return {
    profileId: id,
    settings: legacyWorkspaceToProfileSendSettings(ws),
  };
}

/** True when any profile (or legacy workspace) has an Easy send key. */
export function workspaceHasEasySendKey(ws: Workspace): boolean {
  if (
    ws.resendApiKey?.trim() ||
    ws.mailerooApiKey?.trim() ||
    (ws.smtpHost?.trim() && ws.smtpUser?.trim() && ws.smtpPass?.trim())
  ) {
    return true;
  }
  const map = parseProfileSendSettingsMap(ws.profileSendSettingsJson);
  return Object.values(map).some(
    (s) =>
      Boolean(s.resendApiKey?.trim()) ||
      Boolean(s.mailerooApiKey?.trim()) ||
      Boolean(
        s.smtpHost?.trim() && s.smtpUser?.trim() && s.smtpPass?.trim(),
      ),
  );
}

/**
 * One-time seed: copy legacy workspace From/keys into the *active* profile
 * when the map is empty; other known profiles get empty shells so switching
 * doesn't show identical From/name until the user sets them.
 */
export function migrateLegacySendSettingsIfNeeded(
  ws: Workspace,
): string | null {
  const existing = parseProfileSendSettingsMap(ws.profileSendSettingsJson);
  if (Object.keys(existing).length > 0) return null;

  const ids = profileIdsFromJson(ws.outreachProfilesJson);
  if (ids.length === 0) return null;

  const legacy = legacyWorkspaceToProfileSendSettings(ws);
  const hasLegacy =
    Boolean(legacy.fromName?.trim()) ||
    Boolean(legacy.fromEmail?.trim()) ||
    Boolean(legacy.resendApiKey?.trim()) ||
    Boolean(legacy.mailerooApiKey?.trim()) ||
    Boolean(legacy.smtpHost?.trim()) ||
    Boolean(legacy.smtpPass?.trim()) ||
    legacy.preferredSendPath != null;

  if (!hasLegacy) return null;

  const activeId = activeProfileIdFromJson(ws.outreachProfilesJson);
  const map: ProfileSendSettingsMap = {};
  for (const id of ids) {
    map[id] =
      id === activeId
        ? { ...legacy }
        : emptyProfileSendSettings({
            preferredSendPath: legacy.preferredSendPath,
          });
  }
  return serializeProfileSendSettingsMap(map);
}
