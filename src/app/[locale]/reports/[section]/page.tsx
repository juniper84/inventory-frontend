import { notFound } from 'next/navigation';
import { ReportsWorkspace } from '@/components/reports/ReportsWorkspace';
import { REPORT_SECTIONS, type ReportSection } from '@/components/reports/sections';

export default async function ReportsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!REPORT_SECTIONS.includes(section as ReportSection)) {
    notFound();
  }
  return <ReportsWorkspace section={section as ReportSection} />;
}
