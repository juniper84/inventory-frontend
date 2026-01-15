'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToastState } from '@/lib/app-notifications';
import {
  getAccessToken,
  getLastBusinessId,
  getOrCreateDeviceId,
  getRefreshToken,
  getStoredUser,
  setLastBusinessId,
  setTokens,
} from '@/lib/auth';
import { SmartSelect } from '@/components/SmartSelect';

type SwitchResponse = {
  accessToken: string;
  refreshToken: string;
};

type BusinessOption = {
  businessId: string;
  businessName: string;
  status: string;
};

export function BusinessSwitcher() {
  const [businessId, setBusinessId] = useState('');
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [, setMessage] = useToastState();

  useEffect(() => {
    const loadBusinesses = async () => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      try {
        const list = await apiFetch<BusinessOption[]>('/auth/businesses', {
          token,
        });
        setBusinesses(list);
        if (!businessId) {
          const last = getLastBusinessId();
          const match = list.find((item) => item.businessId === last);
          setBusinessId(match?.businessId ?? list[0]?.businessId ?? '');
        }
      } catch {
        setMessage('Failed to load businesses.');
      }
    };
    loadBusinesses();
  }, []);

  const onSwitch = async () => {
    setMessage(null);
    try {
      const token = getAccessToken();
      const response = await apiFetch<SwitchResponse>('/auth/switch-business', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify({ businessId, deviceId: getOrCreateDeviceId() }),
      });
      setTokens(response.accessToken, response.refreshToken);
      setLastBusinessId(businessId);
      setMessage('Switched business.');
    } catch (error) {
      setMessage('Switch failed. Please try again.');
    }
  };

  const user = getStoredUser();
  const hasSession = Boolean(getRefreshToken());

  if (!user || !hasSession) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gold-300">
      <SmartSelect
        instanceId="business-switcher"
        value={businessId}
        onChange={setBusinessId}
        options={businesses.map((biz) => ({
          value: biz.businessId,
          label: biz.businessName,
        }))}
        className="min-w-[180px] text-xs"
      />
      <button
        type="button"
        onClick={onSwitch}
        className="rounded bg-gold-500 px-2 py-1 text-black"
      >
        Switch
      </button>
    </div>
  );
}
