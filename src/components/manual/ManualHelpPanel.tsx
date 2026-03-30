'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getManualDataset,
  isManualInScopePath,
  materializeLocaleRoute,
  resolveManualEntry,
  type ManualLocale,
} from '@/lib/manual';
import { dispatchSupportChatHandoff } from '@/lib/support-chat-handoff';

type Mode = 'guide' | 'elements' | 'ask';

type Copy = {
  open: string;
  close: string;
  title: string;
  guide: string;
  elements: string;
  askAI: string;
  important: string;
  beforeYouStart: string;
  commonTasks: string;
  nextSteps: string;
  searchPlaceholder: string;
  noResults: string;
  explainSimply: string;
  whatFirst: string;
  troubleshoot: string;
  explainSimplyPrompt: string;
  whatFirstPrompt: string;
  troubleshootPrompt: string;
  customQuestionPlaceholder: string;
  ask: string;
  missingTitle: string;
  missingBody: string;
  before: string;
  after: string;
  parallel: string;
  relatedPageFallback: string;
  elementTypeButton: string;
  elementTypeInput: string;
  elementTypeDropdown: string;
  elementTypeSelect: string;
  elementTypeToggle: string;
  elementTypeTable: string;
  elementTypeCard: string;
  elementTypeLink: string;
  elementTypeSearch: string;
};

const COPY: Record<ManualLocale, Copy> = {
  en: {
    open: 'Manual',
    close: 'Close',
    title: 'Page Guide',
    guide: 'Guide',
    elements: 'Elements',
    askAI: 'Ask AI',
    important: 'Important',
    beforeYouStart: 'Before you start',
    commonTasks: 'Common tasks',
    nextSteps: 'Next steps',
    searchPlaceholder: 'Search elements...',
    noResults: 'No elements match your search.',
    explainSimply: 'Explain this page simply',
    whatFirst: 'What should I do first?',
    troubleshoot: 'Help me troubleshoot',
    explainSimplyPrompt: 'Explain this page simply.',
    whatFirstPrompt: 'What should I do first on this page?',
    troubleshootPrompt: 'Help me troubleshoot an error on this page.',
    customQuestionPlaceholder: 'Ask anything about this page...',
    ask: 'Ask',
    missingTitle: 'Manual entry not found',
    missingBody: 'This page is in scope, but no guide entry was found yet.',
    before: 'Before',
    after: 'After',
    parallel: 'Also see',
    relatedPageFallback: 'Related page',
    elementTypeButton: 'Button',
    elementTypeInput: 'Input',
    elementTypeDropdown: 'Dropdown',
    elementTypeSelect: 'Select',
    elementTypeToggle: 'Toggle',
    elementTypeTable: 'Table',
    elementTypeCard: 'Card',
    elementTypeLink: 'Link',
    elementTypeSearch: 'Search',
  },
  sw: {
    open: 'Mwongozo',
    close: 'Funga',
    title: 'Mwongozo wa Ukurasa',
    guide: 'Mwongozo',
    elements: 'Vipengele',
    askAI: 'Uliza AI',
    important: 'Muhimu',
    beforeYouStart: 'Kabla hujaanza',
    commonTasks: 'Kazi za kawaida',
    nextSteps: 'Hatua zinazofuata',
    searchPlaceholder: 'Tafuta vipengele...',
    noResults: 'Hakuna vipengele vinavyolingana na utafutano wako.',
    explainSimply: 'Eleza ukurasa huu kwa urahisi',
    whatFirst: 'Nianze na nini kwanza?',
    troubleshoot: 'Nisaidie kutatua tatizo',
    explainSimplyPrompt: 'Eleza ukurasa huu kwa urahisi.',
    whatFirstPrompt: 'Nianze na nini kwanza kwenye ukurasa huu?',
    troubleshootPrompt: 'Nisaidie kutatua kosa kwenye ukurasa huu.',
    customQuestionPlaceholder: 'Uliza chochote kuhusu ukurasa huu...',
    ask: 'Uliza',
    missingTitle: 'Ingizo la mwongozo halijapatikana',
    missingBody: 'Ukurasa huu upo kwenye wigo lakini mwongozo wake bado haujapatikana.',
    before: 'Kabla',
    after: 'Baada',
    parallel: 'Angalia pia',
    relatedPageFallback: 'Ukurasa husika',
    elementTypeButton: 'Kitufe',
    elementTypeInput: 'Ingizo',
    elementTypeDropdown: 'Orodha ya chaguo',
    elementTypeSelect: 'Chagua',
    elementTypeToggle: 'Kubadilisha',
    elementTypeTable: 'Jedwali',
    elementTypeCard: 'Kadi',
    elementTypeLink: 'Kiungo',
    elementTypeSearch: 'Tafuta',
  },
};

