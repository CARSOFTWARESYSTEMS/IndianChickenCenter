import { describe, expect, it } from 'vitest'
import { lastDayOfMonth, makeCustomer, previousMonth, updateCustomer, type Customer } from '../index'
import { errorCode, must, OWNER } from './fixtures'

const base = { createdAt: '2026-10-01', createdBy: OWNER }

describe('Customers and month helpers', () => {
  it('CU-01 a customer needs a shop name; name and phone are optional; the phone is normalised', () => {
    expect(errorCode(makeCustomer([], { ...base, id: 'c1', shopName: '  ' }))).toBe('invalid_input')
    const { customer } = must(makeCustomer([], { ...base, id: 'c1', shopName: ' Customer1 ', name: '', phone: '98765 43210' }))
    expect(customer).toEqual({ ...base, id: 'c1', shopName: 'Customer1', phone: '919876543210' })
    expect(errorCode(makeCustomer([], { ...base, id: 'c2', shopName: 'X', phone: '12345' }))).toBe('invalid_phone')
  })

  it('CU-02 a shared phone number is warned about, never merged or blocked', () => {
    const first = must(makeCustomer([], { ...base, id: 'c1', shopName: 'Customer1', phone: '9876543210' })).customer
    const second = must(makeCustomer([first], { ...base, id: 'c2', shopName: 'Customer2', phone: '+91 98765 43210' }))
    expect(second.duplicatePhoneOf?.id).toBe('c1')
    expect(errorCode(makeCustomer([first], { ...base, id: 'c1', shopName: 'Again' }))).toBe('id_conflict')
  })

  it('CU-03 editing keeps the id and created date, and does not warn about its own number', () => {
    const list: Customer[] = [must(makeCustomer([], { ...base, id: 'c1', shopName: 'Customer1', phone: '9876543210' })).customer]
    const edited = must(updateCustomer(list, 'c1', { shopName: 'Hotel Udupi', name: 'Rafiq', phone: '9876543210' }))
    expect(edited.customer).toEqual({ ...base, id: 'c1', shopName: 'Hotel Udupi', name: 'Rafiq', phone: '919876543210' })
    expect(edited.duplicatePhoneOf).toBeUndefined()
  })

  it('DT-01 previous month and last day of month, across years and leap years', () => {
    expect(previousMonth('2026-11')).toBe('2026-10')
    expect(previousMonth('2027-01')).toBe('2026-12')
    expect(lastDayOfMonth('2026-11')).toBe('2026-11-30')
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
    expect(lastDayOfMonth('2027-02')).toBe('2027-02-28')
  })
})
