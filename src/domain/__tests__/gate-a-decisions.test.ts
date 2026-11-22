/**
 * Owner's Gate A answers (22 Nov 2026). Expected values are literal and checked by hand.
 * Paise literals are rupees_paise: 10_780_00 = ₹10,780.
 */
import { describe, expect, it } from 'vitest'
import {
  billText,
  buildBill,
  can,
  closeTrip,
  DEFAULT_SETTINGS,
  kg,
  makeDefaultRate,
  makeExpense,
  makeFuelByAmount,
  makeLoading,
  makeOpeningBalance,
  makePayment,
  makeReversal,
  openTrip,
  passbook,
  postEntry,
  postTripEvent,
  pricePerLitre,
  ratePerKg,
  recordShopSale,
  recordTripSale,
  rupees,
  validateSettings,
  type BusinessSettings,
  type PaymentMethod,
  type SaleEntry,
  type Trip,
} from '../index'
import {
  DRIVER,
  driver,
  errorCode,
  LEDGER_CUSTOMER,
  LedgerBuilder,
  manager,
  MANAGER,
  must,
  owner,
  OWNER,
  sourceLedger,
  TRIP_DATE,
  TripBuilder,
} from './fixtures'

const LIVE = 'ROUND_HALF_UP_RUPEE' as const

/** A trip assigned to the driver, opened with today's default rate of ₹140/kg and 5,000 kg loaded at ₹120. */
function driverTrip() {
  const t = new TripBuilder('trip-d', TRIP_DATE, { driverId: DRIVER, driverName: 'Ramesh', defaultSaleRatePaisePerKg: ratePerKg('140') })
  t.load('5000', '120')
  return t
}

function driverSale(t: TripBuilder, id: string, weight: string, rate?: string) {
  const cmd = { id, customerId: 'customer1', date: TRIP_DATE, createdBy: DRIVER, grams: kg(weight) }
  const result = recordTripSale(t.state, rate === undefined ? cmd : { ...cmd, ratePaisePerKg: ratePerKg(rate) }, {
    ...driver,
    policy: LIVE,
  })
  if (result.ok) t.ledger = result.value.ledger
  return result
}

