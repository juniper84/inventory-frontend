'use client';

import { ReactNode } from 'react';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';

export type DatePreset = {
  id: string;
  label: string;
  apply: () => { startDate: string; endDate: string };
};

export type FilterBarProps = {
  branchId: string;
  startDate: string;
  endDate: string;
  branches: { id: string; name: string }[];
  onBranchChange: (id: string) => void;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onPresetSelect: (preset: DatePreset) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  presets: DatePreset[];
  activePresetId?: string;
  labels: {
    allBranches: string;
    fromDate: string;
    toDate: string;
    refresh: string;
    refreshing: string;
  };
  extra?: ReactNode;
};

export function FilterBar({
  branchId,
  startDate,
  endDate,
  branches,
  onBranchChange,
  onStartChange,
  onEndChange,
  onPresetSelect,
  onRefresh,
  isRefreshing = false,
  presets,
  activePresetId,
  labels,
  extra,
}: FilterBarProps) {
  return (
    <div className="rpt-filter-bar">
      {/* Presets row */}
      <div className="rpt-filter-bar__presets">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPresetSelect(preset)}
              className={`rpt-preset ${isActive ? 'rpt-preset--active' : ''}`}
              disabled={isRefreshing}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="rpt-filter-bar__refresh"
        >
          {isRefreshing ? <Spinner size="xs" variant="orbit" /> : '↻'}
          <span>{isRefreshing ? labels.refreshing : labels.refresh}</span>
        </button>
      </div>

      {/* Inputs row */}
      <div className="rpt-filter-bar__inputs">
        <div className="rpt-filter-input">
          <SmartSelect
            instanceId="reports-branch"
            value={branchId}
            onChange={onBranchChange}
            placeholder={labels.allBranches}
            isDisabled={isRefreshing}
            options={[
              { value: 'ALL', label: labels.allBranches },
              ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
            ]}
          />
        </div>
        <div className="rpt-filter-input">
          <DatePickerInput
            value={startDate}
            onChange={onStartChange}
            placeholder={labels.fromDate}
            disabled={isRefreshing}
            className="rpt-filter-input__date"
          />
        </div>
        <div className="rpt-filter-input">
          <DatePickerInput
            value={endDate}
            onChange={onEndChange}
            placeholder={labels.toDate}
            disabled={isRefreshing}
            className="rpt-filter-input__date"
          />
        </div>
        {extra}
      </div>
    </div>
  );
}

/** Build standard date presets for the current timezone */
export function buildDatePresets(): DatePreset[] {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [
    {
      id: 'today',
      label: 'Today',
      apply: () => {
        const today = fmt(new Date());
        return { startDate: today, endDate: today };
      },
    },
    {
      id: '7d',
      label: 'Last 7 days',
      apply: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        return { startDate: fmt(start), endDate: fmt(end) };
      },
    },
    {
      id: '30d',
      label: 'Last 30 days',
      apply: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 29);
        return { startDate: fmt(start), endDate: fmt(end) };
      },
    },
    {
      id: 'mtd',
      label: 'This month',
      apply: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: fmt(start), endDate: fmt(now) };
      },
    },
    {
      id: 'lastMonth',
      label: 'Last month',
      apply: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { startDate: fmt(start), endDate: fmt(end) };
      },
    },
  ];
}

/** Detect which preset (if any) matches the current filter range */
export function detectActivePreset(
  startDate: string,
  endDate: string,
  presets: DatePreset[],
): string | undefined {
  if (!startDate || !endDate) return undefined;
  for (const p of presets) {
    const { startDate: ps, endDate: pe } = p.apply();
    if (ps === startDate && pe === endDate) return p.id;
  }
  return undefined;
}
