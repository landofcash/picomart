import {beforeEach, describe, expect, it, vi} from "vitest";
import {
  cacheUnlockedSecret,
  getCachedUnlockedSecret,
  lockAllWalletSessions,
  lockWalletSession,
} from "@/lib/internalWallet/store.ts";

describe("internal wallet session cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    lockAllWalletSessions();
  });

  it("returns cached secret material while the session is active", () => {
    cacheUnlockedSecret("wallet-1", {
      privateKeyHex: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      importedAs: "privateKey",
    });

    expect(getCachedUnlockedSecret("wallet-1")).toEqual({
      privateKeyHex: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      importedAs: "privateKey",
    });
  });

  it("expires cached secret material after the auto-lock timeout", () => {
    vi.useFakeTimers();
    cacheUnlockedSecret("wallet-2", {
      privateKeyHex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      importedAs: "privateKey",
    });

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    expect(getCachedUnlockedSecret("wallet-2")).toBeNull();
  });

  it("locks a wallet session explicitly", () => {
    cacheUnlockedSecret("wallet-3", {
      privateKeyHex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      importedAs: "privateKey",
    });

    lockWalletSession("wallet-3");

    expect(getCachedUnlockedSecret("wallet-3")).toBeNull();
  });
});
