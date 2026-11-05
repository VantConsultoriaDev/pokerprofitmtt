export interface FinancialMovement {
  id: string
  type: 'deposit' | 'withdrawal'
  amount: number
  date: string
  note: string
  createdAt: string
}
