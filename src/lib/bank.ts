/** Banks and wallets people in Pakistan commonly pay through; only suggestions, any name can be typed. */
export const BANKS = [
  'HBL',
  'UBL',
  'MCB',
  'Allied Bank',
  'Bank Alfalah',
  'Meezan Bank',
  'Askari Bank',
  'Faysal Bank',
  'Habib Metropolitan Bank',
  'Standard Chartered',
  'BankIslami',
  'Soneri Bank',
  'JS Bank',
  'Silk Bank',
  'Dubai Islamic Bank',
  'National Bank of Pakistan',
  'Bank of Punjab',
  'Easypaisa',
  'JazzCash',
  'SadaPay',
  'NayaPay',
] as const

type BankFields = { bankName?: string | null; bankAccount?: string | null }

/** The last digits of an account number or IBAN, ignoring spaces and dashes. */
export const lastDigits = (account: string | null | undefined, n = 4): string => (account ?? '').replace(/[^A-Za-z0-9]/g, '').slice(-n)

/**
 * A short line for lists: "HBL · …1234". Only the end of the account is shown; the full number is on the payment itself.
 * The digits sit in a left-to-right isolate so they do not flip inside Urdu text.
 */
export function bankLine(p: BankFields): string {
  const name = (p.bankName ?? '').trim()
  const last = lastDigits(p.bankAccount)
  return [name, last ? `⁦…${last}⁩` : ''].filter(Boolean).join(' · ')
}

/** Fills what a payment's bank details still lack from the vendor's saved details; what was typed is never replaced. */
export function bankFromVendor(vendor: BankFields | undefined, current: { name: string; account: string }): { name: string; account: string } {
  return { name: current.name.trim() ? current.name : (vendor?.bankName ?? ''), account: current.account.trim() ? current.account : (vendor?.bankAccount ?? '') }
}
