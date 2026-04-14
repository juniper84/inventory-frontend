'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { clearSession, getAccessToken } from '@/lib/auth';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { loadUnits, Unit } from '@/lib/units';
import { getPermissionSet } from '@/lib/permissions';
import {
  NotificationSettings,
  normalizeNotificationSettings,
} from '@/lib/notification-settings';
import { setStoredCurrency, setStoredTimezone, setStoredDateFormat } from '@/lib/business-context';
import type { NotifySeverity } from '@/components/notifications/types';

// ── Types ──────────────────────────────────────────────────────────────────

export type Business = { id: string; name: string; defaultLanguage: string };
export type Role = { id: string; name: string };
export type UserRecord = { id: string; name: string; email: string };
export type SupportRequest = {
  id: string;
  platformAdminId: string;
  reason: string;
  status: string;
  scope?: string[] | null;
  durationHours?: number | null;
  requestedAt: string;
};
export type SubscriptionSummary = {
  status: string;
  tier: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  expiresAt: string | null;
  limits: Record<string, number | string | boolean | null>;
  usage: {
    users: number;
    branches: number;
    products: number;
    devices: number;
  };
  warnings: { type: string; message: string }[];
};
export type SubscriptionRequest = {
  id: string;
  type: 'UPGRADE' | 'DOWNGRADE' | 'CANCEL' | 'SUBSCRIBE';
  requestedTier?: string | null;
  requestedDurationMonths?: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  responseNote?: string | null;
  createdAt: string;
  decidedAt?: string | null;
};
export type ExpenseCategory = { id: string; code: string; label: string; isSystem: boolean };
export type ChangelogEntry = { action: string; userId: string; createdAt: string; metadata?: Record<string, unknown> };

export type BusinessSettings = {
  approvalDefaults: {
    stockAdjust: boolean;
    stockAdjustThresholdAmount: number | null;
    refund: boolean;
    refundThresholdAmount: number | null;
    purchase: boolean;
    purchaseThresholdAmount: number | null;
    transfer: boolean;
    transferThresholdAmount: number | null;
    expense: boolean;
    expenseThresholdAmount: number | null;
    discountThresholdPercent: number;
    discountThresholdAmount: number | null;
  };
  notificationDefaults: NotificationSettings;
  stockPolicies: {
    negativeStockAllowed: boolean;
    fifoMode: 'FIFO' | 'FEFO';
    valuationMethod: 'FIFO' | 'LIFO' | 'AVERAGE';
    expiryPolicy: 'ALLOW' | 'WARN' | 'BLOCK';
    expiryAlertDays: number;
    batchTrackingEnabled: boolean;
    transferBatchPolicy: 'PRESERVE' | 'RECREATE';
    lowStockThreshold: number;
  };
  posPolicies: {
    receiptTemplate: 'THERMAL' | 'A4';
    receiptHeader: string;
    receiptFooter: string;
    showBranchContact: boolean;
    creditEnabled: boolean;
    priceEditEnabled: boolean;
    shiftTrackingEnabled: boolean;
    shiftVarianceThreshold: number;
    discountThresholdPercent: number;
    discountThresholdAmount: number;
    refundReturnToStockDefault: boolean;
    offlinePriceVariancePercent: number;
    offlineLimits: {
      maxDurationHours: number;
      maxSalesCount: number;
      maxTotalValue: number;
    };
  };
  localeSettings: {
    currency: string;
    timezone: string;
    dateFormat: string;
  };
  sectionUpdatedAt?: Record<string, string> | null;
};

// ── Defaults ──────────────────────────────────────────────────────────────

export const APPROVAL_DEFAULTS: BusinessSettings['approvalDefaults'] = {
  stockAdjust: false,
  stockAdjustThresholdAmount: null,
  refund: false,
  refundThresholdAmount: null,
  purchase: false,
  purchaseThresholdAmount: null,
  transfer: false,
  transferThresholdAmount: null,
  expense: false,
  expenseThresholdAmount: null,
  discountThresholdPercent: 0,
  discountThresholdAmount: null,
};

