import {useRef, useState} from 'react';
import {BuilderError} from './client';

/** Keep the exact payload and idempotency key after an ambiguous response. */
export function useMutation<T>() {
  const pending = useRef<{input: T; key: string} | null>(null), running = useRef(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState<string | null>(null);
  async function run<R>(input: T, send: (input: T, key: string) => Promise<R>): Promise<R | undefined> {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    pending.current ??= {input, key: crypto.randomUUID()};
    try {
      const result = await send(pending.current.input, pending.current.key);
      pending.current = null; setUncertain(false); return result;
    } catch (failure) {
      const ambiguous = !(failure instanceof BuilderError) || failure.status === 0 || failure.status >= 500;
      if (!ambiguous) pending.current = null;
      setUncertain(ambiguous);
      setError(ambiguous ? 'We could not confirm this request. Retry to check it safely.' : failure.message);
    } finally { running.current = false; setBusy(false); }
  }
  return {run, busy, uncertain, error};
}
