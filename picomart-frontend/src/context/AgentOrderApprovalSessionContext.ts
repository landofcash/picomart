import {createContext, useContext} from 'react'

import type {
  AgentOrderApprovalSession,
  AgentOrderApprovalSessionState,
} from '@/lib/agentOrders/approvalSession'

export type AgentOrderApprovalSessionContextValue = {
  state: AgentOrderApprovalSessionState
  setSession: (session: AgentOrderApprovalSession) => void
  expireSession: () => void
  clearSession: () => void
}

export const AgentOrderApprovalSessionContext =
  createContext<AgentOrderApprovalSessionContextValue | null>(null)

export function useAgentOrderApprovalSession() {
  const context = useContext(AgentOrderApprovalSessionContext)
  if (!context) {
    throw new Error('useAgentOrderApprovalSession must be used within AgentOrderApprovalSessionProvider.')
  }
  return context
}
