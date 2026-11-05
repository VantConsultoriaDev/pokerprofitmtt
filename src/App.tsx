import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './supabase'
import DashboardApp from './DashboardApp'
import Login from './Login'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) { setSession(nextSession); setLoading(false) }
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  if (loading) return <div className="auth-loading">Carregando PokerProfitMTT...</div>
  if (!isSupabaseConfigured || !session) return <Login configured={isSupabaseConfigured} />
  return <DashboardApp key={session.user.id} userId={session.user.id} email={session.user.email ?? ""} onSignOut={() => void supabase?.auth.signOut()} />
}
