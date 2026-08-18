// Shared shape returned by any live search provider before enrichment.
export interface PageResult {
  url: string;
  title: string | null;
  description: string | null;
  content: string; // markdown or plain text, may be empty
  /** Live fetch timed out or the origin was down — do not register as a lead. */
  unreachable?: boolean;
}

export interface SearchProvider {
  name: string;
  search(query: string, limit: number): Promise<PageResult[]>;
}
