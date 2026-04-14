'use client';

import AsyncSelect from 'react-select/async';
import type { SmartSelectOption } from './SmartSelect';

type AsyncSmartSelectProps = {
  instanceId: string;
  value: SmartSelectOption | null;
  loadOptions: (inputValue: string) => Promise<SmartSelectOption[]>;
  onChange: (option: SmartSelectOption | null) => void;
  placeholder?: string;
  isClearable?: boolean;
  isDisabled?: boolean;
  className?: string;
  /** Pass a static array to show immediately; pass true to call loadOptions('') on mount. Defaults to true. */
  defaultOptions?: boolean | SmartSelectOption[];
  noOptionsMessage?: () => string;
};

export function AsyncSmartSelect({
  instanceId,
  value,
  loadOptions,
  onChange,
  placeholder,
  isClearable,
  isDisabled,
  className,
  defaultOptions = true,
  noOptionsMessage,
}: AsyncSmartSelectProps) {
  return (
    <AsyncSelect
      instanceId={instanceId}
      className={className}
      classNamePrefix="nvi-select"
      value={value}
      loadOptions={loadOptions}
      defaultOptions={defaultOptions}
      cacheOptions
      placeholder={placeholder}
      isClearable={isClearable}
      isDisabled={isDisabled}
      noOptionsMessage={noOptionsMessage}
      menuPortalTarget={
        typeof document !== 'undefined' ? document.body : undefined
      }
      menuPosition="fixed"
      styles={{
        menuPortal: (base) => ({ ...base, zIndex: 300 }),
      }}
      onChange={(next) => onChange(next ?? null)}
    />
  );
}
