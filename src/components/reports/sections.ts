export const REPORT_SECTIONS = [
  'overview',
  'sales-profit',
  'customers',
  'inventory',
  'operations',
] as const;

export type ReportSection = (typeof REPORT_SECTIONS)[number];
