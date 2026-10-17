/**
 * Onboarding decision tree. Checked step ids live on the lead as JSON in
 * `customFields[ONBOARDING_FIELD]` so the board does not need its own column.
 */

export const ONBOARDING_FIELD = "__onboarding";

export type OnboardingStep = {
  id: string;
  label: string;
};

export const SEND_PRICES: OnboardingStep = {
  id: "send_prices",
  label: "Enviar precios",
};

export const CHOOSE_TRIAL: OnboardingStep = {
  id: "choose_trial",
  label: "Escoger trial",
};

export const BUY_DEVICE: OnboardingStep = {
  id: "buy_device",
  label: "Comprar dispositivo",
};

/** Trial path, in order, after choosing trial. */
export const PATH_A: readonly OnboardingStep[] = [
  { id: "a_send_contract", label: "Enviar contrato" },
  { id: "a_sign", label: "Firmar contrato" },
  { id: "a_deposit", label: "Cobrar fianza" },
  { id: "a_deliver", label: "Enviar / entregar producto" },
  { id: "a_week1", label: "Contacto 1ª semana" },
  { id: "a_week3", label: "Contacto 3ª semana" },
];

export const PATH_A_NOT_INTERESTED: OnboardingStep = {
  id: "a_not_interested",
  label: "No le interesa",
};

export const PATH_A_INTERESTED: OnboardingStep = {
  id: "a_interested",
  label: "Les interesa",
};

/** After “no le interesa”: close the trial. */
export const PATH_A_CLOSE: readonly OnboardingStep[] = [
  { id: "a_recover", label: "Recuperar dispositivo" },
  { id: "a_return_deposit", label: "Devolver depósito" },
];

/** Purchase path, in order, after choosing to buy (or converting from trial). */
export const PATH_B: readonly OnboardingStep[] = [
  { id: "b_accessories", label: "Preguntar si quieren accesorios" },
  { id: "b_fiscal", label: "Preguntar por datos fiscales" },
  { id: "b_prepare", label: "Preparar contrato" },
  { id: "b_send", label: "Enviar contrato" },
  { id: "b_sign", label: "Firmar contrato" },
  { id: "b_payment", label: "Recibir pago" },
  { id: "b_software", label: "Pagar software" },
  { id: "b_ship", label: "Enviar dispositivo" },
];

const ALL_IDS = new Set<string>([
  SEND_PRICES.id,
  CHOOSE_TRIAL.id,
  BUY_DEVICE.id,
  ...PATH_A.map((s) => s.id),
  PATH_A_NOT_INTERESTED.id,
  PATH_A_INTERESTED.id,
  ...PATH_A_CLOSE.map((s) => s.id),
  ...PATH_B.map((s) => s.id),
]);

export function parseOnboardingDone(
  customFields: Record<string, string> | undefined,
): string[] {
  const raw = customFields?.[ONBOARDING_FIELD];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && ALL_IDS.has(id));
  } catch {
    return [];
  }
}

export function onboardingDonePatch(
  customFields: Record<string, string> | undefined,
  done: string[],
): Record<string, string> {
  const next = { ...(customFields ?? {}) };
  const clean = done.filter((id) => ALL_IDS.has(id));
  if (clean.length === 0) delete next[ONBOARDING_FIELD];
  else next[ONBOARDING_FIELD] = JSON.stringify(clean);
  return next;
}

function firstOpen(steps: readonly OnboardingStep[], done: Set<string>): string | null {
  const open = steps.find((s) => !done.has(s.id));
  return open?.label ?? null;
}

/** Short label for the lead list: the next unchecked step on the active path. */
export function onboardingCursor(doneIds: string[]): string {
  const done = new Set(doneIds);
  if (!done.has(SEND_PRICES.id)) return SEND_PRICES.label;
  const trial = done.has(CHOOSE_TRIAL.id);
  const buy = done.has(BUY_DEVICE.id) || done.has(PATH_A_INTERESTED.id);
  if (!trial && !buy) return "Elegir trial o compra";
  if (trial && !done.has(PATH_A_NOT_INTERESTED.id) && !done.has(PATH_A_INTERESTED.id)) {
    const open = firstOpen(PATH_A, done);
    if (open) return open;
    return "¿Les interesa?";
  }
  if (done.has(PATH_A_NOT_INTERESTED.id) && !buy) {
    const open = firstOpen(PATH_A_CLOSE, done);
    return open ?? "Fin";
  }
  if (buy) {
    const open = firstOpen(PATH_B, done);
    return open ?? "Listo";
  }
  return "En curso";
}