const ELEMENT_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  button: { label: 'Button', className: 'bg-blue-500/10 text-blue-600' },
  input: { label: 'Input', className: 'bg-slate-400/15 text-slate-500' },
  dropdown: { label: 'Dropdown', className: 'bg-purple-500/10 text-purple-600' },
  select: { label: 'Select', className: 'bg-purple-500/10 text-purple-600' },
  toggle: { label: 'Toggle', className: 'bg-orange-500/10 text-orange-600' },
  table: { label: 'Table', className: 'bg-green-500/10 text-green-700' },
  card: { label: 'Card', className: 'bg-indigo-500/10 text-indigo-600' },
  link: { label: 'Link', className: 'bg-teal-500/10 text-teal-600' },
  search: { label: 'Search', className: 'bg-sky-500/10 text-sky-600' },
};

function ElementTypeBadge({ type, copy }: { type: string; copy: Copy }) {
  const labelMap: Record<string, string> = {
    button: copy.elementTypeButton,
    input: copy.elementTypeInput,
    dropdown: copy.elementTypeDropdown,
    select: copy.elementTypeSelect,
    toggle: copy.elementTypeToggle,
    table: copy.elementTypeTable,
    card: copy.elementTypeCard,
    link: copy.elementTypeLink,
    search: copy.elementTypeSearch,
  };
  const style = ELEMENT_TYPE_STYLES[type] ?? {
    label: type,
    className: 'bg-slate-400/15 text-slate-500',
  };
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.className}`}
    >
      {labelMap[type] ?? type}
    </span>
  );
}

export function ManualHelpPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('guide');
  const [elementSearch, setElementSearch] = useState('');
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const locale = useMemo<ManualLocale>(() => {
    const segment = pathname.split('/').filter(Boolean)[0];
    return segment === 'sw' ? 'sw' : 'en';
  }, [pathname]);

  const copy = COPY[locale];
  const inScope = isManualInScopePath(pathname);
  const dataset = useMemo(() => getManualDataset(locale), [locale]);

  const entry = useMemo(() => {
    if (!inScope) return null;
    return resolveManualEntry(pathname, locale);
  }, [inScope, locale, pathname]);

  const routeTitleByRoute = useMemo(() => {
    const map = new Map<string, string>();
    dataset.entries.forEach((item) => map.set(item.route, item.title));
    return map;
  }, [dataset]);

  const filteredElements = useMemo(() => {
    if (!entry?.elements) return [];
    const q = elementSearch.toLowerCase().trim();
    if (!q) return entry.elements;
    return entry.elements.filter(
      (el) =>
        el.name.toLowerCase().includes(q) ||
        el.description.toLowerCase().includes(q) ||
        el.type.toLowerCase().includes(q),
    );
  }, [entry, elementSearch]);

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Reset state when panel closes
  useEffect(() => {
    if (!open) {
      setMode('guide');
      setElementSearch('');
      setExpandedTask(null);
      setCustomQuestion('');
    }
  }, [open]);

  // Auto-focus search when switching to elements mode
  useEffect(() => {
    if (mode === 'elements') {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [mode]);

  if (!inScope) return null;

  function handleAsk(prompt: string) {
    dispatchSupportChatHandoff({ question: prompt });
    setOpen(false);
  }

  function orderLabel(order: 'before' | 'after' | 'parallel') {
    if (order === 'before') return copy.before;
    if (order === 'after') return copy.after;
    return copy.parallel;
  }

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-36 right-4 z-40 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-xs font-semibold text-[color:var(--foreground)] shadow-lg hover:bg-[color:var(--surface-soft)]"
      >
        {copy.open}
      </button>

      {open && (
        <div
          className="nvi-sidepanel-overlay fixed inset-0 z-50 md:pointer-events-none"
          onClick={() => setOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={copy.title}
            className="absolute inset-x-0 bottom-0 top-14 flex h-auto max-h-[calc(100vh-3.5rem)] w-full flex-col rounded-t-2xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] md:pointer-events-auto md:inset-y-0 md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:max-w-sm md:rounded-none md:border-l md:border-r-0 md:border-b-0 md:border-t-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
              <span className="text-sm font-semibold">{copy.title}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-[color:var(--border)] px-2.5 py-1 text-xs text-[color:var(--muted)] hover:bg-[color:var(--surface-soft)]"
              >
                {copy.close}
              </button>
            </div>

            {/* Mode switcher */}
            <div className="flex shrink-0 gap-1 border-b border-[color:var(--border)] px-3 py-2">
              {(['guide', 'elements', 'ask'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === m
                      ? 'bg-[color:var(--foreground)] text-[color:var(--surface)]'
                      : 'text-[color:var(--muted)] hover:bg-[color:var(--surface-soft)]'
                  }`}
                >
                  {m === 'guide' ? copy.guide : m === 'elements' ? copy.elements : copy.askAI}
                </button>
              ))}
            </div>

            {/* Scrollable content area */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {entry ? (
                <>
                  {/* ── GUIDE MODE ── */}
                  {mode === 'guide' && (
                    <div>
                      {/* Page title + overview */}
                      <div className="px-4 pb-4 pt-4">
                        <p className="text-[15px] font-semibold leading-snug">{entry.title}</p>
                        <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted)]">
                          {entry.overview ?? entry.purpose}
                        </p>
                      </div>

                      {/* Warnings — always visible, not collapsible */}
                      {entry.warnings?.length ? (
                        <div className="mx-4 mb-3 rounded-lg border border-amber-400/50 bg-amber-500/10 p-3">
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                            {copy.important}
                          </p>
                          <ul className="space-y-1.5">
                            {entry.warnings.map((w, i) => (
                              <li
                                key={i}
                                className="flex gap-2 text-xs leading-relaxed text-amber-800"
                              >
                                <span className="mt-0.5 shrink-0 text-amber-500">▲</span>
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {/* Before you start */}
                      {entry.before_you_start?.length ? (
                        <div className="border-t border-[color:var(--border)] px-4 py-4">
                          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[color:var(--muted)]">
                            {copy.beforeYouStart}
                          </p>
                          <ul className="space-y-2.5">
                            {entry.before_you_start.map((item, i) => (
                              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[color:var(--border)] text-[9px] font-bold text-[color:var(--muted)]">
                                  ✓
                                </span>
                                <span className="flex-1">
                                  {item.text}
                                  {item.link ? (
                                    <Link
                                      href={materializeLocaleRoute(item.link, locale)}
                                      className="ml-1 text-xs underline text-[color:var(--muted)]"
                                    >
                                      → {routeTitleByRoute.get(item.link) ?? copy.relatedPageFallback}
                                    </Link>
                                  ) : null}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {/* Common tasks */}
                      {entry.common_tasks?.length ? (
                        <div className="border-t border-[color:var(--border)] px-4 py-4">
                          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[color:var(--muted)]">
                            {copy.commonTasks}
                          </p>
                          <div className="space-y-2">
                            {entry.common_tasks.map((task, tIdx) => (
                              <div
                                key={tIdx}
                                className="overflow-hidden rounded-lg border border-[color:var(--border)]"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedTask(expandedTask === tIdx ? null : tIdx)
                                  }
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[color:var(--surface-soft)]"
                                >
                                  <span className="text-sm font-medium">{task.task}</span>
                                  <span className="shrink-0 text-[10px] text-[color:var(--muted)]">
                                    {expandedTask === tIdx ? '▲' : '▼'}
                                  </span>
                                </button>
                                {expandedTask === tIdx && (
                                  <ol className="space-y-2 border-t border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-3">
                                    {task.steps.map((step, sIdx) => (
                                      <li key={sIdx} className="flex gap-2.5 text-xs leading-relaxed">
                                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--foreground)] text-[9px] font-bold text-[color:var(--surface)]">
                                          {sIdx + 1}
                                        </span>
                                        <span className="flex-1 text-[color:var(--muted)]">{step}</span>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Related pages */}
                      {entry.related_pages?.length ? (
                        <div className="border-t border-[color:var(--border)] px-4 py-4">
                          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[color:var(--muted)]">
                            {copy.nextSteps}
                          </p>
                          <ul className="space-y-2">
                            {entry.related_pages.map((rel) => (
                              <li
                                key={`${rel.id}-${rel.order}`}
                                className="flex items-baseline gap-2 text-xs"
                              >
                                <span className="shrink-0 text-[color:var(--muted)]">
                                  {orderLabel(rel.order)}
                                </span>
                                <Link
                                  href={materializeLocaleRoute(rel.route, locale)}
                                  className="underline"
                                >
                                  {dataset.entries.find((e) => e.id === rel.id)?.title ??
                                    copy.relatedPageFallback}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* ── ELEMENTS MODE ── */}
                  {mode === 'elements' && (
                    <div className="flex h-full flex-col">
                      {/* Search bar */}
                      <div className="shrink-0 border-b border-[color:var(--border)] px-4 py-3">
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={elementSearch}
                          onChange={(e) => setElementSearch(e.target.value)}
                          placeholder={copy.searchPlaceholder}
                          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--foreground)]"
                        />
                      </div>

                      {/* Element list */}
                      {filteredElements.length ? (
                        <ul className="divide-y divide-[color:var(--border)]">
                          {filteredElements.map((el, i) => (
                            <li key={i} className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <ElementTypeBadge type={el.type} copy={copy} />
                                <span className="text-sm font-medium">{el.name}</span>
                              </div>
                              <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--muted)]">
                                {el.description}
                              </p>
                              {el.notes ? (
                                <p className="mt-1 text-[11px] italic text-[color:var(--muted)]">
                                  {el.notes}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-4 py-8 text-sm text-[color:var(--muted)]">
                          {copy.noResults}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── ASK AI MODE ── */}
                  {mode === 'ask' && (
                    <div className="px-4 py-4">
                      <div className="space-y-2">
                        {[
                          { label: copy.explainSimply, prompt: copy.explainSimplyPrompt },
                          { label: copy.whatFirst, prompt: copy.whatFirstPrompt },
                          { label: copy.troubleshoot, prompt: copy.troubleshootPrompt },
                        ].map(({ label, prompt }) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => handleAsk(prompt)}
                            className="w-full rounded-lg border border-[color:var(--border)] px-4 py-3 text-left text-sm hover:bg-[color:var(--surface-soft)]"
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 flex gap-2 border-t border-[color:var(--border)] pt-4">
                        <input
                          type="text"
                          value={customQuestion}
                          onChange={(e) => setCustomQuestion(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customQuestion.trim()) {
                              handleAsk(customQuestion.trim());
                            }
                          }}
                          placeholder={copy.customQuestionPlaceholder}
                          className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--foreground)]"
                        />
                        <button
                          type="button"
                          disabled={!customQuestion.trim()}
                          onClick={() => {
                            if (customQuestion.trim()) handleAsk(customQuestion.trim());
                          }}
                          className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[color:var(--surface-soft)] disabled:opacity-40"
                        >
                          {copy.ask}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-4 py-6 text-sm">
                  <p className="font-semibold">{copy.missingTitle}</p>
                  <p className="mt-2 text-[color:var(--muted)]">{copy.missingBody}</p>
                  <p className="mt-2 font-mono text-xs text-[color:var(--muted)]">{pathname}</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
