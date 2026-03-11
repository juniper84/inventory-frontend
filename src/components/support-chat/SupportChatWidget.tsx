'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { PERMISSION_CATALOG } from '@/lib/permission-catalog';
import { pushToast } from '@/lib/app-notifications';
import {
  type SupportChatLatestError,
  isSupportChatLatestErrorRelevant,
  useSupportChatRecentErrors,
} from '@/lib/support-chat-error-context';
import {
  HELP_CENTER_OPEN_EVENT,
  SUPPORT_CHAT_HANDOFF_EVENT,
  type HelpCenterOpenPayload,
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
type HelpTab = 'manual' | 'assistant';
type ManualFilter = 'all' | 'workflow' | 'errors' | 'permissions';
type ManualMode = 'guide' | 'elements';

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

type Copy = {
  open: string;
  title: string;
  close: string;
  manualTab: string;
  assistantTab: string;
  placeholder: string;
  send: string;
  sending: string;
  clear: string;
  noMessages: string;
  confidence: string;
  alternatives: string;
  related: string;
  sources: string;
  escalation: string;
  low: string;
  medium: string;
  high: string;
  selectedErrorDropped: string;
  depthSimple: string;
  depthStandard: string;
  depthDetailed: string;
  explainMore: string;
  recentErrors: string;
  recentErrorsAuto: string;
  recentErrorsNone: string;
  recentErrorsAskWithout: string;
  recentErrorsSelectPrompt: string;
  manualSearchTitle: string;
  manualSearchPlaceholder: string;
  manualSearchAll: string;
  manualSearchWorkflow: string;
  manualSearchErrors: string;
  manualSearchPermissions: string;
  pageGuide: string;
  oneLineSummary: string;
  whatFirst: string;
  explainSimply: string;
  troubleshoot: string;
  writeManual: string;
  writeManualHint: string;
  improveManual: string;
  improveManualHint: string;
  designFlow: string;
  designFlowHint: string;
  commonErrors: string;
  permissions: string;
  moreDetails: string;
  audience: string;
  prerequisites: string;
  workflow: string;
  relatedPages: string;
  route: string;
  noGuideTitle: string;
  noGuideBody: string;
  roleLabel: string;
  branchLabel: string;
  pageLabel: string;
  assistantPromptExplain: string;
  assistantPromptFirst: string;
  assistantPromptTroubleshoot: string;
  assistantPromptWriteManual: string;
  assistantPromptImproveManual: string;
  assistantPromptDesignFlow: string;
  generateDraft: string;
  notSaved: string;
  // manual v2 UI
  guide: string;
  elements: string;
  important: string;
  beforeYouStart: string;
  commonTasks: string;
  nextSteps: string;
  elementSearchPlaceholder: string;
  noElementsFound: string;
  goToAssistant: string;
  relatedPageFallback: string;
  before: string;
  after: string;
  parallel: string;
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
    open: 'Help',
    title: 'Help Center',
    close: 'Close',
    manualTab: 'Manual',
    assistantTab: 'Assistant',
    placeholder: 'Type your question...',
    send: 'Send',
    sending: 'Sending...',
    clear: 'Clear',
    noMessages: 'Ask what to do on this page or share your exact error.',
    confidence: 'Confidence',
    alternatives: 'Alternatives',
    related: 'Related Pages',
    sources: 'Sources',
    escalation: 'Escalation',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    selectedErrorDropped:
      'Selected error could not be attached. Please re-select it and try again.',
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
    manualSearchTitle: 'Manual Search',
    manualSearchPlaceholder: 'Search guide content for this page...',
    manualSearchAll: 'All',
    manualSearchWorkflow: 'Workflow',
    manualSearchErrors: 'Errors',
    manualSearchPermissions: 'Permissions',
    pageGuide: 'Page Guide',
    oneLineSummary: 'One-line summary',
    whatFirst: 'What first?',
    explainSimply: 'Explain simply',
    troubleshoot: 'Troubleshoot',
    writeManual: 'Write manual draft',
    writeManualHint: 'Generate draft text',
    improveManual: 'Improve manual draft',
    improveManualHint: 'Generate better wording',
    designFlow: 'Design flow',
    designFlowHint: 'Generate RBAC draft',
    commonErrors: 'Common errors',
    permissions: 'Permissions',
    moreDetails: 'More details',
    audience: 'Audience',
    prerequisites: 'Prerequisites',
    workflow: 'Workflow',
    relatedPages: 'Related pages',
    route: 'Route',
    noGuideTitle: 'Manual entry not found',
    noGuideBody: 'This page is in scope, but no guide entry was found yet.',
    roleLabel: 'Role',
    branchLabel: 'Branch',
    pageLabel: 'Page',
    assistantPromptExplain: 'Explain this page simply and clearly.',
    assistantPromptFirst: 'What should I do first on this page? Give me the safest path.',
    assistantPromptTroubleshoot:
      'I got an error on this page. Ask me for the exact error and help troubleshoot.',
    assistantPromptWriteManual:
      'Write a short draft manual section for this page using clear numbered steps.',
    assistantPromptImproveManual:
      'Improve this manual draft with clearer wording and better troubleshooting checks.',
    assistantPromptDesignFlow:
      'Design a permissions and approvals flow for this page with role accountability.',
    generateDraft: 'Generate draft',
    notSaved: 'Not saved automatically',
    guide: 'Guide',
    elements: 'Elements',
    important: 'Important',
    beforeYouStart: 'Before you start',
    commonTasks: 'Common tasks',
    nextSteps: 'Next steps',
    elementSearchPlaceholder: 'Search elements...',
    noElementsFound: 'No elements match your search.',
    goToAssistant: '→ Ask AI',
    relatedPageFallback: 'Related page',
    before: 'Before',
    after: 'After',
    parallel: 'Also see',
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
    open: 'Msaada',
    title: 'Kituo cha Msaada',
    close: 'Funga',
    manualTab: 'Mwongozo',
    assistantTab: 'Msaidizi',
    placeholder: 'Andika swali lako...',
    send: 'Tuma',
    sending: 'Inatuma...',
    clear: 'Futa',
    noMessages: 'Uliza hatua ya kufanya kwenye ukurasa huu au tuma kosa kamili.',
    confidence: 'Uhakika',
    alternatives: 'Njia mbadala',
    related: 'Kurasa husika',
    sources: 'Vyanzo',
    escalation: 'Msaada wa ziada',
    low: 'Chini',
    medium: 'Wastani',
    high: 'Juu',
    selectedErrorDropped:
      'Kosa ulilochagua halikuweza kuunganishwa. Chagua tena kisha ujaribu tena.',
    depthSimple: 'Rahisi',
    depthStandard: 'Kawaida',
    depthDetailed: 'Kwa kina',
    explainMore: 'Fafanua zaidi',
    recentErrors: 'Makosa ya hivi karibuni',
    recentErrorsAuto: 'Hakuna kosa lililochaguliwa',
    recentErrorsNone: 'Hakuna kosa la hivi karibuni kwa ukurasa huu',
    recentErrorsAskWithout: 'Uliza bila kosa',
    recentErrorsSelectPrompt:
      'Kuna makosa mengi yanayolingana na ukurasa huu. Chagua moja kwanza.',
    manualSearchTitle: 'Tafuta Mwongozo',
    manualSearchPlaceholder: 'Tafuta maudhui ya mwongozo kwa ukurasa huu...',
    manualSearchAll: 'Yote',
    manualSearchWorkflow: 'Hatua za kazi',
    manualSearchErrors: 'Makosa',
    manualSearchPermissions: 'Ruhusa',
    pageGuide: 'Mwongozo wa ukurasa',
    oneLineSummary: 'Muhtasari mfupi',
    whatFirst: 'Nianze na nini?',
    explainSimply: 'Eleza kwa urahisi',
    troubleshoot: 'Tatua kosa',
    writeManual: 'Andika rasimu ya mwongozo',
    writeManualHint: 'Tengeneza rasimu',
    improveManual: 'Boresha rasimu ya mwongozo',
    improveManualHint: 'Boresha maandishi',
    designFlow: 'Tengeneza mtiririko',
    designFlowHint: 'Rasimu ya RBAC',
    commonErrors: 'Makosa ya kawaida',
    permissions: 'Ruhusa',
    moreDetails: 'Maelezo zaidi',
    audience: 'Walengwa',
    prerequisites: 'Masharti ya awali',
    workflow: 'Hatua za kazi',
    relatedPages: 'Kurasa husika',
    route: 'Njia',
    noGuideTitle: 'Ingizo la mwongozo halijapatikana',
    noGuideBody: 'Ukurasa upo kwenye wigo lakini mwongozo wake haujapatikana bado.',
    roleLabel: 'Wajibu',
    branchLabel: 'Tawi',
    pageLabel: 'Ukurasa',
    assistantPromptExplain: 'Eleza ukurasa huu kwa urahisi na uwazi.',
    assistantPromptFirst: 'Nianze na nini kwanza kwenye ukurasa huu? Nipe njia salama.',
    assistantPromptTroubleshoot:
      'Nimepata kosa kwenye ukurasa huu. Niulize kosa kamili kisha nisaidie kulitatua.',
    assistantPromptWriteManual:
      'Andika rasimu fupi ya mwongozo kwa ukurasa huu kwa hatua zilizo wazi.',
    assistantPromptImproveManual:
      'Boresha rasimu ya mwongozo kwa maneno rahisi na ukaguzi bora wa makosa.',
    assistantPromptDesignFlow:
      'Tengeneza mtiririko wa ruhusa na approvals kwa uwajibikaji wa majukumu.',
    generateDraft: 'Tengeneza rasimu',
    notSaved: 'Haihifadhiwi moja kwa moja',
    guide: 'Mwongozo',
    elements: 'Vipengele',
    important: 'Muhimu',
    beforeYouStart: 'Kabla hujaanza',
    commonTasks: 'Kazi za kawaida',
    nextSteps: 'Hatua zinazofuata',
    elementSearchPlaceholder: 'Tafuta vipengele...',
    noElementsFound: 'Hakuna vipengele vinavyolingana na utafutano wako.',
    goToAssistant: '→ Uliza AI',
    relatedPageFallback: 'Ukurasa husika',
    before: 'Kabla',
    after: 'Baada',
    parallel: 'Angalia pia',
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

const STORAGE_KEY = 'nvi.supportChat.messages.v1';
const HELP_TAB_KEY = 'nvi.helpCenter.activeTab.v1';
const HELP_DETAILS_KEY = 'nvi.helpCenter.manualDetailsOpen.v1';
const ASK_WITHOUT_ERROR = '__ask_without_error__';
const PERMISSION_CODE_PATTERN = /\(([a-z0-9._-]+)\)/gi;

function extractPermissionCodes(check: string) {
  const matches = check.matchAll(PERMISSION_CODE_PATTERN);
  return [...matches].map((match) => match[1]);
}

function inferRoleLabel(
  roleIds: string[] | undefined,
  permissions: string[] | undefined,
  locale: ManualLocale,
  roleNamesById?: Record<string, string>,
) {
  if (Array.isArray(roleIds) && roleIds.length > 0) {
    for (const roleId of roleIds) {
      const resolvedName = roleNamesById?.[roleId];
      if (resolvedName) {
        return resolvedName;
      }
    }
    const firstRole = roleIds[0];
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      firstRole,
    );
    if (!isUuid) {
      return firstRole
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }
  }
  const set = new Set(permissions ?? []);
  if (set.has('roles.update') || set.has('settings.write') || set.has('users.update')) {
    return locale === 'sw' ? 'Msimamizi' : 'Admin';
  }
  if (set.has('approvals.write') || set.has('sales.write') || set.has('purchases.write')) {
    return locale === 'sw' ? 'Meneja' : 'Manager';
  }
  return locale === 'sw' ? 'Mtumiaji' : 'Staff';
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

function readStoredTab() {
  if (typeof window === 'undefined') {
    return 'manual' as HelpTab;
  }
  const raw = window.localStorage.getItem(HELP_TAB_KEY);
  return raw === 'assistant' ? 'assistant' : 'manual';
}

function readStoredDetailsOpen() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(HELP_DETAILS_KEY) === 'true';
}

function confidenceLabel(value: 'high' | 'medium' | 'low', copy: Copy) {
  if (value === 'high') return copy.high;
  if (value === 'medium') return copy.medium;
  return copy.low;
}

function confidencePillTone(value: 'high' | 'medium' | 'low') {
  if (value === 'high') {
    return {
      pill: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
      dot: 'bg-emerald-300',
    };
  }
  if (value === 'medium') {
    return {
      pill: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
      dot: 'bg-amber-300',
    };
  }
  return {
    pill: 'border-rose-400/40 bg-rose-500/10 text-rose-200',
    dot: 'bg-rose-300',
  };
}

function confidenceBorderColor(value: 'high' | 'medium' | 'low') {
  if (value === 'high') return 'rgba(52,211,153,0.6)';
  if (value === 'medium') return 'rgba(251,191,36,0.6)';
  return 'rgba(251,113,133,0.6)';
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

const ELEMENT_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  button: { label: 'Button', className: 'bg-blue-500/10 text-blue-400' },
  input: { label: 'Input', className: 'bg-slate-400/15 text-slate-400' },
  dropdown: { label: 'Dropdown', className: 'bg-purple-500/10 text-purple-400' },
  select: { label: 'Select', className: 'bg-purple-500/10 text-purple-400' },
  toggle: { label: 'Toggle', className: 'bg-orange-500/10 text-orange-400' },
  table: { label: 'Table', className: 'bg-green-500/10 text-green-400' },
  card: { label: 'Card', className: 'bg-indigo-500/10 text-indigo-400' },
  link: { label: 'Link', className: 'bg-teal-500/10 text-teal-400' },
  search: { label: 'Search', className: 'bg-sky-500/10 text-sky-400' },
};

export function SupportChatWidget() {
  const pathname = usePathname();
  const permissionCatalog = useTranslations('permissions');
  const recentErrors = useSupportChatRecentErrors();
  const activeBranch = useActiveBranch();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HelpTab>(() => readStoredTab());
  const [manualQuery, setManualQuery] = useState('');
  const [manualFilter, setManualFilter] = useState<ManualFilter>('all');
  const [question, setQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredMessages());
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(() => readStoredDetailsOpen());
  const [roleNamesById, setRoleNamesById] = useState<Record<string, string>>({});
  const [manualMode, setManualMode] = useState<ManualMode>('guide');
  const [elementSearch, setElementSearch] = useState('');
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const elementSearchRef = useRef<HTMLInputElement | null>(null);
  const [detached, setDetached] = useState(false);
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 });
  const dragOriginRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const drawerRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  const locale = useMemo<ManualLocale>(() => {
    const segment = pathname.split('/').filter(Boolean)[0];
    return segment === 'sw' ? 'sw' : 'en';
  }, [pathname]);

  const copy = COPY[locale];

  const elementLabelMap: Record<string, string> = {
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

  const hasValidToken = () => {
    const t = getAccessToken();
    if (!t) return false;
    const payload = decodeJwt<{ exp?: number }>(t);
    if (typeof payload?.exp !== 'number') return true;
    return payload.exp >= Math.floor(Date.now() / 1000);
  };

  const token = typeof window !== 'undefined' ? getAccessToken() : null;
  const tokenPayload = token
    ? decodeJwt<{
        businessId?: string;
        roleIds?: string[];
        permissions?: string[];
      }>(token)
    : null;

  const roleLabel = useMemo(
    () =>
      inferRoleLabel(
        tokenPayload?.roleIds,
        tokenPayload?.permissions,
        locale,
        roleNamesById,
      ),
    [locale, roleNamesById, tokenPayload?.permissions, tokenPayload?.roleIds],
  );
  const tokenBusinessId = tokenPayload?.businessId ?? null;

  const inScope = isManualInScopePath(pathname);
  const entry = useMemo(() => resolveManualEntry(pathname, locale), [locale, pathname]);
  const dataset = useMemo(() => getManualDataset(locale), [locale]);
  const entryAudience = entry?.audience ?? [];
  const entryPrerequisites =
    entry?.prerequisites ??
    (entry?.before_you_start ?? []).map((item) => ({ check: item.text, required: true as const }));
  const entryWorkflow =
    entry?.workflow ??
    (entry?.common_tasks ?? []).map((task) => ({ step: task.task }));
  const entryCommonErrors = entry?.common_errors ?? [];

  const permissionRows = useMemo(() => {
    if (!entry) {
      return [];
    }
    const explicit = entry.permissions_required ?? [];
    const inferred = entryPrerequisites.flatMap((item) =>
      extractPermissionCodes(item.check),
    );
    const codes = Array.from(new Set([...explicit, ...inferred]));
    return codes.map((code) => {
      const meta = PERMISSION_CATALOG.find((perm) => perm.code === code);
      if (!meta) {
        return {
          code,
          title: code,
          description: locale === 'sw' ? 'Haijapatikana kwenye katalogi' : 'Not found in catalog',
        };
      }
      return {
        code,
        title: permissionCatalog(`${meta.labelKey}.title`),
        description: permissionCatalog(`${meta.descriptionKey}.description`),
      };
    });
  }, [entry, entryPrerequisites, locale, permissionCatalog]);

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
    window.localStorage.setItem(HELP_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(HELP_DETAILS_KEY, String(detailsOpen));
  }, [detailsOpen]);

  useEffect(() => {
    if (!open) {
      return;
    }
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (detached || event.key !== 'Tab' || !drawerRef.current) {
        return;
      }
      const focusables = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'));
      if (!focusables.length) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      return;
    }
    if (returnFocusRef.current) {
      returnFocusRef.current.focus();
    } else if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open || activeTab !== 'assistant') {
      return;
    }
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight });
  }, [activeTab, messages, open]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const onHandoff = (event: Event) => {
      const custom = event as CustomEvent<SupportChatHandoffPayload>;
      const nextQuestion = custom.detail?.question?.trim();
      if (!nextQuestion || !hasValidToken()) {
        return;
      }
      setOpen(true);
      setActiveTab('assistant');
      setQuestion(nextQuestion);
    };
    const onOpen = (event: Event) => {
      if (!hasValidToken()) {
        return;
      }
      const custom = event as CustomEvent<HelpCenterOpenPayload>;
      const tab = custom.detail?.tab;
      const nextQuestion = custom.detail?.question?.trim();
      setOpen(true);
      setActiveTab(tab === 'assistant' ? 'assistant' : 'manual');
      if (nextQuestion) {
        setQuestion(nextQuestion);
      }
    };
    window.addEventListener(SUPPORT_CHAT_HANDOFF_EVENT, onHandoff);
    window.addEventListener(HELP_CENTER_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(SUPPORT_CHAT_HANDOFF_EVENT, onHandoff);
      window.removeEventListener(HELP_CENTER_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    setManualMode('guide');
    setElementSearch('');
    setExpandedTask(null);
  }, [activeTab, open]);

  useEffect(() => {
    if (!open) {
      setDetached(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && activeTab === 'manual' && manualMode === 'elements') {
      setTimeout(() => elementSearchRef.current?.focus(), 50);
    }
  }, [manualMode, open, activeTab]);

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

  useEffect(() => {
    const roleIds = tokenPayload?.roleIds ?? [];
    if (!token || !open || roleIds.length === 0) {
      return;
    }
    const missingRoleIds = roleIds.filter((roleId) => !roleNamesById[roleId]);
    if (!missingRoleIds.length) {
      return;
    }
    let cancelled = false;
    const loadRoleNames = async () => {
      try {
        const data = await apiFetch<
          | { items?: Array<{ id: string; name: string }> }
          | Array<{ id: string; name: string }>
        >('/roles?limit=200', { token });
        const roles = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
        if (cancelled || !roles.length) {
          return;
        }
        setRoleNamesById((prev) => {
          const next = { ...prev };
          for (const role of roles) {
            if (typeof role.id === 'string' && typeof role.name === 'string' && role.name.trim()) {
              next[role.id] = role.name.trim();
            }
          }
          return next;
        });
      } catch {
        // Fallback keeps permission-based inference when roles API is unavailable.
      }
    };
    void loadRoleNames();
    return () => {
      cancelled = true;
    };
  }, [open, roleNamesById, token, tokenPayload?.roleIds]);

  const askFromManual = (text: string) => {
    setActiveTab('assistant');
    setQuestion(text);
  };

  const handleDetach = () => {
    const x = typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 520) : 20;
    setFloatPos({ x, y: 20 });
    setDetached(true);
  };

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!detached) return;
    e.preventDefault();
    const origin = { mx: e.clientX, my: e.clientY, px: floatPos.x, py: floatPos.y };
    dragOriginRef.current = origin;
    const onMove = (me: MouseEvent) => {
      if (!dragOriginRef.current) return;
      setFloatPos({
        x: dragOriginRef.current.px + (me.clientX - dragOriginRef.current.mx),
        y: dragOriginRef.current.py + (me.clientY - dragOriginRef.current.my),
      });
    };
    const onUp = () => {
      dragOriginRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const manualTextBlob = useMemo(() => {
    if (!entry) {
      return '';
    }
    return [
      entry.title,
      entry.purpose,
      entry.overview,
      entryAudience.join(' '),
      ...entryWorkflow.map((item) => item.step),
      ...(entry?.common_tasks ?? []).flatMap((task) => [task.task, ...task.steps]),
      ...(entry?.elements ?? []).map((el) => `${el.name} ${el.description}`),
      ...(entry?.before_you_start ?? []).map((item) => item.text),
      ...(entry?.warnings ?? []),
      ...entryCommonErrors.map(
        (item) => `${item.error_code} ${item.error_symptom} ${item.likely_cause}`,
      ),
      ...permissionRows.map((item) => `${item.title} ${item.description}`),
    ]
      .join(' ')
      .toLowerCase();
  }, [entry, entryAudience, entryCommonErrors, entryWorkflow, permissionRows]);

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

  const matchesQuery = (extraText?: string) => {
    const query = manualQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return (extraText ?? manualTextBlob).includes(query);
  };

  const showWorkflow = (manualFilter === 'all' || manualFilter === 'workflow') && matchesQuery();
  const showErrors = (manualFilter === 'all' || manualFilter === 'errors') && matchesQuery();
  const showPermissions =
    (manualFilter === 'all' || manualFilter === 'permissions') && matchesQuery();

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
        : 'standard';
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
        ref={triggerRef}
        type="button"
        onClick={() => { if (hasValidToken()) setOpen(true); }}
        className="fixed bottom-6 right-4 z-40 h-12 w-12 rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent)] text-black shadow-[0_18px_34px_rgba(0,0,0,0.45)] md:h-14 md:w-14"
        aria-label={copy.open}
      >
        ?
      </button>

      {open ? (
        <>
          {!detached && (
            <div
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
          )}
          <aside
            ref={drawerRef}
            style={detached ? { left: floatPos.x, top: floatPos.y } : undefined}
            className={
              detached
                ? 'fixed z-50 flex h-[600px] w-[480px] flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] [background-image:radial-gradient(80rem_22rem_at_15%_-10%,rgba(246,211,122,0.09),transparent_60%),radial-gradient(70rem_20rem_at_95%_0%,rgba(90,215,209,0.09),transparent_60%)] text-[color:var(--foreground)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]'
                : 'fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col border-l border-[color:var(--border)] bg-[color:var(--surface)] [background-image:radial-gradient(80rem_22rem_at_15%_-10%,rgba(246,211,122,0.09),transparent_60%),radial-gradient(70rem_20rem_at_95%_0%,rgba(90,215,209,0.09),transparent_60%)] text-[color:var(--foreground)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]'
            }
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            aria-label={copy.title}
          >
            <div
              className={`border-b border-[color:var(--border)] px-4 py-4${detached ? ' cursor-grab select-none active:cursor-grabbing' : ''}`}
              onMouseDown={handleDragStart}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <h2 className="text-lg font-semibold">{copy.title}</h2>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-[color:var(--border)] px-2 py-1">
                      {copy.pageLabel}: <b>{entry?.title ?? pathname}</b>
                    </span>
                    <span className="rounded-full border border-[color:var(--border)] px-2 py-1">
                      {copy.branchLabel}: <b>{activeBranch?.name ?? 'All'}</b>
                    </span>
                    <span className="rounded-full border border-[color:var(--border)] px-2 py-1">
                      {copy.roleLabel}: <b>{roleLabel}</b>
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={detached ? () => setDetached(false) : handleDetach}
                    title={
                      detached
                        ? locale === 'sw' ? 'Rejesha nafasi' : 'Snap back'
                        : locale === 'sw' ? 'Fungua dirisha' : 'Pop out'
                    }
                    className="rounded border border-[color:var(--border)] p-1 opacity-60 transition-opacity hover:opacity-100"
                  >
                    {detached ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <rect x="2" y="2" width="10" height="10" rx="1" />
                        <path d="M5 7h4" />
                        <path d="M7 5v4" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <rect x="1" y="4" width="8" height="8" rx="1" />
                        <path d="M7 1h6v6" />
                        <path d="M8 6L13 1" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setOpen(false)}
                    className="rounded border border-[color:var(--border)] px-2 py-1 text-xs"
                  >
                    {copy.close}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    activeTab === 'manual'
                      ? 'border-gold-300/70 bg-gold-300/20 text-gold-100 shadow-[0_10px_24px_rgba(0,0,0,0.35)]'
                      : 'border-[color:var(--border)] text-[color:var(--foreground)]'
                  }`}
                >
                  {copy.manualTab}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('assistant')}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    activeTab === 'assistant'
                      ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-100 shadow-[0_10px_24px_rgba(0,0,0,0.35)]'
                      : 'border-[color:var(--border)] text-[color:var(--foreground)]'
                  }`}
                >
                  {copy.assistantTab}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'manual' ? (
                <div className="flex h-full flex-col">
                  {/* Manual sub-mode switcher */}
                  <div className="flex shrink-0 items-center gap-1 border-b border-[color:var(--border)] px-3 py-2">
                    {(['guide', 'elements'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setManualMode(m)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          manualMode === m
                            ? 'bg-[color:var(--foreground)] text-[color:var(--surface)]'
                            : 'text-[color:var(--muted)] hover:bg-[color:var(--surface-soft)]'
                        }`}
                      >
                        {m === 'guide' ? copy.guide : copy.elements}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setActiveTab('assistant')}
                      className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--muted)] hover:bg-[color:var(--surface-soft)]"
                    >
                      {copy.goToAssistant}
                    </button>
                  </div>

                  {/* Mode content */}
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {entry ? (
                      <>
                        {/* ── GUIDE MODE ── */}
                        {manualMode === 'guide' && (
                          <div>
                            {/* Title + overview */}
                            <div className="px-4 py-4">
                              <p className="text-[15px] font-semibold leading-snug">{entry.title}</p>
                              <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted)]">
                                {entry.overview ?? entry.purpose}
                              </p>
                            </div>

                            {/* Warnings — always visible, never collapsed */}
                            {entry.warnings?.length ? (
                              <div className="mx-4 mb-1 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-500">
                                  {copy.important}
                                </p>
                                <ul className="space-y-1.5">
                                  {entry.warnings.map((w, i) => (
                                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-amber-200/90">
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
                                            onClick={() => setOpen(false)}
                                          >
                                            → {titleByRoute.get(item.link) ?? titleByRoute.get(materializeLocaleRoute(item.link, locale)) ?? copy.relatedPageFallback}
                                          </Link>
                                        ) : null}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {/* Common tasks — expandable cards */}
                            {entry.common_tasks?.length ? (
                              <div className="border-t border-[color:var(--border)] px-4 py-4">
                                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[color:var(--muted)]">
                                  {copy.commonTasks}
                                </p>
                                <div className="space-y-2">
                                  {entry.common_tasks.map((task, tIdx) => (
                                    <div
                                      key={tIdx}
                                      className="overflow-hidden rounded-xl border border-[color:var(--border)]"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setExpandedTask(expandedTask === tIdx ? null : tIdx)}
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

                            {/* Next steps / related pages */}
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
                                        {rel.order === 'before' ? copy.before : rel.order === 'after' ? copy.after : copy.parallel}
                                      </span>
                                      <Link
                                        href={materializeLocaleRoute(rel.route, locale)}
                                        className="underline"
                                        onClick={() => setOpen(false)}
                                      >
                                        {titleById.get(rel.id) ?? copy.relatedPageFallback}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {/* ── ELEMENTS MODE ── */}
                        {manualMode === 'elements' && (
                          <div className="flex h-full flex-col">
                            <div className="shrink-0 border-b border-[color:var(--border)] px-4 py-3">
                              <input
                                ref={elementSearchRef}
                                type="text"
                                value={elementSearch}
                                onChange={(e) => setElementSearch(e.target.value)}
                                placeholder={copy.elementSearchPlaceholder}
                                className="w-full rounded-xl border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--foreground)]"
                              />
                            </div>
                            {filteredElements.length ? (
                              <ul className="divide-y divide-[color:var(--border)]">
                                {filteredElements.map((el, i) => (
                                  <li key={i} className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ELEMENT_TYPE_STYLES[el.type]?.className ?? 'bg-[color:var(--surface-soft)] text-[color:var(--muted)]'}`}
                                      >
                                        {elementLabelMap[el.type] ?? el.type}
                                      </span>
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
                                {copy.noElementsFound}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="px-4 py-6 text-sm">
                        <p className="font-semibold">{copy.noGuideTitle}</p>
                        <p className="mt-2 text-[color:var(--muted)]">{copy.noGuideBody}</p>
                        <p className="mt-2 font-mono text-xs text-[color:var(--muted)]">{pathname}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[420px] flex-col gap-3">
                  <div className="rounded-2xl border border-[color:var(--border)] p-3">
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      {copy.recentErrors}
                    </p>
                    {relevantRecentErrors.length === 0 ? (
                      <p className="text-xs text-[color:var(--muted)]">{copy.recentErrorsNone}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedErrorId(null)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            !selectedErrorId
                              ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                              : 'border-[color:var(--border)] text-[color:var(--muted)] hover:border-[color:var(--foreground)]/40 hover:text-[color:var(--foreground)]'
                          }`}
                        >
                          {copy.recentErrorsAuto}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedErrorId(ASK_WITHOUT_ERROR)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            selectedErrorId === ASK_WITHOUT_ERROR
                              ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                              : 'border-[color:var(--border)] text-[color:var(--muted)] hover:border-[color:var(--foreground)]/40 hover:text-[color:var(--foreground)]'
                          }`}
                        >
                          {copy.recentErrorsAskWithout}
                        </button>
                        {relevantRecentErrors.map((error) => {
                          const code = error.error_code ?? (locale === 'sw' ? 'KOSA' : 'ERROR');
                          const isActive = selectedErrorId === error.id;
                          return (
                            <button
                              key={error.id}
                              type="button"
                              onClick={() => setSelectedErrorId(error.id)}
                              title={formatErrorOptionLabel(error, locale)}
                              className={`max-w-[180px] truncate rounded-full border px-2.5 py-1 text-[11px] font-mono font-semibold transition-colors ${
                                isActive
                                  ? 'border-rose-400/60 bg-rose-500/10 text-rose-200'
                                  : 'border-[color:var(--border)] text-[color:var(--muted)] hover:border-rose-400/40 hover:text-rose-200'
                              }`}
                            >
                              {code}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div
                    ref={chatLogRef}
                    className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-[color:var(--border)] p-3"
                  >
                    {messages.length === 0 ? (
                      <div className="rounded-xl border border-[color:var(--border)] p-3 text-sm text-[color:var(--muted)]">
                        {copy.noMessages}
                      </div>
                    ) : null}
                    {messages.map((message) =>
                      message.role === 'user' ? (
                        /* ── User bubble ── */
                        <div
                          key={message.id}
                          className="ml-auto max-w-[88%] rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm break-words [overflow-wrap:anywhere] [animation:nvi-fade-slide-up_0.2s_ease-out]"
                        >
                          {message.text}
                        </div>
                      ) : (
                        /* ── Assistant bubble ── */
                        <div
                          key={message.id}
                          style={{ borderLeftColor: confidenceBorderColor(message.response.confidence) }}
                          className="max-w-[94%] rounded-xl border border-l-2 border-[color:var(--border)] px-3 py-3 text-sm break-words [overflow-wrap:anywhere] [animation:nvi-fade-slide-up_0.2s_ease-out]"
                        >
                          {/* Error code chip — troubleshoot only */}
                          {message.intent === 'troubleshoot_error' &&
                          message.depth !== 'simple' &&
                          extractDetectedErrorCode(
                            message.response.diagnosis.evidence,
                            message.response.diagnosis.error_interpretation,
                          ) ? (
                            <div className="mb-2.5 inline-flex max-w-full rounded border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2 py-1 text-[11px] font-mono font-semibold break-all">
                              {extractDetectedErrorCode(
                                message.response.diagnosis.evidence,
                                message.response.diagnosis.error_interpretation,
                              )}
                            </div>
                          ) : null}

                          {/* Main narrative */}
                          <p className="leading-relaxed">{message.response.summary}</p>

                          {/* Steps — numbered step cards */}
                          {message.response.steps.length > 0 ? (
                            <div className="mt-3 space-y-1.5">
                              <p className="mb-2 text-xs text-[color:var(--muted)]">
                                {locale === 'sw' ? 'Hatua za kufuata:' : "Here's what to do:"}
                              </p>
                              {message.response.steps.map((step, i) => (
                                <div
                                  key={`${message.id}-step-${i}`}
                                  className="flex gap-2.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2.5 py-2"
                                >
                                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--foreground)]/10 text-[10px] font-bold text-[color:var(--foreground)]">
                                    {i + 1}
                                  </span>
                                  <span className="flex-1 text-xs leading-relaxed">{step}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {/* Alternatives */}
                          {message.response.alternatives.length > 0 ? (
                            <ul className="mt-3 list-disc space-y-1 pl-5 text-[color:var(--muted)]">
                              {message.response.alternatives.map((item, i) => (
                                <li key={`${message.id}-alt-${i}`}>{item}</li>
                              ))}
                            </ul>
                          ) : null}

                          {/* Related pages — route cards */}
                          {message.response.related_routes.length > 0 ? (
                            <div className="mt-3 space-y-1.5">
                              {message.response.related_routes.slice(0, 4).map((item, i) => {
                                const localizedRoute = materializeLocaleRoute(item.route, locale);
                                const routeTitle =
                                  titleByRoute.get(item.route) ??
                                  titleByRoute.get(localizedRoute) ??
                                  localizedRoute;
                                return (
                                  <Link
                                    key={`${message.id}-rel-${i}`}
                                    href={localizedRoute}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--border)] px-2.5 py-2 text-xs text-[color:var(--muted)] transition-colors hover:border-[color:var(--foreground)]/30 hover:text-[color:var(--foreground)]"
                                  >
                                    <span className="truncate">{routeTitle}</span>
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 opacity-50" aria-hidden="true">
                                      <path d="M2 5h6M5 2l3 3-3 3" />
                                    </svg>
                                  </Link>
                                );
                              })}
                            </div>
                          ) : null}

                          {/* Escalation notice with warning icon */}
                          {message.response.escalate ? (
                            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs">
                              <div className="flex items-center gap-1.5 font-semibold text-amber-200">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                  <path d="M6 1L11 10H1L6 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                                  <path d="M6 5v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                  <circle cx="6" cy="9" r="0.6" fill="currentColor" />
                                </svg>
                                {copy.escalation}
                              </div>
                              <p className="mt-1 text-[color:var(--muted)]">
                                {message.response.escalation_contact ?? '-'}
                              </p>
                            </div>
                          ) : null}

                          {/* Footer: explain more + confidence pill */}
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void send({
                                  overrideQuestion:
                                    locale === 'sw' ? 'Fafanua zaidi' : 'Explain more',
                                  overrideIntent: message.intent,
                                  overrideDepth: nextDepth(message.depth),
                                  baseQuestion: message.baseQuestion,
                                })
                              }
                              className="rounded border border-[color:var(--border)] px-2 py-1 text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                            >
                              {copy.explainMore}
                            </button>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                                confidencePillTone(message.response.confidence).pill
                              }`}
                            >
                              <span
                                className={`inline-block h-1.5 w-1.5 rounded-full ${
                                  confidencePillTone(message.response.confidence).dot
                                }`}
                              />
                              {confidenceLabel(message.response.confidence, copy)}
                            </span>
                          </div>
                        </div>
                      ),
                    )}

                    {/* Change 2 — Thinking animation bubble */}
                    {isSending && (
                      <div className="flex max-w-[94%] items-center gap-2.5 rounded-xl border border-l-2 border-[color:var(--border)] px-3 py-3 [animation:nvi-fade-slide-up_0.2s_ease-out]">
                        <span className="text-xs text-[color:var(--muted)]">
                          {locale === 'sw' ? 'Inafikiri...' : 'Thinking...'}
                        </span>
                        <span className="flex gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--muted)] [animation:nvi-dot-bounce_1.2s_ease-in-out_infinite]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--muted)] [animation:nvi-dot-bounce_1.2s_ease-in-out_0.2s_infinite]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--muted)] [animation:nvi-dot-bounce_1.2s_ease-in-out_0.4s_infinite]" />
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
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
                        className="min-h-[56px] flex-1 rounded-xl border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void send()}
                        disabled={isSending || !question.trim()}
                        className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        {isSending ? copy.sending : copy.send}
                      </button>
                    </div>
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
                  </div>
                </div>
              )}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
