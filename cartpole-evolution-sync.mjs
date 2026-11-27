import {SHARED_MODEL_URL, SHARED_MODEL_KEY} from './robot-shared-config.mjs';
import {cacheGet, cachePut} from './cartpole-evolution-cache.mjs?v=quota1';

export class CartSync {
  constructor({key, storage = localStorage, fetcher = fetch.bind(globalThis)}) {
    Object.assign(this, {key, storage, fetcher});
    this.rows = new Map();
    this.pending = new Map();
    this.busy = false;
    this.persistence = Promise.resolve();
    try {
      const saved = JSON.parse(storage.getItem('mydesk.cartpole.pending.v1'));
      if (saved?.scope === key.slice(-12)) this.pending = new Map(saved.entries);
    } catch {}
    this.ready = cacheGet('pending:' + key.slice(-12)).then(saved => {
      if (saved?.scope === key.slice(-12)) this.pending = new Map(saved.entries);
    }).catch(() => {});
  }

  persist() {
    const saved = structuredClone({
      scope: this.key.slice(-12), entries: [...this.pending]
    });
    this.persistence = this.persistence.then(async () => {
      try {
        await cachePut('pending:' + saved.scope, saved);
        try { this.storage.removeItem('mydesk.cartpole.pending.v1'); } catch {}
        this.durable = true;
      } catch {
        try {
          this.storage.setItem('mydesk.cartpole.pending.v1', JSON.stringify(saved));
          this.durable = true;
        } catch { this.durable = false; }
      }
    });
    return this.persistence;
  }

  archive(id, model) {
    this.conflicts ??= new Map();
    this.conflicts.set(id, model);
    cachePut('conflict:' + this.key.slice(-12) + ':' + id, model).catch(() => {});
  }

  async request(query = '', data) {
    const response = await this.fetcher(SHARED_MODEL_URL.replace('robot_shared_model', 'cartpole_link_models') + query, {
      method: data ? 'PATCH' : 'GET', cache: 'no-store', credentials: 'omit',
      headers: {apikey: SHARED_MODEL_KEY, 'x-mindmap-key': this.key,
        'Content-Type': 'application/json', Prefer: 'return=representation'},
      body: data ? JSON.stringify({model: data.model}) : undefined,
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw Error('웹 저장 연결 실패');
    return response.json();
  }

  async load() {
    await this.ready;
    const rows = await this.request('?select=id,model,revision');
    if (rows.length !== 5) throw Error('기기 연결 링크 필요');
    for (const row of rows) this.rows.set(row.id, row);
    for (const [id, pending] of this.pending) {
      if (this.rows.get(id).revision !== pending.revision) {
        this.archive(id, pending.model);
        this.pending.delete(id);
      }
    }
    this.persist();
    return rows;
  }

  queue(id, model) {
    if (this.blocked) return;
    const row = this.rows.get(id);
    if (!row) return;
    this.pending.set(id, {model, revision: this.pending.get(id)?.revision ?? row.revision});
    this.persist();
  }

  async reset(id) {
    while (this.busy) await new Promise(resolve => setTimeout(resolve, 25));
    this.busy = true;
    try {
      const [row] = await this.request('?id=eq.' + id + '&select=id,model,revision');
      if (!row) throw Error('연결 확인 필요');
      const [saved] = await this.request('?id=eq.' + id + '&revision=eq.' + row.revision + '&select=id,model,revision', {model: null});
      if (!saved) throw Error('다른 기기 갱신 · 재시도');
      this.rows.set(id, saved);
      this.pending.delete(id);
      this.blocked = false;
      try { this.persist(); } catch {}
    } finally { this.busy = false; }
  }

  async flush() {
    if (this.blocked) throw Error('다른 기기의 최신 결과 적용 필요 · 새로고침');
    if (this.busy) return;
    this.busy = true;
    try {
      for (const [id, snapshot] of this.pending) {
        const rows = await this.request('?id=eq.' + id + '&revision=eq.' + snapshot.revision + '&select=id,model,revision', snapshot);
        if (!rows.length) {
          this.blocked = true;
          this.archive(id, snapshot.model);
          this.pending.delete(id);
          this.persist();
          throw Error('다른 기기의 최신 결과 적용 필요 · 새로고침');
        }
        this.rows.set(id, rows[0]);
        if (this.pending.get(id) === snapshot) this.pending.delete(id);
        else this.pending.get(id).revision = rows[0].revision;
        this.persist();
      }
    } finally { this.busy = false; }
  }
}
