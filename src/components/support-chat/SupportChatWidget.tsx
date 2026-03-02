'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { decodeJwt, getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import {
  getManualDataset,
  isManualInScopePath,
  materializeLocaleRoute,
  resolveManualEntry,
  type ManualLocale,
} from '@/lib/manual';
import { pushToast } from '@/lib/app-notifications';
import {
  type SupportChatLatestError,
  isSupportChatLatestErrorRelevant,
  useSupportChatRecentErrors,
} from '@/lib/support-chat-error-context';
import {
  SUPPORT_CHAT_HANDOFF_EVENT,
  type SupportChatHandoffPayload,
} from '@/lib/support-chat-handoff';

type ChatResponse = {
  summary: string;
  diagnosis: {
    primary_issue: string;
    evidence: string[];
    error_interpretation: string;
  };
  steps: string[];
  alternatives: string[];
  related_routes: { route: string; reason: string }[];
  sources: { id: string; route: string; locale: 'en' | 'sw'; section: string }[];
  confidence: 'high' | 'medium' | 'low';
  escalate: boolean;
  escalation_contact: string | null;
  policy_flags: {
    used_playbook: boolean;
    used_error_context: boolean;
    used_fallback: boolean;
    permission_limited: boolean;
  };
  meta?: {
    response_depth?: 'simple' | 'standard' | 'detailed';
    rendered_intent?: ChatIntent;
    confidence_reason?: string;
    error_context_status?: string;
    error_context_reason?: string;
  };
  intent_payload?: {
    intent: ChatIntent;
    sections: Array<{
      key: string;
      title: string;
      kind: 'text' | 'list' | 'links';
      lines?: string[];
      links?: Array<{ route: string; reason?: string }>;
      collapsed?: boolean;
      secondary?: boolean;
    }>;
  };
};
type ChatIntent = 'explain_page' | 'troubleshoot_error' | 'how_to' | 'what_next';
type ResponseDepth = 'simple' | 'standard' | 'detailed';

type ChatMessage =
  | { id: string; role: 'user'; text: string; createdAt: number }
  | {
      id: string;
      role: 'assistant';
      response: ChatResponse;
      createdAt: number;
      intent: ChatIntent;
      depth: ResponseDepth;
      baseQuestion: string;
    };

const STORAGE_KEY = 'nvi.supportChat.messages.v1';

type Copy = {
  open: string;
  close: string;
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  sending: string;
  clear: string;
  noMessages: string;
  confidence: string;
  diagnosis: string;
  fixes: string;
  alternatives: string;
  related: string;
  sources: string;
  details: string;
  escalation: string;
  low: string;
  medium: string;
  high: string;
  lastError: string;
  selectedErrorDropped: string;
  sourceSectionPurpose: string;
  sourceSectionPrerequisites: string;
  sourceSectionWorkflow: string;
  sourceSectionErrors: string;
  sourceSectionLinks: string;
  depthSimple: string;
  depthStandard: string;
  depthDetailed: string;
  explainMore: string;
  recentErrors: string;
  recentErrorsAuto: string;
  recentErrorsNone: string;
  recentErrorsAskWithout: string;
  recentErrorsSelectPrompt: string;
};

