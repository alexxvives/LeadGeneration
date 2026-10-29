/**
 * LUMIA lead tree (v2). Checked step ids live in the lead's `lead_tree`
 * column (`lead.leadTree`). Every lead starts this tree from zero: the legacy
 * `customFields.__lead_tree` / `__onboarding` values stay in the DB untouched
 * but are never read as this tree's state.
 */

export const LEAD_TREE_FIELD = "__lead_tree";

export type TreeStep = { id: string; label: string };

const s = (id: string, label: string): TreeStep => ({ id, label });

export const COMMON: readonly TreeStep[] = [
  s("c_contact", "Contacto inicial (propuesta de demo + canva general)"),
  s("c_demo", "Demo hecha"),
  s("c_post_demo", "Email post-demo"),
  s("c_interest", "Confirmación de interés"),
  s("c_contract_info", "Info de contrato pedida + plan de pago decidido"),
];

export const TRIAL = s("trial", "TRIAL");
export const NO_TRIAL = s("no_trial", "NO TRIAL");
export const NUEVO = s("t_nuevo", "LUMIA NUEVO");
export const USADO = s("t_usado", "LUMIA USADO");

const followUpsAfterPurchase = (p: string): TreeStep[] => [
  s(`${p}_f_w1`, "Seguimiento semana 1"),
  s(`${p}_f_m1`, "Seguimiento mes 1"),
  s(`${p}_f_m6`, "Seguimiento mes 6"),
  s(`${p}_f_y1`, "Seguimiento año 1"),
];

const noBuy = (p: string): TreeStep[] => [
  s(`${p}_nb_return`, "Devolución del producto"),
  s(`${p}_nb_review`, "Revisión del producto"),
  s(`${p}_nb_deposit_back`, "Retorno del depósito"),
  s(`${p}_nb_doc`, "Documento enviado de retorno de depósito"),
];

const buy = (p: string, withDeviceReturn: boolean): TreeStep[] => [
  ...(withDeviceReturn ? [s(`${p}_b_device_return`, "Devolución del dispositivo")] : []),
  s(`${p}_b_contract`, "Enviar contrato con depósito descuento"),
  s(`${p}_b_paid`, "Pago recibido"),
  s(`${p}_b_direct_debit`, "Domiciliación hecha"),
  s(`${p}_b_ship`, "Envío dispositivo"),
  ...followUpsAfterPurchase(`${p}_b`),
];

const trialSteps = (p: string, withActivation: boolean): TreeStep[] => [
  s(`${p}_contract`, "Contrato enviado"),
  s(`${p}_deposit`, "Depósito cobrado"),
  s(`${p}_deposit_doc`, "Documento depósito recibido enviado"),
  s(`${p}_shipped`, "LUMIA enviado"),
  ...(withActivation ? [s(`${p}_activate`, "Activar software")] : []),
  s(`${p}_w1`, "Seguimiento semana 1"),
  s(`${p}_w3`, "Seguimiento semana 3"),
];

export type TrialBranch = {
  head: TreeStep;
  steps: TreeStep[];
  decisionLabel: string;
  buyHead: TreeStep;
  buy: TreeStep[];
  noBuyHead: TreeStep;
  noBuy: TreeStep[];
};

function trialBranch(head: TreeStep, p: string, nuevo: boolean): TrialBranch {
  return {
    head,
    steps: trialSteps(p, nuevo),
    decisionLabel: "Decisión: ¿compra?",
    buyHead: s(`${p}_buy`, "Compra"),
    buy: buy(p, !nuevo),
    noBuyHead: s(`${p}_nobuy`, "No compra"),
    noBuy: noBuy(p),
  };
}

export const BRANCH_NUEVO = trialBranch(NUEVO, "n", true);
export const BRANCH_USADO = trialBranch(USADO, "u", false);

/**
 * NO TRIAL path. A plan choice (one row, one of two), then "Añadir productos /
 * extra" splits into three lanes that run in parallel: the center line is
 * always on; customización (left) and complementos (right) are optional
 * toggles whose steps diverge from and merge back into the center line.
 */
export const PLAN_VARIABLE = s("d_plan_var", "Plan variable");
export const PLAN_FIJO = s("d_plan_fix", "Plan fijo");
export const NT_PRODUCTS = s("d_products", "Añadir productos / extra");
export const LANE_CUSTOM = s("d_lane_custom", "Añadir customización");
export const LANE_COMPL = s("d_lane_compl", "Añadir complementos");

export const NT = {
  contract: s("d_contract", "Enviar contrato + factura"),
  paid: s("d_paid", "Pago recibido"),
  sepa: s("d_sepa", "SEPA recibido"),
  ship: s("d_ship", "Enviar dispositivo"),
  activate: s("d_activate", "Activar dispositivo"),
  creds: s("d_creds", "Enviar credenciales"),
  w1: s("d_f_w1", "Seguimiento semana 1"),
  m1: s("d_f_m1", "Seguimiento mes 1"),
  m6: s("d_f_m6", "Seguimiento mes 6"),
  y1: s("d_f_y1", "Seguimiento año 1"),
  customExcel: s("dc_excel", "Enviar excel a cliente"),
  customPay: s("dc_pay", "Pagar customización"),
  customBecon: s("dc_becon", "Enviar excel a Becon"),
  complExcel: s("dm_excel", "Enviar excel a cliente"),
  complAmazon: s("dm_amazon", "Pagar Amazon"),
  complProduct: s("dm_product", "Enviar producto + enviar dispositivo"),
} as const;

