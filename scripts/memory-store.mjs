export class MemoryStore {
  data = new Map();
  async get(key) { return structuredClone(this.data.get(key)?.value ?? null); }
  async setJSON(key, value, options = {}) { if (options.onlyIfNew && this.data.has(key)) return { modified: false }; this.data.set(key, { value: structuredClone(value), metadata: structuredClone(options.metadata || {}) }); return { modified: true }; }
  async getMetadata(key) { const row = this.data.get(key); return row ? { metadata: structuredClone(row.metadata) } : null; }
  async delete(key) { this.data.delete(key); }
  async *list({ prefix = '' } = {}) { yield { blobs: [...this.data.keys()].filter(k => k.startsWith(prefix)).sort().map(key => ({ key })) }; }
}
export function memoryDatabase() { return { production: true, sessions: new MemoryStore(), chunks: new MemoryStore() }; }
