export function PlatformConsoleHeader({
  t,
  message,
}: {
  t: unknown;
  message: string | null;
}) {
  const translate = t as (key: string) => string;
  return (
    <section className="space-y-1">
      <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
        {translate('title')}
      </h2>
      <p className="text-sm text-[color:var(--muted)]">{translate('subtitle')}</p>
      {message ? (
        <p className="text-sm text-[color:var(--muted)]">{message}</p>
      ) : null}
    </section>
  );
}
