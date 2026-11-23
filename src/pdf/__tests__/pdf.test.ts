/** PDF-*: the bill PDF's pages (the drawing itself is checked in the browser; Node has no canvas). */
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { A4, pagesToPdf } from '../billPdf'

/** A 1 × 1 white PNG. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'),
  (c) => c.charCodeAt(0),
)

describe('bill PDF', () => {
  it('PDF-01 one A4 page per drawn page, titled with the bill number', async () => {
    const bytes = await pagesToPdf([PNG, PNG], 'Bill ICC/2026-27/0001')
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(2)
    const { width, height } = pdf.getPage(0).getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
    expect(pdf.getTitle()).toBe('Bill ICC/2026-27/0001')
    expect(A4.width).toBe(595.28)
  })
})
