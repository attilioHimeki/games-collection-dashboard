export type GoogleSheetSource = {
  /**
   * Spreadsheet id from:
   * https://docs.google.com/spreadsheets/d/<spreadsheetId>/edit...
   */
  spreadsheetId: string
  /**
   * Optional sheet/tab name. If omitted, Google returns the first sheet.
   * Example: "Sheet1"
   */
  sheetName?: string
  /**
   * Optional label used in logs/errors.
   */
  label?: string
}

/**
 * Sources are loaded at runtime from `public/google-sheets-sources.json`
 * (gitignored). Copy `public/google-sheets-sources.example.json` to that
 * path and fill in your spreadsheet IDs.
 *
 * Notes:
 * - Your sheet must be accessible without auth for browser fetch to work
 *   (e.g. "Anyone with the link" or "Published to the web").
 * - Each sheet should have a header row with:
 *   ID, Title, Price, New/Used, Shipped/Local, Purchase Date, Region, Tags, Location, Last Seen
 */

const SOURCES_PATH = 'google-sheets-sources.json'

let resolvedSources: GoogleSheetSource[] | null = null

function parseGoogleSheetSources(raw: unknown): GoogleSheetSource[] {
  if (!Array.isArray(raw)) {
    throw new Error('google-sheets-sources.json must be a JSON array')
  }
  const out: GoogleSheetSource[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') {
      throw new Error(`google-sheets-sources.json: entry ${i} must be an object`)
    }
    const o = item as Record<string, unknown>
    if (typeof o.spreadsheetId !== 'string' || !o.spreadsheetId.trim()) {
      throw new Error(
        `google-sheets-sources.json: entry ${i} requires a non-empty spreadsheetId string`,
      )
    }
    const spreadsheetId = o.spreadsheetId.trim()
    const sheetName = typeof o.sheetName === 'string' ? o.sheetName : undefined
    const label = typeof o.label === 'string' ? o.label : undefined
    out.push({ spreadsheetId, sheetName, label })
  }
  return out
}

/**
 * Fetches and parses `public/google-sheets-sources.json` once per session.
 */
export async function loadGoogleSheetsSources(): Promise<GoogleSheetSource[]> {
  if (resolvedSources) return resolvedSources

  const url = `${import.meta.env.BASE_URL}${SOURCES_PATH}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `Missing ${SOURCES_PATH}. Copy public/google-sheets-sources.example.json to public/google-sheets-sources.json and configure your sources.`,
      )
    }
    throw new Error(`HTTP ${res.status} ${res.statusText} while loading ${SOURCES_PATH}`)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new Error(`${SOURCES_PATH} is not valid JSON`)
  }

  resolvedSources = parseGoogleSheetSources(json)
  return resolvedSources
}
