'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { X, ChevronRight, ChevronLeft, Eye, EyeOff, Building2, Check, Sparkles } from 'lucide-react';
import { TextInput } from '@/components/ui/TextInput';
import { Spinner } from '@/components/Spinner';
import { useBusinessWorkspace, type ProvisionForm } from './hooks/useBusinessWorkspace';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

const TIERS = [
  {
    value: 'STARTER' as const,
    icon: '🌱',
    color: 'amber',
    features: ['features1', 'features2', 'features3'],
    label: 'tierStarter',
    price: 'tierStarterPrice',
  },
  {
    value: 'BUSINESS' as const,
    icon: '⚡',
    color: 'blue',
    features: ['features1', 'features2', 'features3'],
    label: 'tierBusiness',
    price: 'tierBusinessPrice',
  },
  {
    value: 'ENTERPRISE' as const,
    icon: '👑',
    color: 'yellow',
    features: ['features1', 'features2', 'features3'],
    label: 'tierEnterprise',
    price: 'tierEnterprisePrice',
  },
];

export function BusinessProvisionPanel({ open, onClose, onCreated }: Props) {
  const t = useTranslations('platformConsole');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const { provisionBusiness, isProvisioning } = useBusinessWorkspace();

  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<ProvisionForm>({
    businessName: '',
    ownerName: '',
    ownerEmail: '',
    ownerTempPassword: '',
    tier: 'STARTER',
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setShowPassword(false);
      setForm({
        businessName: '',
        ownerName: '',
        ownerEmail: '',
        ownerTempPassword: '',
        tier: 'STARTER',
      });
    }
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const step1Valid =
    form.businessName.trim().length > 0 &&
    form.ownerName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(form.ownerEmail) &&
    form.ownerTempPassword.length >= 8;

  const handleSubmit = async () => {
    const created = await provisionBusiness(form);
    if (created) {
      onCreated?.();
      // Auto-navigate to workspace
      router.push(`/${params.locale}/platform/businesses/${created.id}`);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 h-full w-full max-w-[480px] overflow-y-auto bg-[var(--pt-bg-deep)] border-l border-[var(--pt-accent-border)] shadow-[0_0_50px_rgba(0,0,0,0.5)] platform-provision-slide"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[var(--pt-bg-deep)] px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-accent-dim)]">
              <Sparkles size={14} className="text-[var(--pt-accent)]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--pt-text-muted)]">{t('provisionEyebrow')}</p>
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('provisionPanelTitle')}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--pt-text-muted)] hover:bg-white/[0.05] hover:text-[var(--pt-text-1)] transition nvi-press"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition ${
              step >= 1 ? 'bg-[var(--pt-accent)] text-black' : 'bg-white/[0.06] text-[var(--pt-text-muted)]'
            }`}>
              {step > 1 ? <Check size={12} /> : '1'}
            </div>
            <span className={`text-[10px] uppercase tracking-wide ${step === 1 ? 'text-[var(--pt-text-1)]' : 'text-[var(--pt-text-muted)]'}`}>
              {t('provisionStep1')}
            </span>
          </div>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <div className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition ${
              step >= 2 ? 'bg-[var(--pt-accent)] text-black' : 'bg-white/[0.06] text-[var(--pt-text-muted)]'
            }`}>
              2
            </div>
            <span className={`text-[10px] uppercase tracking-wide ${step === 2 ? 'text-[var(--pt-text-1)]' : 'text-[var(--pt-text-muted)]'}`}>
              {t('provisionStep2')}
            </span>
          </div>
        </div>

        {/* Step 1 — Business details */}
        {step === 1 && (
          <div className="space-y-4 p-5 nvi-slide-in-bottom">
            <p className="text-xs text-[var(--pt-text-muted)]">{t('provisionStep1Hint')}</p>

            <TextInput
              label={t('provisionBusinessName')}
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              placeholder={t('provisionBusinessNamePlaceholder')}
              required
            />
            <TextInput
              label={t('provisionOwnerName')}
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              placeholder={t('provisionOwnerNamePlaceholder')}
              required
            />
            <TextInput
              label={t('provisionOwnerEmail')}
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
              placeholder={t('provisionOwnerEmailPlaceholder')}
              required
            />
            <div className="relative">
              <TextInput
                label={t('provisionTempPassword')}
                type={showPassword ? 'text' : 'password'}
                value={form.ownerTempPassword}
                onChange={(e) => setForm({ ...form, ownerTempPassword: e.target.value })}
                placeholder="••••••••"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-[34px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-2)]"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-[var(--pt-text-muted)]">{t('provisionPasswordHint')}</p>

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--pt-accent)] px-4 py-2.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40 nvi-press"
            >
              {t('provisionContinue')}
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Step 2 — Tier selection */}
        {step === 2 && (
          <div className="space-y-4 p-5 nvi-slide-in-bottom">
            <p className="text-xs text-[var(--pt-text-muted)]">{t('provisionStep2Hint')}</p>

            <div className="space-y-2">
              {TIERS.map((tier) => {
                const isSelected = form.tier === tier.value;
                return (
                  <button
                    key={tier.value}
                    type="button"
                    onClick={() => setForm({ ...form, tier: tier.value })}
                    className={`w-full rounded-xl border p-3 text-left transition nvi-press ${
                      isSelected
                        ? 'border-[var(--pt-accent)] bg-[var(--pt-accent-dim)]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-[var(--pt-accent-border)]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">{tier.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-semibold ${isSelected ? 'text-[var(--pt-accent)]' : 'text-[var(--pt-text-1)]'}`}>
                            {t(tier.label)}
                          </p>
                          <p className="text-[10px] text-[var(--pt-text-muted)]">{t(`provisionTier.${tier.value}.price`)}</p>
                        </div>
                        <ul className="mt-1.5 space-y-0.5">
                          {[1, 2, 3].map((i) => (
                            <li key={i} className="flex items-center gap-1.5 text-[10px] text-[var(--pt-text-muted)]">
                              <Check size={9} className={isSelected ? 'text-[var(--pt-accent)]' : 'text-[var(--pt-text-muted)]'} />
                              {t(`provisionTier.${tier.value}.feature${i}`)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {isSelected && (
                        <div className="shrink-0 rounded-full bg-[var(--pt-accent)] p-0.5">
                          <Check size={10} className="text-black" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isProvisioning}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--pt-accent-border)] px-4 py-2.5 text-xs text-[var(--pt-text-2)] disabled:opacity-40 nvi-press"
              >
                <ChevronLeft size={14} />
                {t('provisionBack')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isProvisioning}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--pt-accent)] px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-70 nvi-press"
              >
                {isProvisioning ? <Spinner size="xs" variant="orbit" /> : <Building2 size={14} />}
                {isProvisioning ? t('provisionCreating') : t('provisionCreate')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
