import {
  TempoDeliveryOptionsSchema,
  canonicalJson,
  type TempoDeliveryOptions,
  type TempoDeliveryMethod,
} from "@picomart/order-protocol/tempo-protocol";
import {
  getCurrency,
  isPaymentCurrency,
  PICOMART_TEMPO_CONFIG,
} from "@picomart/config";
import {
  prepareItem,
  signSeedAndDerive,
  decryptStorageItem,
  clearItemKeys,
  encodeBase64,
} from "@zkbytes/sdk";
import { configuredProofClient } from "./internalWallet/tempoRecoveryProof";
import {
  tempoWalletRevision,
  assertTempoWalletRevision,
} from "./internalWallet/providers/tempoInternalWalletProvider";
import type { WalletAdapter } from "@/context/wallet/types";

export interface DeliverySet {
  id: string;
  name: string;
  description: string;
  options: TempoDeliveryOptions;
  disabledTypes: TempoDeliveryMethod["type"][];
}
const key = `picomart_delivery_sets_v1_${PICOMART_TEMPO_CONFIG.chainId}`;
export const deliverySetsChanged = "picomart:delivery-sets-changed";
export const defaultDeliverySets = [
  {id: 'default-physical-free', name: 'Physical delivery — free'},
  {id: 'default-digital-free', name: 'Digital delivery — free'},
] as const;

