import type { Tournament } from './types'

export const money = (value: number, currency: string = 'BRL') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)

export const invested = (t: Tournament) => t.buyIn * (1 + t.rebuys) + t.addon
export const profit = (t: Tournament) => t.status === 'closed' ? t.payout - invested(t) : -invested(t)

export function bankroll(start: number, tournaments: Tournament[]) {
  return start + tournaments.reduce((sum, t) => sum + (t.status === 'closed' ? t.payout - invested(t) : -invested(t)), 0)
}

export function exportRows(tournaments: Tournament[]) {
  return tournaments.map(t => ({
    Data: t.date, Site: t.site, BI: t.buyIn, Rebuys: t.rebuys, Addon: t.addon,
    'Investimento total': invested(t), Posição: t.position,
    Retorno: t.payout, 'Lucro/prejuízo': profit(t),
    Status: t.status === 'open' ? 'Em andamento' : 'Encerrado',
  }))
}