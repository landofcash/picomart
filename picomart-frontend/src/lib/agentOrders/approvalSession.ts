import type {ValidatedAgentOrder} from '@/lib/agentOrders/quoteClient'
import {quoteExecutionDeadlineMilliseconds} from '@/lib/agentOrders/quoteExpiry'

export type AgentOrderApprovalSession = {
  intent: ValidatedAgentOrder
  profileRevision: number
}

export type AgentOrderApprovalSessionState =
  | {status: 'empty'}
  | {status: 'active'; session: AgentOrderApprovalSession}
  | {status: 'expired'}

export type AgentOrderApprovalSessionAction =
  | {type: 'set'; session: AgentOrderApprovalSession}
  | {type: 'expire'}
  | {type: 'clear'}

export const EMPTY_AGENT_ORDER_APPROVAL_SESSION: AgentOrderApprovalSessionState = {status: 'empty'}

export function agentOrderApprovalSessionReducer(
  state: AgentOrderApprovalSessionState,
  action: AgentOrderApprovalSessionAction,
): AgentOrderApprovalSessionState {
  switch (action.type) {
    case 'set':
      return {status: 'active', session: action.session}
    case 'expire':
      return state.status === 'active' ? {status: 'expired'} : state
    case 'clear':
      return EMPTY_AGENT_ORDER_APPROVAL_SESSION
  }
}

export function approvalSessionRemainingMilliseconds(
  session: AgentOrderApprovalSession,
  nowMilliseconds = Date.now(),
): number {
  return quoteExecutionDeadlineMilliseconds(session.intent.quote) - nowMilliseconds
}

export function shouldResumeAgentOrderApprovalSession(input: {
  hash: string
  hasPendingHandoff: boolean
  hasPendingResolution: boolean
}): boolean {
  return input.hash.length <= 1 &&
    !input.hasPendingHandoff &&
    !input.hasPendingResolution
}
