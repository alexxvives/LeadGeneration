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

const leads = seeds.map(([company, domain, mailbox, hasEmail, fit]) => ({
  id: id("lead"),
  runId,
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
    leadId: lead.id,
    runId,
    toEmail: lead.emails[0] ?? null,
    subject: `Quick idea for ${short}`,
    body: [
      `Hi there,`,
      "",
      `I came across ${short} — "${lead.aboutBlurb}" — and thought I'd reach out.`,
      "",
      offerNotes,
      "",
      "Would it be worth a quick 10-minute call next week to see if it's a fit? If not, no worries at all — just reply and let me know.",
      "",
      "Best,",
      "Lodestar Outreach",
      "",
      "—",
      "Sent by Lodestar Outreach <you@example.com>",
      "123 Placeholder St, Your City, ST 00000",
      "Don't want to hear from us? Reply STOP or unsubscribe: {{unsubscribe_url}}",
    ].join("\n"),
    status: "draft",
    sentAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
});

const db = {
  runs: [
    {
      id: runId,
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
