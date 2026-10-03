import {describe, expect, it} from 'vitest'

import {getAgentOrderApprovalPrimaryAction} from './approvalAction'

describe('agent-order approval primary action', () => {
  it('opens wallet management when no wallet is connected', () => {
    expect(getAgentOrderApprovalPrimaryAction({
      walletAddress: null,
      hasWalletAdapter: false,
      walletCanTransact: false,
      walletLocked: false,
    })).toBe('open-wallet')
  })

  it('returns to wallet setup when the connected wallet cannot transact', () => {
    expect(getAgentOrderApprovalPrimaryAction({
      walletAddress: '0.0.1234',
      hasWalletAdapter: true,
      walletCanTransact: false,
      walletLocked: false,
    })).toBe('finish-wallet-setup')
  })

  it('uses the unlock path for a ready locked wallet', () => {
    expect(getAgentOrderApprovalPrimaryAction({
      walletAddress: '0.0.1234',
      hasWalletAdapter: true,
      walletCanTransact: true,
      walletLocked: true,
    })).toBe('unlock-and-approve')
  })

  it('offers approval when the wallet is ready and unlocked', () => {
    expect(getAgentOrderApprovalPrimaryAction({
      walletAddress: '0.0.1234',
      hasWalletAdapter: true,
      walletCanTransact: true,
      walletLocked: false,
    })).toBe('approve-and-pay')
  })
})
