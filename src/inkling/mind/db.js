/**
 * Inkling Mind — local-first IndexedDB foundation (Abstraction Engine, stage 1).
 *
 * All of a user's raw conversations + the layered knowledge graph live ON DEVICE
 * here (see docs/INKLING_ABSTRACTION_ENGINE.md §4). Promise-wrapped helpers over
 * IndexedDB; later stages (facts, clustering, models) build on these stores.
 */
const DB_NAME = "inkling-mind-v1";
const DB_VERSION = 1;

/** Object stores + their indexes. */
const STORES = {
  conversations: { keyPath: "id", indexes: [["ts", "ts"], ["sessionId", "sessionId"]] },
  facts: { keyPath: "id", indexes: [["convId", "convId"], ["category", "category"]] },
  nodes: { keyPath: "id", indexes: [["layer", "layer"], ["state", "state"], ["type", "type"]] },
  edges: { keyPath: "id", indexes: [["from", "from"], ["to", "to"], ["rel", "rel"]] },
  evidence: { keyPath: "id", indexes: [["ref", "ref"]] },
  frontier: { keyPath: "id", indexes: [["kind", "kind"]] },
  models: { keyPath: "id", indexes: [] },
  worldview: { keyPath: "id", indexes: [] },
  jobs: { keyPath: "id", indexes: [["type", "type"], ["status", "status"]] }
};

let _dbPromise = null;

export function isMindSupported() {
  return typeof indexedDB !== "undefined";
}

/** @returns {Promise<IDBDatabase>} */
export function openMindDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!isMindSupported()) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [idxName, keyPath] of def.indexes) {
          store.createIndex(idxName, keyPath, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Put (insert/replace) a record. */
export async function put(storeName, value) {
  const db = await openMindDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Put many in one transaction. */
export async function putMany(storeName, values) {
  if (!values?.length) return [];
  const db = await openMindDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const v of values) store.put(v);
    tx.oncomplete = () => resolve(values);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function get(storeName, key) {
  const db = await openMindDb();
  return reqToPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

export async function getAll(storeName) {
  const db = await openMindDb();
  return reqToPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, value) {
  const db = await openMindDb();
  const idx = db.transaction(storeName, "readonly").objectStore(storeName).index(indexName);
  return reqToPromise(idx.getAll(value));
}

export async function del(storeName, key) {
  const db = await openMindDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function count(storeName) {
  const db = await openMindDb();
  return reqToPromise(db.transaction(storeName, "readonly").objectStore(storeName).count());
}

/** Wipe everything (Settings → Privacy "clear local data"). */
export async function clearMind() {
  const db = await openMindDb();
  return new Promise((resolve, reject) => {
    const names = Object.keys(STORES);
    const tx = db.transaction(names, "readwrite");
    for (const n of names) tx.objectStore(n).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** Short unique id. */
export function mindId(prefix = "n") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
