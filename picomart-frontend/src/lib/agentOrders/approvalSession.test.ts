import {describe, expect, it} from 'vitest'

import type {ValidatedAgentOrder} from './quoteClient'
import {
  EMPTY_AGENT_ORDER_APPROVAL_SESSION,
  agentOrderApprovalSessionReducer,
  approvalSessionRemainingMilliseconds,
  shouldResumeAgentOrderApprovalSession,
  type AgentOrderApprovalSession,
} from './approvalSession'

function createSession(expiresAt: number, profileRevision = 1): AgentOrderApprovalSession {
  return {
    intent: {
      quote: {expiresAt},
    } as ValidatedAgentOrder,
    profileRevision,
  }
}

describe('agent-order approval session', () => {
  it('retains a validated approval for an in-app route change', () => {
    const session = createSession(1_700_000_600)
    const state = agentOrderApprovalSessionReducer(
      EMPTY_AGENT_ORDER_APPROVAL_SESSION,
      {type: 'set', session},
    )

    expect(state).toEqual({status: 'active', session})
  })

  it('replaces an older approval with a newly validated link', () => {
    const first = createSession(1_700_000_600, 1)
    const second = createSession(1_700_000_900, 2)
    const active = agentOrderApprovalSessionReducer(
      EMPTY_AGENT_ORDER_APPROVAL_SESSION,
      {type: 'set', session: first},
    )

    expect(agentOrderApprovalSessionReducer(active, {type: 'set', session: second}))
      .toEqual({status: 'active', session: second})
  })

  it('removes sensitive approval data when the execution window expires', () => {
    const active = agentOrderApprovalSessionReducer(
      EMPTY_AGENT_ORDER_APPROVAL_SESSION,
      {type: 'set', session: createSession(1_700_000_600)},
    )

    expect(agentOrderApprovalSessionReducer(active, {type: 'expire'}))
      .toEqual({status: 'expired'})
  })

  it('clears the session after completion or invalidation', () => {
    const active = agentOrderApprovalSessionReducer(
      EMPTY_AGENT_ORDER_APPROVAL_SESSION,
      {type: 'set', session: createSession(1_700_000_600)},
    )

    expect(agentOrderApprovalSessionReducer(active, {type: 'clear'}))
      .toEqual({status: 'empty'})
  })

  it('calculates the remaining resumable approval time', () => {
    const session = createSession(1_700_000_600)

    expect(approvalSessionRemainingMilliseconds(session, 1_700_000_000_000))
      .toBe(540_000)
  })

  it('reuses a pending resolution when StrictMode replays the effect after clearing the hash', () => {
    expect(shouldResumeAgentOrderApprovalSession({
      hash: '',
      hasPendingHandoff: true,
      hasPendingResolution: true,
    })).toBe(false)

    expect(shouldResumeAgentOrderApprovalSession({
      hash: '',
      hasPendingHandoff: false,
      hasPendingResolution: false,
    })).toBe(true)
  })
})
