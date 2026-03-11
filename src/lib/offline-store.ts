type OfflineActionType = 'SALE_COMPLETE' | 'PURCHASE_DRAFT' | 'STOCK_ADJUSTMENT';

export type OfflineQueueItem = {
  id: string;
  actionType: OfflineActionType;
  payload: Record<string, unknown>;
  checksum: string;
  provisionalAt?: string;
  localAuditId?: string;
  createdAt: string;
  status?: 'PENDING' | 'APPLIED' | 'REJECTED' | 'CONFLICT' | 'FAILED';
  conflictReason?: string;
  errorMessage?: string;
};

type EncryptedPayload = { iv: string; data: string };

type OfflineQueueRecord = {
  id: string;
  actionType: OfflineActionType;
  checksum: string;
  provisionalAt?: string;
  localAuditId?: string;
  createdAt: string;
  status?: OfflineQueueItem['status'];
  conflictReason?: string;
  errorMessage?: string;
  encryptedPayload: EncryptedPayload;
  sizeBytes: number;
};

type OfflineCacheRecord = {
  key: string;
  encryptedPayload: EncryptedPayload;
  updatedAt: string;
};

type OfflineMetaRecord = {
  key: string;
  value: string;
};

const DB_NAME = 'nvi-offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'queue';
const CACHE_STORE = 'cache';
const META_STORE = 'meta';
const EVENT_NAME = 'nvi-offline-queue-updated';
const MAX_QUEUE_ITEMS = 5000;
const MAX_QUEUE_BYTES = 50 * 1024 * 1024;

let dbOpenError: Error | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      const err = new Error(
        'IndexedDB is not available (private browsing or storage blocked).',
      );
      dbOpenError = err;
      reject(err);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      dbOpenError = null;
      resolve(request.result);
    };
    request.onerror = () => {
      const err = request.error ?? new Error('IndexedDB failed to open.');
      dbOpenError = err;
      reject(err);
    };
  });
}

