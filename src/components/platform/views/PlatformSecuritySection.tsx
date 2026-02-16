import { Spinner } from '@/components/Spinner';

type PasswordForm = {
  current: string;
  next: string;
  confirm: string;
};

type PasswordVisible = {
  current: boolean;
  next: boolean;
  confirm: boolean;
};

export function PlatformSecuritySection({
  t,
  show,
  platformAdminId,
  adminPasswordForm,
  setAdminPasswordForm,
  adminPasswordVisible,
  setAdminPasswordVisible,
  adminPasswordBusy,
  updatePlatformPassword,
}: {
  t: unknown;
  show: boolean;
  platformAdminId: string;
  adminPasswordForm: PasswordForm;
  setAdminPasswordForm: (updater: (prev: PasswordForm) => PasswordForm) => void;
  adminPasswordVisible: PasswordVisible;
  setAdminPasswordVisible: (
    updater: (prev: PasswordVisible) => PasswordVisible,
  ) => void;
  adminPasswordBusy: boolean;
  updatePlatformPassword: () => Promise<void>;
}) {
  if (!show) {
    return null;
  }
  const translate = t as (key: string) => string;

  return (
    <section className="command-card p-6 space-y-4 nvi-reveal">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{translate('securityTitle')}</h3>
        <span className="text-xs text-gold-300">{translate('securityHint')}</span>
      </div>
      <div className="rounded border border-gold-700/40 bg-black/40 px-3 py-2 text-xs text-gold-100">
        <span className="text-gold-300">{translate('platformAdminIdLabel')}</span>{' '}
        {platformAdminId || translate('platformAdminIdUnknown')}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="relative">
          <input
            value={adminPasswordForm.current}
            onChange={(event) =>
              setAdminPasswordForm((prev) => ({
                ...prev,
                current: event.target.value,
              }))
            }
            type={adminPasswordVisible.current ? 'text' : 'password'}
            placeholder={translate('currentPassword')}
            className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 pr-12 text-gold-100"
          />
          <button
            type="button"
            onClick={() =>
              setAdminPasswordVisible((prev) => ({
                ...prev,
                current: !prev.current,
              }))
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gold-300"
          >
            {adminPasswordVisible.current
              ? translate('hidePassword')
              : translate('showPassword')}
          </button>
        </div>
        <div className="relative">
          <input
            value={adminPasswordForm.next}
            onChange={(event) =>
              setAdminPasswordForm((prev) => ({
                ...prev,
                next: event.target.value,
              }))
            }
            type={adminPasswordVisible.next ? 'text' : 'password'}
            placeholder={translate('newPassword')}
            className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 pr-12 text-gold-100"
          />
          <button
            type="button"
            onClick={() =>
              setAdminPasswordVisible((prev) => ({
                ...prev,
                next: !prev.next,
              }))
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gold-300"
          >
            {adminPasswordVisible.next
              ? translate('hidePassword')
              : translate('showPassword')}
          </button>
        </div>
        <div className="relative">
          <input
            value={adminPasswordForm.confirm}
            onChange={(event) =>
              setAdminPasswordForm((prev) => ({
                ...prev,
                confirm: event.target.value,
              }))
            }
            type={adminPasswordVisible.confirm ? 'text' : 'password'}
            placeholder={translate('confirmPassword')}
            className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 pr-12 text-gold-100"
          />
          <button
            type="button"
            onClick={() =>
              setAdminPasswordVisible((prev) => ({
                ...prev,
                confirm: !prev.confirm,
              }))
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gold-300"
          >
            {adminPasswordVisible.confirm
              ? translate('hidePassword')
              : translate('showPassword')}
          </button>
        </div>
        <p className="text-xs text-gold-400 md:col-span-2">
          {translate('passwordRequirements')}
        </p>
        <button
          type="button"
          onClick={updatePlatformPassword}
          disabled={adminPasswordBusy}
          className="rounded bg-gold-500 px-3 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {adminPasswordBusy ? <Spinner variant="dots" size="xs" /> : null}
            {adminPasswordBusy ? translate('updating') : translate('updatePassword')}
          </span>
        </button>
      </div>
    </section>
  );
}
