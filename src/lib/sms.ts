// Bank SMS -> expense. An iPhone Shortcuts automation posts each bank SMS to /api/sms;
// the Worker uses parseBankSms to read the amount. Only money going out is added.

export interface ParsedSms {
  amount: number;
  date: string | null; // YYYY-MM-DD when the SMS says one ("on 24-Oct-26")
  note: string; // where it went, e.g. "Swiggy"
}

const AMOUNT = /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|₹)/i;
const OUT = /\b(debited|debit|spent|paid|purchase|withdrawn|sent|deducted|txn of|txn|transaction|payment of|payment|dr)\b/i;
const IN = /\b(credited|received|refund(?:ed)?|deposited|cashback|reversed)\b/i;
// Heads-ups about a debit that has not happened (or did not): not an expense yet.
const NOT_YET = /\b(will be debited|to be debited|not debited|is due|due by|requested money|mandate (?:created|registered))\b/i;
const OTP = /\b(otp|one[- ]time|verification code|password)\b/i;

export function parseBankSms(text: string): ParsedSms | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || OTP.test(t) || NOT_YET.test(t) || !OUT.test(t)) return null;
  // "credited" with no debit wording is money in; a message with both ("debited ... credited to X") is a payment.
  if (IN.test(t) && !/\b(debited|debit|spent|paid|withdrawn|sent|deducted|dr)\b/i.test(t)) return null;
  const m = AMOUNT.exec(t);
  if (!m) return null;
  const amount = Math.round(Number((m[1] ?? m[2]).replace(/,/g, '')) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, date: smsDate(t), note: merchant(t) };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "on 24-Oct-26" / "24-10-2026" -> 2026-10-24, so older messages land on the day they happened.
export function smsDate(t: string): string | null {
  const m = /\b(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4}|\d{2})\b/.exec(t);
  if (!m) return null;
  const mon = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].toLowerCase()) + 1;
  const day = Number(m[1]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, mon - 1, day));
  if (d.getUTCMonth() !== mon - 1) return null;
  return d.toISOString().slice(0, 10);
}

function merchant(t: string): string {
  const pats = [
    /;\s*([A-Za-z0-9&._' -]{2,40}?)\s+credited\b/i,
    /\binfo[:\s-]*([A-Za-z0-9*@&._' /-]{2,40}?)(?=\.\s*(?:avl|bal|to|if)\b|[,;]|\s{2}|$)/i,
    /\b(?:at|to|towards)\s+(?:vpa\s+)?([A-Za-z0-9@&._' -]{2,40}?)(?=\s+(?:on|via|ref|using|from|upi|avl|available|bal|if|for|\.)|[.,;]|$)/i,
  ];
  for (const p of pats) {
    const m = p.exec(t);
    const v = m?.[1].trim();
    if (v && !/^(?:a\/c|account|your|rs|inr|xx|dispute|[0-9 ]+$)/i.test(v)) return v.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return 'Bank SMS';
}

// Date in the SMS is unreliable across banks, so the expense takes the day it arrived.
export async function smsHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.replace(/\s+/g, ' ').trim());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
