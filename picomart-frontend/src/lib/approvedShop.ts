import {useEffect, useMemo, useState} from 'react'
import {getCurrentConfig} from '@/config'
import {getHederaAccountIdFromEvmAddress} from '@/lib/hedera/hederaUtils.ts'

const ACCOUNT_ID_PATTERN = /^\d+\.\d+\.\d+$/
const EVM_ADDRESS_PATTERN = /^(0x)?[a-fA-F0-9]{40}$/
const resolvedWalletCache = new Map<string, Promise<string>>()

function normalizeWalletAddress(walletAddress: string): string {
  const trimmed = walletAddress.trim()

  if (!trimmed) {
    return ''
  }

  if (ACCOUNT_ID_PATTERN.test(trimmed)) {
    return trimmed
  }

  if (EVM_ADDRESS_PATTERN.test(trimmed)) {
    const hex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
    return hex.toLowerCase()
  }

  return trimmed.toLowerCase()
}

async function resolveWalletAddress(walletAddress: string): Promise<string> {
  const normalized = normalizeWalletAddress(walletAddress)

  if (!normalized || ACCOUNT_ID_PATTERN.test(normalized) || !normalized.startsWith('0x')) {
    return normalized
  }

  const cached = resolvedWalletCache.get(normalized)
  if (cached) {
    return cached
  }

  const pending = getHederaAccountIdFromEvmAddress(normalized)
    .then(accountId => accountId.toString())
    .catch(() => normalized)

  resolvedWalletCache.set(normalized, pending)
  return pending
}

export async function isApprovedShopWallet(
  walletAddress: string,
  approvedShopWallets = getCurrentConfig().approvedShopWallets,
): Promise<boolean> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress)

  if (!normalizedWalletAddress) {
    return false
  }

  const normalizedApprovedShopWallets = approvedShopWallets.map(normalizeWalletAddress)
  if (normalizedApprovedShopWallets.includes(normalizedWalletAddress)) {
    return true
  }

  const [resolvedWalletAddress, ...resolvedApprovedShopWallets] = await Promise.all(
    [walletAddress, ...approvedShopWallets].map(resolveWalletAddress),
  )

  return resolvedApprovedShopWallets.includes(resolvedWalletAddress)
}

function hasDirectApprovalMatch(walletAddress: string, approvedShopWallets: string[]): boolean {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress)

  if (!normalizedWalletAddress) {
    return false
  }

  return approvedShopWallets
    .map(normalizeWalletAddress)
    .includes(normalizedWalletAddress)
}

export function useApprovedShopStatus(walletAddress: string): boolean {
  const approvedShopWallets = getCurrentConfig().approvedShopWallets
  const approvedWalletsKey = useMemo(() => approvedShopWallets.join('|'), [approvedShopWallets])
  const directMatch = useMemo(
    () => hasDirectApprovalMatch(walletAddress, approvedShopWallets),
    [approvedShopWallets, approvedWalletsKey, walletAddress],
  )
  const [isApproved, setIsApproved] = useState(directMatch)

  useEffect(() => {
    let cancelled = false

    setIsApproved(directMatch)

    if (directMatch) {
      return () => {
        cancelled = true
      }
    }

    const syncApprovalStatus = async () => {
      const approved = await isApprovedShopWallet(walletAddress, approvedShopWallets)
      if (!cancelled) {
        setIsApproved(approved)
      }
    }

    void syncApprovalStatus()

    return () => {
      cancelled = true
    }
  }, [approvedShopWallets, approvedWalletsKey, directMatch, walletAddress])

  return isApproved
}
