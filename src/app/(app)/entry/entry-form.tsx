'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PACKAGES, COMMISSION_RATE, type PackageCode } from '@/lib/packages'
import { createTransaction } from './actions'

type DealerOption = {
  id: string
  company_name: string
  package: PackageCode | null
  rate: number | null
}

export function EntryForm({ dealers }: { dealers: DealerOption[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [dealerId, setDealerId] = useState('')
  const [type, setType] = useState<'topup' | 'package'>('topup')
  const [pkg, setPkg] = useState<PackageCode>('A')
  const [points, setPoints] = useState('')
  const [moneyOverride, setMoneyOverride] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dealer = dealers.find((d) => d.id === dealerId)

  const preview = useMemo(() => {
    if (type === 'package') {
      const def = PACKAGES[pkg]
      return { points: def.reload, rate: def.rate, money: def.price, commission: Math.round(def.reload * COMMISSION_RATE * 100) / 100 }
    }
    const rate = dealer?.rate ?? null
    const pts = Number(points) || 0
    if (rate == null) return null
    const suggestedMoney = Math.round(pts * (1 - rate / 100) * 100) / 100
    const money = moneyOverride ? Number(moneyOverride) : suggestedMoney
    return { points: pts, rate, money, commission: Math.round(pts * COMMISSION_RATE * 100) / 100 }
  }, [type, pkg, dealer, points, moneyOverride])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!dealerId) {
      setError('请选择 dealer。')
      return
    }
    if (type === 'topup' && dealer?.rate == null) {
      setError('这个 dealer 还没有套餐 / rate，请先帮他买套餐。')
      return
    }

    const formData = new FormData(e.currentTarget)

    if (receiptFile) {
      setUploading(true)
      const supabase = createClient()
      const path = `${dealerId}/${Date.now()}-${receiptFile.name}`
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, receiptFile)
      setUploading(false)
      if (uploadError) {
        setError('收据上传失败：' + uploadError.message)
        return
      }
      formData.set('receipt_url', path)
    }

    await createTransaction(formData)
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h1 className="mb-4 text-base font-bold text-zinc-50">录入一笔交易</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Dealer</label>
            <select
              name="dealer_id"
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            >
              <option value="">选择 dealer…</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.company_name}
                  {d.package ? `（当前 ${d.package}·${d.rate}%）` : '（未设定套餐）'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">类型</label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as 'topup' | 'package')}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            >
              <option value="topup">日常 Top-up</option>
              <option value="package">买套餐（会更新 rate）</option>
            </select>
          </div>

          {type === 'package' ? (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">套餐</label>
                <select
                  name="package"
                  value={pkg}
                  onChange={(e) => setPkg(e.target.value as PackageCode)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
                >
                  {(Object.keys(PACKAGES) as PackageCode[]).map((code) => (
                    <option key={code} value={code}>
                      {PACKAGES[code].name} · RM{PACKAGES[code].price} · {PACKAGES[code].rate}%
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">SIM 类型</label>
                <select
                  name="sim_type"
                  defaultValue="esim"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
                >
                  <option value="esim">eSIM（即时）</option>
                  <option value="physical">实体 SIM（需配送）</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Top-up 面值 (points)</label>
                <input
                  name="points"
                  type="number"
                  min="1"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="例如 850"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">收 dealer 的钱 (RM)</label>
                <input
                  name="money_rm"
                  type="number"
                  step="0.01"
                  value={moneyOverride}
                  onChange={(e) => setMoneyOverride(e.target.value)}
                  placeholder={preview ? String(preview.money) : '按 rate 自动算，可改'}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">收据（可选）</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-xs text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-700 file:px-2.5 file:py-1 file:text-xs file:text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">备注（可选）</label>
            <input
              name="note"
              type="text"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="mt-2 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
          >
            {uploading ? '上传收据中…' : '提交（待核对）'}
          </button>
          <p className="rounded-lg border-l-2 border-violet-500 bg-zinc-800/60 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-400">
            买套餐会自动更新该 dealer 的 rate（跟最新套餐）；日常 top-up 用他当前 rate 算你的 2%。
          </p>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-3 text-sm font-bold text-zinc-50">💡 系统自动算给你看</h3>
        {preview ? (
          <div className="flex flex-col text-sm">
            <Row label={type === 'package' ? '套餐面值' : 'Top-up 面值'} value={`${preview.points.toLocaleString()} pts`} />
            <Row label="Rate" value={`${preview.rate}%`} />
            <Row label="收 dealer 的钱" value={`RM${preview.money.toLocaleString()}`} />
            <Row label="你的 2%" value={`RM${preview.commission.toLocaleString()}`} gold last />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            {dealer ? '这个 dealer 还没有套餐 / rate，请先帮他买一个套餐。' : '先选一个 dealer。'}
          </p>
        )}
        <p className="mt-4 rounded-lg bg-zinc-800/60 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-400">
          钱和 points 分开：In 记钱、Out 记 points，永不混。
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, gold, last }: { label: string; value: string; gold?: boolean; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 ${last ? '' : 'border-b border-dashed border-zinc-800'}`}
    >
      <span className="text-zinc-400">{label}</span>
      <b className={gold ? 'text-amber-300' : 'text-zinc-100'}>{value}</b>
    </div>
  )
}
