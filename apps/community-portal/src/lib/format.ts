export const today = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
export const timestamp = () => new Date().toISOString();
export const money = (n: number | string | undefined) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(Number(n) || 0);
export const date = (d: string | undefined) =>
  d
    ? new Intl.DateTimeFormat('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Australia/Sydney'
      }).format(new Date(d.length === 10 ? d + 'T12:00:00+11:00' : d))
    : '—';
