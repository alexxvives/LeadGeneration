// Seed the local file DB with a ready-made board of demo leads so the app has
// content on first open, even fully offline. Run with: npm run seed
//
// Self-contained on purpose (no @/ path aliases) so it runs under plain Node's
// TypeScript stripping without a bundler.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

const now = new Date().toISOString();
const niche = "boutique dental clinics";
const location = "Austin, TX";
const runId = id("run");
const boardId = id("board");

const seeds = [
  ["Cedar Dental Studio", "cedar-dental.example.com", "front-desk", true, 88],
  ["North Loop Smiles", "northloopsmiles.example.com", "hello", true, 82],
  ["Barton Springs Dental Co", "bartonspringsdental.example.com", "care", true, 79],
  ["Mueller Family Dentistry", "muellerfamilydental.example.com", "", false, 61],
  ["Zilker Bright Dental", "zilkerbright.example.com", "reception", true, 74],
  ["Congress Ave Orthodontics", "congressortho.example.com", "info", true, 71],
] as const;

const offerNotes =
  "We build booking sites that turn website visitors into scheduled appointments.";

const WORKSPACE_ID = "local";

const leads = seeds.map(([company, domain, mailbox, hasEmail, fit]) => ({
  id: id("lead"),
  workspaceId: WORKSPACE_ID,
  runId,
  boardId,
  company,
  website: `https://${domain}`,
  emails: hasEmail ? [`${mailbox}@${domain}`] : [],
  phones: [`(512) 555-0${Math.floor(100 + Math.random() * 800)}`],
  contactName: null,
  location,
  aboutBlurb: `A ${company.includes("Family") ? "family-focused" : "boutique"} dental practice in ${location} known for a warm patient experience and strong local reviews.`,
  tags: ["dental", "demo-data"],
  fitScore: fit,
  fitReasons: [
    "Matched your search query",
    hasEmail ? "Direct email contact found" : "No email yet — needs manual lookup",
    "Has a live website",
    `In target location (${location})`,
  ],
  sourceUrl: `https://${domain}/contact`,
  // Leads arrive already drafted + in the approval queue (mirrors the live flow).
  status: "queued",
  createdAt: now,
}));

// A minimal, self-contained draft to match the app's auto-draft behavior.
const outreach = leads.map((lead) => {
  const short = lead.company.replace(/\b(Co|Group|Studio|Partners|Collective)\b/gi, "").trim();
  return {
    id: id("out"),
    workspaceId: WORKSPACE_ID,
    leadId: lead.id,
    runId,
    toEmail: lead.emails[0] ?? null,
    subject: `Propuesta para ${short}`,
    body: [
      `Hola,`,
      "",
      `Estuve mirando ${short} y me pareció un buen momento para escribirles.`,
      "",
      offerNotes,
      "",
      "¿Tendrían 10 minutos la semana que viene para ver si encaja? Si no es el momento, no hay problema.",
      "",
      "Un saludo,",
      "Leadify Outreach",
    ].join("\n"),
    status: "draft",
    deliveryStatus: "unknown",
    sentAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
});

const db = {
  workspaces: [],
  boards: [
    {
      id: boardId,
      workspaceId: WORKSPACE_ID,
      name: "Default",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
  ],
  runs: [
    {
      id: runId,
      workspaceId: WORKSPACE_ID,
      boardId,
      niche,
      location,
      offerNotes,
      status: "complete",
      mode: "demo",
      provider: "demo",
      leadCount: leads.length,
      error: null,
      createdAt: now,
      completedAt: now,
    },
  ],
  leads,
  outreach,
};

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
console.log(`Seeded ${leads.length} demo leads → ${DB_FILE}`);