export const STOCK_POLICY_DEFAULTS: BusinessSettings['stockPolicies'] = {
  negativeStockAllowed: false,
  fifoMode: 'FIFO',
  valuationMethod: 'FIFO',
  expiryPolicy: 'ALLOW',
  expiryAlertDays: 30,
  batchTrackingEnabled: false,
  transferBatchPolicy: 'PRESERVE',
  lowStockThreshold: 10,
};

export const POS_POLICY_DEFAULTS: BusinessSettings['posPolicies'] = {
  receiptTemplate: 'THERMAL',
  receiptHeader: '',
  receiptFooter: '',
  showBranchContact: false,
  creditEnabled: false,
  priceEditEnabled: false,
  shiftTrackingEnabled: false,
  shiftVarianceThreshold: 0,
  discountThresholdPercent: 0,
  discountThresholdAmount: 0,
  refundReturnToStockDefault: true,
  offlinePriceVariancePercent: 3,
  offlineLimits: {
    maxDurationHours: 72,
    maxSalesCount: 200,
    maxTotalValue: 5000000,
  },
};

// ── Hook ──────────────────────────────────────────────────────────────────

export function useBusinessSettings() {
  const t = useTranslations('businessSettingsPage');
  const router = useRouter();
  const locale = useLocale();
  const permissions = getPermissionSet();
  const canWrite = permissions.has('settings.write');
  const canDeleteBusiness = permissions.has('business.delete');
  const canRequestSubscription = permissions.has('subscription.request');

  // ── State ──
  const [business, setBusiness] = useState<Business | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<BusinessSettings | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ text: string; severity: NotifySeverity } | null>(null);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>([]);
  const [subscriptionRequestForm, setSubscriptionRequestForm] = useState({
    type: 'UPGRADE',
    requestedTier: 'BUSINESS',
    reason: '',
    requestedDurationMonths: '1',
  });
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeletingBusiness, setIsDeletingBusiness] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ businessId: '', password: '', confirmText: '' });
  const [unitForm, setUnitForm] = useState({ label: '', code: '', unitType: 'COUNT' as Unit['unitType'] });
  const [isCreatingUnit, setIsCreatingUnit] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingUnitForm, setEditingUnitForm] = useState({ label: '', code: '' });
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatLabel, setNewCatLabel] = useState('');
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [isDeletingCat, setIsDeletingCat] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatForm, setEditingCatForm] = useState({ label: '', code: '' });

  // ── Derived ──
  const isDirty = useMemo(() => {
    if (!settings || !draftSettings) return false;
    return JSON.stringify(settings) !== JSON.stringify(draftSettings);
  }, [settings, draftSettings]);

  const offlineEnabled = subscription?.limits?.offline !== false;
  const offlineTierCap = {
    maxDurationHours: subscription?.tier === 'ENTERPRISE' ? 168 : 72,
    maxSalesCount: subscription?.tier === 'ENTERPRISE' ? 2000 : 200,
    maxTotalValue: 5000000,
  };

  const sectionTimestamp = useCallback(
    (key: string): string | null => {
      const ts = settings?.sectionUpdatedAt?.[key];
      return ts ?? null;
    },
    [settings],
  );

  const resetSection = useCallback(
    (section: 'approval' | 'stock' | 'pos') => {
      if (!draftSettings) return;
      if (section === 'approval') {
        setDraftSettings({ ...draftSettings, approvalDefaults: { ...APPROVAL_DEFAULTS } });
      } else if (section === 'stock') {
        setDraftSettings({ ...draftSettings, stockPolicies: { ...STOCK_POLICY_DEFAULTS } });
      } else if (section === 'pos') {
        setDraftSettings({ ...draftSettings, posPolicies: { ...POS_POLICY_DEFAULTS } });
      }
    },
    [draftSettings],
  );

  // ── Data loading ──
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    setIsLoading(true);
    Promise.all([
      apiFetch<Business>('/business', { token }),
      apiFetch<BusinessSettings>('/settings', { token }),
      apiFetch<PaginatedResponse<Role> | Role[]>('/roles?limit=200', { token }),
      apiFetch<PaginatedResponse<UserRecord> | UserRecord[]>('/users?limit=200', { token }),
      apiFetch<PaginatedResponse<SupportRequest> | SupportRequest[]>('/support-access/requests?limit=200', { token }),
      apiFetch<SubscriptionSummary>('/subscription', { token }),
      loadUnits(token),
    ])
      .then(async ([biz, config, roleData, userData, requests, sub, unitList]) => {
        setBusiness(biz);
        const normalized: BusinessSettings = {
          ...config,
          notificationDefaults: normalizeNotificationSettings(config.notificationDefaults ?? null),
          stockPolicies: {
            ...config.stockPolicies,
            expiryAlertDays: config.stockPolicies.expiryAlertDays ?? 30,
          },
          posPolicies: {
            ...config.posPolicies,
            priceEditEnabled: config.posPolicies?.priceEditEnabled ?? false,
            offlinePriceVariancePercent: config.posPolicies?.offlinePriceVariancePercent ?? 3,
            offlineLimits: {
              maxDurationHours: config.posPolicies?.offlineLimits?.maxDurationHours ?? 72,
              maxSalesCount: config.posPolicies?.offlineLimits?.maxSalesCount ?? 200,
              maxTotalValue: config.posPolicies?.offlineLimits?.maxTotalValue ?? 5000000,
            },
          },
        };
        setSettings(normalized);
        setDraftSettings(normalized);
        setRoles(normalizePaginated(roleData).items);
        setUsers(normalizePaginated(userData).items);
        setSupportRequests(normalizePaginated(requests).items);
        setSubscription(sub);
        setUnits(unitList);
        try {
          const subReqData = await apiFetch<SubscriptionRequest[] | PaginatedResponse<SubscriptionRequest>>('/subscription/requests', { token });
          setSubscriptionRequests(normalizePaginated(subReqData).items);
        } catch { setSubscriptionRequests([]); }
        try {
          const historyData = await apiFetch<ChangelogEntry[]>('/settings/history', { token });
          setChangelog(historyData ?? []);
        } catch { setChangelog([]); }
        try {
          const catData = await apiFetch<ExpenseCategory[]>('/expenses/categories', { token });
          setExpenseCategories(catData ?? []);
        } catch { setExpenseCategories([]); }
      })
      .catch((err) => setBannerMsg({ text: getApiErrorMessage(err, t('loadFailed')), severity: 'error' }))
      .finally(() => setIsLoading(false));
  }, []);

  // Reset draft when leaving edit mode
  useEffect(() => {
    if (settings && !isEditing) setDraftSettings(settings);
  }, [settings, isEditing]);

  // Unsaved changes warning
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Actions ──

  const updateSettings = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !draftSettings) return;
    setBannerMsg(null);
    setIsSaving(true);
    try {
      const updated = await apiFetch<BusinessSettings>('/settings', {
        token,
        method: 'PUT',
        body: JSON.stringify(draftSettings),
      });
      setSettings(updated);
      setDraftSettings(updated);
      setIsEditing(false);
      if (updated.localeSettings?.currency) setStoredCurrency(updated.localeSettings.currency);
      if (updated.localeSettings?.timezone) setStoredTimezone(updated.localeSettings.timezone);
      if (updated.localeSettings?.dateFormat) setStoredDateFormat(updated.localeSettings.dateFormat);
      setBannerMsg({ text: t('settingsSaved'), severity: 'success' });
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('settingsSaveFailed')), severity: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [draftSettings, t]);

  const cancelEditing = useCallback(() => {
    setDraftSettings(settings);
    setIsEditing(false);
    setBannerMsg({ text: t('changesDiscarded'), severity: 'info' });
  }, [settings, t]);

  const deleteBusiness = useCallback(async () => {
    if (!business || !canDeleteBusiness) {
      setBannerMsg({ text: t('deleteNoAccess'), severity: 'error' });
      return;
    }
    if (deleteForm.businessId.trim() !== business.id || deleteForm.confirmText.trim() !== 'DELETE' || !deleteForm.password) {
      setBannerMsg({ text: t('deleteValidationFailed'), severity: 'error' });
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setIsDeletingBusiness(true);
    setBannerMsg(null);
    try {
      await apiFetch('/business/delete', {
        token,
        method: 'POST',
        body: JSON.stringify({ businessId: deleteForm.businessId.trim(), password: deleteForm.password, confirmText: deleteForm.confirmText.trim() }),
      });
      clearSession();
      router.replace(`/${locale}/login`);
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('deleteFailed')), severity: 'error' });
    } finally {
      setIsDeletingBusiness(false);
    }
  }, [business, canDeleteBusiness, deleteForm, locale, router, t]);

  const createUnit = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !unitForm.label || !unitForm.code) return;
    setBannerMsg(null);
    setIsCreatingUnit(true);
    try {
      const created = await apiFetch<Unit>('/units', {
        token,
        method: 'POST',
        body: JSON.stringify({ label: unitForm.label, code: unitForm.code, unitType: unitForm.unitType }),
      });
      setUnits((prev) => [...prev, created]);
      setUnitForm({ label: '', code: '', unitType: 'COUNT' });
      setBannerMsg({ text: t('unitCreated'), severity: 'success' });
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('unitCreateFailed')), severity: 'error' });
    } finally {
      setIsCreatingUnit(false);
    }
  }, [unitForm, t]);

  const updateUnit = useCallback(async (unitId: string, data: { label?: string; code?: string }) => {
    const token = getAccessToken();
    if (!token) return;
    setBannerMsg(null);
    try {
      const updated = await apiFetch<Unit>(`/units/${unitId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setUnits((prev) => prev.map((u) => (u.id === unitId ? updated : u)));
      setEditingUnitId(null);
      setBannerMsg({ text: t('unitUpdated') || 'Unit updated.', severity: 'success' });
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('unitUpdateFailed') || 'Failed to update unit.'), severity: 'error' });
    }
  }, [t]);

  const deleteUnit = useCallback(async (unitId: string) => {
    const token = getAccessToken();
    if (!token) return;
    setBannerMsg(null);
    try {
      await apiFetch(`/units/${unitId}`, { token, method: 'DELETE' });
      setUnits((prev) => prev.filter((u) => u.id !== unitId));
      setBannerMsg({ text: t('unitDeleted') || 'Unit deleted.', severity: 'success' });
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('unitDeleteFailed') || 'Failed to delete unit.'), severity: 'error' });
    }
  }, [t]);

  const loadExpenseCategories = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const catData = await apiFetch<ExpenseCategory[]>('/expenses/categories', { token });
      setExpenseCategories(catData ?? []);
    } catch { setExpenseCategories([]); }
  }, []);

  const createExpenseCategory = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !newCatCode || !newCatLabel) return;
    setBannerMsg(null);
    setIsCreatingCat(true);
    try {
      await apiFetch('/expenses/categories', {
        token,
        method: 'POST',
        body: JSON.stringify({ code: newCatCode.toUpperCase().replace(/\s+/g, '_'), label: newCatLabel }),
      });
      setNewCatCode('');
      setNewCatLabel('');
      await loadExpenseCategories();
      setBannerMsg({ text: t('categoryCreated'), severity: 'success' });
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('categoryCreateFailed')), severity: 'error' });
    } finally {
      setIsCreatingCat(false);
    }
  }, [newCatCode, newCatLabel, loadExpenseCategories, t]);

  const deleteExpenseCategory = useCallback(async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    setBannerMsg(null);
    setIsDeletingCat(id);
    try {
      await apiFetch(`/expenses/categories/${id}`, { token, method: 'DELETE' });
      await loadExpenseCategories();
      setBannerMsg({ text: t('categoryDeleted'), severity: 'success' });
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('categoryDeleteFailed')), severity: 'error' });
    } finally {
      setIsDeletingCat(null);
    }
  }, [loadExpenseCategories, t]);

  const updateExpenseCategory = useCallback(async (id: string, data: { label?: string; code?: string }) => {
    const token = getAccessToken();
    if (!token) return;
    setBannerMsg(null);
    try {
      await apiFetch(`/expenses/categories/${id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify(data),
      });
      await loadExpenseCategories();
      setEditingCatId(null);
      setBannerMsg({ text: t('categoryUpdated') || 'Category updated.', severity: 'success' });
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('categoryUpdateFailed') || 'Failed to update category.'), severity: 'error' });
    }
  }, [loadExpenseCategories, t]);

  const resolveSupportRequest = useCallback(async (requestId: string, action: 'approve' | 'reject') => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await apiFetch(`/support-access/requests/${requestId}/${action}`, { token, method: 'POST' });
      const updated = await apiFetch<SupportRequest[] | PaginatedResponse<SupportRequest>>('/support-access/requests', { token });
      setSupportRequests(normalizePaginated(updated).items);
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('supportRequestFailed')), severity: 'error' });
    }
  }, [t]);

  const submitSubscriptionRequest = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsSubmittingRequest(true);
    try {
      await apiFetch('/subscription/requests', {
        token,
        method: 'POST',
        body: JSON.stringify({
          type: subscriptionRequestForm.type,
          requestedTier: subscriptionRequestForm.type === 'CANCEL' ? undefined : subscriptionRequestForm.requestedTier,
          reason: subscriptionRequestForm.reason || undefined,
          requestedDurationMonths: subscriptionRequestForm.type === 'CANCEL' ? undefined : parseInt(subscriptionRequestForm.requestedDurationMonths, 10) || undefined,
        }),
      });
      const updated = await apiFetch<SubscriptionRequest[] | PaginatedResponse<SubscriptionRequest>>('/subscription/requests', { token });
      setSubscriptionRequests(normalizePaginated(updated).items);
      setSubscriptionRequestForm({ type: 'UPGRADE', requestedTier: 'BUSINESS', reason: '', requestedDurationMonths: '1' });
      setBannerMsg({ text: t('subscriptionRequestSent'), severity: 'success' });
    } catch (err) {
      setBannerMsg({ text: getApiErrorMessage(err, t('subscriptionRequestFailed')), severity: 'error' });
    } finally {
      setIsSubmittingRequest(false);
    }
  }, [subscriptionRequestForm, t]);

  return {
    // Data
    business, settings, draftSettings, subscription, roles, users, units,
    subscriptionRequests, supportRequests, changelog, expenseCategories,
    // State
    isLoading, isSaving, isEditing, isDirty, isDeletingBusiness, isCreatingUnit,
    isSubmittingRequest, isCreatingCat, isDeletingCat,
    bannerMsg, deleteForm, unitForm, subscriptionRequestForm,
    editingUnitId, editingUnitForm, editingCatId, editingCatForm,
    newCatCode, newCatLabel,
    // Permissions
    canWrite, canDeleteBusiness, canRequestSubscription,
    // Derived
    offlineEnabled, offlineTierCap, sectionTimestamp,
    // Setters
    setDraftSettings, setBannerMsg, setIsEditing, setDeleteForm, setUnitForm,
    setSubscriptionRequestForm, setEditingUnitId, setEditingUnitForm,
    setEditingCatId, setEditingCatForm, setNewCatCode, setNewCatLabel,
    // Actions
    updateSettings, cancelEditing, deleteBusiness,
    createUnit, updateUnit, deleteUnit,
    createExpenseCategory, deleteExpenseCategory, updateExpenseCategory,
    resolveSupportRequest, submitSubscriptionRequest,
    resetSection,
  };
}
