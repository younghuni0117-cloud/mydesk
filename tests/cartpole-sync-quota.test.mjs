import test from 'node:test';
import assert from 'node:assert/strict';
import {CartSync} from '../cartpole-evolution-sync.mjs';

test('full browser storage does not block server loading, queuing or checkpoint upload', async () => {
  let patchCount = 0;
  const rows = Array.from({length: 5}, (_, i) => ({id: i + 1, revision: 1, model: null}));
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {}
  };
  const store = new CartSync({key: 'a'.repeat(43), storage, fetcher: async (url, request) => {
    if (request.method === 'PATCH') {
      patchCount++;
      return {ok: true, json: async () => [{id: 1, revision: 2, model: JSON.parse(request.body).model}]};
    }
    return {ok: true, json: async () => rows};
  }});
  assert.equal((await store.load()).length, 5);
  const model = {version: 2, level: 1, episodes: 42};
  store.queue(1, model);
  await store.persistence;
  await store.flush();
  await store.persistence;
  assert.equal(patchCount, 1);
  assert.equal(store.pending.size, 0);
  assert.deepEqual(store.rows.get(1).model, model);
});

test('quota exhaustion during a write conflict still blocks stale uploads and preserves a memory copy', async () => {
  const store = new CartSync({key: 'a'.repeat(43),
    storage: {getItem: () => null, setItem: () => { throw Error('quota'); }},
    fetcher: async () => ({ok: true, json: async () => []})});
  await store.ready;
  store.rows.set(1, {revision: 1});
  store.queue(1, {episodes: 22});
  await assert.rejects(store.flush(), /새로고침/);
  assert.equal(store.blocked, true);
  assert.equal(store.conflicts.get(1).episodes, 22);
  assert.equal(store.pending.size, 0);
});