export const NO_TRIAL_CENTER: readonly TreeStep[] = [
  NT.contract, NT.paid, NT.sepa, NT.ship, NT.activate, NT.creds, NT.w1, NT.m1, NT.m6, NT.y1,
];
export const NO_TRIAL_CUSTOM: readonly TreeStep[] = [NT.customExcel, NT.customPay, NT.customBecon];
export const NO_TRIAL_COMPL: readonly TreeStep[] = [NT.complExcel, NT.complAmazon, NT.complProduct];

/** Steps on the active NO TRIAL path, in order (lanes only when toggled on). */
export function noTrialActiveSteps(done: ReadonlySet<string>): TreeStep[] {
  const custom = done.has(LANE_CUSTOM.id);
  const compl = done.has(LANE_COMPL.id);
  return [
    ...(custom ? [NT.customExcel] : []),
    ...(compl ? [NT.complExcel] : []),
    NT.contract, NT.paid, NT.sepa,
    ...(compl ? [NT.complAmazon, NT.complProduct] : []),
    NT.ship,
    ...(custom ? [NT.customPay, NT.customBecon] : []),
    NT.activate, NT.creds, NT.w1, NT.m1, NT.m6, NT.y1,
  ];
}

export const NO_TRIAL_STEPS: readonly TreeStep[] = [
  PLAN_VARIABLE, PLAN_FIJO, NT_PRODUCTS, LANE_CUSTOM, LANE_COMPL,
  ...NO_TRIAL_CENTER, ...NO_TRIAL_CUSTOM, ...NO_TRIAL_COMPL,
];

function branchIds(b: TrialBranch): string[] {
  return [
    b.head.id,
    ...b.steps.map((x) => x.id),
    b.buyHead.id,
    ...b.buy.map((x) => x.id),
    b.noBuyHead.id,
    ...b.noBuy.map((x) => x.id),
  ];
}

export const ALL_TREE_IDS: ReadonlySet<string> = new Set([
  ...COMMON.map((x) => x.id),
  TRIAL.id,
  NO_TRIAL.id,
  ...branchIds(BRANCH_NUEVO),
  ...branchIds(BRANCH_USADO),
  ...NO_TRIAL_STEPS.map((x) => x.id),
]);

/** Mutually exclusive choices: picking one clears its sibling (not the sibling's steps). */
const EXCLUSIVE: ReadonlyArray<[string, string]> = [
  [TRIAL.id, NO_TRIAL.id],
  [NUEVO.id, USADO.id],
  [BRANCH_NUEVO.buyHead.id, BRANCH_NUEVO.noBuyHead.id],
  [BRANCH_USADO.buyHead.id, BRANCH_USADO.noBuyHead.id],
  [PLAN_VARIABLE.id, PLAN_FIJO.id],
];

export function parseTreeDone(customFields: Record<string, string> | undefined): string[] {
  const raw = customFields?.[LEAD_TREE_FIELD];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === "string" && ALL_TREE_IDS.has(id)))];
  } catch {
    return [];
  }
}

/** Toggle one step; choosing a branch head un-picks its exclusive sibling head. */
export function toggleTreeStep(done: readonly string[], id: string, checked: boolean): string[] {
  if (!ALL_TREE_IDS.has(id)) return [...done];
  const next = new Set(done);
  if (checked) {
    next.add(id);
    for (const [a, b] of EXCLUSIVE) {
      if (id === a) next.delete(b);
      if (id === b) next.delete(a);
    }
  } else {
    next.delete(id);
  }
  // NUEVO/USADO only exist under TRIAL: leaving TRIAL (e.g. switching to NO TRIAL)
  // must not keep a hidden branch pick.
  if (!next.has(TRIAL.id)) {
    next.delete(NUEVO.id);
    next.delete(USADO.id);
  }
  return [...next];
}

export function treeDonePatch(
  customFields: Record<string, string> | undefined,
  done: readonly string[],
): Record<string, string> {
  const next = { ...(customFields ?? {}) };
  const clean = [...new Set(done.filter((id) => ALL_TREE_IDS.has(id)))];
  if (clean.length === 0) delete next[LEAD_TREE_FIELD];
  else next[LEAD_TREE_FIELD] = JSON.stringify(clean);
  return next;
}

function firstOpen(steps: readonly TreeStep[], done: Set<string>): string | null {
  return steps.find((x) => !done.has(x.id))?.label ?? null;
}

/** Next unchecked step on the active path (short status for lists). */
export function treeCursor(doneIds: readonly string[]): string {
  const done = new Set(doneIds);
  const common = firstOpen(COMMON, done);
  if (common) return common;
  if (done.has(NO_TRIAL.id)) {
    if (!done.has(PLAN_VARIABLE.id) && !done.has(PLAN_FIJO.id)) return "¿Plan variable o fijo?";
    if (!done.has(NT_PRODUCTS.id)) return NT_PRODUCTS.label;
    return firstOpen(noTrialActiveSteps(done), done) ?? "Listo";
  }
  if (!done.has(TRIAL.id)) return "¿TRIAL o NO TRIAL?";
  const branch = done.has(NUEVO.id) ? BRANCH_NUEVO : done.has(USADO.id) ? BRANCH_USADO : null;
  if (!branch) return "¿LUMIA NUEVO o USADO?";
  const open = firstOpen(branch.steps, done);
  if (open) return open;
  if (done.has(branch.buyHead.id)) return firstOpen(branch.buy, done) ?? "Listo";
  if (done.has(branch.noBuyHead.id)) return firstOpen(branch.noBuy, done) ?? "Fin";
  return branch.decisionLabel;
}