describe('Gate A decisions', () => {
  it('G-01 rounding is round-half-up to the rupee: the source customer ends at ₹10,780 instead of ₹10,778', () => {
    expect(DEFAULT_SETTINGS.roundingPolicy).toBe('ROUND_HALF_UP_RUPEE')
    const l = new LedgerBuilder()
    l.opening('10625', '2026-10-01')
    expect(l.sale('sale-1', '63.1', '128', '2026-10-05', LIVE).amount).toBe(8_077_00)
    expect(l.sale('sale-2', '153.2', '118', '2026-10-12', LIVE).amount).toBe(18_078_00)
    expect(l.balance).toBe(36_780_00)
    l.payment('pay-1', '26000', '2026-10-20')
    expect(l.balance).toBe(10_780_00)
  })

  it('G-02 payments by cash, UPI or bank transfer, each named in the passbook', () => {
    const l = new LedgerBuilder()
    l.opening('10625', '2026-10-01')
    const pay = (id: string, method: PaymentMethod, reference?: string) =>
      must(
        l.post(
          must(
            makePayment({
              id,
              customerId: LEDGER_CUSTOMER,
              date: '2026-10-05',
              createdBy: OWNER,
              amount: rupees('1000'),
              method,
              ...(reference ? { reference } : {}),
            }),
          ),
        ),
      )
    pay('p-cash', 'CASH')
    pay('p-upi', 'UPI', 'UTR4711')
    pay('p-bank', 'BANK_TRANSFER')
    expect(l.balance).toBe(7_625_00)
    expect(passbook(l.entries, LEDGER_CUSTOMER).slice(1).map((r) => r.comments)).toEqual([
      'CashPayment',
      'UpiPayment UTR4711',
      'BankTransfer',
    ])
    const cheque = makePayment({ id: 'p-x', customerId: LEDGER_CUSTOMER, date: '2026-10-05', createdBy: OWNER, amount: rupees('1'), method: 'CHEQUE' as PaymentMethod })
    expect(errorCode(cheque)).toBe('invalid_input')
  })

  it('G-03 one trip a day per vehicle; several vehicles; vehicle number on every trip', () => {
    const base = { date: TRIP_DATE, createdBy: OWNER }
    const first = must(openTrip([], { ...base, id: 't1', vehicleNumber: 'ka-21 ab 1234' }, owner))
    expect(first.vehicleNumber).toBe('KA21AB1234')

    const trips: Trip[] = [first]
    expect(errorCode(openTrip(trips, { ...base, id: 't2', vehicleNumber: 'KA21AB1234' }, owner))).toBe('duplicate_trip')
    for (const [i, v] of ['KA21AB1235', 'KA19C77', 'KA70M9', 'KA21Z4321', '22BH1234AA'].entries()) {
      trips.push(must(openTrip(trips, { ...base, id: `v${i}`, vehicleNumber: v }, owner)))
    }
    expect(trips).toHaveLength(6)
    expect(must(openTrip(trips, { ...base, id: 'next-day', date: '2026-11-03', vehicleNumber: 'KA21AB1234' }, owner)).status).toBe('OPEN')
    expect(errorCode(openTrip([], { ...base, id: 'bad', vehicleNumber: 'ABC' }, owner))).toBe('invalid_input')
    expect(errorCode(openTrip([], { ...base, id: 'd', createdBy: DRIVER, vehicleNumber: 'KA21AB1234' }, driver))).toBe('not_permitted')
  })

  it('G-04 sales use the trip default rate; only owner or manager change it per customer', () => {
    const t = driverTrip()
    const atDefault = must(driverSale(t, 's1', '100'))
    expect(atDefault.entry.ratePaisePerKg).toBe(140_00)
    expect(atDefault.entry.amount).toBe(14_000_00)
    expect(errorCode(driverSale(t, 's2', '100', '135'))).toBe('not_permitted')

    const byManager = recordTripSale(
      t.state,
      { id: 's3', customerId: 'customer2', date: TRIP_DATE, createdBy: MANAGER, grams: kg('100'), ratePaisePerKg: ratePerKg('135') },
      { ...manager, policy: LIVE },
    )
    expect(must(byManager).entry.amount).toBe(13_500_00)
    t.ledger = must(byManager).ledger

    const newRate = must(makeDefaultRate({ id: 'rate-2', tripId: t.trip.id, date: TRIP_DATE, createdBy: OWNER, ratePaisePerKg: ratePerKg('142') }))
    t.add({ ok: true, value: newRate })
    expect(t.summary().defaultSaleRatePaisePerKg).toBe(142_00)
    expect(must(driverSale(t, 's4', '10')).entry.amount).toBe(1_420_00)

    const byDriver = must(makeDefaultRate({ id: 'rate-3', tripId: t.trip.id, date: TRIP_DATE, createdBy: DRIVER, ratePaisePerKg: ratePerKg('150') }))
    expect(errorCode(postTripEvent(t.trip, t.events, byDriver, driver))).toBe('not_permitted')

    const noRate = new TripBuilder('trip-n', TRIP_DATE, { driverId: DRIVER })
    noRate.load('100', '120')
    expect(errorCode(driverSale(noRate, 's5', '10'))).toBe('invalid_rate')
    expect(errorCode(driverSale(noRate, 's6', '10', '140'))).toBe('invalid_rate')
  })

  it('G-04b Option 1 values the load at the trip default rate; differing customer rates show a difference', () => {
    const t = new TripBuilder('trip-m', TRIP_DATE, { defaultSaleRatePaisePerKg: ratePerKg('140') })
    t.fuelByAmount('8000', '91')
    t.load('5000', '120')
    must(t.sell('customer1', '2000', '140'))
    must(t.sell('customer2', '2870', '135'))
    t.expense('LABOUR', '6000')
    t.wastage('130')
    must(t.close())
    const report = t.profit()
    expect(report.option1?.valuation).toBe('TRIP_DEFAULT_RATE')
    expect(report.option1?.wastageValue).toBe(18_200_00) // wastage at selling price (U-11)
    expect(report.option1?.profit).toBe(67_800_00)
    expect(report.option2.profit).toBe(53_450_00)
    expect(report.differencePaise).toBe(14_350_00)
  })

  it('G-05 kg left at the end are sold at the shop or shown as wastage, then the trip closes', () => {
    const t = new TripBuilder('trip-s', TRIP_DATE, { defaultSaleRatePaisePerKg: ratePerKg('140') })
    t.load('5000', '120')
    must(t.sell('customer1', '4800', '140'))
    expect(errorCode(t.close())).toBe('stock_not_reconciled')

    const shop = (id: string, weight: string) =>
      recordShopSale(
        t.state,
        { id, date: TRIP_DATE, createdBy: OWNER, grams: kg(weight), ratePaisePerKg: ratePerKg('120'), method: 'CASH' },
        { ...owner, policy: LIVE },
      )
    expect(errorCode(shop('shop-big', '250'))).toBe('exceeds_stock')
    const sold = must(shop('shop-1', '150'))
    t.events = sold.events
    expect(sold.event.amount).toBe(18_000_00)
    t.wastage('50')
    must(t.close())

    const s = t.summary()
    expect(s.shopSoldGrams).toBe(150_000)
    expect(s.soldGrams).toBe(4_950_000)
    expect(s.salesPaise).toBe(6_90_000_00)
    expect(t.trip.closeSummary?.shopSoldGrams).toBe(150_000)
    const report = t.profit()
    expect(report.option2.profit).toBe(90_000_00)
    expect(report.option1?.profit).toBe(93_000_00)
    expect(report.differencePaise).toBe(3_000_00) // 150 kg sold at the shop for ₹20/kg under the trip rate
  })

  it('G-06 labour per person with names that change per trip, or one total, never both on a trip', () => {
    const perPerson = new TripBuilder('trip-p')
    const line = (slot: 'DRIVER' | 'LABOUR_1', name: string, amount: string) =>
      perPerson.add(
        makeExpense({ id: `lab-${slot}`, tripId: 'trip-p', date: TRIP_DATE, createdBy: OWNER, category: 'LABOUR', slot, workerName: name, amount: rupees(amount) }),
      )
    line('DRIVER', 'Ramesh', '1000')
    line('LABOUR_1', 'Suresh', '800')
    expect(perPerson.summary().expensesByCategory.LABOUR).toBe(1_800_00)
    expect(perPerson.summary().labourMode).toBe('PER_PERSON')
    const total = must(makeExpense({ id: 'lab-total', tripId: 'trip-p', date: TRIP_DATE, createdBy: OWNER, category: 'LABOUR', amount: rupees('6000') }))
    expect(errorCode(postTripEvent(perPerson.trip, perPerson.events, total, owner))).toBe('invalid_input')

    const oneTotal = new TripBuilder('trip-t')
    oneTotal.expense('LABOUR', '6000')
    expect(oneTotal.summary().labourMode).toBe('TOTAL')
    const slot = must(makeExpense({ id: 'lab-d', tripId: 'trip-t', date: TRIP_DATE, createdBy: OWNER, category: 'LABOUR', slot: 'DRIVER', amount: rupees('1000') }))
    expect(errorCode(postTripEvent(oneTotal.trip, oneTotal.events, slot, owner))).toBe('invalid_input')

    expect(errorCode(makeExpense({ id: 'f', tripId: 'trip-t', date: TRIP_DATE, createdBy: OWNER, category: 'FOOD', workerName: 'Ramesh', amount: rupees('100') }))).toBe('invalid_input')
  })

  it('G-07 roles: driver works only on their own trip; manager runs trips; owner alone adjusts and closes months', () => {
    expect(can('driver', 'profit.view')).toBe(false)
    expect(can('driver', 'purchase.view')).toBe(false)
    expect(can('manager', 'profit.view')).toBe(true)
    expect(can('manager', 'settings.edit')).toBe(false)
    expect(can('owner', 'settings.edit')).toBe(true)

    const t = driverTrip()
    const ev = { tripId: t.trip.id, date: TRIP_DATE, createdBy: DRIVER }
    const fuel = must(makeFuelByAmount({ ...ev, id: 'fuel-d', amount: rupees('8000'), pricePaisePerLitre: pricePerLitre('91') }))
    expect(must(postTripEvent(t.trip, t.events, fuel, driver)).status).toBe('saved')
    const load = must(makeLoading({ ...ev, id: 'load-d', grams: kg('100'), ratePaisePerKg: ratePerKg('120') }))
    expect(errorCode(postTripEvent(t.trip, t.events, load, driver))).toBe('not_permitted')

    const otherDriversTrip = { ...t.trip, driverId: 'uid-someone-else' }
    expect(errorCode(postTripEvent(otherDriversTrip, t.events, fuel, driver))).toBe('not_permitted')

    const sale = must(driverSale(t, 'ds-1', '100')).entry as SaleEntry
    const reversal = must(makeReversal(sale, { date: TRIP_DATE, createdBy: DRIVER }))
    const tripInfo = () => ({ status: t.trip.status, driverId: DRIVER })
    expect(errorCode(postEntry(t.ledger, reversal, { ...driver, tripInfo }))).toBe('not_permitted')

    const tripPayment = must(makePayment({ id: 'dp-1', customerId: 'customer1', date: TRIP_DATE, createdBy: DRIVER, amount: rupees('5000'), method: 'UPI', tripId: t.trip.id }))
    expect(must(postEntry(t.ledger, tripPayment, { ...driver, tripInfo })).status).toBe('saved')
    const { tripId: _drop, ...offTrip } = tripPayment
    expect(errorCode(postEntry(t.ledger, { ...offTrip, id: 'dp-2' }, { ...driver, tripInfo }))).toBe('not_permitted')
    const opening = must(makeOpeningBalance({ customerId: 'customer9', date: TRIP_DATE, createdBy: DRIVER, amount: rupees('100') }))
    expect(errorCode(postEntry(t.ledger, opening, driver))).toBe('not_permitted')

    t.wastage('4900')
    const closeAs = (actor: typeof driver | typeof manager) =>
      closeTrip(t.state, { ...actor, closedOn: TRIP_DATE, online: true, hasPendingWrites: false })
    expect(errorCode(closeAs(driver))).toBe('not_permitted')
    expect(must(closeAs(manager)).status).toBe('CLOSED')
  })

  it('G-08 bills in Kannada or English, with the contact details chosen in Settings', () => {
    const settings: BusinessSettings = {
      ...DEFAULT_SETTINGS,
      contact: { ownerName: 'Umarabba', phones: ['919876543210'], whatsapp: '919876543210', email: 'icc@example.com', address: 'Main Road, Ujire' },
    }
    const bill = must(buildBill(sourceLedger().entries, LEDGER_CUSTOMER, { from: '2026-10-01', to: '2026-10-31' }))
    const kn = billText(bill, { settings, language: 'kn', shopName: 'Customer1' })
    expect(kn).toContain('ಫೋನ್: +91 98765 43210')
    expect(kn).toContain('ಅವಧಿ: 01-10-2026 ರಿಂದ 31-10-2026 ರವರೆಗೆ')
    expect(kn).toContain('ಹಿಂದಿನ ಬಾಕಿ: ₹10,625')
    expect(kn).toContain('05-10-2026  63.1 ಕೆಜಿ × ₹128/ಕೆಜಿ = ₹8,076')
    expect(kn).toContain('20-10-2026  ನಗದು: ₹26,000')
    expect(kn).toContain('ಬಾಕಿ ಮೊತ್ತ: ₹10,778')
    expect(kn).not.toContain('icc@example.com') // email is off in the print options by default
    expect(kn).not.toContain('GSTIN')

    const withGst = billText(bill, {
      settings: { ...settings, gst: { enabled: true, gstin: '29ABCDE1234F1Z5' }, print: { ...settings.print, email: true } },
      shopName: 'Customer1',
    })
    expect(withGst).toContain('GSTIN: 29ABCDE1234F1Z5')
    expect(withGst).toContain('Email: icc@example.com')
    expect(withGst).toContain('Balance due: ₹10,778')
  })

  it('G-09 settings: phones normalised, GST needs a valid GSTIN, contact details checked', () => {
    const saved = must(
      validateSettings({
        ...DEFAULT_SETTINGS,
        contact: { ownerName: 'Umarabba', phones: ['98765 43210', '+91 87654-32109'], whatsapp: '09876543210' },
        gst: { enabled: true, gstin: '29abcde1234f1z5' },
      }),
    )
    expect(saved.contact.phones).toEqual(['919876543210', '918765432109'])
    expect(saved.contact.whatsapp).toBe('919876543210')
    expect(saved.gst.gstin).toBe('29ABCDE1234F1Z5')

    expect(errorCode(validateSettings({ ...DEFAULT_SETTINGS, gst: { enabled: true } }))).toBe('invalid_input')
    expect(errorCode(validateSettings({ ...DEFAULT_SETTINGS, gst: { enabled: true, gstin: '29ABCDE1234F1X5' } }))).toBe('invalid_input')
    expect(errorCode(validateSettings({ ...DEFAULT_SETTINGS, contact: { ownerName: 'Umarabba', phones: [], email: 'not-an-email' } }))).toBe('invalid_input')
    expect(errorCode(validateSettings({ ...DEFAULT_SETTINGS, shopLocation: { label: 'Ujire', latitude: 12.99 } }))).toBe('invalid_input')
    expect(must(validateSettings({ ...DEFAULT_SETTINGS, shopLocation: { label: 'Ujire', latitude: 12.99, longitude: 75.33 } })).shopLocation.longitude).toBe(75.33)
  })
})
