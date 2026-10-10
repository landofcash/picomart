import { useState } from "react";
import { Link } from "react-router-dom";
import { formatUnits } from "ethers";
import { getCurrency, PICOMART_TEMPO_CONFIG } from "@picomart/config";
import type { TempoDeliveryMethod } from "@picomart/order-protocol/tempo-protocol";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
import { currencyAmount } from "@/lib/catalogStorage";
import {
  loadDeliverySets,
  saveDeliverySets,
  newDeliverySet,
  publishedDeliverySet,
  backupDeliverySets,
  restoreDeliverySets,
  type DeliverySet,
} from "@/lib/deliverySets";

const input = "w-full rounded-md border bg-background px-3 py-2";
export default function DeliveryOptionsPage() {
  const wallet = useWallet();
  const [sets, setSets] = useState<DeliverySet[]>(() => loadDeliverySets());
  const [selected, setSelected] = useState(""),
    [filter, setFilter] = useState<string>(
      PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId,
    );
  const [saved, setSaved] = useState(() => JSON.stringify(sets)),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [backupCode, setBackupCode] = useState("");
  const active = sets.find((s) => s.id === selected),
    currency = getCurrency(active?.options.currency ?? filter);
  function change(fn: (set: DeliverySet) => DeliverySet) {
    setSets((current) => current.map((s) => (s.id === selected ? fn(s) : s)));
  }
  function methodChange(
    id: string,
    fn: (method: TempoDeliveryMethod) => TempoDeliveryMethod,
  ) {
    change((s) => ({
      ...s,
      options: {
        ...s.options,
        methods: s.options.methods.map((m) => (m.id === id ? fn(m) : m)),
      },
    }));
  }
  function add(template: "physical" | "digital" | "pickup") {
    const next = newDeliverySet(filter, template);
    setSets((s) => [...s, next]);
    setSelected(next.id);
  }
  async function run(work: () => Promise<void>) {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const dirty = JSON.stringify(sets) !== saved;
  return (
    <div className="seller-page space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">Delivery sets</h1>
        <Link className="underline" to="/edit-product-catalogue">
          Create catalogue
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Save reusable delivery options, then choose a matching set when creating
        a catalogue. Published catalogues keep their saved terms.
      </p>
      <label className="block space-y-1">
        Currency
        <select
          className={input}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelected("");
          }}
        >
          {PICOMART_TEMPO_CONFIG.paymentTokens.map((t) => (
            <option key={t.tokenId} value={t.tokenId}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        {(["physical", "digital", "pickup"] as const).map((t) => (
          <Button
            key={t}
            variant="outline"
            disabled={busy}
            onClick={() => add(t)}
          >
            New {t} set
          </Button>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="space-y-2">
          {sets
            .filter((s) => s.options.currency === filter)
            .map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`block w-full rounded-lg border p-3 text-left ${selected === s.id ? "border-primary bg-primary/5" : ""}`}
              >
                {s.name}
              </button>
            ))}
          {!sets.some((s) => s.options.currency === filter) && (
            <p>No sets for this currency yet.</p>
          )}
        </aside>
        {active && (
          <div className="space-y-5">
            <label className="block">
              Set name
              <input
                className={input}
                value={active.name}
                onChange={(e) =>
                  change((s) => ({ ...s, name: e.target.value }))
                }
              />
            </label>
            <label className="block">
              Description
              <textarea
                className={input}
                value={active.description}
                onChange={(e) =>
                  change((s) => ({ ...s, description: e.target.value }))
                }
              />
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const next = {
                    ...structuredClone(active),
                    id: crypto.randomUUID(),
                    name: active.name + " copy",
                  };
                  setSets((s) => [...s, next]);
                  setSelected(next.id);
                }}
              >
                Duplicate
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSets((s) => s.filter((v) => v.id !== selected));
                  setSelected("");
                }}
              >
                Delete set
              </Button>
            </div>
            {active.options.methods.map((m) => (
              <section key={m.id} className="space-y-3 border-t pt-4">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={!active.disabledTypes.includes(m.type)}
                    onChange={(e) =>
                      change((s) => ({
                        ...s,
                        disabledTypes: e.target.checked
                          ? s.disabledTypes.filter((t) => t !== m.type)
                          : [...s.disabledTypes, m.type],
                      }))
                    }
                  />
                  {m.type === "customer-address"
                    ? "Address delivery"
                    : m.type === "shop-pickup"
                      ? "Shop pickup"
                      : m.type === "pickup-box"
                        ? "Pickup box"
                        : "Digital delivery"}
                </label>
                {!active.disabledTypes.includes(m.type) && (
                  <>
                    <label className="block">
                      Buyer-facing name
                      <input
                        className={input}
                        value={m.name}
                        onChange={(e) =>
                          methodChange(m.id, (v) => ({
                            ...v,
                            name: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      Description
                      <input
                        className={input}
                        value={m.description}
                        onChange={(e) =>
                          methodChange(m.id, (v) => ({
                            ...v,
                            description: e.target.value,
                          }))
                        }
                      />
                    </label>
                    {m.type !== "digital" && (
                      <>
                        {(m.type === "customer-address"
                          ? m.services
                          : m.locations
                        ).map((o) => (
                          <div
                            className="rounded-lg border p-4 space-y-3"
                            key={o.id}
                          >
                            {(
                              [
                                "name",
                                "description",
                                ...("address" in o
                                  ? ["address", "schedule"]
                                  : []),
                              ] as const
                            ).map((field) => (
                              <label className="block capitalize" key={field}>
                                {field}
                                <input
                                  className={input}
                                  value={String(
                                    (o as unknown as Record<string, unknown>)[
                                      field
                                    ] ?? "",
                                  )}
                                  onChange={(e) =>
                                    methodChange(m.id, (v) =>
                                      v.type === "digital"
                                        ? v
                                        : v.type === "customer-address"
                                          ? {
                                              ...v,
                                              services: v.services.map((x) =>
                                                x.id === o.id
                                                  ? {
                                                      ...x,
                                                      [field]: e.target.value,
                                                    }
                                                  : x,
                                              ),
                                            }
                                          : {
                                              ...v,
                                              locations: v.locations.map((x) =>
                                                x.id === o.id
                                                  ? {
                                                      ...x,
                                                      [field]: e.target.value,
                                                    }
                                                  : x,
                                              ),
                                            },
                                    )
                                  }
                                />
                              </label>
                            ))}
                            <label className="block">
                              Fee ({currency.symbol})
                              <input
                                className={input}
                                defaultValue={formatUnits(
                                  o.amount,
                                  currency.decimals,
                                )}
                                key={`${o.id}-${currency.tokenId}`}
                                inputMode="decimal"
                                onBlur={(e) => {
                                  try {
                                    const amount = currencyAmount(
                                      e.target.value,
                                      currency.tokenId,
                                      true,
                                    );
                                    methodChange(m.id, (v) =>
                                      v.type === "digital"
                                        ? v
                                        : v.type === "customer-address"
                                          ? {
                                              ...v,
                                              services: v.services.map((x) =>
                                                x.id === o.id
                                                  ? { ...x, amount }
                                                  : x,
                                              ),
                                            }
                                          : {
                                              ...v,
                                              locations: v.locations.map((x) =>
                                                x.id === o.id
                                                  ? { ...x, amount }
                                                  : x,
                                              ),
                                            },
                                    );
                                    setError("");
                                  } catch (err) {
                                    setError((err as Error).message);
                                    e.target.value = formatUnits(
                                      o.amount,
                                      currency.decimals,
                                    );
                                  }
                                }}
                              />
                            </label>
                            <Button
                              variant="outline"
                              onClick={() =>
                                methodChange(m.id, (v) =>
                                  v.type === "digital"
                                    ? v
                                    : v.type === "customer-address"
                                      ? {
                                          ...v,
                                          services: v.services.filter(
                                            (x) => x.id !== o.id,
                                          ),
                                        }
                                      : {
                                          ...v,
                                          locations: v.locations.filter(
                                            (x) => x.id !== o.id,
                                          ),
                                        },
                                )
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          onClick={() =>
                            methodChange(m.id, (v) => {
                              const next = {
                                id: crypto.randomUUID(),
                                name: "New option",
                                description: "",
                                amount: "0",
                              };
                              return v.type === "digital"
                                ? v
                                : v.type === "customer-address"
                                  ? { ...v, services: [...v.services, next] }
                                  : {
                                      ...v,
                                      locations: [
                                        ...v.locations,
                                        { ...next, address: "", schedule: "" },
                                      ],
                                    };
                            })
                          }
                        >
                          Add{" "}
                          {m.type === "customer-address"
                            ? "service"
                            : "location"}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </section>
            ))}
            <section className="border-t pt-4 space-y-3">
              <h2 className="font-semibold">Buyer preview</h2>
              {active.options.methods
                .filter((m) => !active.disabledTypes.includes(m.type))
                .map((m) => (
                  <div key={m.id} className="rounded-lg border p-4">
                    <strong>{m.name}</strong>
                    <p className="text-sm text-muted-foreground">
                      {m.description}
                    </p>
                    {m.type !== "digital" &&
                      (m.type === "customer-address"
                        ? m.services
                        : m.locations
                      ).map((o) => (
                        <div className="mt-2" key={o.id}>
                          <div className="flex justify-between gap-3">
                            <span>{o.name}</span>
                            <span>
                              {o.amount === "0"
                                ? "Free"
                                : `${formatUnits(o.amount, currency.decimals)} ${currency.symbol}`}
                            </span>
                          </div>
                          {"address" in o && (
                            <p className="text-sm">
                              {String(o.address)} ·{" "}
                              {"schedule" in o ? String(o.schedule) : ""}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                ))}
            </section>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !dirty}
          onClick={() =>
            void run(async () => {
              sets.forEach(publishedDeliverySet);
              saveDeliverySets(sets);
              setSaved(JSON.stringify(sets));
              setStatus("Delivery sets saved locally.");
            })
          }
        >
          {dirty ? "Save changes" : "Saved locally"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || dirty || !wallet.walletAdapter || !sets.length}
          onClick={() =>
            void run(async () => {
              const code = await backupDeliverySets(
                wallet.walletAdapter!,
                sets,
                setBackupCode,
              );
              setBackupCode(code);
              setStatus(
                "Encrypted backup saved for 29 days. Keep its code to restore with the same wallet.",
              );
            })
          }
        >
          Back up saved sets
        </Button>
      </div>
      <section className="border-t pt-4 space-y-3">
        <label className="block">
          Backup code
          <input
            className={input}
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value.trim())}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          Restoring replaces local sets. Use the wallet that created the backup.
        </p>
        <Button
          variant="outline"
          disabled={busy || !backupCode || !wallet.walletAdapter}
          onClick={() =>
            void run(async () => {
              if (
                dirty &&
                !window.confirm("Replace your unsaved delivery sets?")
              )
                return;
              const next = await restoreDeliverySets(
                wallet.walletAdapter!,
                backupCode,
              );
              setSets(next);
              setSaved(JSON.stringify(next));
              setSelected("");
              setStatus("Delivery sets restored and saved locally.");
            })
          }
        >
          Restore backup
        </Button>
      </section>
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