/** Built-in templates take the catalogue currency when confirmed, without creating saved sets. */
export function defaultDeliveryOptions(id: string, currency: string): TempoDeliveryOptions | null {
  if (!defaultDeliverySets.some(set => set.id === id)) return null;
  getCurrency(currency);
  return TempoDeliveryOptionsSchema.parse({
    version: 1,
    currency,
    methods: id === 'default-physical-free' ? [{
      id: 'customer-address', type: 'customer-address', name: 'Delivery to your address',
      description: 'Have your order shipped to you.',
      services: [{id: 'regular-delivery', name: 'Regular delivery', description: 'Standard delivery', amount: '0'}],
    }] : [{
      id: 'digital', type: 'digital', name: 'Digital delivery',
      description: "Receive a URL or code by email or in the order's delivery comments.",
    }],
  });
}
export function publishedDeliverySet(set: DeliverySet) {
  if (
    !set.name.trim() ||
    set.name.length > 200 ||
    set.description.length > 2000 ||
    !isPaymentCurrency(set.options.currency)
  )
    throw new Error("Enter a set name and supported currency.");
  for (const method of set.options.methods.filter(
    (m) => !set.disabledTypes.includes(m.type),
  )) {
    if (
      (method.type === "shop-pickup" || method.type === "pickup-box") &&
      method.locations.some(
        (location) =>
          location.address === "Enter the collection address" ||
          location.address === "Enter the pickup box address",
      )
    )
      throw new Error(
        "Enter the collection address for every enabled pickup location.",
      );
  }
  return TempoDeliveryOptionsSchema.parse({
    ...set.options,
    methods: set.options.methods.filter(
      (m) => !set.disabledTypes.includes(m.type),
    ),
  });
}
export function parseDeliverySets(value: unknown): DeliverySet[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Invalid delivery sets.");
  const ids = new Set<string>();
  return value.map((set) => {
    if (
      !set ||
      typeof set.id !== "string" ||
      !set.id ||
      ids.has(set.id) ||
      typeof set.name !== "string" ||
      typeof set.description !== "string" ||
      !Array.isArray(set.disabledTypes) ||
      set.disabledTypes.some(
        (t: unknown) =>
          ![
            "customer-address",
            "shop-pickup",
            "pickup-box",
            "digital",
          ].includes(String(t)),
      )
    )
      throw new Error("Invalid delivery set.");
    if (
      set.id.length > 100 ||
      set.name.length > 200 ||
      set.description.length > 2000 ||
      new Set(set.disabledTypes).size !== set.disabledTypes.length
    )
      throw new Error("Invalid delivery set.");
    TempoDeliveryOptionsSchema.parse(set.options);
    ids.add(set.id);
    publishedDeliverySet(set);
    return structuredClone(set) as DeliverySet;
  });
}
export function loadDeliverySets(): DeliverySet[] {
  try {
    return parseDeliverySets(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return [];
  }
}
export function saveDeliverySets(sets: DeliverySet[]) {
  localStorage.setItem(key, canonicalJson(parseDeliverySets(sets)));
  window.dispatchEvent(new Event(deliverySetsChanged));
}
export function newDeliverySet(
  currency: string,
  template: "physical" | "digital" | "pickup" = "physical",
): DeliverySet {
  getCurrency(currency);
  const methods: TempoDeliveryMethod[] = [
    {
      id: "customer-address",
      type: "customer-address",
      name: "Delivery to your address",
      description: "Have your order shipped to you.",
      services: [
        {
          id: crypto.randomUUID(),
          name: "Standard delivery",
          description: "",
          amount: "0",
        },
      ],
    },
    {
      id: "shop-pickup",
      type: "shop-pickup",
      name: "Shop pickup",
      description: "Collect your order from a shop.",
      locations: [
        {
          id: crypto.randomUUID(),
          name: "Main shop",
          description: "",
          address: "Enter the collection address",
          schedule: "",
          amount: "0",
        },
      ],
    },
    {
      id: "pickup-box",
      type: "pickup-box",
      name: "Pickup box",
      description: "Collect your order from a pickup box.",
      locations: [
        {
          id: crypto.randomUUID(),
          name: "Pickup box",
          description: "",
          address: "Enter the pickup box address",
          schedule: "",
          amount: "0",
        },
      ],
    },
    {
      id: "digital",
      type: "digital",
      name: "Digital delivery",
      description: "Receive a URL or code by email or in the order's delivery comments.",
    },
  ];
  return {
    id: crypto.randomUUID(),
    name:
      template === "digital"
        ? "Digital only"
        : template === "pickup"
          ? "Pickup only"
          : "Physical delivery",
    description: "",
    options: { version: 1, currency, methods },
    disabledTypes: methods
      .filter((m) =>
        template === "digital"
          ? m.type !== "digital"
          : template === "pickup"
            ? m.type !== "shop-pickup"
            : !["customer-address", "shop-pickup"].includes(m.type),
      )
      .map((m) => m.type),
  };
}
function backupSigner(wallet: WalletAdapter) {
  const revision = tempoWalletRevision();
  return async () => {
    const address = (await wallet.getAddress())?.toLowerCase();
    if (
      !address ||
      wallet.chain !== "tempo" ||
      (await wallet.getNetwork?.()) !== PICOMART_TEMPO_CONFIG.network
    )
      throw new Error("Select your Picomart wallet.");
    const check = async () => {
      assertTempoWalletRevision(revision);
      if ((await wallet.getAddress())?.toLowerCase() !== address)
        throw new Error("Wallet changed during backup.");
    };
    return {
      address,
      check,
      signer: {
        address,
        signMessage: async (message: string) => {
          await check();
          const signature = await wallet.signMessage(message);
          await check();
          return signature;
        },
      },
    };
  };
}
export async function backupDeliverySets(
  wallet: WalletAdapter,
  sets: DeliverySet[],
  onPrepared: (code: string) => void = () => {},
) {
  const client = configuredProofClient();
  if (!client)
    throw new Error("Configure private storage to back up delivery sets.");
  const { address, check, signer } = await backupSigner(wallet)();
  const prepared = await prepareItem({
    plaintext: canonicalJson({
      version: 1,
      chainId: PICOMART_TEMPO_CONFIG.chainId,
      address,
      sets: parseDeliverySets(sets),
    }),
    expiresAt: new Date(Date.now() + 29 * 86400_000),
    signer,
    managers: [],
  });
  try {
    await check();
    localStorage.setItem(`${key}_backup_${address}`, prepared.item.seed);
    onPrepared(prepared.item.seed);
    await check();
    const result = await client.upload(prepared.item);
    await check();
    if ("state" in result)
      throw new Error(
        "Encrypted backup is still processing. Keep the backup code and retry restore shortly: " +
          prepared.item.seed,
      );
    localStorage.setItem(`${key}_backup_${address}`, prepared.item.seed);
    return prepared.item.seed;
  } finally {
    clearItemKeys(prepared.keys);
  }
}
export async function restoreDeliverySets(wallet: WalletAdapter, seed: string) {
  if (!/^[a-z2-7]{25}[aeimquy4]$/.test(seed))
    throw new Error("Enter a valid delivery backup code.");
  const client = configuredProofClient();
  if (!client)
    throw new Error("Configure private storage to restore delivery sets.");
  const { address, check, signer } = await backupSigner(wallet)();
  const keys = await signSeedAndDerive(seed, signer);
  try {
    await check();
    const item = await client.download(seed);
    await check();
    if (
      item.seed !== seed ||
      item.creator.publicKey !== encodeBase64(keys.signingPublicKey)
    )
      throw new Error("This backup belongs to another wallet.");
    const decoded = await decryptStorageItem(
        item,
        item.creator,
        keys.encryptionPrivateKey,
      ),
      backup = JSON.parse(decoded.plaintext);
    if (decoded.expired) throw new Error("This delivery backup has expired.");
    if (
      backup.version !== 1 ||
      backup.chainId !== PICOMART_TEMPO_CONFIG.chainId ||
      backup.address !== address
    )
      throw new Error("Unsupported delivery backup.");
    const sets = parseDeliverySets(backup.sets);
    await check();
    saveDeliverySets(sets);
    return sets;
  } finally {
    clearItemKeys(keys);
  }
}
