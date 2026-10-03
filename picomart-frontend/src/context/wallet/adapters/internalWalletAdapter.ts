import {getCurrentConfig} from "@/config";
import type {WalletAdapter} from "@/context/wallet/types";
import {hederaInternalWalletProvider} from "@/lib/internalWallet/providers/hederaInternalWalletProvider.ts";

export const internalWalletAdapter: WalletAdapter = {
  chain: "hedera",
  id: "internal",
  name: "Built-in (Internal)",
  isInstalled() {
    return true;
  },
  async getAddress() {
    return await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).getAddress();
  },
  async getNetwork() {
    return getCurrentConfig().name;
  },
  async getPublicKey() {
    return await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).getPublicKey?.() ?? null;
  },
  async connect(options) {
    return await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).connect(options);
  },
  async disconnect() {
    await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).disconnect();
  },
  onAccountChange() {
    return () => undefined;
  },
  onNetworkChange() {
    return () => undefined;
  },
  async signMessage(dataToSign: string, message?: string) {
    return await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).signMessage(dataToSign, message);
  },
  async executeContract(payload) {
    return await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).executeContract(payload);
  },
  async executeBatch(payloads) {
    return await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).executeBatch(payloads);
  },
  async signAndSubmit(transaction: object) {
    return await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).signAndSubmit!(transaction);
  },
  async readFileContents(fileId: string) {
    return await hederaInternalWalletProvider.getWalletAdapter(getCurrentConfig().name).readFileContents!(fileId);
  },
};
