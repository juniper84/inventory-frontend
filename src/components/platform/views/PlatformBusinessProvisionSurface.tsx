import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type Business = {
  subscription?: { tier?: string | null } | null;
};

type CreateForm = {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerTempPassword: string;
  tier: string;
};

export function PlatformBusinessProvisionSurface({
  show,
  t,
  businesses,
  createForm,
  setCreateForm,
  createBusiness,
  creatingBusiness,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  businesses: Business[];
  createForm: CreateForm;
  setCreateForm: Dispatch<SetStateAction<CreateForm>>;
  createBusiness: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  creatingBusiness: boolean;
}) {
  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-5 nvi-reveal">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
            {t('businessOnboardingTag')}
          </p>
          <h3 className="text-xl font-semibold text-[color:var(--pt-text-1)]">{t('provisionTitle')}</h3>
          <p className="text-xs text-[color:var(--pt-text-2)]">{t('businessOnboardingSubtitle')}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="nvi-tile p-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
              {t('tierStarter')}
            </p>
            <p className="mt-1 text-sm text-[color:var(--pt-text-1)]">
              {
                businesses.filter((business) => business.subscription?.tier === 'STARTER')
                  .length
              }
            </p>
          </div>
          <div className="nvi-tile p-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
              {t('tierBusiness')}
            </p>
            <p className="mt-1 text-sm text-[color:var(--pt-text-1)]">
              {
                businesses.filter((business) => business.subscription?.tier === 'BUSINESS')
                  .length
              }
            </p>
          </div>
          <div className="nvi-tile p-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--pt-text-muted)]">
              {t('tierEnterprise')}
            </p>
            <p className="mt-1 text-sm text-[color:var(--pt-text-1)]">
              {
                businesses.filter((business) => business.subscription?.tier === 'ENTERPRISE')
                  .length
              }
            </p>
          </div>
        </div>
      </div>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={createBusiness}>
        <input
          value={createForm.businessName}
          onChange={(event) =>
            setCreateForm((prev) => ({ ...prev, businessName: event.target.value }))
          }
          placeholder={t('businessNamePlaceholder')}
          required
          className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
        />
        <input
          value={createForm.ownerName}
          onChange={(event) =>
            setCreateForm((prev) => ({ ...prev, ownerName: event.target.value }))
          }
          placeholder={t('ownerNamePlaceholder')}
          required
          className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
        />
        <input
          value={createForm.ownerEmail}
          onChange={(event) =>
            setCreateForm((prev) => ({ ...prev, ownerEmail: event.target.value }))
          }
          placeholder={t('ownerEmailPlaceholder')}
          type="email"
          autoComplete="email"
          required
          className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
        />
        <input
          value={createForm.ownerTempPassword}
          onChange={(event) =>
            setCreateForm((prev) => ({ ...prev, ownerTempPassword: event.target.value }))
          }
          placeholder={t('tempPasswordPlaceholder')}
          type="password"
          autoComplete="new-password"
          required
          className="rounded border border-[color:var(--pt-accent-border)] p-bg-deep px-3 py-2 text-[color:var(--pt-text-1)]"
        />
        <SmartSelect
          instanceId="platform-provision-tier"
          value={createForm.tier}
          onChange={(value) => setCreateForm((prev) => ({ ...prev, tier: value }))}
          options={[
            { value: 'STARTER', label: t('tierStarter') },
            { value: 'BUSINESS', label: t('tierBusiness') },
            { value: 'ENTERPRISE', label: t('tierEnterprise') },
          ]}
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded bg-[var(--pt-accent)] px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={creatingBusiness}
        >
          {creatingBusiness ? <Spinner size="xs" variant="orbit" /> : null}
          {creatingBusiness ? t('creating') : t('createBusiness')}
        </button>
      </form>
    </section>
  );
}
