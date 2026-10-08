import { useEffect, useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { PICOMART_TEMPO_CONFIG } from '@picomart/config';
import { isContractOwner, readContractOwner } from '@/lib/tempoAdmin';
import { tempoTransactionError } from '@/lib/internalWallet/tempoTransactions';

export function useTempoAdmin(refresh = 0) {
  const { walletAddress, network } = useWallet();
  const key = `${network}:${walletAddress?.toLowerCase() ?? ''}`;
  const [result, setResult] = useState({ key: '', owner: null as string | null, error: '' });
  const eligible = !!walletAddress && network === PICOMART_TEMPO_CONFIG.network;
  useEffect(() => {
    let active = true;
    setResult({ key: '', owner: null, error: '' });
    if (eligible) void readContractOwner().then(owner => {
      if (active) setResult({ key, owner, error: '' });
    }).catch(error => {
      if (active) setResult({ key, owner: null, error: tempoTransactionError(error) });
    });
    return () => { active = false; };
  }, [key, eligible, refresh]);
  return {
    isAdmin: result.key === key && isContractOwner(walletAddress ?? undefined, network, result.owner),
    loading: eligible && result.key !== key,
    error: result.key === key ? result.error : '',
  };
}
