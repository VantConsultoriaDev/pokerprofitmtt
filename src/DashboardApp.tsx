import { useMemo, useState, useRef, useEffect } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Activity, CalendarDays, CircleDollarSign, Download, ArrowDownLeft, ArrowUpRight, LayoutDashboard, ListOrdered, Plus, Settings, Trophy, Wallet, X, Pencil, Trash2, Check } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { Settings as AppSettings, Tournament } from './types'
import type { FinancialMovement } from './finance'
import { bankroll, exportRows, invested, money as formatMoney, profit } from './utils'

const initialSettings: AppSettings = {
  displayName: '', currency: 'BRL', baseCurrency: 'BRL', currencies: ['BRL'], startingBankroll: 0,
  sites: [],
}
const load = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
const today = () => new Date().toISOString().slice(0, 10)

export default function App({ userId, email, onSignOut }: { userId: string; email: string; onSignOut: () => void }) {
  const prefix = `ppm-${userId}-`
  const [configured, setConfigured] = useState(() => localStorage.getItem(`ppm-${userId}-onboarded`) === 'true')
  const [page, setPage] = useState<'dashboard' | 'tournaments' | 'finance' | 'profile'>(() => localStorage.getItem(`ppm-${userId}-onboarded`) === 'true' ? 'dashboard' : 'profile')
  const [settings, setSettings] = useState(() => load(`ppm-${userId}-settings`, initialSettings))
  const [tournaments, setTournaments] = useState<Tournament[]>(() => load<Tournament[]>(`ppm-${userId}-tournaments`, []))
  const [movements, setMovements] = useState<FinancialMovement[]>(() => load<FinancialMovement[]>(`${prefix}movements`, []))
  const [movementType, setMovementType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDate, setMovementDate] = useState(today())
  const [movementNote, setMovementNote] = useState('')
  const [financeError, setFinanceError] = useState('')
  const [modal, setModal] = useState<'new' | 'close' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Tournament | null>(null)
  const [period, setPeriod] = useState('month')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [rangeOpen, setRangeOpen] = useState(false)
  const [form, setForm] = useState({ site: '', buyIn: '10', date: today(), rebuys: '0', addon: '0', position: '', payout: '0' })
  const [newSite, setNewSite] = useState('')
  const [currencySearch, setCurrencySearch] = useState('')
  const [addingCurrency, setAddingCurrency] = useState(false)
  const [exchange, setExchange] = useState<{currency:string;rate:number;date:string}|null>(null)
  const [exchangeLoading, setExchangeLoading] = useState(false)
  const [exchangeError, setExchangeError] = useState('')
  const [baseChangeBusy, setBaseChangeBusy] = useState(false)
  const [baseChangeError, setBaseChangeError] = useState('')
  const baseCurrency = settings.baseCurrency || 'BRL' // Compatibilidade com registros anteriores.
  useEffect(() => {
    const controller = new AbortController()
    if (settings.currency === baseCurrency) {
      setExchange({currency:baseCurrency,rate:1,date:new Date().toISOString().slice(0,10)})
      setExchangeLoading(false);setExchangeError('')
      return () => controller.abort()
    }
    setExchangeLoading(true);setExchangeError('')
    fetch(`https://api.frankfurter.dev/v2/rate/${baseCurrency.toLowerCase()}/${encodeURIComponent(settings.currency.toLowerCase())}`, {signal:controller.signal})
      .then(async response => {
        if(!response.ok) throw new Error('Cotação indisponível para esta moeda.')
        return response.json() as Promise<{rate:number;date:string}>
      })
      .then(data => {
        if(!Number.isFinite(data.rate) || data.rate<=0) throw new Error('Cotação inválida.')
        setExchange({currency:settings.currency,rate:data.rate,date:data.date})
        setExchangeLoading(false)
      })
      .catch(error => {
        if(controller.signal.aborted) return
        setExchange(null);setExchangeLoading(false)
        setExchangeError(error instanceof Error ? error.message : 'Falha ao consultar cotação.')
      })
    return () => controller.abort()
  },[settings.currency,baseCurrency])
  const [undo, setUndo] = useState<{ tournaments: Tournament[]; label: string; createdAt: number } | null>(null)
  // Cada alteração inicia uma nova janela de 7 segundos; o timer anterior é cancelado.
  useEffect(() => {
    if (!undo) return
    const timeout = window.setTimeout(() => setUndo(null), 7000)
    return () => window.clearTimeout(timeout)
  }, [undo])

  const saveTournaments = (next: Tournament[]) => { setUndo({ tournaments, label: 'Última alteração', createdAt: Date.now() }); setTournaments(next); localStorage.setItem(`${prefix}tournaments`, JSON.stringify(next)) }
  const saveSettings = (next: AppSettings) => { setSettings(next); localStorage.setItem(`${prefix}settings`, JSON.stringify(next)) }
  const saveMovements = (next: FinancialMovement[]) => { setMovements(next); localStorage.setItem(`${prefix}movements`, JSON.stringify(next)) }
  const currencies = Array.from(new Set([...(settings.currencies?.length ? settings.currencies : [settings.currency]),settings.currency]))
  const cycleCurrency = () => { if(currencies.length < 2) return; const next = currencies[(currencies.indexOf(settings.currency)+1)%currencies.length]; saveSettings({...settings,currency:next}) }
  const addCurrency = (code:string) => { if(currencies.includes(code)) return; saveSettings({...settings,currencies:[...currencies,code]}); setCurrencySearch(''); setAddingCurrency(false) }
  const removeCurrency = (code:string) => { if(currencies.length===1 || code===(settings.baseCurrency||'BRL')) return; const next=currencies.filter(c=>c!==code);saveSettings({...settings,currencies:next,currency:settings.currency===code?next[0]:settings.currency}) }
  const changeBaseCurrency = async (next:string) => {
    if(next===baseCurrency || baseChangeBusy) return
    setBaseChangeError('')
    const hasRecords = tournaments.length>0 || movements.length>0 || settings.startingBankroll!==0
    if(!hasRecords){saveSettings({...settings,baseCurrency:next,currency:next,currencies:Array.from(new Set([...currencies,next]))});return}
    if(!confirm(`Converter permanentemente os valores registrados de ${baseCurrency} para ${next} usando a cotação disponível? Essa operação altera a moeda contábil dos registros e não pode ser desfeita automaticamente. Faça backup antes de continuar.`)) return
    setBaseChangeBusy(true)
    try {
      const response=await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(baseCurrency.toLowerCase())}/${encodeURIComponent(next.toLowerCase())}`)
      if(!response.ok) throw new Error('Não foi possível consultar a cotação para migrar os registros.')
      const data=await response.json() as {rate:number,date:string}
      if(!Number.isFinite(data.rate)||data.rate<=0) throw new Error('Cotação inválida.')
      const convert=(amount:number)=>Math.round(amount*data.rate*100)/100
      const newTournaments=tournaments.map(t=>({...t,buyIn:convert(t.buyIn),addon:convert(t.addon),payout:convert(t.payout)}))
      const newMovements=movements.map(m=>({...m,amount:convert(m.amount)}))
      const nextSettings={...settings,startingBankroll:convert(settings.startingBankroll),baseCurrency:next,currency:next,currencies:Array.from(new Set([...currencies,next]))}
      // Persistência de todos os dados convertidos antes de atualizar a interface.
      localStorage.setItem(`${prefix}tournaments`,JSON.stringify(newTournaments))
      localStorage.setItem(`${prefix}movements`,JSON.stringify(newMovements))
      localStorage.setItem(`${prefix}settings`,JSON.stringify(nextSettings))
      setTournaments(newTournaments);setMovements(newMovements);setSettings(nextSettings);setUndo(null)
    } catch(error){setBaseChangeError(error instanceof Error?error.message:'Erro na conversão da moeda de registro.')}
    finally{setBaseChangeBusy(false)}
  }
  const currency = settings.currency
  const exchangeReady = exchange?.currency === currency
  const money = (amount:number, requestedCurrency:string=currency) => exchangeReady
    ? formatMoney(amount * exchange.rate,requestedCurrency)
    : '—'
  const rateInfo = exchangeReady ? `1 ${baseCurrency} = ${exchange.rate.toLocaleString('pt-BR',{maximumFractionDigits:6})} ${currency} · cotação ${exchange.date}` : exchangeLoading ? 'Consultando cotação...' : exchangeError || 'Cotação não disponível'

  const filtered = useMemo(() => {
    const now = new Date()
    return tournaments.filter(t => {
      const d = new Date(`${t.date}T12:00:00`)
      if (period === 'custom') return Boolean(rangeStart && rangeEnd && t.date >= rangeStart && t.date <= rangeEnd)
      if (period === 'all') return true
      if (period === 'today') return t.date === today()
      if (period === '7') return (now.getTime() - d.getTime()) / 86400000 <= 7
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      return d.getFullYear() === now.getFullYear()
    })
  }, [tournaments, period, rangeStart, rangeEnd])
  // Apenas torneios encerrados entram em lucro realizado e ROI.
  // Investimentos de torneios abertos são reservados na banca, mas não viram prejuízo realizado.
  const totalInvested = filtered.reduce((s, t) => s + invested(t), 0)
  const closed = filtered.filter(t => t.status === 'closed')
  const closedInvested = closed.reduce((s, t) => s + invested(t), 0)
  const totalProfit = closed.reduce((s, t) => s + profit(t), 0)
  const roi = closedInvested > 0 ? totalProfit / closedInvested * 100 : 0
  const movementNet = movements.reduce((sum, m) => sum + (m.type === 'deposit' ? m.amount : -m.amount), 0)
  const currentBankroll = bankroll(settings.startingBankroll + movementNet, tournaments)
  const totalEntries = filtered.reduce((sum, t) => sum + 1 + t.rebuys, 0)
  const abi = totalEntries > 0 ? totalInvested / totalEntries : 0

  const addMovement = () => {
    const amount = Number(movementAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0 || !movementDate) { setFinanceError('Informe um valor maior que zero e uma data válida.'); return }
    if (movementType === 'withdrawal' && amount > currentBankroll + 0.00001) { setFinanceError('O saque não pode exceder o bankroll disponível.'); return }
    const next: FinancialMovement = { id: crypto.randomUUID(), type: movementType, amount: Math.round(amount * 100) / 100, date: movementDate, note: movementNote.trim(), createdAt: new Date().toISOString() }
    saveMovements([next, ...movements]); setMovementAmount(''); setMovementNote(''); setFinanceError('')
  }
  const deleteMovement = (id: string) => {
    if (confirm('Excluir esta movimentação financeira?')) saveMovements(movements.filter(m => m.id !== id))
  }
  const openNew = () => { if (!settings.sites.length) { setPage('profile'); return } setForm({ site: '', buyIn: '', date: today(), rebuys: '0', addon: '0', position: '', payout: '0' }); setSelected(null); setModal('new') }
  const submitNew = () => {
    if (!form.site || !Number.isFinite(Number(form.buyIn)) || Number(form.buyIn) <= 0) return
    const t: Tournament = { id: crypto.randomUUID(), date: form.date, site: form.site, buyIn: Number(form.buyIn), rebuys: 0, addon: 0, position: '', payout: 0, status: 'open' }
    saveTournaments([t, ...tournaments]); setModal(null)
  }
  const openClose = (t: Tournament, edit = false) => {
    setSelected(t); setForm({ site: t.site, buyIn: String(t.buyIn), date: t.date, rebuys: String(t.rebuys), addon: String(t.addon), position: t.position, payout: String(t.payout) }); setModal(edit ? 'edit' : 'close')
  }
  const submitClose = () => {
    if (!selected || !form.site || Number(form.buyIn) <= 0 || Number(form.rebuys) < 0 || Number(form.addon) < 0 || Number(form.payout) < 0) return
    const updated = { ...selected, site: form.site, buyIn: Number(form.buyIn), date: form.date, rebuys: Number(form.rebuys), addon: Number(form.addon), position: form.position, payout: Number(form.payout), status: 'closed' as const }
    saveTournaments(tournaments.map(t => t.id === selected.id ? updated : t)); setModal(null)
  }
  const remove = (id: string) => { if (confirm('Excluir este torneio? Você poderá desfazer a última alteração.')) saveTournaments(tournaments.filter(t => t.id !== id)) }
  const exportExcel = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows(tournaments)), 'Torneios')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movements.map(m => ({ Data: m.date, Tipo: m.type === 'deposit' ? 'Depósito' : 'Saque', Valor: m.amount, Observação: m.note }))), 'Financeiro')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Depósitos': movements.filter(m=>m.type==='deposit').reduce((sum,m)=>sum+m.amount,0), 'Saques': movements.filter(m=>m.type==='withdrawal').reduce((sum,m)=>sum+m.amount,0), 'Banca inicial': settings.startingBankroll, 'Bankroll atual': currentBankroll, 'Torneios': tournaments.length, 'Investimento total': tournaments.reduce((s,t)=>s+invested(t),0) }]), 'Resumo')
    XLSX.writeFile(wb, 'PokerProfitMTT.xlsx')
  }

  const finishSetup = () => { if (!settings.displayName.trim() || !settings.sites.length) return; localStorage.setItem(`${prefix}onboarded`, 'true'); setConfigured(true); setPage('dashboard') }
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">♠</div><div><strong>PokerProfit<span>MTT</span></strong><small>TOURNAMENT TRACKER</small></div></div>
      <div className="nav-label">MENU PRINCIPAL</div>
      <button className={page === 'dashboard' ? 'nav active' : 'nav'} onClick={() => setPage('dashboard')}><LayoutDashboard size={18}/> Dashboard</button>
      <button className={page === 'tournaments' ? 'nav active' : 'nav'} onClick={() => setPage('tournaments')}><ListOrdered size={18}/> Torneios</button>
      <button className={page === 'finance' ? 'nav active' : 'nav'} onClick={() => setPage('finance')}><Wallet size={18}/> Financeiro</button>
      <div className="nav-label second">PREFERÊNCIAS</div>
      <button className={page === 'profile' ? 'nav active' : 'nav'} onClick={() => setPage('profile')}><Settings size={18}/> Perfil</button>
      <div className="sidebar-bottom"><div className="avatar">{(settings.displayName || email).slice(0,1).toUpperCase()}</div><div className="sidebar-account"><b>{settings.displayName || "Usuário"}</b><small title={email}>{email}</small></div><button type="button" className="sidebar-signout" onClick={onSignOut} title="Sair da conta">SAIR</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">POKERPROFIT / MTT</div><h1>{page === 'dashboard' ? 'Dashboard' : page === 'tournaments' ? 'Torneios' : page === 'finance' ? 'Financeiro' : 'Perfil'}</h1></div><button className="primary" onClick={openNew} disabled={!configured}><Plus size={17}/> Novo torneio</button></header>
      {page === 'dashboard' && <section>
        <div className="toolbar"><div><b>Visão geral</b><small>Resumo dos seus resultados</small></div><div className="filter-row"><div className="filter-pills">{[['today','Hoje'],['7','7 dias'],['month','Este mês'],['year','Este ano'],['all','Tudo'],['custom','Personalizado']].map(([value,label])=><button key={value} className={period===value?'filter-pill selected':'filter-pill'} onClick={()=>{setPeriod(value);setRangeOpen(value==='custom')}}>{label}</button>)}</div>{period==='custom'&&<button className="range-trigger" onClick={()=>setRangeOpen(!rangeOpen)}><CalendarDays size={15}/>{rangeStart&&rangeEnd?`${rangeStart.split('-').reverse().join('/')} — ${rangeEnd.split('-').reverse().join('/')}`:'Selecionar período'}</button>}{rangeOpen&&period==='custom'&&<RangeCalendar start={rangeStart} end={rangeEnd} onSelect={(a,b)=>{setRangeStart(a);setRangeEnd(b);if(a&&b)setRangeOpen(false)}} onClose={()=>setRangeOpen(false)}/>}</div></div>
        <div className="stats-grid">
          <Stat icon={<Trophy/>} label="TORNEIOS REGISTRADOS" value={String(filtered.length)} detail={`${closed.length} encerrados`}/>
          <Stat icon={<Activity/>} label="ABI DO PERÍODO" value={money(abi,currency)} detail={`${totalEntries} entradas · inclui rebuys e addons`}/>
          <Stat icon={<Wallet/>} label="BANKROLL ATUAL" value={money(currentBankroll,currency)} detail={`Banca inicial: ${money(settings.startingBankroll,currency)} · Clique para próxima moeda`} onClick={cycleCurrency}/>
          <Stat icon={<CircleDollarSign/>} label="LUCRO / PREJUÍZO" value={money(totalProfit,currency)} detail={`${roi.toFixed(1)}% ROI realizado`} positive={totalProfit>=0}/>
        </div>
        <div className="stats-grid secondary-grid">
          <Stat label="MAIOR BI" value={money(Math.max(0,...filtered.map(t=>t.buyIn)),currency)}/>
          <Stat label="MENOR BI" value={filtered.length ? money(Math.min(...filtered.map(t=>t.buyIn)),currency) : money(0,currency)}/>
          <Stat label="INVESTIMENTO TOTAL" value={money(totalInvested,currency)}/>
          <Stat label="RETORNO RECEBIDO" value={money(closed.reduce((s,t)=>s+t.payout,0),currency)}/>
        </div>
        <div className="panel"><div className="panel-head"><div><h2>Atividade recente</h2><p>Seus últimos registros de torneios</p></div><button className="text-button" onClick={()=>setPage('tournaments')}>Ver todos →</button></div><TournamentTable items={tournaments.slice(0,6)} currency={currency} rate={exchangeReady?exchange.rate:null} onClose={openClose} onEdit={t=>openClose(t,true)} onDelete={remove}/></div>
      </section>}
      {page === 'tournaments' && <section><div className="toolbar"><div><b>Todos os torneios</b><small>{tournaments.length} registros no total</small></div><button className="secondary" onClick={exportExcel}><Download size={16}/> Exportar Excel</button></div><div className="panel"><TournamentTable items={tournaments} currency={currency} rate={exchangeReady?exchange.rate:null} onClose={openClose} onEdit={t=>openClose(t,true)} onDelete={remove}/></div></section>}
      {page === 'finance' && <section className="finance-page">
        <div className="finance-summary">
          <InteractiveCard className="finance-kpi finance-kpi-action" onClick={cycleCurrency}><span>BANKROLL ATUAL</span><strong>{money(currentBankroll,currency)}</strong><small>Inclui resultados e movimentações · Clique para próxima moeda</small></InteractiveCard>
          <InteractiveCard className="finance-kpi"><span>TOTAL DE DEPÓSITOS</span><strong className="positive">{money(movements.filter(m=>m.type==='deposit').reduce((sum,m)=>sum+m.amount,0),currency)}</strong></InteractiveCard>
          <InteractiveCard className="finance-kpi"><span>TOTAL DE SAQUES</span><strong>{money(movements.filter(m=>m.type==='withdrawal').reduce((sum,m)=>sum+m.amount,0),currency)}</strong></InteractiveCard>
        </div>
        <div className="finance-layout">
          <div className="panel finance-form"><h2>Nova movimentação</h2><p>Depósitos e saques alteram somente o bankroll, nunca os indicadores de desempenho.</p>
            <div className="finance-type"><button className={movementType==='deposit'?'selected':''} onClick={()=>{setMovementType('deposit');setFinanceError('')}}><ArrowDownLeft size={17}/> Depositar</button><button className={movementType==='withdrawal'?'selected':''} onClick={()=>{setMovementType('withdrawal');setFinanceError('')}}><ArrowUpRight size={17}/> Sacar</button></div>
            <label>Valor ({baseCurrency})<NumberField value={movementAmount} onChange={setMovementAmount} step={10}/></label>
            <label>Data<input type="date" value={movementDate} onChange={e=>setMovementDate(e.target.value)}/></label>
            <label>Observação (opcional)<input value={movementNote} maxLength={140} placeholder="Ex.: Transferência para o site" onChange={e=>setMovementNote(e.target.value)}/></label>
            {financeError && <p className="finance-error" role="alert">{financeError}</p>}
            <button className="primary full" onClick={addMovement}>{movementType==='deposit'?'Confirmar depósito':'Confirmar saque'}</button>
          </div>
          <div className="panel finance-history"><div className="panel-head"><div><h2>Histórico financeiro</h2><p>{movements.length} movimentações registradas</p></div></div>
            {!movements.length?<div className="empty"><Wallet size={28}/><b>Nenhuma movimentação</b><span>Registre seu primeiro depósito ou saque.</span></div>:<div className="table-wrap"><table><thead><tr><th>DATA</th><th>TIPO</th><th>VALOR</th><th>OBSERVAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>{[...movements].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)).map(m=><tr key={m.id}><td>{m.date.split('-').reverse().join('/')}</td><td>{m.type==='deposit'?'Depósito':'Saque'}</td><td className={m.type==='deposit'?'positive':'negative'}>{m.type==='deposit'?'+':'−'} {money(m.amount,currency)}</td><td>{m.note||'—'}</td><td><button className="icon-btn danger" title="Excluir movimentação" onClick={()=>deleteMovement(m.id)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>}
          </div>
        </div>
      </section>}
      {page === 'profile' && <section className="panel profile-panel"><h2>{configured ? "Meu perfil" : "Vamos configurar seu perfil"}</h2><p>{configured ? "Atualize seus dados e sites de poker." : "Primeiro acesso: informe seu nome, sua banca inicial e cadastre pelo menos um site para começar. Nenhum dado de demonstração será criado."}</p><label>Nome de exibição<input value={settings.displayName} onChange={e=>saveSettings({...settings,displayName:e.target.value})}/></label><div className="currency-manager"><h3>Moedas cadastradas</h3><p>Selecione a moeda ativa ou clique no card do bankroll para alternar na ordem abaixo.</p><div className="currency-tags">{currencies.map(code=><div className={code===currency?'currency-tag active':'currency-tag'} key={code}><button type="button" onClick={()=>saveSettings({...settings,currency:code})}><strong>{code}</strong><span>{CURRENCY_CATALOG.find(c=>c.code===code)?.name||code}</span></button>{currencies.length>1&&code!==baseCurrency&&<button type="button" className="currency-remove" title={`Remover ${code}`} onClick={()=>removeCurrency(code)}><X size={14}/></button>}</div>)}</div>{!addingCurrency?<button className="secondary currency-add" onClick={()=>setAddingCurrency(true)}><Plus size={16}/> Adicionar moeda</button>:<div className="currency-search"><input autoFocus value={currencySearch} onChange={e=>setCurrencySearch(e.target.value)} placeholder="Digite nome, símbolo ou código (ex.: EUR, euro)..."/><button className="icon-btn" aria-label="Cancelar" onClick={()=>{setAddingCurrency(false);setCurrencySearch('')}}><X size={18}/></button><div className="currency-results">{CURRENCY_CATALOG.filter(c=>!currencies.includes(c.code)&&`${c.code} ${c.name} ${c.symbol}`.toLocaleLowerCase('pt-BR').includes(currencySearch.toLocaleLowerCase('pt-BR'))).map(c=><button type="button" key={c.code} onClick={()=>addCurrency(c.code)}><b>{c.code}</b><span>{c.name}</span><small>{c.symbol}</small></button>)}</div></div>}<small className="currency-note">Moeda de registro: define a unidade original de todos os lançamentos. As demais moedas são apenas formas de exibição convertidas pela cotação disponível.</small><div className="base-currency-config"><label>Moeda de registro<div className="base-currency-options">{currencies.map(code=><button type="button" key={code} className={code===baseCurrency?'selected':''} disabled={baseChangeBusy} onClick={()=>void changeBaseCurrency(code)}>{code}{code===baseCurrency?' ✓':''}</button>)}</div></label><small>{baseChangeBusy?'Convertendo lançamentos…':'Alterar a moeda de registro converte os lançamentos existentes usando a cotação consultada. Faça backup antes.'}</small>{baseChangeError&&<p role="alert" className="finance-error">{baseChangeError}</p>}</div></div><label>Banca inicial ({baseCurrency}, moeda de registro)<NumberField value={String(settings.startingBankroll)} onChange={value=>saveSettings({...settings,startingBankroll:Number(value)})} step={10}/></label><div className="site-editor"><h3>Sites cadastrados</h3><div className="site-add"><input placeholder="Nome do site" value={newSite} onChange={e=>setNewSite(e.target.value)}/><button className="primary" onClick={()=>{if(newSite.trim()&&!settings.sites.includes(newSite.trim()))saveSettings({...settings,sites:[...settings.sites,newSite.trim()]});setNewSite('')}}><Plus size={16}/> Adicionar</button></div>{settings.sites.map(s=><div className="site-row" key={s}>{s}<button className="icon-btn" onClick={()=>saveSettings({...settings,sites:settings.sites.filter(x=>x!==s)})}><X size={16}/></button></div>)}</div>{!configured&&<button className="primary setup-button" disabled={!settings.displayName.trim()||!settings.sites.length} onClick={finishSetup}>Concluir configuração e acessar Dashboard →</button>}</section>}
      <footer className="app-footer"><span className="footer-fx" title="Cotação de referência, não taxa de câmbio para negociação">{rateInfo}{exchangeLoading?' · atualizando…':''}{exchangeError&&<button onClick={()=>saveSettings({...settings,currency:baseCurrency})}>Usar {baseCurrency}</button>}</span></footer>
    </main>
    {undo && <button className="undo" onClick={()=>{setTournaments(undo.tournaments);localStorage.setItem(`${prefix}tournaments`,JSON.stringify(undo.tournaments));setUndo(null)}}>Alteração realizada · Desfazer</button>}
    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><div className="modal"><div className="modal-head"><div><div className="eyebrow">{modal==='new'?'NOVA ENTRADA':'ATUALIZAR TORNEIO'}</div><h2>{modal==='new'?'Registrar torneio':modal==='close'?'Encerrar torneio':'Editar torneio'}</h2></div><button className="icon-btn" onClick={()=>setModal(null)}><X/></button></div>
      <label>Site<SearchPicker options={settings.sites} value={form.site} placeholder="Digite ou escolha um site" onChange={site=>setForm({...form,site})}/></label>
      <div className="form-row"><label>Buy-in ({baseCurrency})<NumberField value={form.buyIn} onChange={value=>setForm({...form,buyIn:value})} step={0.5}/></label><label>Data<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label></div>
      {modal!=='new' && <><div className="form-row"><label>Quantidade de rebuys<NumberField value={form.rebuys} onChange={value=>setForm({...form,rebuys:value})} step={1}/></label><label>Addon (valor total em {baseCurrency})<NumberField value={form.addon} onChange={value=>setForm({...form,addon:value})} step={0.5}/></label></div><div className="form-row"><label>Posição final<input value={form.position} onChange={e=>setForm({...form,position:e.target.value})} placeholder="Ex.: 1º / 15º"/></label><label>Retorno recebido ({baseCurrency})<NumberField value={form.payout} onChange={value=>setForm({...form,payout:value})} step={0.5}/></label></div></>}
      <div className="modal-summary"><span>Investimento calculado</span><b>{formatMoney(Number(form.buyIn)*(1+Number(form.rebuys))+Number(form.addon),baseCurrency)}</b></div>
      <button className="primary full" onClick={modal==='new'?submitNew:submitClose}>{modal==='new'?'Registrar entrada': 'Salvar encerramento'}</button>
    </div></div>}
  </div>
}

function InteractiveCard({children,className='',onClick}:{children:ReactNode,className?:string,onClick?:()=>void}) {
  const ref=useRef<HTMLDivElement>(null)
  const move=(event:MouseEvent<HTMLDivElement>)=>{
    const element=ref.current
    if(!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect=element.getBoundingClientRect()
    const x=(event.clientX-rect.left)/rect.width-.5
    const y=(event.clientY-rect.top)/rect.height-.5
    // Inclinação segue a posição do ponteiro dentro do card.
    element.style.transform=`perspective(900px) rotateX(${-y*8}deg) rotateY(${x*8}deg) translateY(-3px)`
    element.style.setProperty('--glow-x',`${(x+.5)*100}%`)
    element.style.setProperty('--glow-y',`${(y+.5)*100}%`)
  }
  const reset=()=>{if(ref.current)ref.current.style.transform=''}
  return <div ref={ref} className={`interactive-card ${className}${onClick?' clickable-card':''}`} onMouseMove={move} onMouseLeave={reset} onClick={onClick} role={onClick?'button':undefined} tabIndex={onClick?0:undefined} onKeyDown={onClick?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onClick()}}:undefined}>{children}</div>
}
function Stat({icon,label,value,detail,positive,onClick}:{icon?:ReactNode,label:string,value:string,detail?:string,positive?:boolean,onClick?:()=>void}) {
  return <InteractiveCard className="stat-card" onClick={onClick}><div className="stat-top"><span>{label}</span>{icon&&<i>{icon}</i>}</div><strong className={positive===undefined?'':positive?'positive':'negative'}>{value}</strong>{detail&&<small>{detail}</small>}</InteractiveCard>
}

function TournamentTable({items,currency,rate,onClose,onEdit,onDelete}:{items:Tournament[],currency:string,rate:number|null,onClose:(t:Tournament)=>void,onEdit:(t:Tournament)=>void,onDelete:(id:string)=>void}) {
  const money = (amount:number, code:string) => rate===null?'—':formatMoney(amount*rate,code)
  if (!items.length) return <div className="empty"><CalendarDays size={28}/><b>Nenhum torneio registrado</b><span>Adicione sua primeira entrada para começar a acompanhar os resultados.</span></div>
  return <div className="table-wrap"><table><thead><tr><th>DATA</th><th>BI</th><th>SITE</th><th>REBUYS</th><th>ADDON</th><th>INVESTIDO</th><th>POSIÇÃO</th><th>RETORNO</th><th>RESULTADO</th><th>STATUS / AÇÕES</th></tr></thead><tbody>{items.map(t=><tr key={t.id}><td>{new Date(`${t.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>{money(t.buyIn,currency)}</td><td>{t.site}</td><td>{t.rebuys}</td><td>{money(t.addon,currency)}</td><td>{money(invested(t),currency)}</td><td>{t.position||'—'}</td><td>{money(t.payout,currency)}</td><td className={profit(t)>=0?'positive':'negative'}>{t.status==='open'?'—':money(profit(t),currency)}</td><td><div className="actions">{t.status==='open'?<button className="small-action" onClick={()=>onClose(t)}><Check size={14}/> Encerrar</button>:<span className="status"><Check size={13}/> Encerrado</span>}<button className="icon-btn" title="Editar" onClick={()=>onEdit(t)}><Pencil size={15}/></button><button className="icon-btn danger" title="Excluir" onClick={()=>onDelete(t.id)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>
}
function RangeCalendar({start,end,onSelect,onClose}:{start:string,end:string,onSelect:(start:string,end:string)=>void,onClose:()=>void}) {
  const [month,setMonth]=useState(()=>new Date(start?`${start}T12:00:00`:Date.now()))
  const first=new Date(month.getFullYear(),month.getMonth(),1)
  const offset=first.getDay()
  const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate()
  const toISO=(day:number)=>`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  const pick=(date:string)=>{if(!start || end || date<start)onSelect(date,'');else onSelect(start,date)}
  return <div className="calendar-popover"><div className="calendar-header"><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><b>{month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</b><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div><div className="calendar-grid">{['D','S','T','Q','Q','S','S'].map((d,i)=><span className="weekday" key={i}>{d}</span>)}{Array.from({length:offset},(_,i)=><span key={`blank${i}`}/>)}{Array.from({length:days},(_,i)=>{const date=toISO(i+1);return <button key={date} className={`${date===start||date===end?'day-end':''} ${start&&end&&date>start&&date<end?'day-range':''}`} onClick={()=>pick(date)}>{i+1}</button>})}</div><div className="calendar-foot"><span>{!start?'Selecione a data inicial':!end?'Agora selecione a data final':'Período selecionado'}</span><button onClick={onClose}>Fechar</button></div></div>
}

function SearchPicker({options,value,onChange,placeholder}:{options:string[],value:string,onChange:(value:string)=>void,placeholder:string}) {
  const [query,setQuery]=useState(value)
  const [open,setOpen]=useState(false)
  const [editing,setEditing]=useState(false)
  const filtered=options.filter(o=>o.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="search-picker">
    <div className="search-picker-field"><input value={editing?query:value} placeholder={placeholder} onChange={e=>{setQuery(e.target.value);setEditing(true);onChange('')}} onFocus={()=>{setQuery(value);setEditing(true)}} autoComplete="off"/><button type="button" aria-label="Escolher opção" onClick={()=>{setQuery('');setEditing(false);setOpen(true)}}><span>⌕</span></button></div>
    {editing&&query&&!value&&<div className="search-hint">{filtered.length?filtered.slice(0,4).map(option=><button type="button" key={option} onClick={()=>{onChange(option);setQuery(option);setEditing(false)}}>{option}</button>):<span>Nenhum resultado. Cadastre a opção em Perfil.</span>}</div>}
    {open&&<div className="choice-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="choice-modal"><div className="choice-header"><h3>Escolha uma opção</h3><button onClick={()=>setOpen(false)} aria-label="Fechar">✕</button></div><input autoFocus placeholder="Pesquisar..." value={query} onChange={e=>setQuery(e.target.value)}/><div className="choice-list">{filtered.length?filtered.map(option=><button key={option} onClick={()=>{onChange(option);setQuery(option);setEditing(false);setOpen(false)}}>{option}</button>):<p>Nenhum resultado encontrado.</p>}</div></div></div>}
  </div>
}
function NumberField({value,onChange,step=1}:{value:string,onChange:(value:string)=>void,step?:number}) {
  const number=Number(value)||0
  const adjust=(direction:number)=>onChange(String(Math.max(0,Math.round((number+step*direction)*100)/100)))
  return <div className="number-field"><input type="text" inputMode="decimal" value={value} placeholder="0" onChange={e=>{const next=e.target.value.replace(',','.');if(/^\d*(\.\d{0,2})?$/.test(next))onChange(next)}}/><div className="number-controls"><button type="button" aria-label="Diminuir valor" onClick={()=>adjust(-1)}>−</button><button type="button" aria-label="Aumentar valor" onClick={()=>adjust(1)}>+</button></div></div>
}

const CURRENCY_CATALOG = [
  {code:'BRL',name:'Real brasileiro',symbol:'R$'},
  {code:'USD',name:'Dólar americano',symbol:'US$'},
  {code:'EUR',name:'Euro',symbol:'€'},
  {code:'GBP',name:'Libra esterlina',symbol:'£'},
  {code:'CAD',name:'Dólar canadense',symbol:'C$'},
  {code:'AUD',name:'Dólar australiano',symbol:'A$'},
  {code:'JPY',name:'Iene japonês',symbol:'¥'},
  {code:'CNY',name:'Yuan chinês',symbol:'¥'},
  {code:'CHF',name:'Franco suíço',symbol:'CHF'},
  {code:'ARS',name:'Peso argentino',symbol:'AR$'},
  {code:'CLP',name:'Peso chileno',symbol:'CLP'},
  {code:'MXN',name:'Peso mexicano',symbol:'MX$'},
  {code:'UYU',name:'Peso uruguaio',symbol:'$U'},
  {code:'PYG',name:'Guarani paraguaio',symbol:'₲'},
  {code:'COP',name:'Peso colombiano',symbol:'COL$'},
  {code:'PEN',name:'Sol peruano',symbol:'S/'},
  {code:'INR',name:'Rupia indiana',symbol:'₹'},
  {code:'KRW',name:'Won sul-coreano',symbol:'₩'},
] as const
