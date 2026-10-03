export type AgentOrderApprovalPrimaryAction =
  | 'open-wallet'
  | 'finish-wallet-setup'
  | 'unlock-and-approve'
  | 'approve-and-pay'

export type AgentOrderApprovalWalletState = {
  walletAddress: string | null
  hasWalletAdapter: boolean
  walletCanTransact: boolean
  walletLocked: boolean
}

export function getAgentOrderApprovalPrimaryAction(
  wallet: AgentOrderApprovalWalletState,
): AgentOrderApprovalPrimaryAction {
  if (!wallet.walletAddress || !wallet.hasWalletAdapter) {
    return 'open-wallet'
  }
  if (!wallet.walletCanTransact) {
    return 'finish-wallet-setup'
  }
  if (wallet.walletLocked) {
    return 'unlock-and-approve'
  }
  return 'approve-and-pay'
}
