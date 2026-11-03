import type { ReportRow } from './backend/types.ts';
import { type PortalRecord } from './model.ts';

export function selectReportRows(
  records: PortalRecord[],
  from: string,
  to: string
): PortalRecord[] {
  if (from && to && from > to) return [];
  return records.filter(
    (record) => (!from || record.date >= from) && (!to || record.date <= to)
  );
}

export function downloadCsv(data: ReportRow[], name: string) {
  const keys = [
    ...new Set(
      data.flatMap((r) => Object.keys(r).filter((key) => key !== 'kind'))
    )
  ];
  const cell = (v: unknown) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const csv = [
    keys.map(cell).join(','),
    ...data.map((r) => keys.map((k) => cell(Reflect.get(r, k))).join(','))
  ].join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
