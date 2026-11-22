/**
 * Bill wording in English and Kannada (U-09: both for screens and bills).
 * The Kannada strings are a first draft: a Kannada reader (ideally the owner) should check them before release.
 * Figures stay in Western digits with Indian grouping (₹6,81,800) in both languages.
 */
import type { PaymentMethod } from './ledger'
import type { Language } from './settings'

export interface BillLabels {
  bill: string
  statement: string
  date: string
  period: (from: string, to: string) => string
  previousBalance: string
  items: string
  paid: string
  balanceDue: string
  advance: string
  REVERSAL: string
  ADJUSTMENT: string
  kg: string
  phone: string
  whatsapp: string
  email: string
  payment: Record<PaymentMethod, string>
}

export const BILL_LABELS: Record<Language, BillLabels> = {
  en: {
    bill: 'Bill',
    statement: 'Statement',
    date: 'Date',
    period: (from, to) => `Period: ${from} to ${to}`,
    previousBalance: 'Previous balance',
    items: 'Items',
    paid: 'Paid',
    balanceDue: 'Balance due',
    advance: 'Advance',
    REVERSAL: 'Reversal',
    ADJUSTMENT: 'Adjustment',
    kg: 'kg',
    phone: 'Phone',
    whatsapp: 'WhatsApp',
    email: 'Email',
    payment: { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer' },
  },
  kn: {
    bill: 'ಬಿಲ್',
    statement: 'ಖಾತೆ ವಿವರ',
    date: 'ದಿನಾಂಕ',
    period: (from, to) => `ಅವಧಿ: ${from} ರಿಂದ ${to} ರವರೆಗೆ`,
    previousBalance: 'ಹಿಂದಿನ ಬಾಕಿ',
    items: 'ಖರೀದಿ',
    paid: 'ಪಾವತಿ',
    balanceDue: 'ಬಾಕಿ ಮೊತ್ತ',
    advance: 'ಮುಂಗಡ',
    REVERSAL: 'ರದ್ದು',
    ADJUSTMENT: 'ಹೊಂದಾಣಿಕೆ',
    kg: 'ಕೆಜಿ',
    phone: 'ಫೋನ್',
    whatsapp: 'ವಾಟ್ಸಾಪ್',
    email: 'ಇಮೇಲ್',
    payment: { CASH: 'ನಗದು', UPI: 'UPI', BANK_TRANSFER: 'ಬ್ಯಾಂಕ್ ವರ್ಗಾವಣೆ' },
  },
}
