import { useEffect, useState } from "react";
import { formatUnits } from "ethers";
import { getCurrency } from "@picomart/config";
import { Truck, Store, Package, Mail } from "lucide-react";
import {
  tempoFulfillmentSnapshot,
  type TempoDeliveryOptions,
  type TempoFulfillmentSnapshot,
} from "@picomart/order-protocol/tempo-protocol";
export default function FulfillmentSelector({
  catalogUrl,
  optionsUrl,
  options,
  value,
  onChange,
}: {
  catalogUrl: string;
  optionsUrl: string;
  options: TempoDeliveryOptions;
  value?: TempoFulfillmentSnapshot;
  onChange: (value?: TempoFulfillmentSnapshot) => void;
}) {
  const [methodId, setMethodId] = useState(value?.methodId ?? "");
  useEffect(()=>{if(value?.methodId)setMethodId(value.methodId);},[value?.methodId]);
  const method = options.methods.find((m) => m.id === methodId),
    currency = getCurrency(options.currency);
  const icons = {
    "customer-address": Truck,
    "shop-pickup": Store,
    "pickup-box": Package,
    digital: Mail,
  };
  return (
    <section className="space-y-4" aria-label="Delivery option">
      <h2 className="text-lg font-semibold">Delivery option</h2>
      <div
        role="radiogroup"
        aria-label="Delivery method"
        className="grid gap-3"
      >
        {options.methods.map((m) => {
          const Icon = icons[m.type];
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={methodId === m.id}
              onClick={() => {
                setMethodId(m.id);
                onChange(
                  m.type === "digital"
                    ? tempoFulfillmentSnapshot(
                        catalogUrl,
                        optionsUrl,
                        options,
                        m.id,
                      )
                    : undefined,
                );
              }}
              className={`rounded-lg border p-4 text-left ${methodId === m.id ? "border-primary bg-primary/5" : ""}`}
            >
              <div className="flex gap-3">
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {method && method.type !== "digital" && (
        <div
          role="radiogroup"
          aria-label={
            method.type === "customer-address"
              ? "Delivery service"
              : "Pickup location"
          }
          className="space-y-3"
        >
          <h3 className="font-medium">
            {method.type === "customer-address"
              ? "Delivery service"
              : "Pickup location"}
          </h3>
          {(method.type === "customer-address"
            ? method.services
            : method.locations
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={
                value?.methodId === method.id && value?.optionId === o.id
              }
              onClick={() =>
                onChange(
                  tempoFulfillmentSnapshot(
                    catalogUrl,
                    optionsUrl,
                    options,
                    method.id,
                    o.id,
                  ),
                )
              }
              className={`block w-full rounded-lg border p-4 text-left ${value?.methodId === method.id && value?.optionId === o.id ? "border-primary bg-primary/5" : ""}`}
            >
              <div className="flex justify-between gap-3">
                <span className="font-medium">{o.name}</span>
                <span className="shrink-0">
                  {o.amount === "0"
                    ? "Free"
                    : `${formatUnits(o.amount, currency.decimals)} ${currency.symbol}`}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{o.description}</p>
              {"address" in o && (
                <>
                  <p className="mt-1 text-sm">{String(o.address)}</p>
                  <p className="text-sm text-muted-foreground">
                    {"schedule" in o ? String(o.schedule) : ""}
                  </p>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