export function getDbOpenError(): Error | null {
  return dbOpenError;
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToHex(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(',')}}`;
}

async function getMeta(key: string) {
  const db = await openDb();
  return new Promise<OfflineMetaRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as OfflineMetaRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error(`Failed to read meta key: ${key}`));
    tx.onerror = () => reject(tx.error ?? new Error(`Transaction failed reading meta key: ${key}`));
  });
}

async function setMeta(key: string, value: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getCryptoKey() {
  const stored = await getMeta('cryptoKey');
  if (stored?.value) {
    const raw = fromBase64(stored.value);
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  await setMeta('cryptoKey', toBase64(raw));
  return key;
}

async function encryptJson(payload: Record<string, unknown>) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { iv: toBase64(iv.buffer), data: toBase64(cipher) };
}

async function decryptJson(encrypted: EncryptedPayload) {
  const key = await getCryptoKey();
  const iv = new Uint8Array(fromBase64(encrypted.iv));
  const data = fromBase64(encrypted.data);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
}

export async function computeChecksum(
  payload: Record<string, unknown>,
  deviceId: string,
  provisionalAt?: string,
) {
  const data = stableStringify({ deviceId, provisionalAt, payload });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(data),
  );
  return bufferToHex(digest);
}

function notifyQueueUpdated(count: number) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { count } }));
}

export function onQueueUpdated(handler: (count: number) => void) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail as { count?: number } | undefined;
    handler(detail?.count ?? 0);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export async function enqueueOfflineAction(item: Omit<OfflineQueueItem, 'checksum' | 'createdAt'> & { checksum?: string }) {
  const deviceId = String(item.payload.deviceId ?? 'unknown-device');
  const provisionalAt = item.provisionalAt ?? new Date().toISOString();
  const checksum = item.checksum ?? (await computeChecksum(item.payload, deviceId, provisionalAt));
  const encryptedPayload = await encryptJson(item.payload);
  const record: OfflineQueueRecord = {
    id: item.id,
    actionType: item.actionType,
    checksum,
    provisionalAt,
    localAuditId: item.localAuditId,
    createdAt: new Date().toISOString(),
    status: 'PENDING',
    encryptedPayload,
    sizeBytes: JSON.stringify(encryptedPayload).length,
  };
  const stats = await getQueueStats();
  if (stats.count + 1 > MAX_QUEUE_ITEMS) {
    throw new Error('Offline queue limit reached.');
  }
  if (stats.bytes + record.sizeBytes > MAX_QUEUE_BYTES) {
    throw new Error('Offline queue storage limit reached.');
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const count = await getPendingCount();
  notifyQueueUpdated(count);
  return record;
}

export async function listOfflineQueue() {
  const db = await openDb();
  const records = await new Promise<OfflineQueueRecord[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as OfflineQueueRecord[]);
    request.onerror = () => reject(request.error ?? new Error('Failed to read offline queue.'));
  });
  const items: OfflineQueueItem[] = [];
  for (const record of records) {
    const payload = await decryptJson(record.encryptedPayload);
    items.push({
      id: record.id,
      actionType: record.actionType,
      payload,
      checksum: record.checksum,
      provisionalAt: record.provisionalAt,
      localAuditId: record.localAuditId,
      createdAt: record.createdAt,
      status: record.status,
      conflictReason: record.conflictReason,
      errorMessage: record.errorMessage,
    });
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getQueueStats() {
  const db = await openDb();
  const records = await new Promise<OfflineQueueRecord[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as OfflineQueueRecord[]);
    request.onerror = () => reject(request.error ?? new Error('Failed to read offline queue stats.'));
  });
  const bytes = records.reduce(
    (sum, record) => sum + (record.sizeBytes ?? JSON.stringify(record.encryptedPayload).length),
    0,
  );
  return { count: records.length, bytes, maxItems: MAX_QUEUE_ITEMS, maxBytes: MAX_QUEUE_BYTES };
}

export async function updateQueueItem(
  id: string,
  updates: Partial<Pick<OfflineQueueRecord, 'status' | 'conflictReason' | 'errorMessage'>>,
) {
  const db = await openDb();
  const record = await new Promise<OfflineQueueRecord | undefined>((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).get(id);
    request.onsuccess = () => resolve(request.result as OfflineQueueRecord | undefined);
    request.onerror = () => resolve(undefined);
  });
  if (!record) {
    return;
  }
  const next = { ...record, ...updates };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(next);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const count = await getPendingCount();
  notifyQueueUpdated(count);
}

export async function removeQueueItems(ids: string[]) {
  if (ids.length === 0) {
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const count = await getPendingCount();
  notifyQueueUpdated(count);
}

export async function getPendingCount() {
  const db = await openDb();
  const records = await new Promise<OfflineQueueRecord[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result as OfflineQueueRecord[]);
    request.onerror = () => reject(request.error);
  });
  return records.filter((r) => r.status === 'PENDING' || !r.status).length;
}

export async function setOfflineCache(key: string, payload: Record<string, unknown>) {
  const encryptedPayload = await encryptJson(payload);
  const record: OfflineCacheRecord = {
    key,
    encryptedPayload,
    updatedAt: new Date().toISOString(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.objectStore(CACHE_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineCache<T extends Record<string, unknown>>(key: string) {
  const db = await openDb();
  const record = await new Promise<OfflineCacheRecord | undefined>((resolve) => {
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const request = tx.objectStore(CACHE_STORE).get(key);
    request.onsuccess = () => resolve(request.result as OfflineCacheRecord | undefined);
    request.onerror = () => resolve(undefined);
  });
  if (!record) {
    return null;
  }
  return decryptJson(record.encryptedPayload) as Promise<T>;
}

export async function appendReceiptHistory(record: {
  localReceiptNumber?: string | null;
  receiptNumber?: string | null;
  syncedAt: string;
}) {
  const existing = await getOfflineCache<{ receipts?: typeof record[] }>('receiptHistory');
  const receipts = existing?.receipts ?? [];
  const next = [record, ...receipts].slice(0, 50);
  await setOfflineCache('receiptHistory', { receipts: next });
}

export async function getReceiptHistory() {
  const existing = await getOfflineCache<{ receipts?: Array<Record<string, unknown>> }>(
    'receiptHistory',
  );
  return existing?.receipts ?? [];
}

export async function setOfflineFlag(key: 'lastSyncAt' | 'syncBlocked' | 'offlineSince', value: string) {
  await setMeta(key, value);
}

export async function getOfflineFlag(key: 'lastSyncAt' | 'syncBlocked' | 'offlineSince') {
  const stored = await getMeta(key);
  return stored?.value ?? null;
}

export async function setOfflinePin(pin: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pin),
  );
  await setMeta('pinHash', bufferToHex(digest));
  await setMeta('pinRequired', 'true');
}

export async function clearOfflinePin() {
  await setMeta('pinHash', '');
  await setMeta('pinRequired', 'false');
}

export async function isOfflinePinRequired() {
  const required = await getMeta('pinRequired');
  return required?.value === 'true';
}

export async function getPinLockStatus(): Promise<{
  locked: boolean;
  lockedUntil: string | null;
  attempts: number;
}> {
  const [lockedUntilMeta, attemptsMeta] = await Promise.all([
    getMeta('pinLockedUntil').catch(() => undefined),
    getMeta('pinAttempts').catch(() => undefined),
  ]);
  const lockedUntil = lockedUntilMeta?.value ?? '';
  const attempts = parseInt(attemptsMeta?.value ?? '0', 10);
  if (lockedUntil) {
    const locked = new Date(lockedUntil) > new Date();
    return { locked, lockedUntil: locked ? lockedUntil : null, attempts };
  }
  return { locked: false, lockedUntil: null, attempts };
}

export async function verifyOfflinePin(pin: string): Promise<{
  success: boolean;
  locked: boolean;
  lockedUntil: string | null;
  attempts: number;
}> {
  const lockStatus = await getPinLockStatus();
  if (lockStatus.locked) {
    return {
      success: false,
      locked: true,
      lockedUntil: lockStatus.lockedUntil,
      attempts: lockStatus.attempts,
    };
  }

  const stored = await getMeta('pinHash').catch(() => undefined);
  if (!stored?.value) {
    return { success: false, locked: false, lockedUntil: null, attempts: 0 };
  }

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pin),
  );
  const match = bufferToHex(digest) === stored.value;

  if (match) {
    await Promise.all([
      setMeta('pinAttempts', '0'),
      setMeta('pinLockedUntil', ''),
    ]);
    return { success: true, locked: false, lockedUntil: null, attempts: 0 };
  }

  // Failed — increment counter and lock if threshold reached.
  const newAttempts = lockStatus.attempts + 1;
  await setMeta('pinAttempts', String(newAttempts));

  let lockedUntil = '';
  if (newAttempts >= 10) {
    lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await setMeta('pinLockedUntil', lockedUntil);
  } else if (newAttempts >= 5) {
    lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await setMeta('pinLockedUntil', lockedUntil);
  }

  return {
    success: false,
    locked: !!lockedUntil,
    lockedUntil: lockedUntil || null,
    attempts: newAttempts,
  };
}

export async function rotateOfflineKey() {
  await clearOfflineData();
  await setMeta('cryptoKey', '');
}

export async function clearOfflineData() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE, CACHE_STORE, META_STORE], 'readwrite');
    tx.objectStore(QUEUE_STORE).clear();
    tx.objectStore(CACHE_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
