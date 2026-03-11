'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { setStoredCurrency, setStoredTimezone, setStoredDateFormat } from '@/lib/business-context';

type Business = { id: string; name: string; defaultLanguage: string };

type OnboardingState = {
  enabled?: boolean;
  enforced?: boolean;
  businessProfileComplete?: boolean;
  branchSetupComplete?: boolean;
  teamSetupSkipped?: boolean;
};

type Settings = {
  localeSettings: { currency: string; timezone: string; dateFormat: string };
  posPolicies?: {
    receiptTemplate: string;
    receiptHeader: string;
    receiptFooter: string;
    [key: string]: unknown;
  };
  onboarding?: OnboardingState;
  readOnlyEnabled?: boolean;
  readOnlyReason?: string | null;
};

type Branch = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isDefault?: boolean;
  status?: string;
};

type Role = { id: string; name: string };
type InviteRow = { email: string; roleId: string };

const getTimezoneOptions = (): string[] => {
  try {
    const all = (
      Intl as unknown as { supportedValuesOf(key: string): string[] }
    ).supportedValuesOf('timeZone');
    const africa = all.filter((tz) => tz.startsWith('Africa/')).sort();
    const others = all.filter((tz) => !tz.startsWith('Africa/')).sort();
    return [...africa, ...others];
  } catch {
    return [
      'Africa/Dar_es_Salaam',
      'Africa/Nairobi',
      'Africa/Kampala',
      'Africa/Kigali',
      'Africa/Johannesburg',
      'UTC',
    ];
  }
};


const DEFAULT_ONBOARDING: Required<OnboardingState> = {
  enabled: true,
  enforced: true,
  businessProfileComplete: false,
  branchSetupComplete: false,
  teamSetupSkipped: false,
};

