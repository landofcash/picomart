import {
  TrustedPicomartProfileV1Schema,
  canonicalHash,
  type TrustedPicomartProfileV1,
} from '@picomart/order-protocol'
import {APP_KEY_PREFIX, getConfig} from '@/config'

const PROFILE_KEY = `${APP_KEY_PREFIX}-trusted-agent-order-profile`
const REVISION_KEY = `${PROFILE_KEY}-revision`

export function getTrustedPicomartProfile(): TrustedPicomartProfileV1 {
  const configured = getConfig('testnet').trustedPicomartProfile
  if (!configured) throw new Error('No trusted testnet Picomart profile is configured.')
  const stored = localStorage.getItem(PROFILE_KEY)
  return TrustedPicomartProfileV1Schema.parse(stored ? JSON.parse(stored) : configured)
}

export function getTrustedProfileRevision(): number {
  return Number(localStorage.getItem(REVISION_KEY) || '0')
}

export function saveTrustedPicomartProfile(profile: unknown): TrustedPicomartProfileV1 {
  const parsed = TrustedPicomartProfileV1Schema.parse(profile)
  localStorage.setItem(PROFILE_KEY, JSON.stringify(parsed))
  localStorage.setItem(REVISION_KEY, String(getTrustedProfileRevision() + 1))
  sessionStorage.removeItem(`${APP_KEY_PREFIX}-pending-agent-order`)
  return parsed
}

export function resetTrustedPicomartProfile(): TrustedPicomartProfileV1 {
  localStorage.removeItem(PROFILE_KEY)
  localStorage.setItem(REVISION_KEY, String(getTrustedProfileRevision() + 1))
  sessionStorage.removeItem(`${APP_KEY_PREFIX}-pending-agent-order`)
  return getTrustedPicomartProfile()
}

export async function quoteKeyFingerprint(publicKey: string): Promise<string> {
  return (await canonicalHash({ publicKey })).slice(0, 16)
}
