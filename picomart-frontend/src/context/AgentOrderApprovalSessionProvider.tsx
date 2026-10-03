import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'

import {
  AgentOrderApprovalSessionContext,
  type AgentOrderApprovalSessionContextValue,
} from '@/context/AgentOrderApprovalSessionContext'
import {
  EMPTY_AGENT_ORDER_APPROVAL_SESSION,
  agentOrderApprovalSessionReducer,
  approvalSessionRemainingMilliseconds,
  type AgentOrderApprovalSession,
} from '@/lib/agentOrders/approvalSession'

export function AgentOrderApprovalSessionProvider({children}: {children: ReactNode}) {
  const [state, dispatch] = useReducer(
    agentOrderApprovalSessionReducer,
    EMPTY_AGENT_ORDER_APPROVAL_SESSION,
  )

  useEffect(() => {
    if (state.status !== 'active') {
      return
    }

    const remaining = approvalSessionRemainingMilliseconds(state.session)
    if (remaining <= 0) {
      dispatch({type: 'expire'})
      return
    }

    const timeout = window.setTimeout(() => dispatch({type: 'expire'}), remaining)
    return () => window.clearTimeout(timeout)
  }, [state])

  const setSession = useCallback((session: AgentOrderApprovalSession) => {
    dispatch({type: 'set', session})
  }, [])

  const expireSession = useCallback(() => {
    dispatch({type: 'expire'})
  }, [])

  const clearSession = useCallback(() => {
    dispatch({type: 'clear'})
  }, [])

  const value = useMemo<AgentOrderApprovalSessionContextValue>(() => ({
    state,
    setSession,
    expireSession,
    clearSession,
  }), [clearSession, expireSession, setSession, state])

  return (
    <AgentOrderApprovalSessionContext.Provider value={value}>
      {children}
    </AgentOrderApprovalSessionContext.Provider>
  )
}
