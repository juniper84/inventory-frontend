'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/Checkbox';
import { AnalogToggle } from '@/components/analog';
import { useFormatDate } from '@/lib/business-context';
import {
  NOTIFICATION_GROUPS,
  NotificationGroupKey,
  NotificationEventKey,
  NotificationSettings,
} from '@/lib/notification-settings';
import type { useBusinessSettings } from '../hooks/useBusinessSettings';

type Props = { ctx: ReturnType<typeof useBusinessSettings> };

const CHANNEL_KEYS: ('email' | 'whatsapp')[] = ['email', 'whatsapp'];

const SYSTEM_ROLE_NAMES = ['System Owner'];

export function NotificationsTab({ ctx }: Props) {
  const t = useTranslations('businessSettingsPage');
  const eventLabels = useTranslations('notificationsEvents');
  const { formatDateTime } = useFormatDate();
  const d = ctx.draftSettings;
  if (!d) return null;

  const notif = d.notificationDefaults;
  const isEnterprise = ctx.subscription?.tier === 'ENTERPRISE';
  const selectableRoles = ctx.roles.filter((r) => !SYSTEM_ROLE_NAMES.includes(r.name));

  const updateNotif = (patch: Partial<NotificationSettings>) => {
    ctx.setDraftSettings({
      ...d,
      notificationDefaults: { ...notif, ...patch },
    });
  };

  const toggleChannel = (channel: 'email' | 'whatsapp', enabled: boolean) => {
    updateNotif({
      channels: { ...notif.channels, [channel]: enabled },
    });
  };

  const toggleGroupChannel = (groupKey: NotificationGroupKey, channel: 'email' | 'whatsapp') => {
    const current = notif.groups?.[groupKey]?.channels?.[channel] ?? false;
    updateNotif({
      groups: {
        ...notif.groups,
        [groupKey]: {
          ...notif.groups?.[groupKey],
          channels: {
            ...notif.groups?.[groupKey]?.channels,
            [channel]: !current,
          },
        },
      },
    });
  };

  const toggleEvent = (eventKey: NotificationEventKey, enabled: boolean) => {
    updateNotif({
      events: {
        ...notif.events,
        [eventKey]: { ...notif.events?.[eventKey], enabled },
      },
    });
  };

  const toggleEventChannel = (eventKey: NotificationEventKey, channel: 'email' | 'whatsapp') => {
    const eventSettings = notif.events?.[eventKey] ?? { enabled: true };
    const currentChannels = eventSettings.channels ?? {};
    const groupKey = (Object.entries(NOTIFICATION_GROUPS) as [NotificationGroupKey, string[]][])
      .find(([, events]) => events.includes(eventKey))?.[0];
    const groupDefault = groupKey ? (notif.groups?.[groupKey]?.channels?.[channel] ?? false) : false;
    const current = currentChannels[channel] ?? groupDefault;
    updateNotif({
      events: {
        ...notif.events,
        [eventKey]: {
          ...eventSettings,
          channels: { ...currentChannels, [channel]: !current },
        },
      },
    });
  };

  const toggleRecipientRole = (scope: 'global' | 'email' | 'whatsapp', roleId: string) => {
    const current = notif.recipients?.[scope];
    const roleIds = current?.roleIds ?? [];
    const updated = roleIds.includes(roleId) ? roleIds.filter((id) => id !== roleId) : [...roleIds, roleId];
    updateNotif({
      recipients: {
        ...notif.recipients,
        [scope]: { ...current, roleIds: updated },
      },
    });
  };

  const toggleRecipientUser = (scope: 'global' | 'email' | 'whatsapp', userId: string) => {
    const current = notif.recipients?.[scope];
    const userIds = current?.userIds ?? [];
    const updated = userIds.includes(userId) ? userIds.filter((id) => id !== userId) : [...userIds, userId];
    updateNotif({
      recipients: {
        ...notif.recipients,
        [scope]: { ...current, userIds: updated },
      },
    });
  };

  const toggleBranchScoped = (scoped: boolean) => {
    updateNotif({
      recipients: {
        ...notif.recipients,
        global: { ...notif.recipients?.global, branchScoped: scoped, roleIds: notif.recipients?.global?.roleIds ?? [], userIds: notif.recipients?.global?.userIds ?? [], includeOwners: true, includeManagers: false },
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Global channel toggles ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-blue-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
            <Bell size={18} className="text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-nvi-text-primary">{t('notificationChannelsTitle')}</h3>
          {ctx.sectionTimestamp('notifications') && (
            <span className="text-[10px] text-nvi-text-tertiary">{t('lastUpdated', { date: formatDateTime(ctx.sectionTimestamp('notifications')!) })}</span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* In-app — always on */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">{t('channelInApp') || 'In-App'}</p>
            <p className="mt-1 text-[10px] text-nvi-text-tertiary">{t('channelInAppHint') || 'Always active'}</p>
          </div>
          {/* Email */}
          <div className={`rounded-xl border p-3 ${notif.channels.email ? 'border-blue-500/20 bg-blue-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">{t('channelEmail') || 'Email'}</p>
              <AnalogToggle checked={notif.channels.email} disabled={!ctx.isEditing} onChange={(checked) => toggleChannel('email', checked)} />
            </div>
          </div>
          {/* WhatsApp */}
          <div className={`rounded-xl border p-3 ${notif.channels.whatsapp && isEnterprise ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">{t('channelWhatsApp') || 'WhatsApp'}</p>
              <AnalogToggle
                checked={notif.channels.whatsapp}
                disabled={!ctx.isEditing || !isEnterprise}
                onChange={(checked) => toggleChannel('whatsapp', checked)}
              />
            </div>
            {!isEnterprise && <p className="mt-1 text-[10px] text-amber-400">{t('upgradeRequired')}</p>}
          </div>
        </div>
      </Card>

      {/* ── Recipients ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('recipientsTitle') || 'Recipients'}</p>
        <p className="mb-4 text-[10px] text-nvi-text-tertiary">{t('recipientsHint') || 'Select which roles and individual users should receive notifications. Both selections are combined — anyone matching a selected role OR listed as a specific user will be notified.'}</p>

        {/* Branch scoped */}
        <label className="mb-4 flex items-center gap-2 text-sm text-nvi-text-secondary">
          <AnalogToggle
            checked={notif.recipients?.global?.branchScoped ?? false}
            disabled={!ctx.isEditing}
            onChange={toggleBranchScoped}
          />
          {t('notificationBranchScoped')}
        </label>

        {/* Roles */}
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('recipientRolesLabel') || 'Roles'}</p>
        <p className="mb-2 text-[10px] text-nvi-text-tertiary">{t('recipientOwnerAlwaysIncluded') || 'The business owner always receives notifications automatically.'}</p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 mb-4">
          {selectableRoles.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-xs text-nvi-text-secondary">
              <Checkbox
                checked={(notif.recipients?.global?.roleIds ?? []).includes(role.id)}
                disabled={!ctx.isEditing}
                onChange={() => toggleRecipientRole('global', role.id)}
              />
              {role.name}
            </label>
          ))}
        </div>

        {/* Users */}
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('recipientUsersLabel') || 'Specific users'}</p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {ctx.users.map((user) => (
            <label key={user.id} className="flex items-center gap-2 text-xs text-nvi-text-secondary">
              <Checkbox
                checked={(notif.recipients?.global?.userIds ?? []).includes(user.id)}
                disabled={!ctx.isEditing}
                onChange={() => toggleRecipientUser('global', user.id)}
              />
              {user.name} <span className="text-nvi-text-tertiary">({user.email})</span>
            </label>
          ))}
        </div>
      </Card>

      {/* ── Event matrix ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('eventMatrixTitle') || 'Event notifications'}</p>
        <p className="mb-4 text-[10px] text-nvi-text-tertiary">{t('eventMatrixHint') || 'Enable or disable individual events and choose which channels deliver them. Group-level toggles set the default for all events in that group — override per event below.'}</p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="pb-2 pr-4 text-nvi-text-tertiary font-semibold uppercase tracking-wide">{t('eventColumn') || 'Event'}</th>
                <th className="pb-2 px-3 text-center text-nvi-text-tertiary font-semibold uppercase tracking-wide w-16">{t('enabledColumn') || 'Enabled'}</th>
                {CHANNEL_KEYS.map((ch) => (
                  <th key={ch} className="pb-2 px-3 text-center text-nvi-text-tertiary font-semibold uppercase tracking-wide w-16">
                    {ch === 'email' ? (t('channelEmail') || 'Email') : (t('channelWhatsApp') || 'WhatsApp')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.entries(NOTIFICATION_GROUPS) as [NotificationGroupKey, NotificationEventKey[]][]).map(([groupKey, events]) => (
                <React.Fragment key={`group-${groupKey}`}>
                  {/* Group header row */}
                  <tr className="border-t border-white/[0.04]">
                    <td className="py-2 pr-4 font-semibold text-nvi-text-primary uppercase tracking-wide text-[10px]" colSpan={1}>
                      {t(`notificationGroup.${groupKey}`)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {/* In-app — always on for group */}
                      <span className="text-emerald-400 text-[10px]">ALL</span>
                    </td>
                    {CHANNEL_KEYS.map((ch) => (
                      <td key={ch} className="py-2 px-3 text-center">
                        <Checkbox
                          checked={notif.groups?.[groupKey]?.channels?.[ch] ?? false}
                          disabled={!ctx.isEditing || !notif.channels[ch] || (ch === 'whatsapp' && !isEnterprise)}
                          onChange={() => toggleGroupChannel(groupKey, ch)}
                        />
                      </td>
                    ))}
                  </tr>
                  {/* Individual event rows */}
                  {events.map((eventKey) => {
                    const eventEnabled = notif.events?.[eventKey]?.enabled !== false;
                    return (
                      <tr key={eventKey} className="hover:bg-white/[0.02]">
                        <td className="py-1.5 pr-4 pl-4">
                          <p className="text-nvi-text-secondary">{eventLabels(eventKey)}</p>
                          <p className="text-[10px] text-nvi-text-tertiary mt-0.5">{eventLabels(`${eventKey}Hint`)}</p>
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <Checkbox
                            checked={eventEnabled}
                            disabled={!ctx.isEditing}
                            onChange={() => toggleEvent(eventKey, !eventEnabled)}
                          />
                        </td>
                        {CHANNEL_KEYS.map((ch) => {
                          const groupDefault = notif.groups?.[groupKey]?.channels?.[ch] ?? false;
                          const eventChannelOverride = notif.events?.[eventKey]?.channels?.[ch];
                          const effectiveValue = eventChannelOverride ?? groupDefault;
                          const channelEnabled = notif.channels[ch];
                          return (
                            <td key={ch} className="py-1.5 px-3 text-center">
                              <Checkbox
                                checked={effectiveValue && channelEnabled}
                                disabled={!ctx.isEditing || !channelEnabled || !eventEnabled || (ch === 'whatsapp' && !isEnterprise)}
                                onChange={() => toggleEventChannel(eventKey, ch)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
