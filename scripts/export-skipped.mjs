import fs from "fs";
const j = JSON.parse(fs.readFileSync("import-skip-analysis.json", "utf8"));
console.log("summary", j.summary);
const different = j.skipped.filter(
  (s) => s.company.trim().toLowerCase() !== s.kept_company.trim().toLowerCase(),
);
console.log("different name same key", different.length);
if (different.length) console.log(JSON.stringify(different, null, 2));

function esc(c) {
  return `"${String(c).replace(/"/g, '""')}"`;
}
const rows = [
  ["xlsx_row", "company", "email", "why", "kept_xlsx_row", "kept_company"],
  ...j.skipped.map((s) => [
    s.xlsx_row,
    s.company,
    s.email,
    s.why,
    s.kept_xlsx_row,
    s.kept_company,
  ]),
];
fs.writeFileSync(
  "import-skipped-rows.csv",
  rows.map((r) => r.map(esc).join(",")).join("\n"),
);
console.log("wrote import-skipped-rows.csv", j.skipped.length);
