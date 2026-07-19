'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

function fail(message: string): never {
  redirect('/sim-stock?error=' + encodeURIComponent(message))
}

export async function recordSimIntake(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') fail('You do not have permission to record stock intake.')

  const intakeDate = String(formData.get('intake_date') ?? '')
  const simType = String(formData.get('sim_type') ?? 'physical')
  const quantity = Number(formData.get('quantity') ?? 0)
  const costPerUnit = Number(formData.get('cost_per_unit_rm') ?? 0)
  const note = String(formData.get('note') ?? '').trim() || null

  if (!intakeDate) fail('Intake date is required.')
  if (simType !== 'physical' && simType !== 'esim') fail('Invalid SIM type.')
  if (!Number.isFinite(quantity) || quantity <= 0) fail('Quantity must be a positive number.')
  if (!Number.isFinite(costPerUnit) || costPerUnit < 0) fail('Cost per unit must be zero or more.')

  const supabase = await createClient()
  const { error } = await supabase.from('sim_stock_intakes').insert({
    intake_date: intakeDate,
    sim_type: simType,
    quantity,
    cost_per_unit_rm: costPerUnit,
    note,
    recorded_by: user.id,
  })

  if (error) fail(error.message)

  revalidatePath('/sim-stock')
  redirect('/sim-stock?intake_saved=1')
}

export async function createSimOrder(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') fail('You do not have permission to record a SIM order.')

  const dealerId = String(formData.get('dealer_id') ?? '')
  const orderDate = String(formData.get('order_date') ?? '')
  const simType = String(formData.get('sim_type') ?? 'physical')
  const quantity = Number(formData.get('quantity') ?? 0)
  const shippingFeeRaw = String(formData.get('shipping_fee_rm') ?? '').trim()
  const shippingFee = shippingFeeRaw ? Number(shippingFeeRaw) : null
  const shippingInvoicePath = String(formData.get('shipping_invoice_path') ?? '').trim() || null
  const esimCodes = String(formData.get('esim_codes') ?? '').trim() || null

  if (!dealerId) fail('Please select a dealer.')
  if (!orderDate) fail('Order date is required.')
  if (simType !== 'physical' && simType !== 'esim') fail('Invalid SIM type.')
  if (!Number.isFinite(quantity) || quantity < 10) fail('Minimum order quantity is 10.')
  if (shippingFeeRaw && (!Number.isFinite(shippingFee) || (shippingFee ?? -1) < 0)) fail('Shipping fee must be zero or more.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_sim_order', {
    p_dealer_id: dealerId,
    p_order_date: orderDate,
    p_quantity: quantity,
    p_shipping_fee_rm: simType === 'esim' ? null : shippingFee,
    p_shipping_invoice_path: simType === 'esim' ? null : shippingInvoicePath,
    p_sim_type: simType,
    p_esim_codes: simType === 'esim' ? esimCodes : null,
  })

  if (error) {
    // insufficient_sim_stock: N available, M requested — surfaced from
    // create_sim_order's own raise exception, already dealer-facing text.
    fail(error.message.replace(/^insufficient_sim_stock: /, 'Not enough stock — '))
  }

  revalidatePath('/sim-stock')
  redirect('/sim-stock?order_saved=1')
}

export async function markSimOrderSent(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') fail('You do not have permission to mark an order as sent.')

  const orderId = String(formData.get('id') ?? '')
  if (!orderId) fail('Missing order id.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_sim_order_sent', { p_order_id: orderId })
  if (error) fail(error.message)

  revalidatePath('/sim-stock')
}
