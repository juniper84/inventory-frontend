'use client';

export const SUPPORT_CHAT_HANDOFF_EVENT = 'nvi.supportChat.handoff';
export const HELP_CENTER_OPEN_EVENT = 'nvi.helpCenter.open';

export type SupportChatHandoffPayload = {
  question: string;
};

export type HelpCenterOpenPayload = {
  tab?: 'manual' | 'assistant';
  question?: string;
};

export function dispatchSupportChatHandoff(payload: SupportChatHandoffPayload) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<SupportChatHandoffPayload>(SUPPORT_CHAT_HANDOFF_EVENT, {
      detail: payload,
    }),
  );
}

export function dispatchHelpCenterOpen(payload?: HelpCenterOpenPayload) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<HelpCenterOpenPayload>(HELP_CENTER_OPEN_EVENT, {
      detail: payload ?? {},
    }),
  );
}
