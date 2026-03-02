'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getManualDataset,
  isManualInScopePath,
  materializeLocaleRoute,
  resolveManualEntry,
  type ManualLocale,
} from '@/lib/manual';
import { PERMISSION_CATALOG } from '@/lib/permission-catalog';
import { dispatchSupportChatHandoff } from '@/lib/support-chat-handoff';

type Copy = {
  open: string;
  close: string;
  title: string;
  pagePurpose: string;
  firstAction: string;
  quickActions: string;
  explainSimply: string;
  whatFirst: string;
  troubleshoot: string;
  explainSimplyPrompt: string;
  whatFirstPrompt: string;
  troubleshootPrompt: string;
  advancedSections: string;
  audience: string;
  prerequisites: string;
  workflow: string;
  commonErrors: string;
  permissions: string;
  relatedPages: string;
  missingTitle: string;
  missingBody: string;
  nextActions: string;
  noExplicitPermissions: string;
  unknownPermission: string;
  routeLabel: string;
  before: string;
  after: string;
  parallel: string;
  fixes: string;
  relatedPageFallback: string;
};

const COPY: Record<ManualLocale, Copy> = {
  en: {
    open: 'Manual',
    close: 'Close',
    title: 'Page Guide',
    pagePurpose: 'What this page is for',
    firstAction: 'Start here',
    quickActions: 'Quick actions',
    explainSimply: 'Explain this simply',
    whatFirst: 'What should I do first?',
    troubleshoot: 'Help me troubleshoot',
    explainSimplyPrompt: 'Explain this page simply.',
    whatFirstPrompt: 'What should I do first on this page?',
    troubleshootPrompt: 'Help me troubleshoot an error on this page.',
    advancedSections: 'More details',
    audience: 'Audience',
    prerequisites: 'Prerequisites',
    workflow: 'Workflow',
    commonErrors: 'Common Errors',
    permissions: 'Permissions',
    relatedPages: 'Related Pages',
    missingTitle: 'Manual entry not found',
    missingBody: 'This page is in scope, but no guide entry was found yet.',
    nextActions: 'Next actions',
    noExplicitPermissions: 'No explicit page permission check in UI layer',
    unknownPermission: 'Permission not mapped in catalog',
    routeLabel: 'Route',
    before: 'Before',
    after: 'After',
    parallel: 'Parallel',
    fixes: 'Fix steps',
    relatedPageFallback: 'Related page',
  },
  sw: {
    open: 'Mwongozo',
    close: 'Funga',
    title: 'Mwongozo wa Ukurasa',
    pagePurpose: 'Ukurasa huu ni wa nini',
    firstAction: 'Anza hapa',
    quickActions: 'Vitendo vya haraka',
    explainSimply: 'Eleza kwa urahisi',
    whatFirst: 'Nianze na nini kwanza?',
    troubleshoot: 'Nisaidie kutatua kosa',
    explainSimplyPrompt: 'Eleza ukurasa huu kwa urahisi.',
    whatFirstPrompt: 'Nianze na nini kwanza kwenye ukurasa huu?',
    troubleshootPrompt: 'Nisaidie kutatua kosa kwenye ukurasa huu.',
    advancedSections: 'Maelezo zaidi',
    audience: 'Walengwa',
    prerequisites: 'Masharti ya Awali',
    workflow: 'Hatua za Kazi',
    commonErrors: 'Makosa ya Kawaida',
    permissions: 'Ruhusa',
    relatedPages: 'Kurasa Husika',
    missingTitle: 'Ingizo la mwongozo halijapatikana',
    missingBody: 'Ukurasa huu upo kwenye wigo lakini mwongozo wake bado haujapatikana.',
    nextActions: 'Hatua zinazofuata',
    noExplicitPermissions: 'Hakuna ukaguzi wa ruhusa ulio wazi kwenye tabaka la UI',
    unknownPermission: 'Ruhusa haijafafanuliwa kwenye katalogi',
    routeLabel: 'Njia',
    before: 'Kabla',
    after: 'Baada',
    parallel: 'Sambamba',
    fixes: 'Hatua za kurekebisha',
    relatedPageFallback: 'Ukurasa husika',
  },
};

const PERMISSION_CODE_PATTERN = /\(([a-z0-9._-]+)\)/gi;

function extractPermissionCodes(check: string) {
  const matches = check.matchAll(PERMISSION_CODE_PATTERN);
  return [...matches].map((match) => match[1]);
}

