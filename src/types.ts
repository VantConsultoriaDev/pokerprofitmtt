export type TournamentStatus = 'open' | 'closed'
export interface Tournament {
  id: string
  date: string
  site: string
  buyIn: number
  rebuys: number
  addon: number
  position: string
  payout: number
  status: TournamentStatus
}
export interface Settings {
  displayName: string
  baseCurrency?: string
  currency: string
  currencies?: string[]
  startingBankroll: number
  sites: string[]
}