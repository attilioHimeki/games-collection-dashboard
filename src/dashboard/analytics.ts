import type { ListingRow } from '../data/types'

export type PurchasesPerYearPoint = { year: string; count: number }
export type MoneyPerYearPoint = { year: number; amount: number }
export type MoneyPerYearByKindPoint = { year: string; games: number; consoles: number }
export type MoneyPerPlatformPoint = { platform: string; amount: number }
export type CountPerPlatformPoint = { platform: string; count: number }
/** Recharts pie: `name` + `value` */
export type CountPerLocationPoint = { name: string; value: number }
export type SeriesOwnedCountRow = { series: string; ownedTitles: number }
export type SeriesOwnedTitlesRow = {
  series: string
  ownedTitles: number
  titles: { title: string; platform: string }[]
}
export type LastSeenMaintenanceRow = {
  title: string
  platform: string
  lastSeen: string
  parsedDate: Date | null
}
/** City / shelf where the collection should live long-term (used in platform summary). */
export const FINAL_COLLECTION_LOCATION = 'Berlin'

export function isInFinalCollectionLocation(row: ListingRow): boolean {
  return row.location.trim().toLowerCase() === FINAL_COLLECTION_LOCATION.toLowerCase()
}

export type PlatformSummaryRow = {
  platform: string
  titles: number
  inFinalLocation: number
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

function parseFullDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null

  if (/^\d{4,6}$/.test(s)) {
    const d = excelSerialToDate(Number(s))
    if (d) return d
  }

  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    if (!Number.isNaN(dt.getTime())) return dt
  }

  const us = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (us) {
    const dt = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]))
    if (!Number.isNaN(dt.getTime())) return dt
  }

  const us2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/)
  if (us2) {
    const y = expandTwoDigitYear(Number(us2[3]))
    const dt = new Date(y, Number(us2[1]) - 1, Number(us2[2]))
    if (!Number.isNaN(dt.getTime())) return dt
  }

  const yr = s.match(/^(\d{4})$/)
  if (yr) {
    const y = Number(yr[1])
    if (y >= 1970 && y <= 2100) return new Date(y, 0, 1)
  }

  const dt = new Date(s)
  if (!Number.isNaN(dt.getTime())) return dt
  return null
}

