'use client';

export const SUPPORT_CHAT_HANDOFF_EVENT = 'nvi.supportChat.handoff';

export type SupportChatHandoffPayload = {
  question: string;
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