const COPY: Record<ManualLocale, Copy> = {
  en: {
    open: 'Assistant',
    close: 'Close',
    title: 'Help Assistant',
    subtitle: 'Ask what to do next on this page.',
    placeholder: 'Type your question...',
    send: 'Send',
    sending: 'Sending...',
    clear: 'Clear',
    noMessages: 'Ask a question about this page workflow or error.',
    confidence: 'Confidence',
    diagnosis: 'Diagnosis',
    fixes: 'Fix Steps',
    alternatives: 'Alternatives',
    related: 'Related Pages',
    sources: 'Sources',
    details: 'Details',
    escalation: 'Escalation',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    lastError: 'Selected error will be sent with your next message.',
    selectedErrorDropped:
      'Selected error could not be attached. Please re-select it and try again.',
    sourceSectionPurpose: 'Purpose',
    sourceSectionPrerequisites: 'Prerequisites',
    sourceSectionWorkflow: 'Workflow',
    sourceSectionErrors: 'Common Errors',
    sourceSectionLinks: 'Related Pages',
    depthSimple: 'Simple',
    depthStandard: 'Standard',
    depthDetailed: 'Detailed',
    explainMore: 'Explain more',
    recentErrors: 'Recent errors',
    recentErrorsAuto: 'No error selected',
    recentErrorsNone: 'No recent errors for this page',
    recentErrorsAskWithout: 'Ask without error',
    recentErrorsSelectPrompt:
      'Multiple recent errors match this page. Select one before troubleshooting.',
  },
  sw: {
    open: 'Msaidizi',
    close: 'Funga',
    title: 'Msaidizi wa Msaada',
    subtitle: 'Uliza hatua inayofuata kwenye ukurasa huu.',
    placeholder: 'Andika swali lako...',
    send: 'Tuma',
    sending: 'Inatuma...',
    clear: 'Futa',
    noMessages: 'Uliza swali kuhusu mtiririko wa ukurasa au kosa ulilopata.',
    confidence: 'Uhakika',
    diagnosis: 'Ufafanuzi',
    fixes: 'Hatua za Kurekebisha',
    alternatives: 'Njia Mbadala',
    related: 'Kurasa Husika',
    sources: 'Vyanzo',
    details: 'Maelezo',
    escalation: 'Msaada wa Ziada',
    low: 'Chini',
    medium: 'Wastani',
    high: 'Juu',
    lastError: 'Kosa ulilochagua litatumwa kwenye ujumbe unaofuata.',
    selectedErrorDropped:
      'Kosa ulilochagua halikuweza kuunganishwa. Chagua tena kisha ujaribu tena.',
    sourceSectionPurpose: 'Lengo',
    sourceSectionPrerequisites: 'Masharti ya Awali',
    sourceSectionWorkflow: 'Hatua za Kazi',
    sourceSectionErrors: 'Makosa ya Kawaida',
    sourceSectionLinks: 'Kurasa Husika',
    depthSimple: 'Rahisi',
    depthStandard: 'Kawaida',
    depthDetailed: 'Kwa kina',
    explainMore: 'Fafanua zaidi',
    recentErrors: 'Makosa ya hivi karibuni',
    recentErrorsAuto: 'Hakuna kosa lililochaguliwa',
    recentErrorsNone: 'Hakuna kosa la hivi karibuni kwa ukurasa huu',
    recentErrorsAskWithout: 'Uliza bila kosa',
    recentErrorsSelectPrompt:
      'Kuna makosa mengi ya hivi karibuni yanayolingana na ukurasa huu. Chagua moja kabla ya kutatua kosa.',
  },
};

const ASK_WITHOUT_ERROR = '__ask_without_error__';

function confidenceLabel(value: 'high' | 'medium' | 'low', copy: Copy) {
  if (value === 'high') return copy.high;
  if (value === 'medium') return copy.medium;
  return copy.low;
}

function readStoredMessages() {
  if (typeof window === 'undefined') {
    return [] as ChatMessage[];
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [] as ChatMessage[];
  }
  try {
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [] as ChatMessage[];
  }
}

function sectionLabel(section: string, copy: Copy) {
  if (section === 'purpose') return copy.sourceSectionPurpose;
  if (section === 'prerequisites') return copy.sourceSectionPrerequisites;
  if (section === 'workflow') return copy.sourceSectionWorkflow;
  if (section === 'errors') return copy.sourceSectionErrors;
  return copy.sourceSectionLinks;
}

function extractDetectedErrorCode(evidence: string[], interpretation: string) {
  const evidenceMatch = evidence
    .find((item) => item.startsWith('error:') && item !== 'error:message')
    ?.slice('error:'.length)
    ?.trim();
  if (evidenceMatch) {
    return evidenceMatch;
  }
  return interpretation.match(/\b[A-Z][A-Z0-9_]{4,}\b/g)?.[0] ?? null;
}

