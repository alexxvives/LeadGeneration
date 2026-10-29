/**
 * LUMIA lead tree (v2). Checked step ids live in the lead's `lead_tree`
 * column (`lead.leadTree`). Every lead starts this tree from zero: the legacy
 * `customFields.__lead_tree` / `__onboarding` values stay in the DB untouched
 * but are never read as this tree's state.
 */

import { FOLLOW_UP_PLAN } from "@/lib/activation-follow-ups";

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

const noBuy = (p: string): TreeStep[] => [
  s(`${p}_nb_return`, "Devolución del producto"),
  s(`${p}_nb_review`, "Revisión del producto"),
  s(`${p}_nb_deposit_back`, "Retorno del depósito"),
  s(`${p}_nb_doc`, "Documento enviado de retorno de depósito"),
];

const trialSteps = (p: string, withActivation: boolean): TreeStep[] => [
  s(`${p}_contract`, "Contrato enviado"),
  s(`${p}_deposit`, "Depósito cobrado"),
  s(`${p}_deposit_doc`, "Documento depósito recibido enviado"),
  s(`${p}_shipped`, "LUMIA enviado"),
  ...(withActivation
    ? [s(`${p}_activate`, "Activar software"), s(`${p}_creds`, "Enviar credenciales")]
    : []),
  s(`${p}_w1`, "Seguimiento semana 1"),
  s(`${p}_w3`, "Seguimiento semana 3"),
];

/**
 * Purchase tree, shared by NO TRIAL and both trial "Compra" branches (one
 * definition, distinct step ids per prefix). A plan choice (one row, one of
 * two), then "Añadir productos / extra" splits into three lanes running in
 * parallel: the center line is always on; customización (left) and
 * complementos (right) are optional toggles whose steps diverge from and
 * merge back into the center line. Follow-up dates come from the lead's
 * activation date (activation-follow-ups.ts).
 */
export type PurchaseTree = {
  prefix: string;
  /** Steps before the plan pick (USADO: device return + review). */
  pre: TreeStep[];
  planVar: TreeStep;
  planFix: TreeStep;
  products: TreeStep;
  laneCustom: TreeStep;
  laneCompl: TreeStep;
  contract: TreeStep;
  paid: TreeStep;
  sepa: TreeStep;
  /** Enviar LUMIA → Activar dispositivo → Enviar credenciales (absent when the trial already did it). */
  device: { ship: TreeStep; activate: TreeStep; creds: TreeStep } | null;
  customExcel: TreeStep;
  customPay: TreeStep;
  customBecon: TreeStep;
  complExcel: TreeStep;
  complAmazon: TreeStep;
  complProduct: TreeStep;
  followUps: TreeStep[];
};

function purchaseTree(
  p: string,
  opts: { contractLabel: string; withDevice: boolean; pre?: TreeStep[] },
): PurchaseTree {
  return {
    prefix: p,
    pre: opts.pre ?? [],
    planVar: s(`${p}_plan_var`, "Plan variable"),
    planFix: s(`${p}_plan_fix`, "Plan fijo"),
    products: s(`${p}_products`, "Añadir productos / extra"),
    laneCustom: s(`${p}_lane_custom`, "Añadir customización"),
    laneCompl: s(`${p}_lane_compl`, "Añadir complementos"),
    contract: s(`${p}_contract`, opts.contractLabel),
    paid: s(`${p}_paid`, "Pago recibido"),
    sepa: s(`${p}_sepa`, "SEPA recibido"),
    device: opts.withDevice
      ? {
          ship: s(`${p}_ship`, "Enviar LUMIA"),
          activate: s(`${p}_activate`, "Activar dispositivo"),
          creds: s(`${p}_creds`, "Enviar credenciales"),
        }
      : null,
    customExcel: s(`${p}c_excel`, "Enviar excel a cliente"),
    customPay: s(`${p}c_pay`, "Pagar customización"),
    customBecon: s(`${p}c_becon`, "Enviar excel a Becon"),
    complExcel: s(`${p}m_excel`, "Enviar excel a cliente"),
    complAmazon: s(`${p}m_amazon`, "Pagar Amazon"),
    complProduct: s(`${p}m_product`, "Enviar producto"),
    followUps: FOLLOW_UP_PLAN.map((f) => s(`${p}_f_${f.key}`, f.label)),
  };
}

export function purchaseTreeSteps(t: PurchaseTree): TreeStep[] {
  return [
    ...t.pre, t.planVar, t.planFix, t.products, t.laneCustom, t.laneCompl,
    t.contract, t.paid, t.sepa,
    ...(t.device ? [t.device.ship, t.device.activate, t.device.creds] : []),
    t.customExcel, t.customPay, t.customBecon,
    t.complExcel, t.complAmazon, t.complProduct,
    ...t.followUps,
  ];
}

