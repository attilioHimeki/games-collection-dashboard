import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ListingRow } from '../data/types'
import { loadListingsOnce } from '../data/loadListings'
import {
  moneySpentPerPlatform,
  moneySpentPerYear,
  platformSummary,
  isBlankLocation,
  isMissingLocationEntry,
  purchaseYearDiagnostics,
  purchasesPerYear,
  titlesByLocation,
  titlesOwnedPerPlatform,
} from './analytics'
import { PlatformIcon } from './platformIcon'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; rows: ListingRow[]; errors: string[] }

type PlatformSortKey = 'platform' | 'titles' | 'spent' | 'avgCost'
type SortDir = 'asc' | 'desc'

const LOCATION_PIE_COLORS = [
  '#7c5cff',
  '#ff6b9a',
  '#3ddc97',
  '#ffd166',
  '#4ea8de',
  '#e599f7',
  '#a5d8ff',
  '#ff922b',
  '#51cf66',
  '#ff8787',
]

export function Dashboard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [quickChecksOpen, setQuickChecksOpen] = useState(true)
  const [platformSort, setPlatformSort] = useState<{ key: PlatformSortKey; dir: SortDir }>({
    key: 'platform',
    dir: 'asc',
  })
  const [piePointerTip, setPiePointerTip] = useState<{
    x: number
    y: number
    name: string
    value: number
  } | null>(null)
  const pieLocationWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void loadListingsOnce().then(({ rows, errors }) => {
      if (cancelled) return
      setState({ status: 'ready', rows, errors })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = state.status === 'ready' ? state.rows : []
  const errors = state.status === 'ready' ? state.errors : []

  const rowsForMetrics = useMemo(
    () => rows.filter((r) => !isMissingLocationEntry(r)),
    [rows],
  )

  const perYear = useMemo(() => purchasesPerYear(rowsForMetrics), [rowsForMetrics])
  const spentPerYear = useMemo(() => moneySpentPerYear(rowsForMetrics), [rowsForMetrics])
  const spentPerPlatform = useMemo(() => moneySpentPerPlatform(rowsForMetrics), [rowsForMetrics])
  const ownedPerPlatform = useMemo(() => titlesOwnedPerPlatform(rowsForMetrics), [rowsForMetrics])
  const platformTable = useMemo(() => platformSummary(rowsForMetrics), [rowsForMetrics])
  const yearDiag = useMemo(() => purchaseYearDiagnostics(rowsForMetrics), [rowsForMetrics])
  const byLocation = useMemo(() => titlesByLocation(rows), [rows])

  useEffect(() => {
    setPiePointerTip(null)
  }, [byLocation])

  const platformTableSorted = useMemo(() => {
    const dirMul = platformSort.dir === 'asc' ? 1 : -1

    return platformTable
      .map((r, idx) => ({ r, idx }))
      .sort((a, b) => {
        const ra = a.r
        const rb = b.r

        let cmp = 0
        switch (platformSort.key) {
          case 'platform':
            cmp = ra.platform.localeCompare(rb.platform, undefined, { sensitivity: 'base' })
            break
          case 'titles':
            cmp = ra.titles - rb.titles
            break
          case 'spent':
            cmp = ra.spent - rb.spent
            break
          case 'avgCost': {
            const aNull = ra.avgCost == null
            const bNull = rb.avgCost == null
            if (aNull && bNull) cmp = 0
            else if (aNull) cmp = 1
            else if (bNull) cmp = -1
            else {
              const av = ra.avgCost as number
              const bv = rb.avgCost as number
              cmp = av - bv
            }
            break
          }
        }

        if (cmp !== 0) return cmp * dirMul
        return a.idx - b.idx
      })
      .map(({ r }) => r)
  }, [platformTable, platformSort])

  const totalTitlesPurchasedAllYears = useMemo(
    () => perYear.reduce((sum, p) => sum + p.count, 0),
    [perYear],
  )
  const totalSpentAllYears = useMemo(
    () => spentPerYear.reduce((sum, p) => sum + p.amount, 0),
    [spentPerYear],
  )
  const totalSpentAllPlatforms = useMemo(
    () => spentPerPlatform.reduce((sum, p) => sum + p.amount, 0),
    [spentPerPlatform],
  )
  const totalTitlesOwnedAllPlatforms = useMemo(
    () => ownedPerPlatform.reduce((sum, p) => sum + p.count, 0),
    [ownedPerPlatform],
  )

  const platformChartHeight = useMemo(() => {
    const n = Math.max(spentPerPlatform.length, ownedPerPlatform.length)
    // More platforms need more vertical room for angled labels.
    return Math.min(720, Math.max(340, 240 + n * 14))
  }, [spentPerPlatform.length, ownedPerPlatform.length])

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Games Collection</h1>
        </div>
        <div style={styles.badges}>
          <div style={styles.badge}>
            <div style={styles.badgeLabel}>Games</div>
            <div style={styles.badgeValue}>
              {state.status === 'loading' ? '…' : rowsForMetrics.length}
            </div>
          </div>
          <div style={styles.badge}>
            <div style={styles.badgeLabel}>Platforms</div>
            <div style={styles.badgeValue}>
              {state.status === 'loading'
                ? '…'
                : new Set(rows.map((r) => r.source)).size}
            </div>
          </div>
        </div>
      </header>

      {state.status === 'loading' ? (
        <div style={styles.card}>Loading sheets…</div>
      ) : (
        <>
          {errors.length > 0 && (
            <div style={{ ...styles.card, ...styles.cardWarn }}>
              <div style={styles.cardTitle}>Load warnings</div>
              <ul style={styles.list}>
                {errors.slice(0, 8).map((e) => (
                  <li key={e} style={styles.listItem}>
                    {e}
                  </li>
                ))}
                {errors.length > 8 && (
                  <li style={styles.listItem}>…and {errors.length - 8} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="dashboard-top-grid">
            <div style={styles.card}>
              <div style={styles.cardTitle}>Titles purchased per year</div>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perYear} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="rgba(232, 238, 252, 0.08)" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: 'rgba(232, 238, 252, 0.75)', fontSize: 12 }}
                      axisLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      tickLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: 'rgba(232, 238, 252, 0.75)', fontSize: 12 }}
                      axisLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      tickLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(14, 20, 38, 0.98)',
                        border: '1px solid rgba(232, 238, 252, 0.15)',
                        borderRadius: 10,
                        color: '#e8eefc',
                      }}
                      labelStyle={{ color: 'rgba(232, 238, 252, 0.8)' }}
                      cursor={{ fill: 'rgba(232, 238, 252, 0.06)' }}
                    />
                    <Bar dataKey="count" fill="#7c5cff" radius={[10, 10, 2, 2]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={styles.footerTotalRow}>
                <div style={styles.footerTotalLabel}>Total titles (all years)</div>
                <div style={styles.footerTotalValue}>{totalTitlesPurchasedAllYears}</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Games by location</div>
              <div style={styles.chartWrap}>
                {byLocation.length === 0 ? (
                  <div style={styles.chartEmpty}>No games to chart.</div>
                ) : (
                  <div
                    ref={pieLocationWrapRef}
                    style={{ position: 'relative', width: '100%', height: '100%' }}
                    onMouseLeave={() => setPiePointerTip(null)}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                        <Pie
                          data={byLocation}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="46%"
                          innerRadius={0}
                          outerRadius={92}
                          paddingAngle={1}
                          isAnimationActive={false}
                          onMouseEnter={(data, index, e) => {
                            const rect = pieLocationWrapRef.current?.getBoundingClientRect()
                            if (!rect) return
                            const name = String(data.name ?? byLocation[index]?.name ?? '')
                            const value = Number(data.value ?? byLocation[index]?.value ?? 0)
                            setPiePointerTip({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                              name,
                              value,
                            })
                          }}
                          onMouseMove={(data, index, e) => {
                            const rect = pieLocationWrapRef.current?.getBoundingClientRect()
                            if (!rect) return
                            const name = String(data.name ?? byLocation[index]?.name ?? '')
                            const value = Number(data.value ?? byLocation[index]?.value ?? 0)
                            setPiePointerTip({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                              name,
                              value,
                            })
                          }}
                        >
                          {byLocation.map((entry, i) => (
                            <Cell
                              key={`${entry.name}-${i}`}
                              fill={LOCATION_PIE_COLORS[i % LOCATION_PIE_COLORS.length]}
                              stroke="rgba(14, 20, 38, 0.85)"
                              strokeWidth={1}
                            />
                          ))}
                        </Pie>
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value) => (
                            <span style={{ color: 'rgba(232, 238, 252, 0.82)', fontSize: 11 }}>{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {piePointerTip ? (
                      <div
                        style={{
                          position: 'absolute',
                          left: piePointerTip.x + 14,
                          top: piePointerTip.y + 14,
                          zIndex: 5,
                          pointerEvents: 'none',
                          background: 'rgba(14, 20, 38, 0.98)',
                          border: '1px solid rgba(232, 238, 252, 0.15)',
                          borderRadius: 10,
                          color: '#e8eefc',
                          padding: '8px 12px',
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        }}
                      >
                        {`${piePointerTip.name}: ${piePointerTip.value}`}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div style={styles.card}>
            <div style={styles.cardTitle}>Money spent per year</div>
            <div style={styles.chartWrapWide}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={spentPerYear}
                  margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid stroke="rgba(232, 238, 252, 0.08)" />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: 'rgba(232, 238, 252, 0.75)', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                    tickLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(232, 238, 252, 0.75)', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                    tickLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                    tickFormatter={(v) => formatMoneyTick(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(14, 20, 38, 0.98)',
                      border: '1px solid rgba(232, 238, 252, 0.15)',
                      borderRadius: 10,
                      color: '#e8eefc',
                    }}
                    labelStyle={{ color: 'rgba(232, 238, 252, 0.8)' }}
                    cursor={{ fill: 'rgba(232, 238, 252, 0.06)' }}
                    formatter={(value) => [formatMoney(Number(value)), 'Spent']}
                  />
                  <Bar dataKey="amount" fill="#23d5ab" radius={[10, 10, 2, 2]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={styles.footerTotalRow}>
              <div style={styles.footerTotalLabel}>Total spent (all years)</div>
              <div style={styles.footerTotalValue}>{formatMoney(totalSpentAllYears)}</div>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div style={styles.stack}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Money spent per platform</div>
              <div style={{ ...styles.chartWrapWide, height: platformChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={spentPerPlatform}
                    margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="rgba(232, 238, 252, 0.08)" />
                    <XAxis
                      dataKey="platform"
                      tick={{ fill: 'rgba(232, 238, 252, 0.75)', fontSize: 12 }}
                      axisLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      tickLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={64}
                    />
                    <YAxis
                      tick={{ fill: 'rgba(232, 238, 252, 0.75)', fontSize: 12 }}
                      axisLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      tickLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      tickFormatter={(v) => formatMoneyTick(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(14, 20, 38, 0.98)',
                        border: '1px solid rgba(232, 238, 252, 0.15)',
                        borderRadius: 10,
                        color: '#e8eefc',
                      }}
                      labelStyle={{ color: 'rgba(232, 238, 252, 0.8)' }}
                      cursor={{ fill: 'rgba(232, 238, 252, 0.06)' }}
                      formatter={(value) => [formatMoney(Number(value)), 'Spent']}
                    />
                    <Bar dataKey="amount" fill="#ff6b9a" radius={[10, 10, 2, 2]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={styles.footerTotalRow}>
                <div style={styles.footerTotalLabel}>Total spent (all platforms)</div>
                <div style={styles.footerTotalValue}>{formatMoney(totalSpentAllPlatforms)}</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Titles owned per platform</div>
              <div style={{ ...styles.chartWrapWide, height: platformChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ownedPerPlatform}
                    margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="rgba(232, 238, 252, 0.08)" />
                    <XAxis
                      dataKey="platform"
                      tick={{ fill: 'rgba(232, 238, 252, 0.75)', fontSize: 12 }}
                      axisLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      tickLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={64}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: 'rgba(232, 238, 252, 0.75)', fontSize: 12 }}
                      axisLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                      tickLine={{ stroke: 'rgba(232, 238, 252, 0.18)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(14, 20, 38, 0.98)',
                        border: '1px solid rgba(232, 238, 252, 0.15)',
                        borderRadius: 10,
                        color: '#e8eefc',
                      }}
                      labelStyle={{ color: 'rgba(232, 238, 252, 0.8)' }}
                      cursor={{ fill: 'rgba(232, 238, 252, 0.06)' }}
                    />
                    <Bar dataKey="count" fill="#7c5cff" radius={[10, 10, 2, 2]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={styles.footerNote} />
              <div style={styles.footerTotalRow}>
                <div style={styles.footerTotalLabel}>Total titles (all platforms)</div>
                <div style={styles.footerTotalValue}>{totalTitlesOwnedAllPlatforms}</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Platform summary</div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>
                        <button
                          type="button"
                          style={styles.thButton}
                          onClick={() => toggleSort(setPlatformSort, 'platform')}
                        >
                          Platform {sortGlyph(platformSort, 'platform')}
                        </button>
                      </th>
                      <th style={styles.thRight}>
                        <button
                          type="button"
                          style={styles.thButtonRight}
                          onClick={() => toggleSort(setPlatformSort, 'titles')}
                        >
                          Titles {sortGlyph(platformSort, 'titles')}
                        </button>
                      </th>
                      <th style={styles.thRight}>
                        <button
                          type="button"
                          style={styles.thButtonRight}
                          onClick={() => toggleSort(setPlatformSort, 'spent')}
                        >
                          Spent {sortGlyph(platformSort, 'spent')}
                        </button>
                      </th>
                      <th style={styles.thRight}>
                        <button
                          type="button"
                          style={styles.thButtonRight}
                          onClick={() => toggleSort(setPlatformSort, 'avgCost')}
                        >
                          Avg cost / game {sortGlyph(platformSort, 'avgCost')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformTableSorted.map((r) => (
                      <tr key={r.platform}>
                        <td style={styles.td}>
                          <div style={styles.platformCell}>
                            <PlatformIcon platform={r.platform} />
                            <span>{r.platform}</span>
                          </div>
                        </td>
                        <td style={styles.tdRight}>{r.titles}</td>
                        <td style={styles.tdRight}>{formatMoney(r.spent)}</td>
                        <td style={styles.tdRight}>
                          {r.avgCost == null ? '—' : formatMoney(r.avgCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <details
              style={styles.card}
              open={quickChecksOpen}
              onToggle={(e) => setQuickChecksOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary style={styles.summary}>
                <span style={styles.cardTitle}>Quick checks</span>
                <span style={styles.summaryHint}>{quickChecksOpen ? 'Hide' : 'Show'}</span>
              </summary>
              <div style={styles.kv}>
                <div style={styles.k}>Rows missing a purchase date</div>
                <div style={styles.v}>{rows.filter((r) => !r.purchaseDate.trim()).length}</div>
              </div>
              <div style={styles.kv}>
                <div style={styles.k}>Rows missing a purchase price</div>
                <div style={styles.v}>{rows.filter((r) => !r.price.trim()).length}</div>
              </div>
              <div style={styles.kv}>
                <div style={styles.k}>Rows with blank Location</div>
                <div style={styles.v}>{rows.filter(isBlankLocation).length}</div>
              </div>
              {yearDiag.sampleUnparsedValues.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={styles.mutedTitle}>Examples of unparsed dates</div>
                  <div style={styles.monoBox}>{yearDiag.sampleUnparsedValues.join(' • ')}</div>
                </div>
              )}
            </details>
          </div>
        </>
      )}
    </div>
  )
}

const moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' })
function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  return moneyFmt.format(n)
}
function formatMoneyTick(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function sortGlyph(sort: { key: PlatformSortKey; dir: SortDir }, key: PlatformSortKey): string {
  if (sort.key !== key) return ''
  return sort.dir === 'asc' ? '↑' : '↓'
}

function toggleSort(
  setSort: React.Dispatch<React.SetStateAction<{ key: PlatformSortKey; dir: SortDir }>>,
  key: PlatformSortKey,
) {
  setSort((prev) => {
    if (prev.key !== key) return { key, dir: 'asc' }
    return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
  })
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    maxWidth: 1100,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'rgba(232, 238, 252, 0.65)',
  },
  h1: {
    margin: '6px 0 0',
    fontSize: 32,
    lineHeight: 1.1,
  },
  badges: {
    display: 'flex',
    gap: 12,
  },
  badge: {
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(232, 238, 252, 0.14)',
    background: 'rgba(14, 20, 38, 0.6)',
    minWidth: 110,
  },
  badgeLabel: {
    fontSize: 12,
    color: 'rgba(232, 238, 252, 0.7)',
  },
  badgeValue: {
    fontSize: 18,
    marginTop: 2,
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    alignItems: 'stretch',
  },
  card: {
    borderRadius: 18,
    border: '1px solid rgba(232, 238, 252, 0.14)',
    background: 'rgba(14, 20, 38, 0.6)',
    padding: 16,
  },
  cardWarn: {
    border: '1px solid rgba(255, 197, 92, 0.35)',
    background: 'rgba(255, 197, 92, 0.08)',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    color: 'rgba(232, 238, 252, 0.85)',
    marginBottom: 10,
  },
  thButton: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    padding: 0,
    margin: 0,
    font: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  thButtonRight: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    padding: 0,
    margin: 0,
    font: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    width: '100%',
  },
  summary: {
    listStyle: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
    userSelect: 'none',
  },
  summaryHint: {
    fontSize: 12,
    color: 'rgba(232, 238, 252, 0.6)',
  },
  chartWrap: {
    width: '100%',
    height: 320,
  },
  chartEmpty: {
    height: '100%',
    minHeight: 280,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    color: 'rgba(232, 238, 252, 0.55)',
  },
  chartWrapShort: {
    width: '100%',
    height: 300,
  },
  chartWrapWide: {
    width: '100%',
    height: 340,
  },
  footerNote: {
    marginTop: 10,
    fontSize: 12,
    color: 'rgba(232, 238, 252, 0.65)',
  },
  footerTotalRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px solid rgba(232, 238, 252, 0.10)',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'baseline',
  },
  footerTotalLabel: {
    fontSize: 12,
    color: 'rgba(232, 238, 252, 0.7)',
  },
  footerTotalValue: {
    fontSize: 14,
    color: 'rgba(232, 238, 252, 0.92)',
    fontWeight: 600,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  tableWrap: {
    width: '100%',
    overflowX: 'auto',
    borderRadius: 14,
    border: '1px solid rgba(232, 238, 252, 0.12)',
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  th: {
    textAlign: 'left',
    fontSize: 12,
    color: 'rgba(232, 238, 252, 0.7)',
    padding: '14px 18px',
    background: 'rgba(232, 238, 252, 0.04)',
    borderBottom: '1px solid rgba(232, 238, 252, 0.1)',
    whiteSpace: 'nowrap',
  },
  thRight: {
    textAlign: 'right',
    fontSize: 12,
    color: 'rgba(232, 238, 252, 0.7)',
    padding: '14px 18px',
    background: 'rgba(232, 238, 252, 0.04)',
    borderBottom: '1px solid rgba(232, 238, 252, 0.1)',
    whiteSpace: 'nowrap',
  },
  td: {
    fontSize: 13,
    padding: '14px 18px',
    borderBottom: '1px solid rgba(232, 238, 252, 0.06)',
    whiteSpace: 'nowrap',
    lineHeight: 1.35,
  },
  tdRight: {
    fontSize: 13,
    padding: '14px 18px',
    borderBottom: '1px solid rgba(232, 238, 252, 0.06)',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    lineHeight: 1.35,
  },
  platformCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  mutedTitle: {
    fontSize: 12,
    color: 'rgba(232, 238, 252, 0.65)',
    marginBottom: 6,
  },
  monoBox: {
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    color: 'rgba(232, 238, 252, 0.85)',
    background: 'rgba(232, 238, 252, 0.06)',
    border: '1px solid rgba(232, 238, 252, 0.12)',
    borderRadius: 12,
    padding: '10px 12px',
    overflowX: 'auto',
  },
  list: {
    margin: 0,
    paddingLeft: 18,
  },
  listItem: {
    fontSize: 13,
    color: 'rgba(232, 238, 252, 0.9)',
    marginBottom: 6,
  },
  kv: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid rgba(232, 238, 252, 0.08)',
  },
  k: {
    color: 'rgba(232, 238, 252, 0.75)',
    fontSize: 13,
  },
  v: {
    fontSize: 13,
  },
}

