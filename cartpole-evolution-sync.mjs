import {SHARED_MODEL_URL, SHARED_MODEL_KEY} from './robot-shared-config.mjs';

export class CartSync {
  constructor({key, storage = localStorage, fetcher = fetch.bind(globalThis)}) {
    Object.assign(this, {key, storage, fetcher});
    this.rows = new Map();
    this.pending = new Map();
    this.busy = false;
    try {
      const saved = JSON.parse(storage.getItem('mydesk.cartpole.pending.v1'));
      if (saved?.scope === key.slice(-12)) this.pending = new Map(saved.entries);
    } catch {}
  }

  persist() {
    this.storage.setItem('mydesk.cartpole.pending.v1', JSON.stringify({
      scope: this.key.slice(-12), entries: [...this.pending]
    }));
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
    const rows = await this.request('?select=id,model,revision');
    if (rows.length !== 5) throw Error('기기 연결 링크 필요');
    for (const row of rows) this.rows.set(row.id, row);
    for (const [id, pending] of this.pending) {
      if (this.rows.get(id).revision !== pending.revision) {
        this.storage.setItem('mydesk.cartpole.conflict.' + id, JSON.stringify(pending.model));
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

  async flush() {
    if (this.blocked) throw Error('다른 기기의 최신 결과 적용 필요 · 새로고침');
    if (this.busy) return;
    this.busy = true;
    try {
      for (const [id, snapshot] of this.pending) {
        const rows = await this.request('?id=eq.' + id + '&revision=eq.' + snapshot.revision + '&select=id,model,revision', snapshot);
        if (!rows.length) {
          this.blocked = true;
          this.storage.setItem('mydesk.cartpole.conflict.' + id, JSON.stringify(snapshot.model));
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
