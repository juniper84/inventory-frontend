import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { SectionPdfPayload, PdfKpi } from './pdf-context';

const COLORS = {
  ink: '#1a1f2c',
  muted: '#5b6478',
  border: '#e1e5ec',
  band: '#f5f6f8',
  gold: '#c69b3a',
  red: '#b91c1c',
  green: '#15803d',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLORS.ink,
  },
  headerWrap: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.gold,
    paddingBottom: 10,
    marginBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerEyebrow: {
    fontSize: 8,
    letterSpacing: 1.5,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
  },
  headerMeta: {
    fontSize: 8,
    color: COLORS.muted,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 12,
  },
  metaItem: { flexDirection: 'row', gap: 4 },
  metaLabel: { color: COLORS.muted, fontSize: 8 },
  metaValue: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 16,
    marginBottom: 6,
    color: COLORS.ink,
  },
  narrative: {
    fontSize: 10,
    marginBottom: 4,
  },
  narrativeSub: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 8,
  },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kpiCard: {
    width: '24%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  kpiLabel: {
    fontSize: 7,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  kpiValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  kpiSub: { fontSize: 7, color: COLORS.muted, marginTop: 2 },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  breakdownLabel: { fontSize: 9, flex: 1 },
  breakdownValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  breakdownSub: { fontSize: 7, color: COLORS.muted },
  table: { marginTop: 4, borderWidth: 1, borderColor: COLORS.border },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.band,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableHeaderCell: {
    flex: 1,
    padding: 4,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.muted,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  tableRowAlt: { backgroundColor: '#fafbfc' },
  tableCell: { flex: 1, padding: 4, fontSize: 8 },
  empty: { fontSize: 9, color: COLORS.muted, fontStyle: 'italic', padding: 6 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: COLORS.muted,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    paddingTop: 6,
  },
});

export type ReportPdfMeta = {
  businessName: string;
  sectionLabel: string;
  branchLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  currency: string;
  workspaceKpis: PdfKpi[];
};

type Props = {
  meta: ReportPdfMeta;
  sections: { id: string; label: string; payload: SectionPdfPayload }[];
  labels: {
    eyebrow: string;
    period: string;
    branch: string;
    generated: string;
    kpisHeading: string;
    breakdownsHeading: string;
    tablesHeading: string;
    footer: string;
    page: string;
    of: string;
    empty: string;
  };
};

function KpiGrid({ kpis }: { kpis: PdfKpi[] }) {
  if (!kpis.length) return null;
  return (
    <View style={styles.kpiRow}>
      {kpis.map((k, i) => (
        <View key={`${k.label}-${i}`} style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{k.label}</Text>
          <Text style={styles.kpiValue}>{k.value}</Text>
          {k.sub ? <Text style={styles.kpiSub}>{k.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function ReportPdfDocument({ meta, sections, labels }: Props) {
  return (
    <Document
      title={`${meta.sectionLabel} — ${meta.businessName}`}
      author={meta.businessName}
      creator="New Vision Inventory"
      producer="New Vision Inventory"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerWrap} fixed>
          <View style={styles.headerTitleRow}>
            <View>
              <Text style={styles.headerEyebrow}>{labels.eyebrow}</Text>
              <Text style={styles.headerTitle}>{meta.sectionLabel}</Text>
            </View>
            <View>
              <Text style={styles.headerMeta}>{meta.businessName}</Text>
              <Text style={styles.headerMeta}>
                {labels.generated}: {meta.generatedAt}
              </Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{labels.period}:</Text>
              <Text style={styles.metaValue}>
                {meta.startDate || '—'} → {meta.endDate || '—'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{labels.branch}:</Text>
              <Text style={styles.metaValue}>{meta.branchLabel}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Currency:</Text>
              <Text style={styles.metaValue}>{meta.currency}</Text>
            </View>
          </View>
        </View>

        {/* Workspace KPIs */}
        {meta.workspaceKpis.length ? (
          <>
            <Text style={styles.sectionTitle}>{labels.kpisHeading}</Text>
            <KpiGrid kpis={meta.workspaceKpis} />
          </>
        ) : null}

        {/* Each section's payload */}
        {sections.map((section) => {
          const { payload, label } = section;
          return (
            <View key={section.id} wrap>
              <Text style={styles.sectionTitle}>{label}</Text>
              {payload.headline ? (
                <Text style={styles.narrative}>{payload.headline}</Text>
              ) : null}
              {payload.subline ? (
                <Text style={styles.narrativeSub}>{payload.subline}</Text>
              ) : null}

              {payload.kpis?.length ? (
                <KpiGrid kpis={payload.kpis} />
              ) : null}

              {payload.breakdowns?.map((bd, i) => (
                <View key={`bd-${i}`} wrap={false}>
                  <Text style={styles.sectionTitle}>{bd.title}</Text>
                  {bd.rows.length ? (
                    bd.rows.map((row, idx) => (
                      <View key={`${row.label}-${idx}`} style={styles.breakdownRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.breakdownLabel}>{row.label}</Text>
                          {row.sub ? (
                            <Text style={styles.breakdownSub}>{row.sub}</Text>
                          ) : null}
                        </View>
                        <Text style={styles.breakdownValue}>{row.value}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.empty}>{bd.emptyMessage ?? labels.empty}</Text>
                  )}
                </View>
              ))}

              {payload.tables?.map((table, i) => (
                <View key={`tbl-${i}`} wrap>
                  <Text style={styles.sectionTitle}>{table.title}</Text>
                  {table.rows.length ? (
                    <View style={styles.table}>
                      <View style={styles.tableHeader} fixed>
                        {table.headers.map((h, hi) => (
                          <Text key={hi} style={styles.tableHeaderCell}>
                            {h}
                          </Text>
                        ))}
                      </View>
                      {table.rows.map((row, ri) => (
                        <View
                          key={ri}
                          style={[
                            styles.tableRow,
                            ri % 2 === 1 ? styles.tableRowAlt : {},
                          ]}
                        >
                          {row.map((cell, ci) => (
                            <Text key={ci} style={styles.tableCell}>
                              {cell}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.empty}>{table.emptyMessage ?? labels.empty}</Text>
                  )}
                </View>
              ))}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>{labels.footer}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${labels.page} ${pageNumber} ${labels.of} ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
