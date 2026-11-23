import { describe, expect, it } from 'vitest'
import { formatPin, makePin, mapsLink, parseMapPin, pinProblemOf, validateSettings, DEFAULT_SETTINGS } from '../index'
import { must } from './fixtures'

const problemOf = (r: ReturnType<typeof parseMapPin>) => (r.ok ? 'ok' : pinProblemOf(r.error))

describe('Shop map pin (DV-07 manual fallback)', () => {
  it('LOC-01 a typed pin: comma, space or semicolon between the numbers', () => {
    expect(must(parseMapPin('12.9963, 75.3086'))).toEqual({ latitude: 12.9963, longitude: 75.3086 })
    expect(must(parseMapPin(' 12.9963 75.3086 '))).toEqual({ latitude: 12.9963, longitude: 75.3086 })
    expect(must(parseMapPin('12.9963;75.3086'))).toEqual({ latitude: 12.9963, longitude: 75.3086 })
    expect(must(parseMapPin('-33.8688, 151.2093'))).toEqual({ latitude: -33.8688, longitude: 151.2093 })
  })

  it('LOC-02 Google Maps links: the place pin wins over where the map was looking', () => {
    const place =
      'https://www.google.com/maps/place/Indian+Chicken+Center/@12.9950,75.3000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.9963!4d75.3086!16s'
    expect(must(parseMapPin(place))).toEqual({ latitude: 12.9963, longitude: 75.3086 })
    expect(must(parseMapPin('https://www.google.com/maps?q=12.9963,75.3086'))).toEqual({ latitude: 12.9963, longitude: 75.3086 })
    expect(must(parseMapPin('https://www.google.com/maps/search/?api=1&query=12.9963%2C75.3086'))).toEqual({ latitude: 12.9963, longitude: 75.3086 })
    expect(must(parseMapPin('https://www.google.com/maps/@12.995,75.3,15z'))).toEqual({ latitude: 12.995, longitude: 75.3 })
  })

  it('LOC-03 what cannot be read says why', () => {
    expect(problemOf(parseMapPin('   '))).toBe('empty')
    expect(problemOf(parseMapPin('Ujire, Belthangady'))).toBe('not_a_pin')
    expect(problemOf(parseMapPin('91, 75'))).toBe('out_of_range')
    expect(problemOf(parseMapPin('12.9963, 181'))).toBe('out_of_range')
    expect(problemOf(parseMapPin('https://maps.app.goo.gl/AbC123xyz'))).toBe('short_link')
  })

  it('LOC-04 a pin is kept to 6 decimal places and shown that way', () => {
    expect(must(makePin(12.99631234, 75.30869999))).toEqual({ latitude: 12.996312, longitude: 75.3087 })
    expect(formatPin({ latitude: 12.9963, longitude: 75.3086 })).toBe('12.996300, 75.308600')
    expect(mapsLink({ latitude: 12.9963, longitude: 75.3086 })).toBe('https://www.google.com/maps/search/?api=1&query=12.996300%2C75.308600')
  })

  it('LOC-05 settings keep a pin with both numbers, or none', () => {
    const withPin = { ...DEFAULT_SETTINGS, shopLocation: { label: 'Ujire', latitude: 12.9963, longitude: 75.3086 } }
    expect(must(validateSettings(withPin)).shopLocation).toEqual({ label: 'Ujire', latitude: 12.9963, longitude: 75.3086 })
    expect(validateSettings({ ...DEFAULT_SETTINGS, shopLocation: { label: 'Ujire', latitude: 12.9963 } }).ok).toBe(false)
  })
})