export function lastSeenMaintenance(
  rows: ListingRow[],
  now: Date = new Date(),
): LastSeenMaintenanceRow[] {
  const cutoff = new Date(now)
  cutoff.setFullYear(cutoff.getFullYear() - 1)

  const result: LastSeenMaintenanceRow[] = []
  for (const r of rows) {
    const raw = String(r.lastSeen ?? '').trim()
    const parsedDate = parseFullDate(raw)
    if (!raw || parsedDate == null || parsedDate < cutoff) {
      result.push({
        title: r.title,
        platform: r.platform || r.source,
        lastSeen: raw,
        parsedDate,
      })
    }
  }

  result.sort((a, b) => {
    const aMissing = a.parsedDate == null
    const bMissing = b.parsedDate == null
    if (aMissing && !bMissing) return -1
    if (!aMissing && bMissing) return 1
    if (aMissing && bMissing) {
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    }
    return (a.parsedDate as Date).getTime() - (b.parsedDate as Date).getTime()
  })

  return result
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

export function moneySpentPerYearByKind(rows: ListingRow[]): MoneyPerYearByKindPoint[] {
  const games = new Map<number, number>()
  const consoles = new Map<number, number>()
  let noDateGames = 0
  let noDateConsoles = 0
  for (const r of rows) {
    const p = parsePriceToNumber(r.price)
    if (p == null) continue
    const y = parsePurchaseYear(r.purchaseDate)
    if (y == null) {
      if (r.kind === 'console') noDateConsoles += p
      else noDateGames += p
      continue
    }
    const bucket = r.kind === 'console' ? consoles : games
    bucket.set(y, (bucket.get(y) ?? 0) + p)
  }
  const years = new Set<number>([...games.keys(), ...consoles.keys()])
  const points: MoneyPerYearByKindPoint[] = [...years]
    .sort((a, b) => a - b)
    .map((year) => ({
      year: String(year),
      games: games.get(year) ?? 0,
      consoles: consoles.get(year) ?? 0,
    }))

  if (noDateGames > 0 || noDateConsoles > 0) {
    points.unshift({ year: 'No date', games: noDateGames, consoles: noDateConsoles })
  }

  return points
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
  const inFinal = new Map<string, number>()
  const spent = new Map<string, number>()

  for (const r of rows) {
    const platform = platformFromRow(r)
    titles.set(platform, (titles.get(platform) ?? 0) + 1)
    if (isInFinalCollectionLocation(r)) {
      inFinal.set(platform, (inFinal.get(platform) ?? 0) + 1)
    }

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
        inFinalLocation: inFinal.get(platform) ?? 0,
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

function normalizeForSeriesMatch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function includesAny(haystack: string, needles: string[]): boolean {
  for (const n of needles) {
    if (haystack.includes(n)) return true
  }
  return false
}

export function ownedTitlesByPopularSeries(rows: ListingRow[]): SeriesOwnedCountRow[] {
  const mario = ['mario', 'luigi']
  const marioExtended = [
    ...mario,
    'toad',
    'donkey kong',
    'peach',
    'yoshi',
    'wario',
    'smash',
    'smash bros',
    'super smash',
    'super smash bros',
    'ssbu',
  ]
  const zelda = ['zelda', 'link', 'hyrule', 'triforce']
  const pokemon = ['pokemon', 'pokken']
  const finalFantasy = [
    'final fantasy',
    'theatrhythm',
    'dissidia',
    'crisis core',
    'chocobo',
    'stranger of paradise',
    'world of final fantasy',
  ]
  const kirby = ['kirby']
  const sonic = ['sonic']
  const metroid = ['metroid']
  const metalGear = ['metal gear']
  const silentHill = ['silent hill']
  const residentEvil = ['resident evil', 'biohazard']
  const fifa = ['fifa']
  const fatalFrame = ['fatal frame', 'project zero']
  const halo = ['halo']
  const gearsOfWar = ['gears of war', 'gears']
  const callOfDuty = ['call of duty']
  const yakuzaLikeADragon = ['yakuza', 'like a dragon', 'ryu ga gotoku']

  const counts: SeriesOwnedCountRow[] = [
    { series: 'Mario', ownedTitles: 0 },
    { series: 'Mario (extended)', ownedTitles: 0 },
    { series: 'Zelda', ownedTitles: 0 },
    { series: 'Pokemon', ownedTitles: 0 },
    { series: 'Final Fantasy', ownedTitles: 0 },
    { series: 'Kirby', ownedTitles: 0 },
    { series: 'Sonic', ownedTitles: 0 },
    { series: 'Metroid', ownedTitles: 0 },
    { series: 'Metal Gear', ownedTitles: 0 },
    { series: 'Silent Hill', ownedTitles: 0 },
    { series: 'Resident Evil', ownedTitles: 0 },
    { series: 'Fifa', ownedTitles: 0 },
    { series: 'Fatal Frame', ownedTitles: 0 },
    { series: 'Halo', ownedTitles: 0 },
    { series: 'Gears of War', ownedTitles: 0 },
    { series: 'Call of Duty', ownedTitles: 0 },
    { series: 'Yakuza / Like a Dragon', ownedTitles: 0 },
  ]

  for (const r of rows) {
    const t = normalizeForSeriesMatch(r.title ?? '')
    if (!t) continue

    if (includesAny(t, mario)) counts[0].ownedTitles++
    if (includesAny(t, marioExtended)) counts[1].ownedTitles++
    if (includesAny(t, zelda)) counts[2].ownedTitles++
    if (includesAny(t, pokemon)) counts[3].ownedTitles++
    if (includesAny(t, finalFantasy)) counts[4].ownedTitles++
    if (includesAny(t, kirby)) counts[5].ownedTitles++
    if (includesAny(t, sonic)) counts[6].ownedTitles++
    if (includesAny(t, metroid)) counts[7].ownedTitles++
    if (includesAny(t, metalGear)) counts[8].ownedTitles++
    if (includesAny(t, silentHill)) counts[9].ownedTitles++
    if (includesAny(t, residentEvil)) counts[10].ownedTitles++
    if (includesAny(t, fifa)) counts[11].ownedTitles++
    if (includesAny(t, fatalFrame)) counts[12].ownedTitles++
    if (includesAny(t, halo)) counts[13].ownedTitles++
    if (includesAny(t, gearsOfWar)) counts[14].ownedTitles++
    if (includesAny(t, callOfDuty)) counts[15].ownedTitles++
    if (includesAny(t, yakuzaLikeADragon)) counts[16].ownedTitles++

    // Special-case: "Zero" is only treated as Fatal Frame on Wii (not Wii U).
    const p = normalizeForSeriesMatch(r.platform ?? r.source ?? '')
    const isWii = p.includes('wii') && !p.includes('wii u')
    if (isWii && t.includes('zero')) counts[12].ownedTitles++
  }

  return counts
}

export function ownedTitlesByPopularSeriesWithTitles(rows: ListingRow[]): SeriesOwnedTitlesRow[] {
  const mario = ['mario', 'luigi']
  const marioExtended = [
    ...mario,
    'toad',
    'donkey kong',
    'peach',
    'yoshi',
    'wario',
    'smash',
    'smash bros',
    'super smash',
    'super smash bros',
    'ssbu',
  ]
  const zelda = ['zelda', 'link', 'hyrule', 'triforce']
  const pokemon = ['pokemon', 'pokken']
  const finalFantasy = [
    'final fantasy',
    'theatrhythm',
    'dissidia',
    'crisis core',
    'chocobo',
    'stranger of paradise',
    'world of final fantasy',
  ]
  const kirby = ['kirby']
  const sonic = ['sonic']
  const metroid = ['metroid']
  const metalGear = ['metal gear']
  const silentHill = ['silent hill']
  const residentEvil = ['resident evil', 'biohazard']
  const fifa = ['fifa']
  const fatalFrame = ['fatal frame', 'project zero']
  const halo = ['halo']
  const gearsOfWar = ['gears of war', 'gears']
  const callOfDuty = ['call of duty']
  const yakuzaLikeADragon = ['yakuza', 'like a dragon', 'ryu ga gotoku']

  const seriesRows: SeriesOwnedTitlesRow[] = [
    { series: 'Mario', ownedTitles: 0, titles: [] },
    { series: 'Mario (extended)', ownedTitles: 0, titles: [] },
    { series: 'Zelda', ownedTitles: 0, titles: [] },
    { series: 'Pokemon', ownedTitles: 0, titles: [] },
    { series: 'Final Fantasy', ownedTitles: 0, titles: [] },
    { series: 'Kirby', ownedTitles: 0, titles: [] },
    { series: 'Sonic', ownedTitles: 0, titles: [] },
    { series: 'Metroid', ownedTitles: 0, titles: [] },
    { series: 'Metal Gear', ownedTitles: 0, titles: [] },
    { series: 'Silent Hill', ownedTitles: 0, titles: [] },
    { series: 'Resident Evil', ownedTitles: 0, titles: [] },
    { series: 'Fifa', ownedTitles: 0, titles: [] },
    { series: 'Fatal Frame', ownedTitles: 0, titles: [] },
    { series: 'Halo', ownedTitles: 0, titles: [] },
    { series: 'Gears of War', ownedTitles: 0, titles: [] },
    { series: 'Call of Duty', ownedTitles: 0, titles: [] },
    { series: 'Yakuza / Like a Dragon', ownedTitles: 0, titles: [] },
  ]

  for (const r of rows) {
    const rawTitle = String(r.title ?? '').trim()
    const t = normalizeForSeriesMatch(rawTitle)
    if (!t) continue
    const platform = String(r.platform ?? r.source ?? '').trim()

    if (includesAny(t, mario)) {
      seriesRows[0].ownedTitles++
      if (rawTitle) seriesRows[0].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, marioExtended)) {
      seriesRows[1].ownedTitles++
      if (rawTitle) seriesRows[1].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, zelda)) {
      seriesRows[2].ownedTitles++
      if (rawTitle) seriesRows[2].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, pokemon)) {
      seriesRows[3].ownedTitles++
      if (rawTitle) seriesRows[3].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, finalFantasy)) {
      seriesRows[4].ownedTitles++
      if (rawTitle) seriesRows[4].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, kirby)) {
      seriesRows[5].ownedTitles++
      if (rawTitle) seriesRows[5].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, sonic)) {
      seriesRows[6].ownedTitles++
      if (rawTitle) seriesRows[6].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, metroid)) {
      seriesRows[7].ownedTitles++
      if (rawTitle) seriesRows[7].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, metalGear)) {
      seriesRows[8].ownedTitles++
      if (rawTitle) seriesRows[8].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, silentHill)) {
      seriesRows[9].ownedTitles++
      if (rawTitle) seriesRows[9].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, residentEvil)) {
      seriesRows[10].ownedTitles++
      if (rawTitle) seriesRows[10].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, fifa)) {
      seriesRows[11].ownedTitles++
      if (rawTitle) seriesRows[11].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, fatalFrame)) {
      seriesRows[12].ownedTitles++
      if (rawTitle) seriesRows[12].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, halo)) {
      seriesRows[13].ownedTitles++
      if (rawTitle) seriesRows[13].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, gearsOfWar)) {
      seriesRows[14].ownedTitles++
      if (rawTitle) seriesRows[14].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, callOfDuty)) {
      seriesRows[15].ownedTitles++
      if (rawTitle) seriesRows[15].titles.push({ title: rawTitle, platform })
    }
    if (includesAny(t, yakuzaLikeADragon)) {
      seriesRows[16].ownedTitles++
      if (rawTitle) seriesRows[16].titles.push({ title: rawTitle, platform })
    }

    // Special-case: "Zero" is only treated as Fatal Frame on Wii (not Wii U).
    const p = normalizeForSeriesMatch(platform)
    const isWii = p.includes('wii') && !p.includes('wii u')
    if (isWii && t.includes('zero')) {
      seriesRows[12].ownedTitles++
      if (rawTitle) seriesRows[12].titles.push({ title: rawTitle, platform })
    }
  }

  for (const s of seriesRows) {
    s.titles.sort((a, b) => {
      const tc = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      if (tc !== 0) return tc
      return a.platform.localeCompare(b.platform, undefined, { sensitivity: 'base' })
    })
  }

  return seriesRows
}

