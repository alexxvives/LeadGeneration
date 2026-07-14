import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext-on-Cloudflare config. Caching overrides (KV/R2/D1) can be
// added here later; the app does not require them for the core flow.
export default defineCloudflareConfig();
