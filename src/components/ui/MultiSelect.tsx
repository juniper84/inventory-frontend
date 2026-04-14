'use client';

import Select, { GroupBase } from 'react-select';
import type { SmartSelectOption } from '../SmartSelect';

type MultiSelectProps = {
  values: string[];
  options: SmartSelectOption[] | GroupBase<SmartSelectOption>[];
  placeholder?: string;
  isClearable?: boolean;
  isDisabled?: boolean;
  onChange: (values: string[]) => void;
  className?: string;
  instanceId: string;
  noOptionsMessage?: () => string;
  maxItems?: number;
};

function flattenOptions(
  options: SmartSelectOption[] | GroupBase<SmartSelectOption>[],
): SmartSelectOption[] {
  if (!options.length) return [];
  if ('options' in options[0]) {
    return (options as GroupBase<SmartSelectOption>[]).flatMap((g) => g.options);
  }
  return options as SmartSelectOption[];
}

/**
 * Multi-value select. Extends the same react-select + nvi-select styling as SmartSelect.
 *
 * Usage:
 *   <MultiSelect
 *     instanceId="role-perms"
 *     values={selectedPerms}
 *     options={permOptions}
 *     onChange={setSelectedPerms}
 *     placeholder="Pick permissions..."
 *   />
 */
export function MultiSelect({
  values,
  options,
  placeholder,
  isClearable = true,
  isDisabled,
  onChange,
  className,
  instanceId,
  noOptionsMessage,
  maxItems,
}: MultiSelectProps) {
  const flat = flattenOptions(options);
  const selected = flat.filter((o) => values.includes(o.value));

  return (
    <Select
      isMulti
      instanceId={instanceId}
      className={className}
      classNamePrefix="nvi-select"
      options={options}
      value={selected}
      placeholder={placeholder}
      isClearable={isClearable}
      isDisabled={isDisabled}
      noOptionsMessage={noOptionsMessage}
      isOptionDisabled={() => maxItems != null && values.length >= maxItems}
      menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
      menuPosition="fixed"
      styles={{
        menuPortal: (base) => ({ ...base, zIndex: 120 }),
      }}
      onChange={(next) => onChange(next ? next.map((o) => o.value) : [])}
    />
  );
}
