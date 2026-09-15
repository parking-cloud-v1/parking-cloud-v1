function normalizeText(value?: string | null) {
  return String(value || '').trim().toLocaleLowerCase('zh-TW')
}

function normalizePlate(value?: string | null) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

export type RosterIdentity = {
  customerCode?: string | null
  name?: string | null
  phone?: string | null
  plate?: string | null
}

export function decideRosterIdentity({
  incoming,
  current,
}: {
  incoming: RosterIdentity
  current: RosterIdentity
}): 'same' | 'replacement' | 'different' {
  const incomingCode = normalizeText(incoming.customerCode)
  const currentCode = normalizeText(current.customerCode)
  const incomingPlate = normalizePlate(incoming.plate)
  const currentPlate = normalizePlate(current.plate)

  if (incomingCode) {
    if (!currentCode || incomingCode !== currentCode) return 'different'

    const nameChanged = normalizeText(incoming.name) !== normalizeText(current.name)
    const phoneChanged = normalizePhone(incoming.phone) !== normalizePhone(current.phone)
    const plateChanged = incomingPlate !== currentPlate

    return nameChanged && phoneChanged && plateChanged ? 'replacement' : 'same'
  }

  if (incomingPlate && incomingPlate === currentPlate) return 'same'
  return 'different'
}
