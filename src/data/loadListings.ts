import Papa from 'papaparse'
import { loadGoogleSheetsSources, type GoogleSheetSource } from './sheetsConfig'
import { REQUIRED_COLUMNS, type ListingRow, type RequiredColumn } from './types'

export type LoadResult = {
  rows: ListingRow[]
  errors: string[]
  sources: SourceLoadReport[]
}

let cached: ListingRow[] | null = null
let cachedErrors: string[] = []
let cachedSources: SourceLoadReport[] = []
let inFlight: Promise<LoadResult> | null = null

export type SourceLoadReport = {
  label: string
  platform: string
  url: string
  rowCount: number
  error?: string
}

function sourceLabel(src: GoogleSheetSource): string {
  return src.label ?? `${src.spreadsheetId}${src.sheetName ? `/${src.sheetName}` : ''}`
}

function sourcePlatform(src: GoogleSheetSource): string {
  return src.sheetName ?? src.label ?? 'Unknown'
}

function toCsvUrl(src: GoogleSheetSource): string {
  // gviz endpoint works well for public/accessible sheets.
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(src.spreadsheetId)}/gviz/tq`
  const params = new URLSearchParams({ tqx: 'out:csv' })
  if (src.sheetName) params.set('sheet', src.sheetName)
  return `${base}?${params.toString()}`
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeHeaderKey(h: unknown): string {
  return normalizeHeader(h).toLowerCase()
}

function validateHeaders(headers: string[]): { ok: true } | { ok: false; missing: RequiredColumn[] } {
  const set = new Set(headers.map(normalizeHeaderKey))
  const missing = REQUIRED_COLUMNS.filter((c) => !set.has(normalizeHeaderKey(c)))
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

function mapRow(
  raw: Record<string, unknown>,
  source: string,
  platform: string,
  col: Record<RequiredColumn, string>,
): ListingRow {
  const get = (k: RequiredColumn) => String(raw[col[k]] ?? '').trim()
  return {
    id: get('ID'),
    title: get('Title'),
    price: get('Price'),
    condition: get('New/Used'),
    delivery: get('Shipped/Local'),
    purchaseDate: get('Purchase Date'),
    region: get('Region'),
    tags: get('Tags'),
    location: get('Location'),
    lastSeen: get('Last Seen'),
    source,
    platform,
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return await res.text()
}

export async function loadListingsOnce(): Promise<LoadResult> {
  if (cached) return { rows: cached, errors: cachedErrors, sources: cachedSources }
  if (inFlight) return inFlight

  inFlight = (async () => {
    const errors: string[] = []
    const rows: ListingRow[] = []
    const sources: SourceLoadReport[] = []

    let googleSources: GoogleSheetSource[]
    try {
      googleSources = await loadGoogleSheetsSources()
    } catch (e) {
      errors.push(`Google Sheets config: ${(e as Error).message}`)
      cached = []
      cachedErrors = errors
      cachedSources = []
      return { rows: cached, errors: cachedErrors, sources: cachedSources }
    }

    if (googleSources.length === 0) {
      errors.push(
        'No Google Sheets sources configured. Add entries to public/google-sheets-sources.json.',
      )
      cached = []
      cachedErrors = errors
      cachedSources = []
      return { rows: cached, errors: cachedErrors, sources: cachedSources }
    }

    await Promise.all(
      googleSources.map(async (src) => {
        const label = sourceLabel(src)
        const platform = sourcePlatform(src)
        const url = toCsvUrl(src)
        const report: SourceLoadReport = { label, platform, url, rowCount: 0 }
        try {
          const csvText = await fetchText(url)
          const parsed = Papa.parse<Record<string, unknown>>(csvText, {
            header: true,
            skipEmptyLines: 'greedy',
            dynamicTyping: false,
          })

          const rawHeaders = parsed.meta.fields ?? []
          const headers = rawHeaders.map(normalizeHeader)
          const v = validateHeaders(headers)
          if (v.ok === false) {
            const msg = `${label}: missing columns: ${v.missing.join(', ')}`
            errors.push(msg)
            report.error = msg
            sources.push(report)
            return
          }

          const headerLookup = new Map<string, string>()
          for (const h of rawHeaders) {
            headerLookup.set(normalizeHeaderKey(h), String(h))
          }
          const col = Object.fromEntries(
            REQUIRED_COLUMNS.map((c) => [c, headerLookup.get(normalizeHeaderKey(c)) ?? c]),
          ) as Record<RequiredColumn, string>

          if (parsed.errors?.length) {
            for (const e of parsed.errors) {
              errors.push(`${label}: ${e.message}`)
            }
          }

          let added = 0
          for (const r of parsed.data) {
            // Ignore completely empty rows.
            const hasAny = Object.values(r).some((v) => String(v ?? '').trim() !== '')
            if (!hasAny) continue
            rows.push(mapRow(r, label, platform, col))
            added++
          }
          report.rowCount = added
          sources.push(report)
        } catch (e) {
          const msg = `${label}: ${(e as Error).message}`
          errors.push(msg)
          report.error = msg
          sources.push(report)
        }
      }),
    )

    cached = rows
    cachedErrors = errors
    cachedSources = sources
    return { rows, errors, sources }
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}

export function getListings(): ListingRow[] {
  return cached ?? []
}

export function getListingLoadErrors(): string[] {
  return cachedErrors
}

export function getSourceLoadReport(): SourceLoadReport[] {
  return cachedSources
}

/**
 * Fire-and-forget load; logs errors to console.
 */
export function loadListingsInBackground(): void {
  void loadListingsOnce().then(({ rows, errors }) => {
    // eslint-disable-next-line no-console
    console.info(`[listings] loaded ${rows.length} rows`)
    if (errors.length) {
      // eslint-disable-next-line no-console
      console.warn('[listings] load errors:', errors)
    }
  })
}

