import type {WalletActionKind, WalletAdapter} from "@/context/wallet/types";

type WrapOpts = {
  onStart: (kind: WalletActionKind, label: string) => () => void;
  getLabel?: (kind: WalletActionKind) => string;
};

function defaultLabel(kind: WalletActionKind): string {
  if (kind === "executeBatch" || kind === "executeContract" || kind === "signAndSubmit") {
    return "Waiting for transaction signature in your wallet...";
  }
  return "Waiting for signature in your wallet...";
}

export function wrapWalletAdapterWithWalletAction(adapter: WalletAdapter, opts: WrapOpts): WalletAdapter {
  const labelFor = opts.getLabel ?? defaultLabel;
  async function tempoWrite<T>(work:()=>Promise<T>):Promise<T> {
    const end=opts.onStart("executeContract",labelFor("executeContract"));
    try{return await work();}finally{end();}
  }

  return {
    tempo: adapter.tempo ? {
      ...adapter.tempo,
      sendContract: (...args) => tempoWrite(()=>adapter.tempo!.sendContract(...args)),
      approvePayment: (...args) => tempoWrite(()=>adapter.tempo!.approvePayment(...args)),
      payOrder: (...args) => tempoWrite(()=>adapter.tempo!.payOrder(...args)),
      payOrderAutomatically: (...args) => tempoWrite(()=>adapter.tempo!.payOrderAutomatically(...args)),
      approve: (...args) => tempoWrite(()=>adapter.tempo!.approve(...args)),
      transfer: (...args) => tempoWrite(()=>adapter.tempo!.transfer(...args)),
      transferToken: (...args) => tempoWrite(()=>adapter.tempo!.transferToken(...args)),
    } : undefined,
    chain: adapter.chain,
    name: adapter.name,
    id: adapter.id,
    isInstalled: adapter.isInstalled ? () => adapter.isInstalled!() : undefined,
    getAddress: () => adapter.getAddress(),
    getNetwork: adapter.getNetwork ? () => adapter.getNetwork!() : undefined,
    getPublicKey: adapter.getPublicKey ? () => adapter.getPublicKey!() : undefined,
    connect: (options) => adapter.connect(options),
    disconnect: () => adapter.disconnect(),
    onAccountChange: adapter.onAccountChange ? (cb) => adapter.onAccountChange!(cb) : undefined,
    onNetworkChange: adapter.onNetworkChange ? (cb) => adapter.onNetworkChange!(cb) : undefined,
    signMessage: async (dataToSign: string, message?: string) => {
      const end = opts.onStart("signMessage", labelFor("signMessage"));
      try {
        return await adapter.signMessage(dataToSign, message);
      } finally {
        end();
      }
    },
    executeContract: async (payload) => {
      const end = opts.onStart("executeContract", labelFor("executeContract"));
      try {
        return await adapter.executeContract(payload);
      } finally {
        end();
      }
    },
    executeBatch: async (payloads) => {
      const end = opts.onStart("executeBatch", labelFor("executeBatch"));
      try {
        return await adapter.executeBatch(payloads);
      } finally {
        end();
      }
    },
    signAndSubmit: adapter.signAndSubmit ? async (transaction: object) => {
      const end = opts.onStart("signAndSubmit", labelFor("signAndSubmit"));
      try {
        return await adapter.signAndSubmit!(transaction);
      } finally {
        end();
      }
    } : undefined,
    readFileContents: adapter.readFileContents ? (fileId: string) => adapter.readFileContents!(fileId) : undefined,
  };
}
