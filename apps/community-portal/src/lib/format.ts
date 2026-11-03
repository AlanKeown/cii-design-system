// Intl formatters are reusable and contain no workspace or user data. Initialize
// on first use so routes only pay for the formats they actually display.
let todayFormatter: Intl.DateTimeFormat | undefined;
let currencyFormatter: Intl.NumberFormat | undefined;
let dateFormatter: Intl.DateTimeFormat | undefined;
let monthFormatter: Intl.DateTimeFormat | undefined;

export const today = () =>
  (todayFormatter ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney'
  })).format(new Date());
export const timestamp = () => new Date().toISOString();
export const money = (n: number | string | undefined) =>
  (currencyFormatter ??= new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  })).format(Number(n) || 0);
export const date = (d: string | undefined) =>
  d
    ? (dateFormatter ??= new Intl.DateTimeFormat('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Australia/Sydney'
      })).format(new Date(d.length === 10 ? d + 'T12:00:00+11:00' : d))
    : '—';

export const month = (d: string) =>
  (monthFormatter ??= new Intl.DateTimeFormat('en-AU', {
    month: 'short'
  })).format(new Date(d + 'T12:00:00'));
