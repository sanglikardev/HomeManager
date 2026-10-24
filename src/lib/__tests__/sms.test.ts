import { describe, expect, it } from 'vitest';
import { parseBankSms, smsHash } from '../sms';

describe('parseBankSms', () => {
  it('reads a card spend', () => {
    const r = parseBankSms('Rs.1,250.50 spent on HDFC Card xx1234 at SWIGGY on 24-10-26. Avl limit Rs.50,000');
    expect(r).toEqual({ amount: 1250.5, note: 'SWIGGY' });
  });
  it('reads a UPI debit', () => {
    const r = parseBankSms('Rs 300.00 debited from A/c XX1234 on 24-Oct. UPI to bigbasket@okaxis Ref 123');
    expect(r?.amount).toBe(300);
    expect(r?.note).toContain('bigbasket');
  });
  it('ignores money coming in, OTPs and chatter', () => {
    expect(parseBankSms('Rs.5000 credited to your A/c XX1234')).toBeNull();
    expect(parseBankSms('Refund of Rs 200 received')).toBeNull();
    expect(parseBankSms('123456 is your OTP for payment of Rs 500. Do not share')).toBeNull();
    expect(parseBankSms('Hello, how are you')).toBeNull();
  });
  it('falls back to a plain note', () => {
    expect(parseBankSms('INR 99 debited from your account')?.note).toBe('Bank SMS');
  });
});

describe('smsHash', () => {
  it('ignores spacing', async () => {
    expect(await smsHash('a  b')).toBe(await smsHash('a b '));
  });
});

describe('parseBankSms wording', () => {
  it('reads amount after the word and plain debit', () => {
    expect(parseBankSms('A/c XX12 debit 450 INR at Zomato')?.amount).toBe(450);
    expect(parseBankSms('Txn of Rs 75 done')?.amount).toBe(75);
  });
});

describe('parseBankSms ICICI', () => {
  it('reads the amount and Info text, not the helpline', () => {
    const r = parseBankSms('ICICI Bank Acc XX615 debited Rs. 633.00 on 24-Oct-26 InfoBIL*ONL*00125.Avl Bal Rs. 4,99,424.11.To dispute call 18002662 or SMS BLOCK 615 to 9215676766');
    expect(r).toEqual({ amount: 633, note: 'BIL ONL 00125' });
  });
});

describe('parseBankSms ICICI variants', () => {
  const note = (t: string) => parseBankSms(t);
  it('UPI payment: shop is the name before "credited"', () => {
    expect(note('ICICI Bank Acct XX615 debited for Rs 581.00 on 14-Oct-26; Swiggy Limited credited. UPI:628770753035. Call 18002662 for dispute. SMS BLOCK 615 to 9215676766.')).toEqual({ amount: 581, note: 'Swiggy Limited' });
  });
  it('autopay: shop follows "towards"', () => {
    expect(note('Rs 1580.00 debited from ICICI Bank Savings Account XX615 on 21-Oct-26 towards BLINKIT for Autopay AutoPay Retrieval Ref No.206045416203')).toEqual({ amount: 1580, note: 'BLINKIT' });
  });
  it('large amounts with commas', () => {
    expect(note('ICICI Bank Acc XX615 debited Rs. 55,000.00 on 07-Oct-26 InfoBIL*NEFT*IN12.Avl Bal Rs. 42,599.49.To dispute call 18002662 or SMS BLOCK 615 to 9215676766')).toEqual({ amount: 55000, note: 'BIL NEFT IN12' });
  });
  it('skips future, failed and requested debits', () => {
    expect(note('ICICI Bank SAVINGS Account XX615 will be debited for Rs 79.00 on 22-Oct-26 towards Autopay for APPLE MEDIA SER, Create Mandate, Unique Mandate Number abc@okicici')).toBeNull();
    expect(note('Payment of INR 2399.00 towards Merchant Anthropic to be debited from ICICI Bank Credit Card 1009, as per Standing Instruction X, is due by 23/10/2026.')).toBeNull();
    expect(note('Your account is not debited with Rs 35.00 towards RASRIYAL SWEETS for Autopay due to Total amount for delegation li, RRN 300103271461-ICICI Bank.')).toBeNull();
    expect(note('ZERODHA BROKING LIMITED has requested money through Google-pay. On approval, Rs 100000.00 will be debited from your Bank Account-ICICI Bank.')).toBeNull();
  });
});
