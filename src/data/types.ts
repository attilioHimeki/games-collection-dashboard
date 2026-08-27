export type ListingKind = 'game' | 'console'

export type ListingRow = {
  id: string
  title: string
  price: string
  condition: string
  delivery: string
  purchaseDate: string
  region: string
  tags: string
  location: string
  lastSeen: string
  source: string
  platform: string
  kind: ListingKind
}

export const REQUIRED_COLUMNS = [
  'ID',
  'Title',
  'Price',
  'New/Used',
  'Shipped/Local',
  'Purchase Date',
  'Region',
  'Tags',
  'Location',
  'Last Seen',
] as const

export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number]

