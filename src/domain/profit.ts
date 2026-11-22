/**
 * Trip profit, both ways the owner wrote it (plan Part 2 §4).
 *  Option 2 (C-TXT L53–57): sales − operating expenses − purchases.
 *  Option 1 (C-TXT L46–51): loaded kg × valuation rate − wastage kg × valuation rate − operating − purchases.
 * Valuation rate for the full load and the wastage (wastage at selling price, U-11), in this order:
 *  1. an override passed in for this report,
 *  2. the trip's default selling rate (owner's Gate A answer for D-03),
 *  3. trip sales ÷ kg sold, as an exact fraction, so both options match to the paisa.
 * When customer rates differ from the trip default, the two options differ and the difference is shown.
 */
import type { TripSummary } from './trip'
import type { Grams, Paise, PaisePerKg } from './units'

/** num / den in paise, den > 0. BigInt so large trips cannot overflow. */
interface Fraction {
  num: bigint
  den: bigint
}

/** Nearest paisa, halves away from zero. */
function roundToPaise({ num, den }: Fraction): Paise {
  const negative = num < 0n
  const abs = negative ? -num : num
  const rounded = (2n * abs + den) / (2n * den)
  const value = Number(negative ? -rounded : rounded)
  if (!Number.isSafeInteger(value)) throw new RangeError('Profit value is too large')
  return value
}

const isZero = (f: Fraction): boolean => f.num === 0n

export type ValuationSource = 'OVERRIDE' | 'TRIP_DEFAULT_RATE' | 'AVERAGE_SELLING_RATE'

export interface ProfitOption1 {
  valuation: ValuationSource
  /** Valuation rate per kg, rounded to the paisa for display only. */
  valuationRatePaisePerKg: PaisePerKg
  /** Loaded kg × valuation rate ("Purchased Load × Selling Price"). */
  fullLoadValue: Paise
  /** Wastage kg × valuation rate ("Weight Loss"). */
  wastageValue: Paise
  operating: Paise
  /** Wastage + operating, as the source totals it (32,200 in the example). */
  totalExpenses: Paise
  /** Full load value − total expenses (6,67,800 in the example). */
  afterExpenses: Paise
  purchases: Paise
  profit: Paise
}

export interface ProfitOption2 {
  sales: Paise
  operating: Paise
  afterExpenses: Paise
  purchases: Paise
  profit: Paise
}

export interface ProfitReport {
  /** Null when nothing has been sold yet and no valuation rate was given. */
  option1: ProfitOption1 | null
  option2: ProfitOption2
  /** Option 1 profit − Option 2 profit; shown, never forced to zero. */
  differencePaise: Paise | null
  methodsMatch: boolean | null
  /** True until the trip is closed; screens must label both figures "Provisional". */
  provisional: boolean
  unaccountedGrams: Grams
}

export interface ProfitOptions {
  /** Owner override for the Option 1 valuation rate, per trip (D-03). */
  valuationOverridePaisePerKg?: PaisePerKg
}

export function computeProfit(summary: TripSummary, options: ProfitOptions = {}): ProfitReport {
  const sales = BigInt(summary.salesPaise)
  const operating = BigInt(summary.operatingPaise)
  const purchases = BigInt(summary.purchasePaise)
  const loaded = BigInt(summary.loadedGrams)
  const wastage = BigInt(summary.wastageGrams)
  const sold = BigInt(summary.soldGrams)

  const option2Profit = sales - operating - purchases
  const option2: ProfitOption2 = {
    sales: summary.salesPaise,
    operating: summary.operatingPaise,
    afterExpenses: summary.salesPaise - summary.operatingPaise,
    purchases: summary.purchasePaise,
    profit: Number(option2Profit),
  }

  // Valuation rate as paise per gram = rateNum / rateDen.
  let rateNum: bigint
  let rateDen: bigint
  let valuation: ValuationSource
  if (options.valuationOverridePaisePerKg !== undefined) {
    rateNum = BigInt(options.valuationOverridePaisePerKg)
    rateDen = 1_000n
    valuation = 'OVERRIDE'
  } else if (summary.defaultSaleRatePaisePerKg !== undefined) {
    rateNum = BigInt(summary.defaultSaleRatePaisePerKg)
    rateDen = 1_000n
    valuation = 'TRIP_DEFAULT_RATE'
  } else if (sold > 0n) {
    rateNum = sales
    rateDen = sold
    valuation = 'AVERAGE_SELLING_RATE'
  } else {
    return {
      option1: null,
      option2,
      differencePaise: null,
      methodsMatch: null,
      provisional: summary.provisional,
      unaccountedGrams: summary.remainingGrams,
    }
  }

  const over = (num: bigint): Fraction => ({ num, den: rateDen })
  const fullLoad = over(loaded * rateNum)
  const wastageValue = over(wastage * rateNum)
  const totalExpenses = over(wastage * rateNum + operating * rateDen)
  const afterExpenses = over(loaded * rateNum - wastage * rateNum - operating * rateDen)
  const profit1 = over(loaded * rateNum - wastage * rateNum - (operating + purchases) * rateDen)
  const difference = over(profit1.num - option2Profit * rateDen)

  return {
    option1: {
      valuation,
      valuationRatePaisePerKg: roundToPaise({ num: rateNum * 1_000n, den: rateDen }),
      fullLoadValue: roundToPaise(fullLoad),
      wastageValue: roundToPaise(wastageValue),
      operating: summary.operatingPaise,
      totalExpenses: roundToPaise(totalExpenses),
      afterExpenses: roundToPaise(afterExpenses),
      purchases: summary.purchasePaise,
      profit: roundToPaise(profit1),
    },
    option2,
    differencePaise: roundToPaise(difference),
    methodsMatch: isZero(difference),
    provisional: summary.provisional,
    unaccountedGrams: summary.remainingGrams,
  }
}
