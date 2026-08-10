'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { isSimStockType, isPhysicalSimType } from '@/lib/sim-stock'
import { friendlyDbError } from '@/lib/db-error'
import { parseBusinessDate, todayInMalaysia } from '@/lib/month'
import { uploadReceipt } from '@/lib/receipt-upload'

// Two destinations, because the three actions below are reached from two
// different pages. Both forms moved to /sim-stock/log when it became its own
// sidebar entry, but every failure still redirected to /sim-stock — throwing
// the operator off the form they were filling and discarding it, while the
// error block on /sim-stock/log could never fire. Mark as Sent is genuinely
// on /sim-stock and stays there.
function failOnLog(message: string): never {
  redirect('/sim-stock/log?error=' + encodeURIComponent(message))
}

function failOnStock(message: string): never {
  redirect('/sim-stock?error=' + encodeURIComponent(message))
}

export async function recordSimIntake(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') failOnLog('You do not have permission to record stock intake.')

  const intakeDate = parseBusinessDate(formData.get('intake_date'), todayInMalaysia())
  if (!intakeDate) failOnLog('Please choose a valid intake date — it cannot be in the future.')

  const simType = String(formData.get('sim_type') ?? 'physical')
  const quantity = Number(formData.get('quantity') ?? 0)
  const costPerUnit = Number(formData.get('cost_per_unit_rm') ?? 0)
  const note = String(formData.get('note') ?? '').trim() || null

  if (!isSimStockType(simType)) failOnLog('Invalid SIM type.')
  if (!Number.isFinite(quantity) || quantity <= 0) failOnLog('Quantity must be a positive number.')
  if (!Number.isFinite(costPerUnit) || costPerUnit < 0) failOnLog('Cost per unit must be zero or more.')

  const supabase = await createClient()
  const receipt = await uploadReceipt(supabase, formData, 'sim-intakes')
  if (receipt.error) failOnLog(receipt.error)

  const { error } = await supabase.from('sim_stock_intakes').insert({
    intake_date: intakeDate,
    sim_type: simType,
    quantity,
    cost_per_unit_rm: costPerUnit,
    note,
    receipt_url: receipt.path,
    recorded_by: user.id,
  })

  if (error) failOnLog(friendlyDbError(error.message))

  revalidatePath('/sim-stock')
  revalidatePath('/reports')
  redirect('/sim-stock?intake_saved=1')
}

export async function createSimOrder(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') failOnLog('You do not have permission to record a SIM order.')

  const orderDate = parseBusinessDate(formData.get('order_date'), todayInMalaysia())
  if (!orderDate) failOnLog('Please choose a valid order date — it cannot be in the future.')

  const dealerId = String(formData.get('dealer_id') ?? '')
  const simType = String(formData.get('sim_type') ?? 'physical')
  const quantity = Number(formData.get('quantity') ?? 0)
  const shippingFeeRaw = String(formData.get('shipping_fee_rm') ?? '').trim()
  const shippingFee = shippingFeeRaw ? Number(shippingFeeRaw) : null
  const shippingInvoicePath = String(formData.get('shipping_invoice_path') ?? '').trim() || null
  const esimCodes = String(formData.get('esim_codes') ?? '').trim() || null

  if (!dealerId) failOnLog('Please select a dealer.')
  if (!isSimStockType(simType)) failOnLog('Invalid SIM type.')
  if (!Number.isFinite(quantity) || quantity < 10) failOnLog('Minimum order quantity is 10.')
  if (shippingFeeRaw && (!Number.isFinite(shippingFee) || (shippingFee ?? -1) < 0)) failOnLog('Shipping fee must be zero or more.')

  const isPhysical = isPhysicalSimType(simType)
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_sim_order', {
    p_dealer_id: dealerId,
    p_order_date: orderDate,
    p_quantity: quantity,
    p_shipping_fee_rm: isPhysical ? shippingFee : null,
    p_shipping_invoice_path: isPhysical ? shippingInvoicePath : null,
    p_sim_type: simType,
    p_esim_codes: isPhysical ? null : esimCodes,
  })

  // insufficient_sim_stock is rewritten by friendlyDbError, which now owns the
  // prefix-stripping this used to do inline — one place for every raise the
  // database can reach a form with.
  if (error) failOnLog(friendlyDbError(error.message))

  revalidatePath('/sim-stock')
  revalidatePath('/delivery')
  revalidatePath('/reports')
  redirect('/sim-stock?order_saved=1')
}

export async function markSimOrderSent(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') failOnStock('You do not have permission to mark an order as sent.')

  const orderId = String(formData.get('id') ?? '')
  if (!orderId) failOnStock('Missing order id.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_sim_order_sent', { p_order_id: orderId })
  if (error) failOnStock(friendlyDbError(error.message))

  revalidatePath('/sim-stock')
}