function classifyQuestionIntent(
  question: string,
  locale: ManualLocale,
): ChatIntent {
  const normalized = question.trim().toLowerCase();
  if (!normalized) {
    return 'how_to';
  }
  if (
    /(error|failed|failure|not\s+working|can'?t|cannot|kosa|imeshindwa|haifanyi|tatizo|problem|issue)/i.test(
      normalized,
    )
  ) {
    return 'troubleshoot_error';
  }

  const explainPatternsEn = [
    /what\s+is\s+this\s+page/,
    /about\s+this\s+page/,
    /explain\s+this\s+page/,
    /what\s+does\s+this\s+page\s+do/,
    /page\s+guide/,
  ];
  const explainPatternsSw = [
    /ukurasa\s+huu/,
    /hii\s+ukurasa/,
    /ukrasa\s+huu/,
    /kuhusu\s+ukurasa/,
    /mwongozo\s+wa\s+ukurasa/,
  ];
  const explainPatterns = locale === 'sw' ? explainPatternsSw : explainPatternsEn;
  if (explainPatterns.some((pattern) => pattern.test(normalized))) {
    return 'explain_page';
  }
  if (
    /(what\s+next|next\s+step|where\s+next|nifanye\s+nini\s+baada|hatua\s+inayofuata|baada\s+ya\s+hapa)/i.test(
      normalized,
    )
  ) {
    return 'what_next';
  }
  return 'how_to';
}

function isExplainMoreQuery(question: string) {
  return /(explain more|give details|more detail|fafanua zaidi|maelezo zaidi)/i.test(
    question.trim(),
  );
}

function nextDepth(depth: ResponseDepth): ResponseDepth {
  if (depth === 'simple') return 'standard';
  if (depth === 'standard') return 'detailed';
  return 'detailed';
}

function formatErrorOptionLabel(error: SupportChatLatestError, locale: ManualLocale) {
  const code = error.error_code ?? (locale === 'sw' ? 'KOSA' : 'ERROR');
  const message = error.error_message?.trim();
  const route = error.error_route ?? '-';
  return message ? `${code} - ${route} - ${message}` : `${code} - ${route}`;
}

function buildLegacyIntentPayload(params: {
  locale: ManualLocale;
  intent: ChatIntent;
  copy: Copy;
  response: ChatResponse;
}): NonNullable<ChatResponse['intent_payload']> {
  const { locale, intent, copy, response } = params;

  if (intent === 'explain_page') {
    return {
      intent,
      sections: [
        {
          key: 'about',
          title: locale === 'sw' ? 'Ukurasa huu ni wa nini' : 'What this page is for',
          kind: 'text',
          lines: [response.summary],
        },
        {
          key: 'first-actions',
          title: locale === 'sw' ? 'Hatua za kuanza' : 'First actions',
          kind: 'list',
          lines: response.steps.slice(0, 4),
        },
      ],
    };
  }

  if (intent === 'troubleshoot_error') {
    return {
      intent,
      sections: [
        {
          key: 'what-happened',
          title: locale === 'sw' ? 'Kilichotokea' : 'What happened',
          kind: 'text',
          lines: [response.diagnosis.primary_issue],
        },
        ...(response.diagnosis.error_interpretation
          ? [
              {
                key: 'why-likely',
                title:
                  locale === 'sw'
                    ? 'Kwa nini huenda ikawa hivyo'
                    : 'Why this likely happened',
                kind: 'text' as const,
                lines: [response.diagnosis.error_interpretation],
              },
            ]
          : []),
        {
          key: 'fix-now',
          title: locale === 'sw' ? 'Hatua za kurekebisha sasa' : 'Fix now',
          kind: 'list',
          lines: response.steps.slice(0, 5),
        },
      ],
    };
  }

  if (intent === 'what_next') {
    return {
      intent,
      sections: [
        {
          key: 'goal',
          title: locale === 'sw' ? 'Lengo la sasa' : 'Current goal',
          kind: 'text',
          lines: [response.summary],
        },
        {
          key: 'next-steps',
          title: locale === 'sw' ? 'Hatua zinazofuata' : 'Next steps',
          kind: 'list',
          lines: response.steps.slice(0, 4),
        },
      ],
    };
  }

  return {
    intent,
    sections: [
      {
        key: 'goal',
        title: locale === 'sw' ? 'Unachotaka kufanya' : 'What you want to do',
        kind: 'text',
        lines: [response.summary],
      },
      {
        key: 'steps',
        title: copy.fixes,
        kind: 'list',
        lines: response.steps.slice(0, 4),
      },
    ],
  };
}

