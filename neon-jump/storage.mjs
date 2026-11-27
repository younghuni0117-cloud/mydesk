let opening;
function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('mydesk.neon-jump.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => { opening = null; throw error; });
  return opening;
}

export async function read(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('records').objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('records', 'readwrite');
    const result = operation(transaction.objectStore('records'));
    transaction.oncomplete = () => resolve(result?.());
    transaction.onabort = () => reject(transaction.error ?? Error('IndexedDB 저장 중단'));
  });
}

export const put = (key, value) => write(store => { store.put(value, key); });

export function checkpoint(key, snapshot, expectedRevision, writer, primaryKey, reset = false) {
  return write(store => {
    let outcome;
    const request = store.get(key);
    request.onsuccess = () => {
      const previous = request.result;
      if ((previous?.revision ?? 0) !== expectedRevision) {
        if (!reset) {
          const branch = primaryKey + ':conflict:' + writer;
          store.put({ revision: 1, snapshot }, branch);
          store.put(branch, primaryKey + ':latest-conflict');
          outcome = { branch, revision: 1 };
        } else outcome = { conflict: true, revision: expectedRevision };
        return;
      }
      const revision = expectedRevision + 1;
      if (reset) {
        store.delete(key + ':backup');
        store.delete(key + ':best');
      } else {
        if (previous?.snapshot) store.put(previous.snapshot, key + ':backup');
        if (snapshot.best) store.put(snapshot.best, key + ':best');
      }
      store.put({ revision, snapshot }, key);
      outcome = { revision };
    };
    return () => outcome;
  });
}

export function saveManual(key, attempt) {
  return write(store => {
    let result;
    const request = store.get(key);
    request.onsuccess = () => {
      const previous = request.result ?? { attempts: 0, best: 0, cleared: false, passed: 0 };
      result = { attempts: previous.attempts + 1, best: Math.max(previous.best, attempt.progress),
        cleared: previous.cleared || attempt.cleared, passed: Math.max(previous.passed, attempt.passed),
        replay: !previous.replay || attempt.progress > previous.best ? attempt.replay : previous.replay };
      store.put(result, key);
    };
    return () => result;
  });
}
