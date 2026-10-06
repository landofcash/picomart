import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import {
  accountCurrencies,
  formatAccountBalance,
} from "@/lib/internalWallet/currencies";
import type { InternalWalletBalance } from "@/lib/internalWallet/types";
import { Button } from "../ui/button";

export default function AccountCurrencyPicker({
  network,
  value,
  balances,
  disabled,
  onChange,
}: {
  network: string;
  value: string;
  balances: InternalWalletBalance[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    currencies = accountCurrencies(network),
    selected = currencies.find((item) => item.tokenId === value);
  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          aria-label={`Currency: ${selected?.symbol ?? "Select"}`}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="h-11 max-w-full gap-2 rounded-full border bg-background px-3 hover:bg-muted"
        >
          {selected && (
            <img
              src={selected.img}
              alt=""
              className="h-6 w-6 shrink-0 rounded-full"
            />
          )}
          <span className="font-semibold">
            {selected?.symbol ?? "Select currency"}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </Popover.Trigger>
      {/* Keep the menu inside the native dialog's top layer. */}
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        aria-label="Choose currency"
        className="z-50 w-72 max-w-[calc(100vw-5rem)] rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg outline-none"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              ),
              current = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (current +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }
        }}
      >
        <div className="flex justify-between px-2 py-2 text-xs text-muted-foreground">
          <span>Currency</span>
          <span>Available</span>
        </div>
        <div role="group" aria-label="Currencies" className="space-y-1">
          {currencies.map((currency) => {
            const balance = balances.find(
              (item) =>
                item.tokenId.toLowerCase() === currency.tokenId.toLowerCase(),
            );
            return (
              <button
                key={currency.tokenId}
                type="button"
                aria-label={currency.symbol}
                aria-pressed={value === currency.tokenId}
                onClick={() => {
                  onChange(currency.tokenId);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-3 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
              >
                <img
                  src={currency.img}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full"
                />
                <span className="font-medium">{currency.symbol}</span>
                <span
                  className="ml-auto min-w-0 break-all text-right text-xs tabular-nums text-muted-foreground"
                  title={balance?.formatted}
                >
                  {balance
                    ? formatAccountBalance(balance.raw, balance.decimals)
                    : "—"}
                </span>
                <Check
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-primary ${value === currency.tokenId ? "" : "invisible"}`}
                />
              </button>
            );
          })}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
