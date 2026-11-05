import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Spade, TrendingUp } from 'lucide-react'
import { supabase } from './supabase'
import './login.css'

const REMEMBER_KEY = 'pokerprofitmtt:remember-email'
type Mode = 'login' | 'register' | 'recover'
export default function Login({ configured }: { configured: boolean }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(REMEMBER_KEY) ?? '' } catch { return '' } })
  const [remember, setRemember] = useState(() => { try { return Boolean(localStorage.getItem(REMEMBER_KEY)) } catch { return false } })
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const changeMode = (next: Mode) => { setMode(next); setError(''); setSuccess('') }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(''); setSuccess('')
    if (!supabase) { setError('Configure o arquivo .env para conectar o Supabase.'); return }
    setBusy(true)
    try {
      if (mode === 'recover') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setSuccess('Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.')
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        if (error) throw error
        if (!data.session) setSuccess('Cadastro recebido. Verifique seu e-mail para confirmar sua conta.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        try { if (remember) localStorage.setItem(REMEMBER_KEY, email.trim()); else localStorage.removeItem(REMEMBER_KEY) } catch { /* browser storage unavailable */ }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível concluir a solicitação.'
      setError(message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : message)
    } finally { setBusy(false) }
  }
  return <main className="auth-page">
    <section className="auth-brand-panel">
      <div className="auth-logo"><div className="auth-logo-icon">♠</div><span>PokerProfit<strong>MTT</strong></span></div>
      <div className="auth-brand-content">
        <span className="auth-kicker"><span className="auth-dot"/> SUA PERFORMANCE EM PRIMEIRO LUGAR</span>
        <h1>Domine seus números.<br/><em>Evolua seu jogo.</em></h1>
        <p>Gerencie seus torneios, acompanhe o ROI e tome decisões melhores com dados reais.</p>
        <div className="auth-feature"><TrendingUp size={18}/><span>Resultados e bankroll em um só lugar</span></div>
        <div className="auth-feature"><ShieldCheck size={18}/><span>Acesso seguro à sua conta</span></div>
      </div>
      <div className="auth-brand-footer">POKERPROFITMTT · CONTROLE DE TORNEIOS</div>
    </section>
    <section className="auth-form-panel"><div className="auth-form-wrap">
      <div className="auth-mobile-logo"><Spade size={22}/> PokerProfit<strong>MTT</strong></div>
      <div className="auth-form-icon"><LockKeyhole size={22}/></div>
      <h2>{mode === 'login' ? 'Bem-vindo de volta' : mode === 'register' ? 'Crie sua conta' : 'Recuperar acesso'}</h2>
      <p className="auth-subtitle">{mode === 'login' ? 'Entre com seus dados para acessar seu painel.' : mode === 'register' ? 'Comece a acompanhar seus resultados de MTT.' : 'Enviaremos um link de recuperação para seu e-mail.'}</p>
      {!configured && <div className="auth-alert">Supabase ainda não configurado. Copie <code>.env.example</code> para <code>.env</code> e informe a URL e a chave pública do projeto.</div>}
      <form onSubmit={submit}>
        <label htmlFor="auth-email">E-mail</label>
        <div className="auth-input-wrap"><Mail size={18}/><input id="auth-email" type="email" placeholder="seuemail@exemplo.com" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
        {mode !== 'recover' && <><div className="auth-label-row"><label htmlFor="auth-password">Senha</label>{mode === 'login' && <button type="button" className="auth-link" onClick={()=>changeMode('recover')}>Esqueceu a senha?</button>}</div>
          <div className="auth-input-wrap"><LockKeyhole size={18}/><input id="auth-password" type={showPassword ? 'text' : 'password'} placeholder="Sua senha" autoComplete={mode==='register'?'new-password':'current-password'} minLength={6} value={password} onChange={e=>setPassword(e.target.value)} required /><button type="button" className="auth-eye" aria-label={showPassword?'Ocultar senha':'Mostrar senha'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></>}
        {mode === 'login' && <label className="auth-remember"><input type="checkbox" checked={remember} onChange={e=>{const checked=e.target.checked;setRemember(checked);if(!checked){try{localStorage.removeItem(REMEMBER_KEY)}catch{/* storage unavailable */}}}} /><span>Lembrar meu e-mail neste dispositivo</span></label>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {success && <div className="auth-success" role="status">{success}</div>}
        <button className="auth-submit" type="submit" disabled={busy || !configured}>{busy?'Aguarde...':mode==='login'?'Entrar na minha conta':mode==='register'?'Criar conta':'Enviar link de recuperação'}<ArrowRight size={18}/></button>
      </form>
      <div className="auth-switch">{mode==='login'?'Ainda não tem uma conta?':mode==='register'?'Já possui uma conta?':'Lembrou sua senha?'} <button type="button" onClick={()=>changeMode(mode==='login'?'register':'login')}>{mode==='login'?'Cadastre-se':'Voltar ao login'}</button></div>
      <div className="auth-secure"><ShieldCheck size={15}/> Autenticação protegida pelo Supabase</div>
    </div></section>
  </main>
}