export function SupportChatWidget() {
  const pathname = usePathname();
  const recentErrors = useSupportChatRecentErrors();
  const activeBranch = useActiveBranch();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [responseDepth, setResponseDepth] = useState<ResponseDepth>('simple');
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredMessages());
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);

  const locale = useMemo<ManualLocale>(() => {
    const segment = pathname.split('/').filter(Boolean)[0];
    return segment === 'sw' ? 'sw' : 'en';
  }, [pathname]);
  const copy = COPY[locale];
  const token = typeof window !== 'undefined' ? getAccessToken() : null;
  const tokenBusinessId =
    token
      ? decodeJwt<{ businessId?: string }>(token)?.businessId ?? null
      : null;
  const inScope = isManualInScopePath(pathname);
  const entry = useMemo(() => resolveManualEntry(pathname, locale), [locale, pathname]);
  const dataset = useMemo(() => getManualDataset(locale), [locale]);
  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of dataset.entries) {
      map.set(item.id, item.title);
    }
    return map;
  }, [dataset]);
  const titleByRoute = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of dataset.entries) {
      map.set(item.route, item.title);
      map.set(materializeLocaleRoute(item.route, locale), item.title);
    }
    return map;
  }, [dataset, locale]);

  const relevantRecentErrors = useMemo(
    () =>
      recentErrors.filter((item) =>
        isSupportChatLatestErrorRelevant(item, {
          route: pathname,
          businessId: tokenBusinessId,
          branchId: activeBranch?.id ?? null,
        }),
      ),
    [activeBranch?.id, pathname, recentErrors, tokenBusinessId],
  );

  const selectedErrorContext = useMemo<SupportChatLatestError | null>(() => {
    if (selectedErrorId === ASK_WITHOUT_ERROR) {
      return null;
    }
    if (!selectedErrorId) {
      return null;
    }
    return relevantRecentErrors.find((item) => item.id === selectedErrorId) ?? null;
  }, [relevantRecentErrors, selectedErrorId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const onHandoff = (event: Event) => {
      const custom = event as CustomEvent<SupportChatHandoffPayload>;
      const nextQuestion = custom.detail?.question?.trim();
      if (!nextQuestion) {
        return;
      }
      setOpen(true);
      setQuestion(nextQuestion);
    };
    window.addEventListener(SUPPORT_CHAT_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(SUPPORT_CHAT_HANDOFF_EVENT, onHandoff);
  }, []);

  useEffect(() => {
    if (selectedErrorId === ASK_WITHOUT_ERROR) {
      return;
    }
    if (!relevantRecentErrors.length) {
      setSelectedErrorId(null);
      return;
    }
    if (!selectedErrorId) {
      return;
    }
    const stillExists = relevantRecentErrors.some((item) => item.id === selectedErrorId);
    if (!stillExists) {
      setSelectedErrorId(null);
    }
  }, [relevantRecentErrors, selectedErrorId]);

  if (!inScope || !token) {
    return null;
  }

  const send = async (options?: {
    overrideQuestion?: string;
    overrideIntent?: ChatIntent;
    overrideDepth?: ResponseDepth;
    baseQuestion?: string;
  }) => {
    const trimmed = (options?.overrideQuestion ?? question).trim();
    if (!trimmed || isSending) {
      return;
    }
    const lastAssistant = [...messages]
      .reverse()
      .find((item): item is Extract<ChatMessage, { role: 'assistant' }> => item.role === 'assistant');
    const isExpandPrompt = isExplainMoreQuery(trimmed);
    const intent = options?.overrideIntent
      ? options.overrideIntent
      : isExpandPrompt && lastAssistant
        ? lastAssistant.intent
        : classifyQuestionIntent(trimmed, locale);
    const depth = options?.overrideDepth
      ? options.overrideDepth
      : isExpandPrompt && lastAssistant
        ? nextDepth(lastAssistant.depth)
        : responseDepth;
    const baseQuestion =
      options?.baseQuestion ??
      (isExpandPrompt && lastAssistant ? lastAssistant.baseQuestion : trimmed);
    const requestQuestion = isExpandPrompt ? baseQuestion : trimmed;
    const hasExplicitSelectedError =
      typeof selectedErrorId === 'string' && selectedErrorId.length > 0;
    const isExplainIntent = intent === 'explain_page';
    const isAskWithoutError = selectedErrorId === ASK_WITHOUT_ERROR;
    const defaultErrorForIntent =
      !isExplainIntent &&
      !hasExplicitSelectedError &&
      !isAskWithoutError &&
      relevantRecentErrors.length === 1
        ? relevantRecentErrors[0]
        : null;
    const resolvedErrorContext = selectedErrorContext ?? defaultErrorForIntent;
    const resolvedSelectedErrorId =
      resolvedErrorContext?.id ??
      (isAskWithoutError ? null : undefined);

    if (
      !isExplainIntent &&
      !hasExplicitSelectedError &&
      !isAskWithoutError &&
      relevantRecentErrors.length > 1
    ) {
      pushToast({
        variant: 'warning',
        message: copy.recentErrorsSelectPrompt,
      });
      return;
    }

    setIsSending(true);

    const userMessage: ChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    if (!options?.overrideQuestion) {
      setQuestion('');
    }

    try {
      const response = await apiFetch<ChatResponse>('/support/chat', {
        method: 'POST',
        token,
        body: JSON.stringify({
          question: requestQuestion,
          locale,
          intent,
          response_depth: depth,
          route: pathname,
          module: entry?.module ?? undefined,
          branchId: activeBranch?.id ?? undefined,
          topK: 6,
          latest_error: resolvedErrorContext ?? undefined,
          recent_errors: relevantRecentErrors,
          selected_error_id: resolvedSelectedErrorId,
        }),
      });

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-a`,
        role: 'assistant',
        response,
        createdAt: Date.now(),
        intent: response.meta?.rendered_intent ?? intent,
        depth: response.meta?.response_depth ?? depth,
        baseQuestion,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (
        hasExplicitSelectedError &&
        !response.policy_flags?.used_error_context &&
        response.meta?.error_context_status !== 'none_explain_intent'
      ) {
        pushToast({
          variant: 'warning',
          message: response.meta?.error_context_reason || copy.selectedErrorDropped,
        });
      }
    } catch (err) {
      pushToast({
        variant: 'error',
        message: getApiErrorMessage(
          err,
          locale === 'sw'
            ? 'Imeshindwa kuwasiliana na msaidizi.'
            : 'Failed to contact assistant.',
        ),
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-36 right-4 z-40 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-xs font-semibold text-[color:var(--foreground)] shadow-lg hover:bg-[color:var(--surface-soft)] md:bottom-20"
      >
        {copy.open}
      </button>

      {open ? (
        <div className="nvi-sidepanel-overlay fixed inset-0 z-50 md:pointer-events-none" onClick={() => setOpen(false)}>
          <aside
            className="absolute inset-x-0 bottom-0 top-14 flex h-auto max-h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-[color:var(--border)] bg-[color:var(--surface)] md:pointer-events-auto md:inset-y-0 md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:max-w-lg md:rounded-none md:border-l md:border-t-0 md:border-r-0 md:border-b-0"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[color:var(--border)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
                    {copy.title}
                  </h2>
                  <p className="text-xs text-[color:var(--muted)]">{copy.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      if (typeof window !== 'undefined') {
                        window.localStorage.removeItem(STORAGE_KEY);
                      }
                    }}
                    className="rounded border border-[color:var(--border)] px-2 py-1 text-xs"
                  >
                    {copy.clear}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded border border-[color:var(--border)] px-2 py-1 text-xs"
                  >
                    {copy.close}
                  </button>
                </div>
                <div className="mt-3 flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setResponseDepth('simple')}
                    className={`rounded border px-2 py-1 ${responseDepth === 'simple' ? 'border-amber-400 text-amber-300' : 'border-[color:var(--border)]'}`}
                  >
                    {copy.depthSimple}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseDepth('standard')}
                    className={`rounded border px-2 py-1 ${responseDepth === 'standard' ? 'border-amber-400 text-amber-300' : 'border-[color:var(--border)]'}`}
                  >
                    {copy.depthStandard}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseDepth('detailed')}
                    className={`rounded border px-2 py-1 ${responseDepth === 'detailed' ? 'border-amber-400 text-amber-300' : 'border-[color:var(--border)]'}`}
                  >
                    {copy.depthDetailed}
                  </button>
                </div>
              </div>
              {selectedErrorContext?.error_code || selectedErrorContext?.error_message ? (
                <p className="mt-2 text-xs text-[color:var(--muted)]">{copy.lastError}</p>
              ) : null}
              <div className="mt-3 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {copy.recentErrors}
                </label>
                <select
                  value={selectedErrorId ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedErrorId(value || null);
                  }}
                  className="w-full rounded border border-[color:var(--border)] bg-transparent px-2 py-1 text-xs text-[color:var(--foreground)]"
                >
                  {relevantRecentErrors.length ? (
                    <option value="">{copy.recentErrorsAuto}</option>
                  ) : (
                    <option value="">{copy.recentErrorsNone}</option>
                  )}
                  {relevantRecentErrors.length ? (
                    <option value={ASK_WITHOUT_ERROR}>{copy.recentErrorsAskWithout}</option>
                  ) : null}
                  {relevantRecentErrors.map((error) => (
                    <option key={error.id} value={error.id}>
                      {formatErrorOptionLabel(error, locale)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-6">
              {messages.length === 0 ? (
                <div className="rounded border border-[color:var(--border)] p-3 text-sm text-[color:var(--muted)]">
                  {copy.noMessages}
                </div>
              ) : null}
              {messages.map((message) =>
                message.role === 'user' ? (
                  <div
                    key={message.id}
                    className="ml-auto max-w-[85%] rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground)] break-words [overflow-wrap:anywhere]"
                  >
                    {message.text}
                  </div>
                ) : (
                  <div
                    key={message.id}
                    className="max-w-[92%] rounded-xl border border-[color:var(--border)] px-3 py-3 text-sm text-[color:var(--foreground)] break-words [overflow-wrap:anywhere]"
                  >
                    <p className="font-medium">{message.response.summary}</p>
                    <div className="mt-2 text-xs text-[color:var(--muted)]">
                      {copy.confidence}:{' '}
                      <span className="font-semibold text-[color:var(--foreground)]">
                        {confidenceLabel(message.response.confidence, copy)}
                      </span>
                    </div>
                    {message.response.meta?.confidence_reason ? (
                      <p className="mt-1 text-xs text-[color:var(--muted)] break-words [overflow-wrap:anywhere]">
                        {message.response.meta.confidence_reason}
                      </p>
                    ) : null}
                    {(() => {
                      const detectedErrorCode = extractDetectedErrorCode(
                        message.response.diagnosis.evidence,
                        message.response.diagnosis.error_interpretation,
                      );
                      const shouldShowCodeChip =
                        message.intent === 'troubleshoot_error' &&
                        message.depth !== 'simple';
                      if (!detectedErrorCode || !shouldShowCodeChip) {
                        return null;
                      }
                      return (
                        <div className="mt-2 inline-flex max-w-full rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2 py-1 text-[11px] font-mono font-semibold text-[color:var(--foreground)] break-all [overflow-wrap:anywhere]">
                          {detectedErrorCode}
                        </div>
                      );
                    })()}

                    {(() => {
                      const intentPayload =
                        message.response.intent_payload?.sections?.length
                          ? message.response.intent_payload
                          : buildLegacyIntentPayload({
                              locale,
                              intent: message.intent,
                              copy,
                              response: message.response,
                            });
                      return (
                        <section className="mt-3 space-y-2">
                        {intentPayload.sections.map((section, index) => {
                          const titleClass = section.secondary
                            ? 'text-[color:var(--muted)]'
                            : 'text-[color:var(--foreground)]';
                          const bodyClass = section.secondary
                            ? 'text-xs text-[color:var(--muted)]'
                            : 'text-sm text-[color:var(--foreground)]';
                          const content = (
                            <div className="mt-1 space-y-1">
                              {section.kind === 'text' ? (
                                <div className={`${bodyClass} space-y-1`}>
                                  {(section.lines ?? []).map((line, lineIndex) => (
                                    <p
                                      key={`${message.id}-sec-${index}-line-${lineIndex}`}
                                      className="break-words [overflow-wrap:anywhere]"
                                    >
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                              {section.kind === 'list' ? (
                                <ol className={`${bodyClass} list-decimal space-y-1 pl-5`}>
                                  {(section.lines ?? []).map((line, lineIndex) => (
                                    <li
                                      key={`${message.id}-sec-${index}-line-${lineIndex}`}
                                      className="break-words [overflow-wrap:anywhere]"
                                    >
                                      {line}
                                    </li>
                                  ))}
                                </ol>
                              ) : null}
                              {section.kind === 'links' ? (
                                <ul className={`${bodyClass} space-y-1`}>
                                  {(section.links ?? []).map((link, linkIndex) => {
                                    const localizedRoute = materializeLocaleRoute(
                                      link.route,
                                      locale,
                                    );
                                    const routeTitle =
                                      titleByRoute.get(link.route) ??
                                      titleByRoute.get(localizedRoute) ??
                                      localizedRoute;
                                    return (
                                      <li
                                        key={`${message.id}-sec-${index}-link-${linkIndex}`}
                                        className="space-y-0.5"
                                      >
                                        <Link
                                          href={localizedRoute}
                                          className="underline break-words [overflow-wrap:anywhere]"
                                        >
                                          {routeTitle}
                                        </Link>
                                        {link.reason ? (
                                          <p className="text-xs text-[color:var(--muted)] break-words [overflow-wrap:anywhere]">
                                            {link.reason}
                                          </p>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : null}
                            </div>
                          );
                          if (section.collapsed) {
                            return (
                              <details
                                key={`${message.id}-sec-${index}`}
                                className="rounded border border-[color:var(--border)] p-2"
                              >
                                <summary
                                  className={`cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] ${titleClass}`}
                                >
                                  {section.title}
                                </summary>
                                {content}
                              </details>
                            );
                          }
                          return (
                            <div key={`${message.id}-sec-${index}`} className="space-y-1">
                              <h4
                                className={`text-xs font-semibold uppercase tracking-[0.14em] ${titleClass}`}
                              >
                                {section.title}
                              </h4>
                              {content}
                            </div>
                          );
                        })}
                        </section>
                      );
                    })()}

                    {message.response.alternatives.length ? (
                      <section className="mt-3 space-y-1">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {copy.alternatives}
                        </h4>
                        <ul className="list-disc space-y-1 pl-5">
                          {message.response.alternatives.map((item, index) => (
                            <li
                              key={`${message.id}-alt-${index}`}
                              className="break-words [overflow-wrap:anywhere]"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {message.response.related_routes.length ? (
                      <section className="mt-3 space-y-1">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {copy.related}
                        </h4>
                        <ul className="space-y-1">
                          {message.response.related_routes.slice(0, 4).map((item, index) => (
                            <li key={`${message.id}-rel-${index}`} className="space-y-0.5">
                              {(() => {
                                const localizedRoute = materializeLocaleRoute(item.route, locale);
                                const routeTitle =
                                  titleByRoute.get(item.route) ??
                                  titleByRoute.get(localizedRoute) ??
                                  localizedRoute;
                                return (
                                  <>
                                    <Link
                                      href={localizedRoute}
                                      className="underline break-words [overflow-wrap:anywhere]"
                                    >
                                      {routeTitle}
                                    </Link>
                                    <p className="text-xs text-[color:var(--muted)] break-all [overflow-wrap:anywhere]">
                                      {localizedRoute}
                                    </p>
                                  </>
                                );
                              })()}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {message.response.sources.length ? (
                      <section className="mt-3 space-y-1">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {copy.sources}
                        </h4>
                        <ul className="space-y-1 text-xs text-[color:var(--muted)]">
                          {message.response.sources.slice(0, 4).map((source, index) => (
                            <li
                              key={`${message.id}-src-${index}`}
                              className="break-words [overflow-wrap:anywhere]"
                            >
                              {titleById.get(source.id) ?? source.id} (
                              {sectionLabel(source.section, copy)})
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {message.response.escalate ? (
                      <section className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                        <p className="font-semibold">{copy.escalation}</p>
                        <p className="mt-1">
                          {message.response.escalation_contact ?? '-'}
                        </p>
                      </section>
                    ) : null}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          void send({
                            overrideQuestion: locale === 'sw' ? 'Fafanua zaidi' : 'Explain more',
                            overrideIntent: message.intent,
                            overrideDepth: nextDepth(message.depth),
                            baseQuestion: message.baseQuestion,
                          })
                        }
                        className="rounded border border-[color:var(--border)] px-2 py-1 text-xs"
                      >
                        {copy.explainMore}
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="border-t border-[color:var(--border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex items-end gap-2">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={copy.placeholder}
                  rows={2}
                  className="min-h-[56px] flex-1 rounded border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--foreground)]"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={isSending || !question.trim()}
                  className="rounded border border-[color:var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {isSending ? copy.sending : copy.send}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
