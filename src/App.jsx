import { useState, useEffect, useCallback } from 'react'
import Dashboard from './components/Dashboard.jsx'
import Portfolio from './components/Portfolio.jsx'
import Analysis from './components/Analysis.jsx'
import Charts from './components/Charts.jsx'
import Settings from './components/Settings.jsx'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'analysis',  label: 'AI Analysis' },
  { id: 'charts',    label: 'Charts' },
  { id: 'settings',  label: 'Settings' },
]

function useISTClock() {
  const [info, setInfo] = useState({ time: '', isOpen: false })
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const time = ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      const day = ist.getDay(), h = ist.getHours(), m = ist.getMinutes()
      const mins = h * 60 + m
      const isOpen = day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30
      setInfo({ time: `${time} IST`, isOpen })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return info
}

function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t) }, [])
  const colors = { success: 'bg-emerald-900 border-emerald-700 text-emerald-200', error: 'bg-red-900 border-red-700 text-red-200', info: 'bg-indigo-900 border-indigo-700 text-indigo-200' }
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm max-w-xs shadow-lg ${colors[type] || colors.info}`}>
      {message}
    </div>
  )
}

export default function App() {
  const [tab, setTab]       = useState('dashboard')
  const [toasts, setToasts] = useState([])
  const [notifs, setNotifs] = useState(0)
  const [notifPanel, setNotifPanel] = useState(false)
  const [notifList, setNotifList]   = useState([])
  const clock = useISTClock()

  const toast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    return () => setToasts(t => t.filter(x => x.id !== id))
  }, [])

  // SSE
  useEffect(() => {
    const es = new EventSource('/api/notifications/stream')
    es.addEventListener('notification', e => {
      const data = JSON.parse(e.data)
      setNotifs(n => n + 1)
      toast(data.title, 'info')
      if (Notification.permission === 'granted') {
        new Notification('Investment Monitor', { body: data.message ?? '' })
      }
    })
    es.onerror = () => {}
    if (Notification.permission === 'default') Notification.requestPermission()
    return () => es.close()
  }, [])

  async function openNotifs() {
    setNotifPanel(true)
    setNotifs(0)
    const res = await fetch('/api/notifications')
    setNotifList(await res.json())
  }

  async function markAllRead() {
    await fetch('/api/notifications/read-all', { method: 'PUT' })
    setNotifList(l => l.map(n => ({ ...n, is_read: true })))
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold">IM</div>
          <span className="font-bold tracking-tight">Investment Monitor</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${clock.isOpen ? 'bg-emerald-900/60 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>
            {clock.isOpen ? '● Open' : '○ Closed'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{clock.time}</span>
          <button onClick={openNotifs} className="relative text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors">
            Notifications
            {notifs > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{notifs}</span>}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-gray-900/80 backdrop-blur border-b border-gray-800 px-6 flex">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`py-2.5 px-4 text-sm border-b-2 transition-colors ${tab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'dashboard' && <Dashboard toast={toast} goTo={setTab} />}
        {tab === 'portfolio' && <Portfolio toast={toast} />}
        {tab === 'analysis'  && <Analysis toast={toast} />}
        {tab === 'charts'    && <Charts toast={toast} />}
        {tab === 'settings'  && <Settings toast={toast} />}
      </main>

      {/* Notification Panel */}
      {notifPanel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setNotifPanel(false)} />
          <div className="relative w-80 h-full bg-gray-900 border-l border-gray-800 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900">
              <span className="font-semibold text-sm">Notifications</span>
              <div className="flex gap-3">
                <button onClick={markAllRead} className="text-xs text-gray-400 hover:text-white">Mark all read</button>
                <button onClick={() => setNotifPanel(false)} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
              </div>
            </div>
            <div className="p-3 space-y-2 flex-1">
              {!notifList.length && <p className="text-gray-500 text-xs text-center py-8">No notifications yet.</p>}
              {notifList.map(n => (
                <div key={n.id} className={`p-3 rounded-lg text-sm ${n.is_read ? 'bg-gray-800/50' : 'bg-indigo-900/30 border border-indigo-800/50'}`}>
                  <div className="font-medium text-gray-200 text-xs">{n.title}</div>
                  <div className="text-gray-400 text-xs mt-0.5">{n.message}</div>
                  <div className="text-gray-600 text-xs mt-1">{new Date(n.created_at).toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.map((t, i) => (
        <div key={t.id} style={{ bottom: `${24 + i * 60}px` }} className="fixed right-6 z-50">
          <Toast message={t.message} type={t.type} onDone={() => setToasts(ts => ts.filter(x => x.id !== t.id))} />
        </div>
      ))}
    </div>
  )
}
