import { useState } from 'react'

const PROVIDERS = [
  { id: 'rule_based', label: 'Rule-Based',      sub: 'No API key needed',       badge: 'FREE',      color: 'emerald' },
  { id: 'anthropic',  label: 'Anthropic Claude', sub: 'Claude Sonnet 4.6',       badge: 'PAID',      color: 'purple' },
]

export default function Settings({ toast }) {
  const [provider, setProvider] = useState('rule_based')
  const [keys, setKeys] = useState({ anthropic_api_key: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const payload = { ai_provider: provider, ...Object.fromEntries(Object.entries(keys).filter(([, v]) => v)) }
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast('Settings saved', 'success')
      setKeys({ anthropic_api_key: '' })
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="max-w-lg space-y-5">
      <h1 className="text-base font-semibold">Settings</h1>

      {/* Provider picker */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">AI Analysis Provider</h2>
        <p className="text-xs text-gray-500 mb-4">Rule-Based works instantly with no API key.</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => setProvider(p.id)}
              className={`text-left p-3 rounded-xl border transition-colors ${provider === p.id ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'}`}>
              <div className={`text-xs font-semibold ${p.color === 'emerald' ? 'text-emerald-300' : p.color === 'blue' ? 'text-blue-300' : p.color === 'orange' ? 'text-orange-300' : 'text-purple-300'}`}>{p.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{p.sub}</div>
              <span className={`mt-1.5 inline-block text-xs px-1.5 py-0.5 rounded ${p.color === 'emerald' ? 'bg-emerald-900 text-emerald-400' : p.color === 'blue' ? 'bg-blue-900 text-blue-400' : p.color === 'orange' ? 'bg-orange-900 text-orange-400' : 'bg-purple-900 text-purple-400'}`}>{p.badge}</span>
            </button>
          ))}
        </div>

        {provider === 'anthropic' && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">Anthropic API Key</label>
            <input type="password" value={keys.anthropic_api_key} onChange={e => setKeys(k => ({ ...k, anthropic_api_key: e.target.value }))}
              placeholder="sk-ant-…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 mb-1" />
            <p className="text-xs text-gray-500">Get from <span className="text-purple-400">console.anthropic.com</span></p>
          </div>
        )}
      </div>

      {/* How to get free providers */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Want AI-powered analysis for free?</h2>
        <div className="space-y-3 text-sm text-gray-400">
          <div>
            <div className="font-medium text-gray-300">Google Gemini (coming soon)</div>
            <div className="text-xs">Free tier at <span className="text-blue-400">aistudio.google.com</span> — no credit card</div>
          </div>
          <div>
            <div className="font-medium text-gray-300">Groq + Llama 3 (coming soon)</div>
            <div className="text-xs">Free tier at <span className="text-orange-400">console.groq.com</span> — no credit card</div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Rule-Based mode is already pretty useful — it uses RSI, MACD, and moving averages to give you BUY/SELL/HOLD signals.</p>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium">
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}
