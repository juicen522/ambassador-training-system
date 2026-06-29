function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function toDatetimeLocal(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function visitDateYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function visitDateLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export function isoToTimeHm(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function combineDateAndTime(dateYmd: string, timeHm: string) {
  if (!dateYmd || !timeHm) return '';
  const dt = new Date(`${dateYmd}T${timeHm}`);
  if (Number.isNaN(dt.getTime())) return '';
  return toDatetimeLocal(dt.toISOString());
}

export function computeDurationHours(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round(((end - start) / 3600000) * 10) / 10;
}
