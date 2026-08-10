// What a WhatsApp screenshot is allowed to become on the onboarding form.
//
// Two jobs, both kept out of the route so they can be tested without spending
// a model call: the schema the model is constrained to, and the tidying its
// answer goes through before it reaches a field.
//
// Nothing here decides anything commercial. Package and rate are absent from
// the schema on purpose — they are a decision the master dealer makes, not a
// fact sitting in a chat log, and a model that is never asked for them cannot
// invent one.

import { normalizeRegion } from './regions'

export const DEALER_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    company_name: { type: ['string', 'null'], description: 'The shop or company name, as written' },
    company_no: { type: ['string', 'null'], description: 'Malaysian SSM company registration number, e.g. 202301234567-X' },
    contact_person: { type: ['string', 'null'], description: 'Name of the person in charge' },
    phone: { type: ['string', 'null'], description: 'Their phone number' },
    whatsapp: { type: ['string', 'null'], description: 'Their WhatsApp number, only if stated separately from the phone number' },
    email: { type: ['string', 'null'], description: 'Their email address' },
    address: { type: ['string', 'null'], description: 'Full shop address including postcode and city' },
    region: { type: ['string', 'null'], description: 'The town or city, e.g. Ipoh, Penang, KL' },
  },
  required: ['company_name', 'company_no', 'contact_person', 'phone', 'whatsapp', 'email', 'address', 'region'],
  additionalProperties: false,
} as const

export const DEALER_EXTRACTION_SYSTEM = [
  'You read screenshots of WhatsApp conversations in which a Malaysian phone shop gives its details to a mobile-credit distributor who is about to sign them up as a dealer.',
  'The messages mix English, Malay and Chinese, and the details arrive scattered across several messages rather than as a form.',
  'Return only what is actually written. If a detail is not present in the images, return null for it — never infer, complete or invent one.',
  'Take the shop\'s details, not the distributor\'s: the distributor is the person asking the questions.',
  'Do not return a package, rate, commission or price. Those are not your concern even if they appear in the conversation.',
].join(' ')

export const DEALER_EXTRACTION_PROMPT =
  'Extract the shop\'s details from this conversation. Return null for anything not stated.'

export type ExtractedDealer = {
  company_name: string | null
  company_no: string | null
  contact_person: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
  region: string | null
}

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const trimmed = v.replace(/\s+/g, ' ').trim()
  // Models asked for "null when absent" sometimes answer in words instead.
  if (!trimmed || /^(null|n\/?a|none|unknown|not (stated|given|provided|visible))$/i.test(trimmed)) return null
  return trimmed
}

/**
 * Malaysian numbers arrive as "+60 12-345 6789", "0123456789", "60123456789"
 * and every spacing in between. Settle them on the one shape the rest of the
 * app already holds: a leading zero, a dash after the prefix.
 *
 * Anything that doesn't look like a Malaysian number is handed back trimmed
 * and untouched. A number we don't recognise is not a number we should be
 * rewriting — and the field is free text with a human about to read it.
 */
export function normalizeMalaysianPhone(input: unknown): string | null {
  const raw = clean(input)
  if (!raw) return null

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('60')) digits = '0' + digits.slice(2)
  else if (!digits.startsWith('0') && digits.length >= 9) digits = '0' + digits

  // 03-12345678 is 10; 011-12345678 is 11. Outside that band it is something
  // else — an IC number, an order reference, a partial — so leave it alone.
  if (!digits.startsWith('0') || digits.length < 9 || digits.length > 11) return raw

  const prefixLength = digits.startsWith('01') ? 3 : 2
  return `${digits.slice(0, prefixLength)}-${digits.slice(prefixLength)}`
}

function normalizeEmail(input: unknown): string | null {
  const raw = clean(input)
  if (!raw) return null
  const lowered = raw.toLowerCase().replace(/\s/g, '')
  // The form field is type="email"; handing it something that can never pass
  // validation just blocks the save with no explanation of where it came from.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lowered) ? lowered : null
}

/**
 * The model's answer, made safe to drop into the onboarding form.
 *
 * `whatsapp` is dropped when it matches `phone`, because the field means "a
 * different number from the one above" — the form's own placeholder says
 * "Same as phone" and leaving it blank is what that means.
 */
export function normalizeExtractedDealer(raw: Partial<ExtractedDealer> | null | undefined): ExtractedDealer {
  const phone = normalizeMalaysianPhone(raw?.phone)
  const whatsapp = normalizeMalaysianPhone(raw?.whatsapp)

  return {
    company_name: clean(raw?.company_name),
    company_no: clean(raw?.company_no)?.toUpperCase() ?? null,
    contact_person: clean(raw?.contact_person),
    phone,
    whatsapp: whatsapp && whatsapp === phone ? null : whatsapp,
    email: normalizeEmail(raw?.email),
    address: clean(raw?.address),
    region: normalizeRegion(clean(raw?.region)),
  }
}

/** True when the read found nothing at all, so the form should say so. */
export function isEmptyExtraction(d: ExtractedDealer): boolean {
  return Object.values(d).every((v) => v === null)
}