function cleanPrerequisiteText(text: string, locale: ManualLocale) {
  let output = text;
  output = output.replace(/\(\s*(Permission|Ruhusa)\s*:\s*[^)]+\)/gi, '');
  output = output.replace(/\(\s*[a-z]+(?:\.[a-z-]+)+\s*\)/gi, '');
  output = output.replace(/\b[a-z]+(?:\.[a-z-]+)+\b/gi, () =>
    locale === 'sw' ? 'ruhusa inayohitajika' : 'required permission',
  );
  output = output.replace(/\s+/g, ' ').trim();
  output = output.replace(/\s+\./g, '.');
  return output;
}

function orderLabel(order: 'before' | 'after' | 'parallel', copy: Copy) {
  if (order === 'before') return copy.before;
  if (order === 'after') return copy.after;
  return copy.parallel;
}

export function ManualHelpPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const locale = useMemo<ManualLocale>(() => {
    const segment = pathname.split('/').filter(Boolean)[0];
    return segment === 'sw' ? 'sw' : 'en';
  }, [pathname]);

  const copy = COPY[locale];
  const permissionCatalog = useTranslations('permissions');
  const inScope = isManualInScopePath(pathname);
  const dataset = useMemo(() => getManualDataset(locale), [locale]);

  const entry = useMemo(() => {
    if (!inScope) {
      return null;
    }
    return resolveManualEntry(pathname, locale);
  }, [inScope, locale, pathname]);

  const permissionRows = useMemo(() => {
    if (!entry) {
      return [];
    }
    const explicit = entry.permissions_required ?? [];
    const inferred = entry.prerequisites.flatMap((item) =>
      extractPermissionCodes(item.check),
    );
    const codes = Array.from(new Set([...explicit, ...inferred]));
    return codes.map((code) => {
      const meta = PERMISSION_CATALOG.find((perm) => perm.code === code);
      if (!meta) {
        return {
          code,
          title: code,
          description: copy.unknownPermission,
        };
      }
      return {
        code,
        title: permissionCatalog(`${meta.labelKey}.title`),
        description: permissionCatalog(`${meta.descriptionKey}.description`),
      };
    });
  }, [copy.unknownPermission, entry, permissionCatalog]);

  const routeTitleByRoute = useMemo(() => {
    const map = new Map<string, string>();
    dataset.entries.forEach((item) => {
      map.set(item.route, item.title);
    });
    return map;
  }, [dataset]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!inScope) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-xs font-semibold text-[color:var(--foreground)] shadow-lg hover:bg-[color:var(--surface-soft)] md:bottom-6"
      >
        {copy.open}
      </button>

      {open ? (
        <div className="nvi-sidepanel-overlay fixed inset-0 z-50 md:pointer-events-none" onClick={() => setOpen(false)}>
          <aside
            className="absolute inset-x-0 bottom-0 top-14 flex h-auto max-h-[calc(100vh-3.5rem)] w-full flex-col overflow-y-auto rounded-t-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 text-[color:var(--foreground)] md:pointer-events-auto md:inset-y-0 md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:max-w-lg md:rounded-none md:border-l md:border-r-0 md:border-t-0 md:border-b-0"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{copy.title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-[color:var(--border)] px-3 py-1 text-xs"
              >
                {copy.close}
              </button>
            </div>

            {entry ? (
              <div className="space-y-4 text-sm">
                <section className="space-y-3 rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-4">
                  <h3 className="text-base font-semibold">{entry.title}</h3>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
                      {copy.pagePurpose}
                    </p>
                    <p>{entry.purpose}</p>
                  </div>
                  {entry.workflow[0]?.step ? (
                    <div className="rounded border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                        {copy.firstAction}
                      </p>
                      <p className="mt-1 font-medium">{entry.workflow[0].step}</p>
                    </div>
                  ) : null}
                </section>

                <section className="rounded border border-[color:var(--border)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    {copy.quickActions}
                  </p>
                  <div className="mt-2 grid gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dispatchSupportChatHandoff({ question: copy.explainSimplyPrompt });
                        setOpen(false);
                      }}
                      className="rounded border border-[color:var(--border)] px-3 py-2 text-left text-xs hover:bg-[color:var(--surface-soft)]"
                    >
                      {copy.explainSimply}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dispatchSupportChatHandoff({ question: copy.whatFirstPrompt });
                        setOpen(false);
                      }}
                      className="rounded border border-[color:var(--border)] px-3 py-2 text-left text-xs hover:bg-[color:var(--surface-soft)]"
                    >
                      {copy.whatFirst}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dispatchSupportChatHandoff({ question: copy.troubleshootPrompt });
                        setOpen(false);
                      }}
                      className="rounded border border-[color:var(--border)] px-3 py-2 text-left text-xs hover:bg-[color:var(--surface-soft)]"
                    >
                      {copy.troubleshoot}
                    </button>
                  </div>
                </section>

                <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
                  {copy.advancedSections}
                </p>

                <details className="rounded border border-[color:var(--border)] p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    {copy.audience}
                  </summary>
                  <p className="mt-3">{entry.audience.join(', ')}</p>
                  <p className="mt-2 text-xs text-[color:var(--muted)]">
                    {copy.routeLabel}: <span className="font-mono">{materializeLocaleRoute(entry.route, locale)}</span>
                  </p>
                </details>

                <details className="rounded border border-[color:var(--border)] p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    {copy.prerequisites}
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {entry.prerequisites.map((item, index) => (
                      <li key={`${entry.id}-pre-${index}`} className="rounded border border-[color:var(--border)] p-2">
                        <p>{cleanPrerequisiteText(item.check, locale)}</p>
                        {item.where_to_do_it ? (
                          <p className="mt-1 text-xs text-[color:var(--muted)]">
                            {copy.nextActions}:{' '}
                            <Link
                              href={materializeLocaleRoute(item.where_to_do_it, locale)}
                              className="underline"
                            >
                              {routeTitleByRoute.get(item.where_to_do_it) ?? copy.relatedPageFallback}
                            </Link>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>

                <details className="rounded border border-[color:var(--border)] p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    {copy.workflow}
                  </summary>
                  <ol className="mt-3 space-y-2">
                    {entry.workflow.map((step, index) => (
                      <li key={`${entry.id}-step-${index}`} className="rounded border border-[color:var(--border)] p-2">
                        <p className="font-medium">
                          {index + 1}. {step.step}
                        </p>
                        {step.expected_result ? (
                          <p className="mt-1 text-xs text-[color:var(--muted)]">{step.expected_result}</p>
                        ) : null}
                        {step.if_blocked ? (
                          <p className="mt-1 text-xs text-[color:var(--muted)]">{step.if_blocked}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </details>

                <details className="rounded border border-[color:var(--border)] p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    {copy.commonErrors}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {entry.common_errors.map((error) => (
                      <article key={`${entry.id}-${error.error_code}`} className="rounded border border-[color:var(--border)] p-2">
                        <p className="font-mono text-xs font-semibold">{error.error_code}</p>
                        <p className="mt-1">{error.error_symptom}</p>
                        <p className="mt-1 text-xs text-[color:var(--muted)]">{error.likely_cause}</p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                          {copy.fixes}
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[color:var(--muted)]">
                          {error.fix_steps.map((step, index) => (
                            <li key={`${entry.id}-${error.error_code}-fix-${index}`}>{step}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </details>

                <details className="rounded border border-[color:var(--border)] p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    {copy.permissions}
                  </summary>
                  <div className="mt-3">
                    {permissionRows.length ? (
                      <ul className="space-y-2">
                        {permissionRows.map((permission) => (
                          <li
                            key={`${entry.id}-perm-${permission.code}`}
                            className="rounded border border-[color:var(--border)] p-2"
                          >
                            <p className="font-medium">{permission.title}</p>
                            <p className="mt-1 text-xs text-[color:var(--muted)]">
                              {permission.description}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="break-words">{copy.noExplicitPermissions}</p>
                    )}
                  </div>
                </details>

                <details className="rounded border border-[color:var(--border)] p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                    {copy.relatedPages}
                  </summary>
                  {entry.related_pages.length ? (
                    <ul className="mt-3 space-y-2">
                      {entry.related_pages.map((related) => (
                        <li key={`${entry.id}-${related.id}-${related.order}`} className="rounded border border-[color:var(--border)] p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                              {orderLabel(related.order, copy)}
                            </span>
                            <Link
                              href={materializeLocaleRoute(related.route, locale)}
                              className="text-xs underline"
                            >
                              {dataset.entries.find((item) => item.id === related.id)?.title ??
                                materializeLocaleRoute(related.route, locale)}
                            </Link>
                          </div>
                          <p className="mt-1 text-xs text-[color:var(--muted)]">{related.reason}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[color:var(--muted)]">-</p>
                  )}
                </details>
              </div>
            ) : (
              <div className="rounded border border-[color:var(--border)] p-4 text-sm">
                <p className="font-semibold">{copy.missingTitle}</p>
                <p className="mt-2 text-[color:var(--muted)]">{copy.missingBody}</p>
                <p className="mt-2 font-mono text-xs text-[color:var(--muted)]">{pathname}</p>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}
