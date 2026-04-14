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
import { BrandLogo } from '@/components/BrandLogo';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { FontScaleSelector } from '@/components/ui/FontScaleSelector';

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
type InviteRow = {
  email: string;
  roleId: string;
  name: string;
  phone: string;
  branchIds: string[];
};

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

const CURRENCY_OPTIONS = [
  { value: 'TZS', label: 'TZS - Tanzanian Shilling' },
  { value: 'KES', label: 'KES - Kenyan Shilling' },
  { value: 'UGX', label: 'UGX - Ugandan Shilling' },
  { value: 'RWF', label: 'RWF - Rwandan Franc' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'ZAR', label: 'ZAR - South African Rand' },
];

const DEFAULT_ONBOARDING: Required<OnboardingState> = {
  enabled: true,
  enforced: true,
  businessProfileComplete: false,
  branchSetupComplete: false,
  teamSetupSkipped: false,
};

const EMPTY_INVITE: InviteRow = { email: '', roleId: '', name: '', phone: '', branchIds: [] };

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

  const STEP_ICONS: Array<'Building2' | 'MapPin' | 'Receipt' | 'Users' | 'CircleCheck'> = [
    'Building2', 'MapPin', 'Receipt', 'Users', 'CircleCheck',
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
  const [inviteRows, setInviteRows] = useState<InviteRow[]>([{ ...EMPTY_INVITE }]);
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
            body: JSON.stringify({
              email: r.email.trim(),
              roleId: r.roleId,
              name: r.name.trim() || undefined,
              phone: r.phone.trim() || undefined,
              branchIds: r.branchIds.length > 0 ? r.branchIds : undefined,
            }),
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

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const updateInviteRow = (idx: number, patch: Partial<InviteRow>) => {
    const updated = [...inviteRows];
    updated[idx] = { ...updated[idx], ...patch };
    setInviteRows(updated);
  };

  const toggleInviteBranch = (idx: number, branchId: string) => {
    const row = inviteRows[idx];
    const has = row.branchIds.includes(branchId);
    updateInviteRow(idx, {
      branchIds: has
        ? row.branchIds.filter((id) => id !== branchId)
        : [...row.branchIds, branchId],
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <PageSkeleton title={ot('readyMsg1')} />;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ── Left sidebar — wizard steps (desktop) ── */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-[color:var(--border)] bg-black/40 px-6 py-10">
        <div className="mb-8">
          <BrandLogo variant="vision" size="sm" />
        </div>

        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--muted)] mb-6">
          {ot('sidebarLabel')}
        </p>

        <nav className="flex flex-col gap-0">
          {STEP_LABELS.map((s, i) => {
            const isCompleted = i < step;
            const isActive = i === step;
            const iconName = STEP_ICONS[i];

            return (
              <div key={i} className="flex gap-3 relative">
                {/* Connector line */}
                {i < STEP_LABELS.length - 1 && (
                  <span
                    className={`absolute left-[15px] top-8 w-px ${
                      isCompleted ? 'bg-emerald-500/60' : 'bg-[color:var(--border)]'
                    }`}
                    style={{ height: 36 }}
                  />
                )}
                {/* Step circle */}
                <span
                  className={[
                    'relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all',
                    isCompleted
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                      : isActive
                        ? 'border-[color:var(--accent)] bg-black text-[color:var(--accent)]'
                        : 'border-[color:var(--border)] bg-black text-[color:var(--muted)]',
                  ].join(' ')}
                >
                  {isCompleted ? (
                    <Icon name="Check" size={14} />
                  ) : (
                    <Icon name={iconName} size={14} />
                  )}
                </span>
                {/* Label */}
                <div className="pb-10">
                  <p
                    className={`text-sm font-semibold leading-tight ${
                      isActive
                        ? 'text-[color:var(--foreground)]'
                        : isCompleted
                          ? 'text-emerald-400'
                          : 'text-[color:var(--muted)]'
                    }`}
                  >
                    {s.label}
                  </p>
                  <p className="text-[11px] text-[color:var(--muted)] mt-0.5">{s.description}</p>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Progress at bottom of sidebar */}
        <div className="mt-auto pt-6">
          <ProgressBar
            value={step + 1}
            max={STEP_LABELS.length}
            label={ot('progressLabel')}
            showPercent
            color="accent"
            height={6}
          />
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 px-4 py-8 md:px-10 md:py-10 max-w-2xl mx-auto w-full">
        {/* Mobile progress */}
        <div className="lg:hidden mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[color:var(--muted)]">
              {ot('mobileStepOf', { current: step + 1, total: STEP_LABELS.length })}
            </span>
            <span className="text-[11px] font-medium text-[color:var(--foreground)]">
              {STEP_LABELS[step]?.label}
            </span>
          </div>
          <ProgressBar value={step + 1} max={STEP_LABELS.length} color="accent" height={4} />
        </div>

        {/* Error banner */}
        {error && (
          <Card glow={false} className="mb-5 !border-red-500/50 !bg-red-950/30 nvi-slide-in-bottom">
            <div className="flex items-start gap-2 text-sm text-red-300">
              <Icon name="TriangleAlert" size={16} className="mt-0.5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            Step 0: Business Profile
           ═══════════════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="nvi-slide-in-bottom">
            <Card padding="lg">
              {/* Header */}
              <div className="flex items-start gap-3 mb-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 border border-[color:var(--accent)]/30">
                  <Icon name="Building2" size={20} className="text-[color:var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[color:var(--foreground)]">{ot('step0Title')}</h2>
                  <p className="text-sm text-[color:var(--muted)] mt-0.5">{ot('step0Desc')}</p>
                </div>
              </div>

              {/* Welcome message */}
              <div className="rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/5 px-4 py-3 mb-6">
                <p className="text-sm text-[color:var(--foreground)]">{ot('welcomeMessage')}</p>
              </div>

              {/* Fields */}
              <div className="grid gap-5">
                <TextInput
                  label={ot('fieldBusinessName')}
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="e.g. Acme Traders Ltd"
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80 flex items-center gap-1.5">
                      <Icon name="Globe" size={12} className="text-[color:var(--accent)]" />
                      {ot('fieldCurrency')}
                    </label>
                    <SmartSelect
                      instanceId="onboarding-currency"
                      value={profileForm.currency}
                      options={CURRENCY_OPTIONS}
                      onChange={(v) => setProfileForm({ ...profileForm, currency: v })}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80 flex items-center gap-1.5">
                      <Icon name="Clock" size={12} className="text-[color:var(--accent)]" />
                      {ot('fieldTimezone')}
                    </label>
                    <SmartSelect
                      instanceId="onboarding-timezone"
                      value={profileForm.timezone}
                      options={getTimezoneOptions().map((tz) => ({ value: tz, label: tz }))}
                      onChange={(v) => setProfileForm({ ...profileForm, timezone: v })}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
                      {ot('displaySizeLabel') || 'Display size'}
                    </p>
                    <FontScaleSelector showPreview showHint />
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="flex justify-end pt-6">
                <button
                  type="button"
                  onClick={saveBusinessProfile}
                  disabled={isSavingProfile || !profileForm.name.trim()}
                  className="nvi-press nvi-cta rounded-xl px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-70 inline-flex items-center gap-2"
                >
                  {isSavingProfile && <Spinner variant="dots" size="xs" />}
                  {isSavingProfile ? ot('btnSaving') : ot('btnSaveAndContinue')}
                  {!isSavingProfile && <Icon name="ChevronRight" size={16} />}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            Step 1: Branch Setup
           ═══════════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="nvi-slide-in-bottom">
            <Card padding="lg">
              {/* Header */}
              <div className="flex items-start gap-3 mb-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 border border-[color:var(--accent)]/30">
                  <Icon name="MapPin" size={20} className="text-[color:var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[color:var(--foreground)]">{ot('step1Title')}</h2>
                  <p className="text-sm text-[color:var(--muted)] mt-0.5">{ot('step1Desc')}</p>
                </div>
              </div>

              {/* Existing branches */}
              {branches.length > 0 ? (
                <div className="space-y-2 mb-6 nvi-stagger">
                  {branches.map((b) => (
                    <Card key={b.id} glow={false} padding="sm" className="nvi-card-hover">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--accent)]/10 mt-0.5">
                            <Icon name="Building2" size={14} className="text-[color:var(--accent)]" />
                          </div>
                          <div>
                            <p className="text-sm text-[color:var(--foreground)] font-medium">{b.name}</p>
                            {b.address && (
                              <p className="text-xs text-[color:var(--muted)] flex items-center gap-1 mt-0.5">
                                <Icon name="MapPin" size={10} className="shrink-0" />
                                {b.address}
                              </p>
                            )}
                            {b.phone && (
                              <p className="text-xs text-[color:var(--muted)] flex items-center gap-1 mt-0.5">
                                <Icon name="Phone" size={10} className="shrink-0" />
                                {b.phone}
                              </p>
                            )}
                          </div>
                        </div>
                        {b.isDefault && (
                          <span className="shrink-0 rounded-full border border-emerald-500/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-400 bg-emerald-500/10">
                            {ot('badgeDefault')}
                          </span>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="mb-6">
                  <EmptyState
                    icon={<Icon name="Building2" size={32} className="text-[color:var(--muted)]" />}
                    title={ot('emptyBranchesTitle')}
                    description={ot('emptyBranchesDesc')}
                  />
                </div>
              )}

              {/* Edit existing branch */}
              {branches.length > 0 && (
                <Card glow={false} padding="md" className="mb-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)] mb-3">{ot('labelEditBranch')}</p>
                  <SmartSelect
                    instanceId="onboarding-branch-select"
                    value={selectedBranchId}
                    options={branches.map((b) => ({ value: b.id, label: b.name }))}
                    placeholder={ot('placeholderSelectBranch')}
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
                  <div className="grid gap-3 md:grid-cols-3 mt-3">
                    <TextInput
                      label={ot('fieldBranchName')}
                      value={branchForm.name}
                      onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                      placeholder={ot('placeholderBranchName')}
                    />
                    <TextInput
                      label={ot('fieldBranchAddress')}
                      value={branchForm.address}
                      onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                      placeholder={ot('placeholderAddress')}
                    />
                    <TextInput
                      label={ot('fieldBranchPhone')}
                      value={branchForm.phone}
                      onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                      placeholder="+255..."
                      type="tel"
                    />
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={saveBranchDetails}
                      disabled={isUpdatingBranch || !selectedBranchId || !branchForm.name.trim()}
                      className="nvi-press nvi-cta rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:opacity-70 inline-flex items-center gap-2"
                    >
                      {isUpdatingBranch && <Spinner variant="dots" size="xs" />}
                      {isUpdatingBranch ? ot('btnSavingBranch') : ot('btnSaveBranchDetails')}
                    </button>
                  </div>
                </Card>
              )}

              {/* Add new branch */}
              <Card glow={false} padding="md" className="mb-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)] mb-3">
                  {ot('labelAddAnotherBranch')}
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <TextInput
                    label={ot('fieldBranchName')}
                    value={addBranchForm.name}
                    onChange={(e) => setAddBranchForm({ ...addBranchForm, name: e.target.value })}
                    placeholder={ot('placeholderBranchName')}
                  />
                  <TextInput
                    label={ot('fieldBranchAddress')}
                    value={addBranchForm.address}
                    onChange={(e) => setAddBranchForm({ ...addBranchForm, address: e.target.value })}
                    placeholder={ot('placeholderAddress')}
                  />
                  <TextInput
                    label={ot('fieldBranchPhone')}
                    value={addBranchForm.phone}
                    onChange={(e) => setAddBranchForm({ ...addBranchForm, phone: e.target.value })}
                    placeholder="+255..."
                    type="tel"
                  />
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={createBranch}
                    disabled={isCreatingBranch || !addBranchForm.name.trim()}
                    className="nvi-press rounded-xl border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/10 px-4 py-2 text-sm font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent)]/20 disabled:opacity-70 inline-flex items-center gap-2 transition-colors"
                  >
                    {isCreatingBranch ? (
                      <Spinner variant="dots" size="xs" />
                    ) : (
                      <Icon name="Plus" size={14} />
                    )}
                    {isCreatingBranch ? ot('btnAdding') : ot('btnAddBranch')}
                  </button>
                </div>
              </Card>

              {/* Navigation */}
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="nvi-press rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] transition-colors inline-flex items-center gap-1.5"
                >
                  <Icon name="ChevronLeft" size={14} />
                  {ot('btnBack')}
                </button>
                <button
                  type="button"
                  onClick={completeBranchSetup}
                  disabled={isSavingBranch}
                  className="nvi-press nvi-cta rounded-xl px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-70 inline-flex items-center gap-2"
                >
                  {isSavingBranch && <Spinner variant="dots" size="xs" />}
                  {isSavingBranch ? ot('btnSaving') : ot('btnContinue')}
                  {!isSavingBranch && <Icon name="ChevronRight" size={16} />}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            Step 2: Receipt Setup
           ═══════════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="nvi-slide-in-bottom">
            <Card padding="lg">
              {/* Header */}
              <div className="flex items-start gap-3 mb-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 border border-[color:var(--accent)]/30">
                  <Icon name="Receipt" size={20} className="text-[color:var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[color:var(--foreground)]">{ot('step2Title')}</h2>
                  <p className="text-sm text-[color:var(--muted)] mt-0.5">{ot('step2Desc')}</p>
                </div>
              </div>

              <div className="grid gap-5">
                {/* Template selector */}
                <div className="grid gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
                    {ot('fieldReceiptFormat')}
                  </p>
                  <div className="flex gap-2">
                    {(['THERMAL', 'A4'] as const).map((tmpl) => (
                      <button
                        key={tmpl}
                        type="button"
                        onClick={() => setPosForm({ ...posForm, receiptTemplate: tmpl })}
                        className={[
                          'nvi-press rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all',
                          posForm.receiptTemplate === tmpl
                            ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--foreground)]'
                            : 'border-[color:var(--border)] text-[color:var(--muted)] hover:border-[color:var(--accent)]/50',
                        ].join(' ')}
                      >
                        {tmpl === 'THERMAL' ? ot('labelThermalPos') : ot('labelA4Letter')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Header / footer */}
                <Textarea
                  label={`${ot('fieldReceiptHeader')} ${ot('fieldReceiptHeaderHint')}`}
                  value={posForm.receiptHeader}
                  onChange={(e) => setPosForm({ ...posForm, receiptHeader: e.target.value })}
                  rows={2}
                  placeholder="e.g. VAT Registered | TIN 123-456-789"
                />
                <TextInput
                  label={`${ot('fieldReceiptFooter')} ${ot('fieldReceiptFooterHint')}`}
                  value={posForm.receiptFooter}
                  onChange={(e) => setPosForm({ ...posForm, receiptFooter: e.target.value })}
                  placeholder="e.g. Thank you for your business!"
                />

                {/* Mini receipt preview */}
                <Card glow={false} padding="md" className="!bg-white/[0.03]">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)] mb-3">
                    {ot('receiptPreviewLabel')}
                  </p>
                  <div className="mx-auto max-w-[240px] rounded-lg border border-[color:var(--border)] bg-black/60 px-4 py-4 text-center space-y-2">
                    <p className="text-[11px] font-bold text-[color:var(--foreground)]">
                      {profileForm.name || 'Business Name'}
                    </p>
                    {posForm.receiptHeader && (
                      <p className="text-[9px] text-[color:var(--muted)] whitespace-pre-wrap">{posForm.receiptHeader}</p>
                    )}
                    <div className="border-t border-dashed border-[color:var(--border)] my-2" />
                    <div className="text-[10px] text-[color:var(--muted)] space-y-0.5">
                      <div className="flex justify-between"><span>Item 1</span><span>1,500</span></div>
                      <div className="flex justify-between"><span>Item 2</span><span>2,000</span></div>
                    </div>
                    <div className="border-t border-dashed border-[color:var(--border)] my-2" />
                    <div className="flex justify-between text-[10px] font-bold text-[color:var(--foreground)]">
                      <span>Total</span><span>3,500</span>
                    </div>
                    {posForm.receiptFooter && (
                      <>
                        <div className="border-t border-dashed border-[color:var(--border)] my-2" />
                        <p className="text-[9px] text-[color:var(--muted)] italic">{posForm.receiptFooter}</p>
                      </>
                    )}
                  </div>
                </Card>
              </div>

              {/* Navigation */}
              <div className="flex justify-between items-center pt-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="nvi-press rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] transition-colors inline-flex items-center gap-1.5"
                  >
                    <Icon name="ChevronLeft" size={14} />
                    {ot('btnBack')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] underline underline-offset-2 transition-colors"
                  >
                    {ot('btnSkipForNow')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={saveReceiptSetup}
                  disabled={isSavingPos}
                  className="nvi-press nvi-cta rounded-xl px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-70 inline-flex items-center gap-2"
                >
                  {isSavingPos && <Spinner variant="dots" size="xs" />}
                  {isSavingPos ? ot('btnSaving') : ot('btnSaveAndContinue')}
                  {!isSavingPos && <Icon name="ChevronRight" size={16} />}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            Step 3: Invite Team
           ═══════════════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="nvi-slide-in-bottom">
            <Card padding="lg">
              {/* Header */}
              <div className="flex items-start gap-3 mb-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 border border-[color:var(--accent)]/30">
                  <Icon name="Users" size={20} className="text-[color:var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[color:var(--foreground)]">{ot('step3Title')}</h2>
                  <p className="text-sm text-[color:var(--muted)] mt-0.5">{ot('step3Desc')}</p>
                </div>
              </div>

              <p className="text-xs text-[color:var(--muted)] mb-5">{ot('step3Hint')}</p>

              {/* Invite rows */}
              <div className="space-y-3 nvi-stagger">
                {inviteRows.map((row, idx) => (
                  <Card key={idx} glow={false} padding="md" className="nvi-card-hover">
                    <div className="grid gap-3">
                      {/* Row 1: Email + Role */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex items-end gap-1.5">
                          <div className="flex-1">
                            <TextInput
                              label={ot('fieldInviteEmail')}
                              type="email"
                              value={row.email}
                              onChange={(e) => updateInviteRow(idx, { email: e.target.value })}
                              placeholder={ot('placeholderInviteEmail')}
                            />
                          </div>
                        </div>
                        <div className="grid gap-1.5">
                          <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80 flex items-center gap-1.5">
                            <Icon name="Shield" size={12} className="text-[color:var(--accent)]" />
                            {ot('fieldInviteRole')}
                          </label>
                          <SmartSelect
                            instanceId={`invite-role-${idx}`}
                            value={row.roleId}
                            options={roles.map((r) => ({ value: r.id, label: r.name }))}
                            placeholder={ot('placeholderInviteRole')}
                            onChange={(v) => updateInviteRow(idx, { roleId: v })}
                          />
                        </div>
                      </div>

                      {/* Row 2: Name + Phone (optional) */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <TextInput
                          label={ot('fieldInviteName')}
                          value={row.name}
                          onChange={(e) => updateInviteRow(idx, { name: e.target.value })}
                          placeholder={ot('placeholderInviteName')}
                        />
                        <TextInput
                          label={ot('fieldInvitePhone')}
                          type="tel"
                          value={row.phone}
                          onChange={(e) => updateInviteRow(idx, { phone: e.target.value })}
                          placeholder="+255..."
                        />
                      </div>

                      {/* Row 3: Branch checkboxes (if multiple branches) */}
                      {branches.length > 1 && (
                        <div className="grid gap-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
                            {ot('fieldInviteBranches')}
                          </p>
                          <p className="text-[11px] text-[color:var(--muted)] -mt-1">{ot('fieldInviteBranchesHint')}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {branches.map((b) => {
                              const isChecked = row.branchIds.includes(b.id);
                              return (
                                <label
                                  key={b.id}
                                  className={[
                                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition-colors',
                                    isChecked
                                      ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--foreground)]'
                                      : 'border-[color:var(--border)] text-[color:var(--muted)] hover:border-[color:var(--accent)]/50',
                                  ].join(' ')}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleInviteBranch(idx, b.id)}
                                    className="sr-only"
                                  />
                                  <Icon name="Building2" size={12} />
                                  {b.name}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Remove button */}
                      {inviteRows.length > 1 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setInviteRows(inviteRows.filter((_, i) => i !== idx))}
                            className="nvi-press rounded-lg px-2 py-1 text-xs text-[color:var(--muted)] hover:text-red-400 transition-colors inline-flex items-center gap-1"
                          >
                            <Icon name="Trash2" size={12} />
                            {ot('btnRemoveInvite')}
                          </button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {/* Add more */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setInviteRows([...inviteRows, { ...EMPTY_INVITE }])}
                  className="nvi-press rounded-xl border border-dashed border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--accent)] hover:border-[color:var(--accent)]/50 transition-colors inline-flex items-center gap-2 w-full justify-center"
                >
                  <Icon name="UserPlus" size={14} />
                  {ot('btnAddInvite')}
                </button>
              </div>

              {/* Navigation */}
              <div className="flex justify-between items-center pt-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="nvi-press rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] transition-colors inline-flex items-center gap-1.5"
                  >
                    <Icon name="ChevronLeft" size={14} />
                    {ot('btnBack')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)] underline underline-offset-2 transition-colors"
                  >
                    {ot('btnSkipForNow')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={sendInvites}
                  disabled={isSendingInvites}
                  className="nvi-press nvi-cta rounded-xl px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-70 inline-flex items-center gap-2"
                >
                  {isSendingInvites && <Spinner variant="dots" size="xs" />}
                  {isSendingInvites ? ot('btnSendingInvites') : ot('btnSendInvites')}
                  {!isSendingInvites && <Icon name="ChevronRight" size={16} />}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            Step 4: You're Ready
           ═══════════════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="flex flex-col items-center justify-center py-16 text-center nvi-slide-in-bottom">
            {/* Animated icon */}
            <div className="nvi-bounce-in relative flex items-center justify-center mb-8" style={{ width: 160, height: 160 }}>
              {/* Pulsing rings */}
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="absolute rounded-full border border-emerald-400/30 animate-ping"
                  style={{
                    width: 160 - i * 24,
                    height: 160 - i * 24,
                    animationDuration: '2.5s',
                    animationDelay: `${i * 0.4}s`,
                  }}
                />
              ))}
              {/* Center icon */}
              <div className="nvi-float relative w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/60 flex items-center justify-center">
                <Icon name="CircleCheck" size={36} className="text-emerald-400" />
              </div>
            </div>

            {/* Decorative dots — nvi-stagger */}
            <div className="flex gap-2 mb-6 nvi-stagger">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400/40"
                />
              ))}
            </div>

            <h2 className="nvi-bounce-in text-2xl font-bold text-[color:var(--foreground)]">
              {ot('readyTitle')}
            </h2>
            <p className="mt-3 text-sm text-[color:var(--muted)] min-h-[1.5rem] transition-all">
              {READY_MESSAGES[readyMsgIndex]}
            </p>

            <button
              type="button"
              onClick={() => {
                if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
                router.replace(base);
              }}
              className="nvi-press nvi-cta rounded-xl px-8 py-3 text-sm font-semibold text-black mt-8 inline-flex items-center gap-2"
            >
              {ot('btnGoToDashboard')}
              <Icon name="ArrowRight" size={16} />
            </button>

            <p className="mt-4 text-xs text-[color:var(--muted)]">{ot('readyRedirecting')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