/** Steps on the active path of a purchase tree, in order (lanes only when on). */
export function purchaseActiveSteps(t: PurchaseTree, done: ReadonlySet<string>): TreeStep[] {
  const custom = done.has(t.laneCustom.id);
  const compl = done.has(t.laneCompl.id);
  return [
    ...t.pre,
    t.products,
    ...(custom ? [t.customExcel] : []),
    ...(compl ? [t.complExcel] : []),
    t.contract, t.paid, t.sepa,
    ...(compl ? [t.complAmazon, t.complProduct] : []),
    ...(t.device ? [t.device.ship] : []),
    ...(custom ? [t.customPay, t.customBecon] : []),
    ...(t.device ? [t.device.activate, t.device.creds] : []),
    ...t.followUps,
  ];
}

function purchaseCursor(t: PurchaseTree, done: ReadonlySet<string>): string {
  const pre = firstOpen(t.pre, done);
  if (pre) return pre;
  if (!done.has(t.planVar.id) && !done.has(t.planFix.id)) return "¿Plan variable o fijo?";
  return firstOpen(purchaseActiveSteps(t, done), done) ?? "Listo";
}

export type TrialBranch = {
  head: TreeStep;
  steps: TreeStep[];
  decisionLabel: string;
  buyHead: TreeStep;
  buy: PurchaseTree;
  noBuyHead: TreeStep;
  noBuy: TreeStep[];
};

/** NO TRIAL keeps its original `d` ids so existing ticks stay valid. */
export const NO_TRIAL_TREE = purchaseTree("d", {
  contractLabel: "Enviar contrato + factura",
  withDevice: true,
});

export const BRANCH_NUEVO: TrialBranch = {
  head: NUEVO,
  steps: trialSteps("n", true),
  decisionLabel: "Decisión: ¿compra?",
  buyHead: s("n_buy", "Compra"),
  // The trial already shipped, activated and sent credentials.
  buy: purchaseTree("np", { contractLabel: "Enviar contrato + factura", withDevice: false }),
  noBuyHead: s("n_nobuy", "No compra"),
  noBuy: noBuy("n"),
};

export const BRANCH_USADO: TrialBranch = {
  head: USADO,
  steps: trialSteps("u", false),
  decisionLabel: "Decisión: ¿compra?",
  buyHead: s("u_buy", "Compra"),
  buy: purchaseTree("up", {
    contractLabel: "Enviar contrato con depósito descuento",
    withDevice: true,
    pre: [
      s("up_device_return", "Devolución del dispositivo"),
      s("up_device_review", "Revisión del dispositivo"),
    ],
  }),
  noBuyHead: s("u_nobuy", "No compra"),
  noBuy: noBuy("u"),
};

export const PURCHASE_TREES: readonly PurchaseTree[] = [
  NO_TRIAL_TREE,
  BRANCH_NUEVO.buy,
  BRANCH_USADO.buy,
];

/** Ticking any of these asks for the software activation date. */
export const CREDENTIALS_STEP_IDS: ReadonlySet<string> = new Set([
  ...PURCHASE_TREES.flatMap((t) => (t.device ? [t.device.creds.id] : [])),
  "n_creds",
]);

function branchIds(b: TrialBranch): string[] {
  return [
    b.head.id,
    ...b.steps.map((x) => x.id),
    b.buyHead.id,
    ...purchaseTreeSteps(b.buy).map((x) => x.id),
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
  ...purchaseTreeSteps(NO_TRIAL_TREE).map((x) => x.id),
]);

/** Mutually exclusive choices: picking one clears its sibling (not the sibling's steps). */
const EXCLUSIVE: ReadonlyArray<[string, string]> = [
  [TRIAL.id, NO_TRIAL.id],
  [NUEVO.id, USADO.id],
  [BRANCH_NUEVO.buyHead.id, BRANCH_NUEVO.noBuyHead.id],
  [BRANCH_USADO.buyHead.id, BRANCH_USADO.noBuyHead.id],
  ...PURCHASE_TREES.map((t): [string, string] => [t.planVar.id, t.planFix.id]),
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

function firstOpen(steps: readonly TreeStep[], done: ReadonlySet<string>): string | null {
  return steps.find((x) => !done.has(x.id))?.label ?? null;
}

/** Next unchecked step on the active path (short status for lists). */
export function treeCursor(doneIds: readonly string[]): string {
  const done = new Set(doneIds);
  const common = firstOpen(COMMON, done);
  if (common) return common;
  if (done.has(NO_TRIAL.id)) {
    return purchaseCursor(NO_TRIAL_TREE, done);
  }
  if (!done.has(TRIAL.id)) return "¿TRIAL o NO TRIAL?";
  const branch = done.has(NUEVO.id) ? BRANCH_NUEVO : done.has(USADO.id) ? BRANCH_USADO : null;
  if (!branch) return "¿LUMIA NUEVO o USADO?";
  const open = firstOpen(branch.steps, done);
  if (open) return open;
  if (done.has(branch.buyHead.id)) return purchaseCursor(branch.buy, done);
  if (done.has(branch.noBuyHead.id)) return firstOpen(branch.noBuy, done) ?? "Fin";
  return branch.decisionLabel;
}
