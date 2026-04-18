import type { ListingRow } from '../data/types'

export type PurchasesPerYearPoint = { year: string; count: number }
export type MoneyPerYearPoint = { year: number; amount: number }
export type MoneyPerPlatformPoint = { platform: string; amount: number }
export type CountPerPlatformPoint = { platform: string; count: number }
/** Recharts pie: `name` + `value` */
export type CountPerLocationPoint = { name: string; value: number }
export type PlatformSummaryRow = {
  platform: string
  titles: number
  spent: number
  avgCost: number | null
}
export type PurchaseYearDiagnostics = {
  totalRows: number
  parsedRows: number
  unparsedRows: number
  sampleUnparsedValues: string[]
}

/** Location value "Missing" = not on shelf; still shown in the location pie, excluded from other charts. */
export function isMissingLocationEntry(row: ListingRow): boolean {
  return row.location.trim().toLowerCase() === 'missing'
}

/** True when the Location cell is empty or whitespace only (not the same as the literal "Missing"). */
export function isBlankLocation(row: ListingRow): boolean {
  return !row.location.trim()
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null
  // Google Sheets / Excel commonly use 1899-12-30 as day 0 (taking into account Excel's 1900 leap-year bug).
  // This conversion matches what you typically see when dates are exported as numbers in CSV.
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d
}

function normalizeYear(y: number): number | null {
  if (!Number.isFinite(y)) return null
  // Accept a reasonable range; avoids weird parsing results.
  if (y < 1970 || y > 2100) return null
  return y
}

function expandTwoDigitYear(yy: number): number {
  // Pivot rule: 00-69 => 2000-2069, 70-99 => 1970-1999
  return yy <= 69 ? 2000 + yy : 1900 + yy
}

function parsePurchaseYear(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null

  // Date serial numbers (e.g. 45291) exported from Sheets/Excel.
  if (/^\d{4,6}$/.test(s)) {
    const n = Number(s)
    const d = excelSerialToDate(n)
    if (d) return normalizeYear(d.getFullYear())
  }

  // ISO-ish: 2026-04-16, 2026/04/16, 2026.04.16
  const iso = s.match(/^(\d{4})[-/.]\d{1,2}[-/.]\d{1,2}/)
  if (iso) return normalizeYear(Number(iso[1]))

  // US-ish: 4/16/2026, 04-16-2026
  const us = s.match(/^\d{1,2}[-/]\d{1,2}[-/](\d{4})$/)
  if (us) return normalizeYear(Number(us[1]))

  // Two-digit year: 4/16/25, 04-16-25
  const us2 = s.match(/^\d{1,2}[-/]\d{1,2}[-/](\d{2})$/)
  if (us2) return normalizeYear(expandTwoDigitYear(Number(us2[1])))

  // Year only
  const yr = s.match(/^(\d{4})$/)
  if (yr) return normalizeYear(Number(yr[1]))

  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return normalizeYear(d.getFullYear())

  return null
}

export function purchasesPerYear(rows: ListingRow[]): PurchasesPerYearPoint[] {
  const counts = new Map<number, number>()
  let noDate = 0
  for (const r of rows) {
    const y = parsePurchaseYear(r.purchaseDate)
    if (y == null) {
      noDate++
      continue
    }
    counts.set(y, (counts.get(y) ?? 0) + 1)
  }
  const points = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year: String(year), count }))

  if (noDate > 0) points.unshift({ year: 'No date', count: noDate })

  return points
}

function parsePriceToNumber(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null

  const cleaned = s.replace(/[^\d,.-]/g, '')
  if (!cleaned) return null

  let normalized = cleaned
  const hasDot = normalized.includes('.')
  const hasComma = normalized.includes(',')
  if (hasDot && hasComma) {
    normalized = normalized.replace(/,/g, '')
  } else if (!hasDot && hasComma) {
    normalized = normalized.replace(',', '.')
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function platformFromRow(row: ListingRow): string {
  return row.platform || 'Unknown'
}

export function moneySpentPerYear(rows: ListingRow[]): MoneyPerYearPoint[] {
  const totals = new Map<number, number>()
  for (const r of rows) {
    const y = parsePurchaseYear(r.purchaseDate)
    if (y == null) continue
    const p = parsePriceToNumber(r.price)
    if (p == null) continue
    totals.set(y, (totals.get(y) ?? 0) + p)
  }
  return [...totals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, amount]) => ({ year, amount }))
}

export function moneySpentPerPlatform(rows: ListingRow[]): MoneyPerPlatformPoint[] {
  const totals = new Map<string, number>()
  for (const r of rows) {
    const platform = platformFromRow(r)
    const p = parsePriceToNumber(r.price)
    if (p == null) continue
    totals.set(platform, (totals.get(platform) ?? 0) + p)
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([platform, amount]) => ({ platform, amount }))
}

export function titlesOwnedPerPlatform(rows: ListingRow[]): CountPerPlatformPoint[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const platform = platformFromRow(r)
    counts.set(platform, (counts.get(platform) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([platform, count]) => ({ platform, count }))
}

export function titlesByLocation(rows: ListingRow[]): CountPerLocationPoint[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const loc = r.location.trim()
    const key = loc || 'No location'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))
}

export function platformSummary(rows: ListingRow[]): PlatformSummaryRow[] {
  const titles = new Map<string, number>()
  const spent = new Map<string, number>()

  for (const r of rows) {
    const platform = platformFromRow(r)
    titles.set(platform, (titles.get(platform) ?? 0) + 1)

    const p = parsePriceToNumber(r.price)
    if (p != null) {
      spent.set(platform, (spent.get(platform) ?? 0) + p)
    }
  }

  const platforms = new Set([...titles.keys(), ...spent.keys()])
  return [...platforms]
    .sort((a, b) => a.localeCompare(b))
    .map((platform) => {
      const t = titles.get(platform) ?? 0
      const s = spent.get(platform) ?? 0
      return {
        platform,
        titles: t,
        spent: s,
        avgCost: t > 0 ? s / t : null,
      }
    })
}

export function purchaseYearDiagnostics(rows: ListingRow[]): PurchaseYearDiagnostics {
  const totalRows = rows.length
  let parsedRows = 0
  const samples: string[] = []

  for (const r of rows) {
    const y = parsePurchaseYear(r.purchaseDate)
    if (y != null) {
      parsedRows++
      continue
    }
    const v = r.purchaseDate.trim()
    if (!v) continue
    if (samples.length < 8 && !samples.includes(v)) samples.push(v)
  }

  return {
    totalRows,
    parsedRows,
    unparsedRows: totalRows - parsedRows,
    sampleUnparsedValues: samples,
  }
}

