import type { HomeDoc } from '../types';
import { dateDiff } from './dates';

export type DocStatus = 'expired' | 'soon' | 'ok' | 'none';

export function docStatus(doc: HomeDoc, today: string): DocStatus {
  if (!doc.expiryDate) return 'none';
  const left = dateDiff(today, doc.expiryDate);
  if (left < 0) return 'expired';
  return left <= doc.remindDays ? 'soon' : 'ok';
}

export function docDueLabel(doc: HomeDoc, today: string): string {
  if (!doc.expiryDate) return 'No expiry';
  const left = dateDiff(today, doc.expiryDate);
  const what = doc.category === 'appliance' ? 'Warranty' : 'Expires';
  if (left < 0) return doc.category === 'appliance' ? `Warranty ended ${-left} day${left === -1 ? '' : 's'} ago` : `Expired ${-left} day${left === -1 ? '' : 's'} ago`;
  if (left === 0) return doc.category === 'appliance' ? 'Warranty ends today' : 'Expires today';
  if (left < 60) return `${what === 'Warranty' ? 'Warranty ends' : what} in ${left} days`;
  if (left < 730) return `${what === 'Warranty' ? 'Warranty till' : 'Valid till'} ${new Date(doc.expiryDate + 'T00:00').toLocaleString('en-IN', { month: 'short', year: 'numeric' })}`;
  return `${what === 'Warranty' ? 'Warranty' : 'Valid'} for ${Math.round(left / 365)} years`;
}

// Expired or expiring documents, soonest first, for the To do list and reminders.
// Warranties that already ended are left out: nothing to do about them.
export function docsDue(docs: HomeDoc[], today: string): HomeDoc[] {
  return docs
    .filter((d) => {
      const s = docStatus(d, today);
      return s === 'soon' || (s === 'expired' && d.category !== 'appliance' && dateDiff(d.expiryDate!, today) <= 60);
    })
    .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!));
}
