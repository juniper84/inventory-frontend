'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import { useToastState } from '@/lib/app-notifications';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

type Business = {
  id: string;
  name: string;
  defaultLanguage: string;
};

type OnboardingState = {
  enabled?: boolean;
  enforced?: boolean;
  businessProfileComplete?: boolean;
  branchSetupComplete?: boolean;
  teamSetupSkipped?: boolean;
};

type Settings = {
  localeSettings: {
    currency: string;
    timezone: string;
    dateFormat: string;
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

const DEFAULT_ONBOARDING: Required<OnboardingState> = {
  enabled: true,
  enforced: true,
  businessProfileComplete: false,
  branchSetupComplete: false,
  teamSetupSkipped: false,
};

export default function OnboardingPage() {
  const t = useTranslations('onboardingPage');
  const common = useTranslations('common');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const permissions = getPermissionSet();
  const canUpdateBusiness = permissions.has('business.update');
  const canUpdateSettings = permissions.has('settings.write');
  const canUpdateBranches = permissions.has('settings.write');
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [isUpdatingBranch, setIsUpdatingBranch] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [step, setStep] = useState(0);
  const [profileForm, setProfileForm] = useState({
    name: '',
    currency: '',
    timezone: '',
    dateFormat: '',
  });
  const [branchForm, setBranchForm] = useState({
    name: '',
    address: '',
    phone: '',
  });
  const [addBranchForm, setAddBranchForm] = useState({
    name: '',
    address: '',
    phone: '',
  });

  const onboardingState = useMemo(() => {
    return {
      ...DEFAULT_ONBOARDING,
      ...(settings?.onboarding ?? {}),
    };
  }, [settings]);

  const base = `/${params.locale}`;

  const applyBranchSelection = (items: Branch[], preferredId?: string) => {
    const preferred =
      (preferredId && items.find((branch) => branch.id === preferredId)) || null;
    const fallback = items.find((branch) => branch.isDefault) ?? items[0] ?? null;
    const selected = preferred ?? fallback;
    setSelectedBranchId(selected?.id ?? '');
    setBranchForm({
      name: selected?.name ?? '',
      address: selected?.address ?? '',
      phone: selected?.phone ?? '',
    });
  };

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
    Promise.all([
      apiFetch<Business>('/business', { token }),
      apiFetch<Settings>('/settings', { token }),
      apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
        token,
      }),
    ])
      .then(([biz, config, branchData]) => {
        const branchItems = normalizePaginated(branchData).items;
        setBusiness(biz);
        setSettings(config);
        setBranches(branchItems);
        applyBranchSelection(branchItems);
        setProfileForm({
          name: biz.name ?? '',
          currency: config.localeSettings?.currency ?? 'TZS',
          timezone: config.localeSettings?.timezone ?? 'Africa/Dar_es_Salaam',
          dateFormat: config.localeSettings?.dateFormat ?? 'DD/MM/YYYY',
        });
        if (config.onboarding?.enabled === false) {
          router.replace(base);
          return;
        }
        const nextStep = config.onboarding?.businessProfileComplete
          ? config.onboarding?.branchSetupComplete
            ? 2
            : 1
          : 0;
        setStep(nextStep);
        if (
          config.onboarding?.businessProfileComplete &&
          config.onboarding?.branchSetupComplete
        ) {
          router.replace(base);
        }
      })
      .catch((err) => {
        setMessage({
          action: 'load',
          outcome: 'failure',
          message: getApiErrorMessage(err, t('loadFailed')),
        });
      })
      .finally(() => setIsLoading(false));
  }, [router, base, setMessage, t]);

  const saveBusinessProfile = async () => {
    if (!business || !settings) {
      return;
    }
    if (!canUpdateBusiness || !canUpdateSettings) {
      setMessage({ action: 'save', outcome: 'failure', message: t('noAccess') });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsSavingProfile(true);
    setMessage(null);
    try {
      const businessUpdates: { name?: string; defaultLanguage?: string } = {};
      if (profileForm.name.trim() && profileForm.name.trim() !== business.name) {
        businessUpdates.name = profileForm.name.trim();
      }
      if (Object.keys(businessUpdates).length) {
        await apiFetch('/business', {
          token,
          method: 'PUT',
          body: JSON.stringify(businessUpdates),
        });
      }
      const updated = await apiFetch<Settings>('/settings', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          localeSettings: {
            currency: profileForm.currency.trim().toUpperCase(),
            timezone: profileForm.timezone.trim(),
            dateFormat: profileForm.dateFormat.trim(),
          },
          onboarding: {
            ...onboardingState,
            businessProfileComplete: true,
          },
        }),
      });
      setSettings(updated);
      setMessage({ action: 'save', outcome: 'success', message: t('profileSaved') });
      setStep(1);
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('profileSaveFailed')),
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const createBranch = async () => {
    if (!addBranchForm.name.trim()) {
      return;
    }
    if (!canUpdateBranches) {
      setMessage({ action: 'create', outcome: 'failure', message: t('noAccess') });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsCreatingBranch(true);
    setMessage(null);
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
      setMessage({ action: 'create', outcome: 'success', message: t('branchCreated') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('branchCreateFailed')),
      });
    } finally {
      setIsCreatingBranch(false);
    }
  };

  const saveBranchDetails = async () => {
    if (!selectedBranchId || !branchForm.name.trim()) {
      return;
    }
    if (!canUpdateBranches) {
      setMessage({ action: 'save', outcome: 'failure', message: t('noAccess') });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsUpdatingBranch(true);
    setMessage(null);
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
      setMessage({ action: 'save', outcome: 'success', message: t('branchUpdated') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('branchUpdateFailed')),
      });
    } finally {
      setIsUpdatingBranch(false);
    }
  };

  const completeBranchSetup = async () => {
    if (!settings) {
      return;
    }
    if (!canUpdateSettings) {
      setMessage({ action: 'save', outcome: 'failure', message: t('noAccess') });
      return;
    }
    if (branches.length < 1) {
      setMessage({ action: 'save', outcome: 'warning', message: t('branchRequired') });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsSavingBranch(true);
    setMessage(null);
    try {
      const updated = await apiFetch<Settings>('/settings', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          onboarding: {
            ...onboardingState,
            branchSetupComplete: true,
          },
        }),
      });
      setSettings(updated);
      setMessage({ action: 'save', outcome: 'success', message: t('branchSaved') });
      setStep(2);
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('branchSaveFailed')),
      });
    } finally {
      setIsSavingBranch(false);
    }
  };

  const finishLater = async () => {
    if (!settings || !canUpdateSettings) {
      router.replace(base);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    try {
      await apiFetch('/settings', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          onboarding: {
            ...onboardingState,
            teamSetupSkipped: true,
          },
        }),
      });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('finishLaterFailed')),
      });
    } finally {
      router.replace(base);
    }
  };

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="space-y-6">
      <PremiumPageHeader
        eyebrow="SETUP FLOW"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">GUIDED</span>
            <span className="nvi-badge">STEP {step + 1}/3</span>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">BUSINESS</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">
            {onboardingState.businessProfileComplete ? 'COMPLETE' : 'PENDING'}
          </p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">BRANCH SETUP</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">
            {onboardingState.branchSetupComplete ? 'COMPLETE' : 'PENDING'}
          </p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">BRANCHES</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{branches.length}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">ACCESS MODE</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">
            {settings?.readOnlyEnabled ? 'READ-ONLY' : 'EDITABLE'}
          </p>
        </article>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-gold-200">
        <span className={`rounded-full border px-3 py-1 ${step === 0 ? 'border-gold-400 text-gold-100' : 'border-gold-700/50'}`}>
          {t('stepBusiness')}
        </span>
        <span className={`rounded-full border px-3 py-1 ${step === 1 ? 'border-gold-400 text-gold-100' : 'border-gold-700/50'}`}>
          {t('stepBranch')}
        </span>
        <span className={`rounded-full border px-3 py-1 ${step === 2 ? 'border-gold-400 text-gold-100' : 'border-gold-700/50'}`}>
          {t('stepTeam')}
        </span>
      </div>

      {message ? <StatusBanner message={message} /> : null}

      {settings?.readOnlyEnabled ? (
        <StatusBanner
          message={settings.readOnlyReason ?? t('readOnly')}
          variant="warning"
        />
      ) : null}

      {step === 0 ? (
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">
            {t('businessTitle')}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 text-sm text-gold-200">
            <label className="flex flex-col gap-1">
              {t('businessName')}
              <input
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, name: event.target.value })
                }
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              {t('currency')}
              <input
                value={profileForm.currency}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, currency: event.target.value })
                }
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              {t('timezone')}
              <input
                value={profileForm.timezone}
                readOnly
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              {t('dateFormat')}
              <input
                value={profileForm.dateFormat}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, dateFormat: event.target.value })
                }
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
            </label>
          </div>
          <p className="text-xs text-gold-400">{t('businessHint')}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveBusinessProfile}
              disabled={isSavingProfile}
              className="nvi-cta rounded px-4 py-2 text-sm font-semibold text-black disabled:opacity-70"
            >
              <span className="inline-flex items-center gap-2">
                {isSavingProfile ? <Spinner variant="dots" size="xs" /> : null}
                {isSavingProfile ? t('saving') : t('saveContinue')}
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">
            {t('branchTitle')}
          </h3>
          <p className="text-sm text-gold-300">{t('branchHint')}</p>
          <div className="grid gap-2 text-sm text-gold-200">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="flex flex-col gap-1 rounded border border-gold-700/30 bg-black/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gold-100">{branch.name}</span>
                  {branch.isDefault ? (
                    <span className="rounded border border-gold-500/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gold-300">
                      {t('defaultBranch')}
                    </span>
                  ) : null}
                </div>
                {branch.address ? (
                  <span className="text-xs text-gold-400">{branch.address}</span>
                ) : null}
                {branch.phone ? (
                  <span className="text-xs text-gold-400">{branch.phone}</span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="rounded border border-gold-700/30 bg-black/30 p-4 space-y-3">
            <p className="text-xs uppercase tracking-[0.24em] text-gold-400">
              {t('editBranch')}
            </p>
            <SmartSelect
              instanceId="onboarding-branch-select"
              value={selectedBranchId}
              options={branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
              placeholder={t('selectBranchToEdit')}
              onChange={(value) => {
                setSelectedBranchId(value);
                const selected = branches.find((branch) => branch.id === value);
                setBranchForm({
                  name: selected?.name ?? '',
                  address: selected?.address ?? '',
                  phone: selected?.phone ?? '',
                });
              }}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={branchForm.name}
                onChange={(event) =>
                  setBranchForm({ ...branchForm, name: event.target.value })
                }
                placeholder={t('branchName')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <input
                value={branchForm.address}
                onChange={(event) =>
                  setBranchForm({ ...branchForm, address: event.target.value })
                }
                placeholder={t('branchAddressOptional')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <input
                value={branchForm.phone}
                onChange={(event) =>
                  setBranchForm({ ...branchForm, phone: event.target.value })
                }
                placeholder={t('branchPhoneOptional')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
            </div>
            <button
              type="button"
              onClick={saveBranchDetails}
              disabled={isUpdatingBranch || !selectedBranchId || !branchForm.name.trim()}
              className="nvi-cta rounded px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
            >
              <span className="inline-flex items-center gap-2">
                {isUpdatingBranch ? <Spinner variant="dots" size="xs" /> : null}
                {isUpdatingBranch ? t('saving') : t('saveBranchDetails')}
              </span>
            </button>
          </div>
          <div className="rounded border border-gold-700/30 bg-black/20 p-4 space-y-3">
            <p className="text-xs uppercase tracking-[0.24em] text-gold-400">
              {t('addAnotherBranch')}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={addBranchForm.name}
                onChange={(event) =>
                  setAddBranchForm({ ...addBranchForm, name: event.target.value })
                }
                placeholder={t('branchName')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <input
                value={addBranchForm.address}
                onChange={(event) =>
                  setAddBranchForm({ ...addBranchForm, address: event.target.value })
                }
                placeholder={t('branchAddressOptional')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
              <input
                value={addBranchForm.phone}
                onChange={(event) =>
                  setAddBranchForm({ ...addBranchForm, phone: event.target.value })
                }
                placeholder={t('branchPhoneOptional')}
                className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              />
            </div>
            <button
              type="button"
              onClick={createBranch}
              disabled={isCreatingBranch || !addBranchForm.name.trim()}
              className="nvi-cta rounded px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
            >
              <span className="inline-flex items-center gap-2">
                {isCreatingBranch ? <Spinner variant="dots" size="xs" /> : null}
                {isCreatingBranch ? t('creatingBranch') : t('addBranch')}
              </span>
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={completeBranchSetup}
              disabled={isSavingBranch}
              className="nvi-cta rounded px-4 py-2 text-sm font-semibold text-black disabled:opacity-70"
            >
              <span className="inline-flex items-center gap-2">
                {isSavingBranch ? <Spinner variant="dots" size="xs" /> : null}
                {isSavingBranch ? t('saving') : common('next')}
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="command-card nvi-panel p-6 space-y-4 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">
            {t('teamTitle')}
          </h3>
          <p className="text-sm text-gold-300">{t('teamHint')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push(`${base}/settings/users`)}
              className="nvi-cta rounded px-3 py-2 text-sm font-semibold text-black"
            >
              {t('openUsers')}
            </button>
            <button
              type="button"
              onClick={() => router.push(`${base}/settings/roles`)}
              className="nvi-cta rounded px-3 py-2 text-sm font-semibold text-black"
            >
              {t('openRoles')}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={finishLater}
              className="nvi-cta rounded px-4 py-2 text-sm font-semibold text-black"
            >
              {t('finishLater')}
            </button>
          </div>
        </div>
      ) : null}

      {!canUpdateSettings || !canUpdateBusiness ? (
        <StatusBanner message={t('limitedAccess')} variant="warning" />
      ) : null}
    </section>
  );
}
