// Shared shape returned by any live search provider before enrichment.
export interface PageResult {
  url: string;
  title: string | null;
  description: string | null;
  content: string; // markdown or plain text, may be empty
}

export interface SearchProvider {
  name: string;
  search(query: string, limit: number): Promise<PageResult[]>;
}
