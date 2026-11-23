/**
 * Bill PDF (P6). pdf-lib cannot lay out Kannada (KNOWN_LIMITATIONS.md), so each page is drawn by the browser on a
 * canvas, which shapes Kannada and the ₹ sign with the phone's own fonts, and placed in an A4 PDF as an image.
 * The text in the PDF is therefore not selectable; what it shows is exactly the on-screen bill (billDocument).
 * Loaded on demand: pdf-lib is only downloaded when someone shares a PDF.
 */
import { PDFDocument } from 'pdf-lib'
import { formatRupees, paginate, type BillDocument, type BillRow } from '../domain'

/** A4 in PDF points. */
export const A4 = { width: 595.28, height: 841.89 }

/** Canvas pixels per PDF point: sharp on screen and on paper, small enough to send on WhatsApp. */
const SCALE = 2
const MARGIN = 48
const ROW = 20
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Kannada', 'Kannada Sangam MN', sans-serif"
const INK = '#1c1c1e'
const GREY = '#6e6e73'
const LINE = '#d1d1d6'

/** Puts one PNG per page into an A4 PDF. */
export async function pagesToPdf(pages: readonly Uint8Array[], title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setCreator('Indian Chicken Center')
  pdf.setProducer('Indian Chicken Center')
  for (const png of pages) {
    const image = await pdf.embedPng(png)
    const page = pdf.addPage([A4.width, A4.height])
    page.drawImage(image, { x: 0, y: 0, width: A4.width, height: A4.height })
  }
  return pdf.save()
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight: 400 | 600 | 700 = 400): void {
  ctx.font = `${weight} ${size * SCALE}px ${FONT}`
}

/** Shortens text to fit, ending in "…". */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1)
  return `${s}…`
}

/** Splits text into lines that fit the width (for the address and the legal text). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function newPage(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(A4.width * SCALE)
  canvas.height = Math.round(A4.height * SCALE)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textBaseline = 'alphabetic'
  return { canvas, ctx }
}

/** Draws the bill on as many A4 canvases as it needs. */
export function drawBillPages(doc: BillDocument): HTMLCanvasElement[] {
  const width = A4.width - 2 * MARGIN
  const px = (pt: number) => pt * SCALE
  const probe = newPage().ctx

  // How tall the first page's header is, to know how many rows fit under it.
  setFont(probe, 10)
  const headerLines = doc.header.flatMap((line, i) => (i === 0 ? [line] : wrap(probe, line, width)))
  const footerLines = doc.footer ? (setFont(probe, 9), wrap(probe, doc.footer, width)) : []
  const firstTop = MARGIN + 24 + (headerLines.length - 1) * 15 + 16 + 22 + 16 + 15 + (doc.issued ? 15 : 0) + 16
  const nextTop = MARGIN + 40
  const bottom = A4.height - MARGIN - 20 - footerLines.length * 13
  const pages = paginate(doc.rows, Math.floor((bottom - firstTop - 12) / ROW), Math.floor((bottom - nextTop - 12) / ROW))

  return pages.map((rows, index) => {
    const { canvas, ctx } = newPage()
    let y = MARGIN
    const text = (s: string, x: number, size: number, opts: { weight?: 400 | 600 | 700; color?: string; align?: CanvasTextAlign } = {}) => {
      setFont(ctx, size, opts.weight ?? 400)
      ctx.fillStyle = opts.color ?? INK
      ctx.textAlign = opts.align ?? 'left'
      ctx.fillText(s, px(x), px(y))
    }
    const rule = (at: number) => {
      ctx.strokeStyle = LINE
      ctx.lineWidth = SCALE
      ctx.beginPath()
      ctx.moveTo(px(MARGIN), px(at))
      ctx.lineTo(px(A4.width - MARGIN), px(at))
      ctx.stroke()
    }

    if (index === 0) {
      y += 20
      text(headerLines[0] ?? '', A4.width / 2, 18, { weight: 700, align: 'center' })
      for (const line of headerLines.slice(1)) {
        y += 15
        text(line, A4.width / 2, 10, { color: GREY, align: 'center' })
      }
      y += 16
      rule(y)
      y += 26
      text(doc.title, MARGIN, 15, { weight: 700 })
      y += 18
      text(doc.customer, MARGIN, 11, { weight: 600 })
      y += 15
      text(doc.period, MARGIN, 10, { color: GREY })
      if (doc.issued) {
        y += 15
        text(doc.issued, MARGIN, 10, { color: GREY })
      }
      y += 14
      rule(y)
    } else {
      y += 16
      text(headerLines[0] ?? '', MARGIN, 11, { weight: 600 })
      text(doc.title, A4.width - MARGIN, 11, { weight: 600, align: 'right' })
      y += 12
      rule(y)
    }

    y += 8
    for (const row of rows) drawRow(row)

    function drawRow(row: BillRow): void {
      const size = row.kind === 'due' ? 14 : row.kind === 'detail' ? 10 : 11
      const indent = row.kind === 'detail' ? 12 : 0
      if (row.kind === 'due') {
        y += 8
        rule(y)
        y += 6
      }
      y += row.kind === 'due' ? 22 : ROW
      const amount = formatRupees(row.amount)
      setFont(ctx, size, row.kind === 'due' ? 700 : 400)
      const amountWidth = ctx.measureText(amount).width / SCALE
      const label = fit(ctx, row.label, (width - indent - amountWidth - 16) * SCALE)
      const color = row.kind === 'detail' ? GREY : INK
      const weight = row.kind === 'due' ? 700 : 400
      text(label, MARGIN + indent, size, { color, weight })
      text(amount, A4.width - MARGIN, size, { color, weight, align: 'right' })
    }

    if (index === pages.length - 1 && footerLines.length) {
      y = bottom + 4
      for (const line of footerLines) {
        y += 13
        text(line, MARGIN, 9, { color: GREY })
      }
    }
    if (pages.length > 1) {
      y = A4.height - MARGIN + 8
      text(`${index + 1} / ${pages.length}`, A4.width - MARGIN, 9, { color: GREY, align: 'right' })
    }
    return canvas
  })
}

function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Could not draw the bill'))
      blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject)
    }, 'image/png')
  })
}

/** The bill as a PDF file, ready to share or download. */
export async function billPdfFile(doc: BillDocument, fileName: string): Promise<File> {
  await document.fonts?.ready
  const pages = await Promise.all(drawBillPages(doc).map(pngBytes))
  const bytes = await pagesToPdf(pages, doc.title)
  return new File([bytes.slice().buffer as ArrayBuffer], fileName, { type: 'application/pdf' })
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Sends the PDF through the phone's share sheet (WhatsApp is one of the choices) where the browser can share files;
 * otherwise downloads it, and the bill screen offers the WhatsApp text separately (plan: "WhatsApp bill").
 */
export async function shareOrDownload(file: File, title: string): Promise<ShareOutcome> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Some browsers refuse the share after the tap's permission lapses; fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'downloaded'
}