export default function OnboardingPage() {
  const router = useRouter();
  const locale = useLocale();
  const ot = useTranslations('onboarding');

  const READY_MESSAGES = [
    ot('readyMsg1'),
    ot('readyMsg2'),
    ot('readyMsg3'),
  ];

  const STEP_LABELS = [
    { label: ot('step0Label'), description: ot('step0Description') },
    { label: ot('step1Label'), description: ot('step1Description') },
    { label: ot('step2Label'), description: ot('step2Description') },
    { label: ot('step3Label'), description: ot('step3Description') },
    { label: ot('step4Label'), description: ot('step4Description') },
  ];

  const permissions = getPermissionSet();
  const canUpdateBusiness = permissions.has('business.update');
  const canUpdateSettings = permissions.has('settings.write');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [business, setBusiness] = useState<Business | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [onboardingState, setOnboardingState] =
    useState<Required<OnboardingState>>(DEFAULT_ONBOARDING);

  // Step 0 — Business Profile
  const [profileForm, setProfileForm] = useState({
    name: '',
    currency: 'TZS',
    timezone: 'Africa/Dar_es_Salaam',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Step 1 — Branch Setup
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '' });
  const [addBranchForm, setAddBranchForm] = useState({ name: '', address: '', phone: '' });
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [isUpdatingBranch, setIsUpdatingBranch] = useState(false);

  // Step 2 — Receipt Setup
  const [posForm, setPosForm] = useState({
    receiptTemplate: 'THERMAL',
    receiptHeader: '',
    receiptFooter: ot('receiptFooterDefault'),
  });
  const [isSavingPos, setIsSavingPos] = useState(false);

  // Step 3 — Invite Team
  const [roles, setRoles] = useState<Role[]>([]);
  const [inviteRows, setInviteRows] = useState<InviteRow[]>([{ email: '', roleId: '' }]);
  const [isSendingInvites, setIsSendingInvites] = useState(false);

  // Step 4 — Ready
  const [readyMsgIndex, setReadyMsgIndex] = useState(0);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = `/${locale}`;

  const applyBranchSelection = (items: Branch[], preferredId?: string) => {
    const preferred = (preferredId && items.find((b) => b.id === preferredId)) || null;
    const fallback = items.find((b) => b.isDefault) ?? items[0] ?? null;
    const selected = preferred ?? fallback;
    setSelectedBranchId(selected?.id ?? '');
    setBranchForm({
      name: selected?.name ?? '',
      address: selected?.address ?? '',
      phone: selected?.phone ?? '',
    });
  };

  // Initial data load
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    setIsLoading(true);
    Promise.all([
      apiFetch<Business>('/business', { token }),
      apiFetch<Settings>('/settings', { token }),
      apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
    ])
      .then(([biz, config, branchData]) => {
        const branchItems = normalizePaginated(branchData).items;
        setBusiness(biz);
        setSettings(config);
        setBranches(branchItems);
        applyBranchSelection(branchItems);

        const state = { ...DEFAULT_ONBOARDING, ...(config.onboarding ?? {}) };
        setOnboardingState(state);

        setProfileForm({
          name: biz.name ?? '',
          currency: config.localeSettings?.currency ?? 'TZS',
          timezone: config.localeSettings?.timezone ?? 'Africa/Dar_es_Salaam',
        });
        setPosForm({
          receiptTemplate: config.posPolicies?.receiptTemplate ?? 'THERMAL',
          receiptHeader: config.posPolicies?.receiptHeader ?? '',
          receiptFooter: config.posPolicies?.receiptFooter ?? ot('receiptFooterDefault'),
        });

        if (config.onboarding?.enabled === false) {
          router.replace(base);
          return;
        }
        if (state.businessProfileComplete && state.branchSetupComplete) {
          router.replace(base);
          return;
        }
        setStep(state.businessProfileComplete ? 1 : 0);
      })
      .catch((err) =>
        setError(getApiErrorMessage(err, ot('errorLoadData'))),
      )
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load roles lazily when reaching step 3
  useEffect(() => {
    if (step !== 3 || roles.length > 0) return;
    const token = getAccessToken();
    if (!token) return;
    apiFetch<PaginatedResponse<Role> | Role[]>('/roles?limit=200', { token })
      .then((data) => {
        const items = normalizePaginated(data).items;
        setRoles(items.filter((r) => r.name !== 'System Owner'));
      })
      .catch(() => {
        /* silently skip */
      });
  }, [step, roles.length]);

  // Ready step — rotating messages + redirect
  useEffect(() => {
    if (step !== 4) return;
    const msgInterval = setInterval(() => {
      setReadyMsgIndex((i) => (i + 1) % READY_MESSAGES.length);
    }, 800);
    readyTimerRef.current = setTimeout(() => {
      router.replace(base);
    }, 2800);
    return () => {
      clearInterval(msgInterval);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [step, base, router]);

  // ─── Step 0: Save Business Profile ──────────────────────────────────────────
  const saveBusinessProfile = async () => {
    if (!business || !settings) return;
    if (!canUpdateBusiness || !canUpdateSettings) {
      setError(ot('errorPermission'));
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setIsSavingProfile(true);
    setError(null);
    try {
      if (profileForm.name.trim() && profileForm.name.trim() !== business.name) {
        await apiFetch('/business', {
          token,
          method: 'PUT',
          body: JSON.stringify({ name: profileForm.name.trim() }),
        });
      }
      const updated = await apiFetch<Settings>('/settings', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          localeSettings: {
            currency: profileForm.currency,
            timezone: profileForm.timezone,
            dateFormat: settings.localeSettings?.dateFormat ?? 'DD/MM/YYYY',
          },
          onboarding: { ...onboardingState, businessProfileComplete: true },
        }),
      });
      setSettings(updated);
      setOnboardingState({
        ...DEFAULT_ONBOARDING,
        ...(updated.onboarding ?? {}),
        businessProfileComplete: true,
      });
      setStoredCurrency(profileForm.currency);
      setStoredTimezone(profileForm.timezone);
      setStoredDateFormat(settings.localeSettings?.dateFormat ?? 'DD/MM/YYYY');
      setStep(1);
    } catch (err) {
      setError(getApiErrorMessage(err, ot('errorSaveProfile')));
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ─── Step 1: Branch helpers ──────────────────────────────────────────────────
  const createBranch = async () => {
    if (!addBranchForm.name.trim() || !canUpdateSettings) return;
    const token = getAccessToken();
    if (!token) return;
    setIsCreatingBranch(true);
    setError(null);
    try {
      const created = await apiFetch<Branch>('/branches', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: addBranchForm.name.trim(),
          address: addBranchForm.address.trim() || undefined,
          phone: addBranchForm.phone.trim() || undefined,
        }),
      });
      const branchData = await apiFetch<PaginatedResponse<Branch> | Branch[]>(
        '/branches?limit=200',
        { token },
      );
      const items = normalizePaginated(branchData).items;
      setBranches(items);
      applyBranchSelection(items, created.id);
      setAddBranchForm({ name: '', address: '', phone: '' });
    } catch (err) {
      setError(getApiErrorMessage(err, ot('errorCreateBranch')));
    } finally {
      setIsCreatingBranch(false);
    }
  };

  const saveBranchDetails = async () => {
    if (!selectedBranchId || !branchForm.name.trim() || !canUpdateSettings) return;
    const token = getAccessToken();
    if (!token) return;
    setIsUpdatingBranch(true);
    setError(null);
    try {
      await apiFetch(`/branches/${selectedBranchId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: branchForm.name.trim(),
          address: branchForm.address.trim() || undefined,
          phone: branchForm.phone.trim() || undefined,
        }),
      });
      const branchData = await apiFetch<PaginatedResponse<Branch> | Branch[]>(
        '/branches?limit=200',
        { token },
      );
      const items = normalizePaginated(branchData).items;
      setBranches(items);
      applyBranchSelection(items, selectedBranchId);
    } catch (err) {
      setError(getApiErrorMessage(err, ot('errorUpdateBranch')));
    } finally {
      setIsUpdatingBranch(false);
    }
  };

  const completeBranchSetup = async () => {
    if (!settings || !canUpdateSettings) return;
    if (branches.length < 1) {
      setError(ot('errorNoBranch'));
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setIsSavingBranch(true);
    setError(null);
    try {
      const updated = await apiFetch<Settings>('/settings', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          onboarding: { ...onboardingState, branchSetupComplete: true },
        }),
      });
      setSettings(updated);
      setOnboardingState({
        ...DEFAULT_ONBOARDING,
        ...(updated.onboarding ?? {}),
        branchSetupComplete: true,
      });
      setStep(2);
    } catch (err) {
      setError(getApiErrorMessage(err, ot('errorCompleteBranch')));
    } finally {
      setIsSavingBranch(false);
    }
  };

  // ─── Step 2: Receipt Setup ───────────────────────────────────────────────────
  const saveReceiptSetup = async () => {
    if (!settings || !canUpdateSettings) {
      setStep(3);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setStep(3);
      return;
    }
    setIsSavingPos(true);
    setError(null);
    try {
      const updated = await apiFetch<Settings>('/settings', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          posPolicies: {
            ...(settings.posPolicies ?? {}),
            receiptTemplate: posForm.receiptTemplate,
            receiptHeader: posForm.receiptHeader,
            receiptFooter: posForm.receiptFooter,
          },
        }),
      });
      setSettings(updated);
      setStep(3);
    } catch (err) {
      setError(getApiErrorMessage(err, ot('errorSaveReceipt')));
    } finally {
      setIsSavingPos(false);
    }
  };

  // ─── Step 3: Send Invites ────────────────────────────────────────────────────
  const sendInvites = async () => {
    const validRows = inviteRows.filter((r) => r.email.trim() && r.roleId);
    if (validRows.length === 0) {
      setStep(4);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setStep(4);
      return;
    }
    setIsSendingInvites(true);
    setError(null);
    try {
      await Promise.all(
        validRows.map((r) =>
          apiFetch('/users/invite', {
            token,
            method: 'POST',
            body: JSON.stringify({ email: r.email.trim(), roleId: r.roleId }),
          }),
        ),
      );
      setStep(4);
    } catch (err) {
      setError(getApiErrorMessage(err, ot('errorSendInvites')));
    } finally {
      setIsSendingInvites(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <PageSkeleton title={ot('readyMsg1')} />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left sidebar — step indicator (desktop only) */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-gold-700/30 bg-black/40 px-6 py-10">
        <p className="text-[10px] uppercase tracking-[0.28em] text-gold-500 mb-8">Setup</p>
        {STEP_LABELS.map((s, i) => {
          const isCompleted = i < step;
          const isActive = i === step;
          return (
            <div key={i} className="flex gap-3 relative">
              {i < STEP_LABELS.length - 1 && (
                <span
                  className="absolute left-3.5 top-7 w-px bg-gold-700/40"
                  style={{ height: 40 }}
                />
              )}
              <span
                className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all ${
                  isCompleted
                    ? 'border-gold-400 bg-gold-400 text-black'
                    : isActive
                      ? 'border-gold-400 bg-black text-gold-300'
                      : 'border-gold-700/50 bg-black text-gold-600'
                }`}
              >
                {isCompleted ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    className="w-3.5 h-3.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <div className="pb-10">
                <p
                  className={`text-sm font-semibold leading-tight ${
                    isActive
                      ? 'text-gold-100'
                      : isCompleted
                        ? 'text-gold-300'
                        : 'text-gold-600'
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[11px] text-gold-500 mt-0.5">{s.description}</p>
              </div>
            </div>
          );
        })}
      </aside>

      {/* Main content */}
      <main className="flex-1 px-4 py-8 md:px-10 md:py-10 max-w-2xl mx-auto w-full">
        {/* Mobile progress bar */}
        <div className="md:hidden mb-6">
          <div className="flex justify-between text-[10px] text-gold-500 mb-1.5">
            <span>
              Step {step + 1} of {STEP_LABELS.length}
            </span>
            <span>{STEP_LABELS[step]?.label}</span>
          </div>
          <div className="h-1 rounded-full bg-gold-700/30">
            <div
              className="h-1 rounded-full bg-gold-400 transition-all duration-500"
              style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Error banner */}
        {error ? (
          <div className="mb-5 rounded border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
            <span className="mt-0.5 shrink-0">&#9888;</span>
            <span>{error}</span>
          </div>
        ) : null}

        {/* ── Step 0: Business Profile ── */}
        {step === 0 && (
          <div className="command-card nvi-panel p-6 space-y-5 nvi-reveal">
            <div>
              <h2 className="text-xl font-semibold text-gold-100">{ot('step0Title')}</h2>
              <p className="text-sm text-gold-400 mt-1">
                {ot('step0Desc')}
              </p>
            </div>
            <div className="grid gap-4 text-sm text-gold-200">
              <label className="flex flex-col gap-1.5">
                {ot('fieldBusinessName')}
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="e.g. Acme Traders Ltd"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 placeholder:text-gold-600"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                {ot('fieldTimezone')}
                <SmartSelect
                  instanceId="onboarding-timezone"
                  value={profileForm.timezone}
                  options={getTimezoneOptions().map((tz) => ({ value: tz, label: tz }))}
                  onChange={(v) => setProfileForm({ ...profileForm, timezone: v })}
                />
              </label>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={saveBusinessProfile}
                disabled={isSavingProfile || !profileForm.name.trim()}
                className="nvi-cta rounded px-5 py-2 text-sm font-semibold text-black disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isSavingProfile && <Spinner variant="dots" size="xs" />}
                  {isSavingProfile ? ot('btnSaving') : ot('btnSaveAndContinue')}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Branch Setup ── */}
        {step === 1 && (
          <div className="command-card nvi-panel p-6 space-y-5 nvi-reveal">
            <div>
              <h2 className="text-xl font-semibold text-gold-100">{ot('step1Title')}</h2>
              <p className="text-sm text-gold-400 mt-1">
                {ot('step1Desc')}
              </p>
            </div>

            {branches.length > 0 && (
              <div className="space-y-2">
                {branches.map((b) => (
                  <div
                    key={b.id}
                    className="rounded border border-gold-700/30 bg-black/40 px-3 py-2 flex items-start justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm text-gold-100 font-medium">{b.name}</p>
                      {b.address && <p className="text-xs text-gold-400">{b.address}</p>}
                      {b.phone && <p className="text-xs text-gold-400">{b.phone}</p>}
                    </div>
                    {b.isDefault && (
                      <span className="shrink-0 rounded border border-gold-500/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gold-300">
                        {ot('badgeDefault')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded border border-gold-700/30 bg-black/30 p-4 space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-400">{ot('labelEditBranch')}</p>
              <SmartSelect
                instanceId="onboarding-branch-select"
                value={selectedBranchId}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
                placeholder="Select a branch to edit"
                onChange={(v) => {
                  setSelectedBranchId(v);
                  const sel = branches.find((b) => b.id === v);
                  setBranchForm({
                    name: sel?.name ?? '',
                    address: sel?.address ?? '',
                    phone: sel?.phone ?? '',
                  });
                }}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder={ot('placeholderBranchName')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                />
                <input
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  placeholder={ot('placeholderAddress')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                />
                <input
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  placeholder={ot('placeholderPhone')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                />
              </div>
              <button
                type="button"
                onClick={saveBranchDetails}
                disabled={isUpdatingBranch || !selectedBranchId || !branchForm.name.trim()}
                className="nvi-cta rounded px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isUpdatingBranch && <Spinner variant="dots" size="xs" />}
                  {isUpdatingBranch ? ot('btnSavingBranch') : ot('btnSaveBranchDetails')}
                </span>
              </button>
            </div>

            <div className="rounded border border-gold-700/30 bg-black/20 p-4 space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-400">
                {ot('labelAddAnotherBranch')}
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  value={addBranchForm.name}
                  onChange={(e) => setAddBranchForm({ ...addBranchForm, name: e.target.value })}
                  placeholder={ot('placeholderBranchName')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                />
                <input
                  value={addBranchForm.address}
                  onChange={(e) =>
                    setAddBranchForm({ ...addBranchForm, address: e.target.value })
                  }
                  placeholder={ot('placeholderAddress')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                />
                <input
                  value={addBranchForm.phone}
                  onChange={(e) => setAddBranchForm({ ...addBranchForm, phone: e.target.value })}
                  placeholder={ot('placeholderPhone')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                />
              </div>
              <button
                type="button"
                onClick={createBranch}
                disabled={isCreatingBranch || !addBranchForm.name.trim()}
                className="nvi-cta rounded px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isCreatingBranch && <Spinner variant="dots" size="xs" />}
                  {isCreatingBranch ? ot('btnAdding') : ot('btnAddBranch')}
                </span>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={completeBranchSetup}
                disabled={isSavingBranch}
                className="nvi-cta rounded px-5 py-2 text-sm font-semibold text-black disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isSavingBranch && <Spinner variant="dots" size="xs" />}
                  {isSavingBranch ? ot('btnSaving') : ot('btnContinue')}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Receipt Setup ── */}
        {step === 2 && (
          <div className="command-card nvi-panel p-6 space-y-5 nvi-reveal">
            <div>
              <h2 className="text-xl font-semibold text-gold-100">{ot('step2Title')}</h2>
              <p className="text-sm text-gold-400 mt-1">
                {ot('step2Desc')}
              </p>
            </div>
            <div className="space-y-4 text-sm text-gold-200">
              <div className="flex flex-col gap-1.5">
                <p>{ot('fieldReceiptFormat')}</p>
                <div className="flex gap-2">
                  {(['THERMAL', 'A4'] as const).map((tmpl) => (
                    <button
                      key={tmpl}
                      type="button"
                      onClick={() => setPosForm({ ...posForm, receiptTemplate: tmpl })}
                      className={`rounded border px-4 py-2 text-sm font-semibold transition-colors ${
                        posForm.receiptTemplate === tmpl
                          ? 'border-gold-400 bg-gold-400/10 text-gold-100'
                          : 'border-gold-700/50 text-gold-500 hover:border-gold-500'
                      }`}
                    >
                      {tmpl === 'THERMAL' ? ot('labelThermalPos') : ot('labelA4Letter')}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1.5">
                {ot('fieldReceiptHeader')}{' '}
                <span className="text-gold-500 text-xs font-normal">
                  {ot('fieldReceiptHeaderHint')}
                </span>
                <textarea
                  value={posForm.receiptHeader}
                  onChange={(e) => setPosForm({ ...posForm, receiptHeader: e.target.value })}
                  rows={2}
                  placeholder="e.g. VAT Registered | TIN 123-456-789"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 placeholder:text-gold-600 resize-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                {ot('fieldReceiptFooter')}{' '}
                <span className="text-gold-500 text-xs font-normal">
                  {ot('fieldReceiptFooterHint')}
                </span>
                <input
                  value={posForm.receiptFooter}
                  onChange={(e) => setPosForm({ ...posForm, receiptFooter: e.target.value })}
                  placeholder="e.g. Thank you for your business!"
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 placeholder:text-gold-600"
                />
              </label>
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-sm text-gold-500 hover:text-gold-300 underline underline-offset-2"
              >
                {ot('btnSkipForNow')}
              </button>
              <button
                type="button"
                onClick={saveReceiptSetup}
                disabled={isSavingPos}
                className="nvi-cta rounded px-5 py-2 text-sm font-semibold text-black disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isSavingPos && <Spinner variant="dots" size="xs" />}
                  {isSavingPos ? ot('btnSaving') : ot('btnSaveAndContinue')}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Invite Team ── */}
        {step === 3 && (
          <div className="command-card nvi-panel p-6 space-y-5 nvi-reveal">
            <div>
              <h2 className="text-xl font-semibold text-gold-100">Invite Your Team</h2>
              <p className="text-sm text-gold-400 mt-1">
                Send invites to your staff. They will receive an email to set up their account.
              </p>
            </div>
            <div className="space-y-3">
              {inviteRows.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => {
                      const updated = [...inviteRows];
                      updated[idx] = { ...updated[idx], email: e.target.value };
                      setInviteRows(updated);
                    }}
                    placeholder="Email address"
                    className="flex-1 rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100 placeholder:text-gold-600"
                  />
                  <div className="w-44">
                    <SmartSelect
                      instanceId={`invite-role-${idx}`}
                      value={row.roleId}
                      options={roles.map((r) => ({ value: r.id, label: r.name }))}
                      placeholder="Role"
                      onChange={(v) => {
                        const updated = [...inviteRows];
                        updated[idx] = { ...updated[idx], roleId: v };
                        setInviteRows(updated);
                      }}
                    />
                  </div>
                  {inviteRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setInviteRows(inviteRows.filter((_, i) => i !== idx))}
                      className="text-gold-600 hover:text-red-400 text-xl leading-none"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setInviteRows([...inviteRows, { email: '', roleId: '' }])}
                className="text-sm text-gold-500 hover:text-gold-300"
              >
                + Add another
              </button>
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="text-sm text-gold-500 hover:text-gold-300 underline underline-offset-2"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={sendInvites}
                disabled={isSendingInvites}
                className="nvi-cta rounded px-5 py-2 text-sm font-semibold text-black disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isSendingInvites && <Spinner variant="dots" size="xs" />}
                  {isSendingInvites ? 'Sending...' : 'Send Invites'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: You're Ready ── */}
        {step === 4 && (
          <div className="flex flex-col items-center justify-center py-20 text-center nvi-reveal">
            <div
              className="relative flex items-center justify-center"
              style={{ width: 160, height: 160 }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="absolute rounded-full border border-gold-400/40 animate-ping"
                  style={{
                    width: 160 - i * 24,
                    height: 160 - i * 24,
                    animationDuration: '2s',
                    animationDelay: `${i * 0.3}s`,
                  }}
                />
              ))}
              <div className="relative w-16 h-16 rounded-full bg-gold-400/10 border border-gold-400 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-gold-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="mt-10 text-2xl font-bold text-gold-100">You&apos;re all set!</h2>
            <p className="mt-3 text-sm text-gold-400 min-h-[1.5rem]">
              {READY_MESSAGES[readyMsgIndex]}
            </p>
            <p className="mt-4 text-xs text-gold-600">Redirecting to your dashboard...</p>
          </div>
        )}
      </main>
    </div>
  );
}
