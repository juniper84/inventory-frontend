'use client';

import Select, { GroupBase } from 'react-select';

export type SmartSelectOption = {
  value: string;
  label: string;
};

type SmartSelectProps = {
  value: string;
  options: SmartSelectOption[] | GroupBase<SmartSelectOption>[];
  placeholder?: string;
  isClearable?: boolean;
  isDisabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  instanceId?: string;
};

function flattenOptions(
  options: SmartSelectOption[] | GroupBase<SmartSelectOption>[],
): SmartSelectOption[] {
  if (!options.length) {
    return [];
  }
  if ('options' in options[0]) {
    return (options as GroupBase<SmartSelectOption>[]).flatMap(
      (group) => group.options,
    );
  }
  return options as SmartSelectOption[];
}

export function SmartSelect({
  value,
  options,
  placeholder,
  isClearable,
  isDisabled,
  onChange,
  className,
  instanceId,
}: SmartSelectProps) {
  const flat = flattenOptions(options);
  const selected = flat.find((option) => option.value === value) ?? null;

  return (
    <Select
      instanceId={instanceId}
      className={className}
      classNamePrefix="nvi-select"
      options={options}
      value={selected}
      placeholder={placeholder}
      isClearable={isClearable}
      isDisabled={isDisabled}
      menuPortalTarget={
        typeof document !== 'undefined' ? document.body : undefined
      }
      menuPosition="fixed"
      styles={{
        menuPortal: (base) => ({ ...base, zIndex: 120 }),
      }}
      onChange={(next) => onChange(next?.value ?? '')}
    />
  );
}
