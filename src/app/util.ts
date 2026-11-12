const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d?: Date | null): string {
  if (!d) return 'TBC';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateShort(d?: Date | null): string {
  if (!d) return 'TBC';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function statusClass(status: string): string {
  return 'st-' + (status || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function severityClass(sev: string): string {
  return 'sev-' + (sev || '').toLowerCase().replace(/[^a-z]+/g, '');
}
