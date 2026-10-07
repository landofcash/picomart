import { useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PICOMART_TEMPO_CONFIG } from "@picomart/config";
import TokenIcon from "@/components/TokenIcon";
import { Button } from "@/components/ui/button";

// Render inside the native dialog: a document-body portal would be inert.
export default function WalletTokenSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: `0x${string}`) => void;
}) {
  const tokens = PICOMART_TEMPO_CONFIG.tokens;
  const selected = tokens.find(
    (t) => t.tokenId.toLowerCase() === value.toLowerCase(),
  )!;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const choose = (index: number) => {
    onChange(tokens[index].tokenId);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="space-y-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <span id={id + "-label"} className="text-sm font-medium">
        {label}
      </span>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        role="combobox"
        aria-label={label}
        aria-describedby={id + "-value"}
        aria-controls={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? id + "-" + active : undefined}
        className="h-14 w-full justify-start gap-3 border-slate-300 bg-background px-3 dark:border-slate-600"
        onClick={() => {
          setActive(tokens.indexOf(selected));
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((index) =>
              open
                ? (index + (e.key === "ArrowDown" ? 1 : -1) + tokens.length) %
                  tokens.length
                : tokens.indexOf(selected),
            );
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            choose(active);
          }
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
          if (e.key === "Tab") setOpen(false);
        }}
      >
        <TokenIcon assetId={value} size={28} />
        <span id={id + "-value"} className="font-semibold">
          {selected.symbol}
        </span>
        <ChevronDown className="ml-auto text-muted-foreground" />
      </Button>
      {open && (
        <div
          id={id}
          role="listbox"
          aria-labelledby={id + "-label"}
          className="overflow-hidden rounded-lg bg-muted/50 p-1"
        >
          {tokens.map((t, index) => (
            <button
              key={t.tokenId}
              id={id + "-" + index}
              role="option"
              type="button"
              aria-label={t.symbol}
              aria-selected={t.tokenId === value}
              tabIndex={-1}
              className={`flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-background ${active === index ? "bg-background" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <TokenIcon assetId={t.tokenId} size={24} />
              <span className="flex-1 font-medium">{t.symbol}</span>
              {t.tokenId === value && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
