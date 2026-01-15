import { apiFetch } from './api';
import { getAccessToken, getOrCreateDeviceId, getStoredUser } from './auth';
import {
  appendReceiptHistory,
  getOfflineFlag,
  listOfflineQueue,
  removeQueueItems,
  setOfflineCache,
  setOfflineFlag,
  updateQueueItem,
} from './offline-store';

type OfflineSyncResult = {
  results: {
    id: string;
    actionType: string;
    checksum: string;
    localAuditId?: string | null;
    status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'CONFLICT' | 'FAILED';
    conflictReason?: string | null;
    errorMessage?: string | null;
    result?: Record<string, unknown> | null;
  }[];
  cache?: Record<string, unknown>;
};

export async function syncOfflineQueue() {
  const token = getAccessToken();
  const user = getStoredUser();
  if (!token || !user?.id) {
    throw new Error('Missing session.');
  }
  const deviceId = getOrCreateDeviceId();
  const queue = await listOfflineQueue();
  if (queue.length === 0) {
    await setOfflineFlag('syncBlocked', 'false');
    return { results: [], cache: null };
  }
  let response: OfflineSyncResult;
  try {
    response = await apiFetch<OfflineSyncResult>('/offline/sync', {
      token,
      method: 'POST',
      body: JSON.stringify({
        userId: user.id,
        deviceId,
        actions: queue.map((item) => ({
          actionType: item.actionType,
          payload: item.payload,
          checksum: item.checksum,
          provisionalAt: item.provisionalAt,
          localAuditId: item.localAuditId,
        })),
      }),
    });
  } catch (error) {
    await setOfflineFlag('syncBlocked', 'true');
    throw error;
  }

  const removeIds: string[] = [];
  for (const result of response.results) {
    const target = queue.find(
      (item) =>
        item.checksum === result.checksum ||
        (result.localAuditId && item.localAuditId === result.localAuditId),
    ) ?? null;
    if (!target) {
      continue;
    }
    if (result.status === 'APPLIED' || result.status === 'REJECTED') {
      if (result.status === 'APPLIED' && result.result?.receiptNumber) {
        const localReceipt = (target.payload as { localReceiptNumber?: string })
          ?.localReceiptNumber;
        await appendReceiptHistory({
          localReceiptNumber: localReceipt ?? null,
          receiptNumber: String(result.result.receiptNumber ?? ''),
          syncedAt: new Date().toISOString(),
        });
      }
      removeIds.push(target.id);
    } else {
      await updateQueueItem(target.id, {
        status: result.status,
        conflictReason: result.conflictReason ?? undefined,
        errorMessage: result.errorMessage ?? undefined,
      });
    }
  }
  await removeQueueItems(removeIds);
  if (response.cache) {
    await setOfflineCache('snapshot', response.cache);
  }
  await setOfflineFlag('lastSyncAt', new Date().toISOString());
  await setOfflineFlag('syncBlocked', 'false');
  return response;
}

export async function recordOfflineStatus(status: 'OFFLINE' | 'ONLINE', since?: string) {
  const token = getAccessToken();
  const user = getStoredUser();
  if (!token || !user?.id) {
    return null;
  }
  const deviceId = getOrCreateDeviceId();
  return apiFetch('/offline/status', {
    token,
    method: 'POST',
    body: JSON.stringify({ deviceId, status, since }),
  });
}

export async function getSyncBlocked() {
  const blocked = await getOfflineFlag('syncBlocked');
  return blocked === 'true';
}
