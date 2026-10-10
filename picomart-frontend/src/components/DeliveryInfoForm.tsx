import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  tempoRecipientValid,
  type TempoFulfillmentSnapshot,
} from "@picomart/order-protocol/tempo-protocol";
export interface DeliveryInfo {
  fullName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  deliveryComments?: string;
  noPhysicalDelivery: boolean;
}
const emptyDelivery: DeliveryInfo = {
  fullName: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
  phone: "",
  email: "",
  deliveryComments: "",
  noPhysicalDelivery: false,
};
type SavedAddress = { id: string; label: string; delivery: DeliveryInfo };
const addressKey = "picomart_delivery_addresses_v1";
function addresses(): SavedAddress[] {
  try {
    const value = JSON.parse(localStorage.getItem(addressKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (v) =>
            v &&
            typeof v.id === "string" &&
            typeof v.label === "string" &&
            v.delivery &&
            Object.keys(emptyDelivery).every((k) =>
              k === "noPhysicalDelivery"
                ? typeof v.delivery[k] === "boolean"
                : typeof v.delivery[k] === "string",
            ) &&
            tempoRecipientValid("customer-address", v.delivery),
        )
      : [];
  } catch {
    return [];
  }
}
export function DeliveryInfoForm({
  deliveryInfo,
  onDeliveryInfoChange,
  method,
}: {
  deliveryInfo: DeliveryInfo;
  onDeliveryInfoChange: (info: DeliveryInfo) => void;
  method?: TempoFulfillmentSnapshot["type"];
}) {
  const kind =
    method ??
    (deliveryInfo.noPhysicalDelivery ? "digital" : "customer-address");
  const [saved, setSaved] = useState(addresses),
    [selected, setSelected] = useState(""),
    [save, setSave] = useState(false),
    [label, setLabel] = useState(""),
    [status, setStatus] = useState("");
  const fields: Array<[keyof DeliveryInfo, string, string?]> =
    kind === "digital"
      ? [["email", "Email", "email"]]
      : kind === "customer-address"
        ? [
            ["fullName", "Full name"],
            ["address", "Street address"],
            ["city", "City"],
            ["postalCode", "Postal code"],
            ["country", "Country"],
            ["phone", "Phone", "tel"],
            ["email", "Email", "email"],
          ]
        : [
            ["fullName", "Full name"],
            ["phone", "Phone", "tel"],
            ["email", "Email", "email"],
          ];
  const input = "w-full rounded-md border bg-background px-3 py-2";
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">
        {kind === "customer-address"
          ? "Recipient and address"
          : kind === "digital"
            ? "Digital delivery details"
            : "Pickup contact"}
      </h2>
      {kind === "customer-address" && saved.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm">
            Saved address
            <select
              className={input}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                const record = saved.find((s) => s.id === e.target.value);
                if (record) {
                  onDeliveryInfoChange({
                    ...record.delivery,
                    noPhysicalDelivery: false,
                  });
                  setLabel(record.label);
                }
              }}
            >
              <option value="">Enter a new address</option>
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next = saved.filter((s) => s.id !== selected);
                localStorage.setItem(addressKey, JSON.stringify(next));
                setSaved(next);
                setSelected("");
                setStatus("Saved address deleted.");
              }}
            >
              Delete saved address
            </Button>
          )}
        </div>
      )}
      {fields.map(([field, title, type]) => (
        <label className="block text-sm space-y-1" key={field} htmlFor={field}>
          <span>{title} *</span>
          <input
            className={input}
            id={field}
            type={type ?? "text"}
            required
            value={String(deliveryInfo[field] ?? "")}
            onChange={(e) =>
              onDeliveryInfoChange({
                ...deliveryInfo,
                [field]: e.target.value,
                noPhysicalDelivery: kind === "digital",
              })
            }
          />
        </label>
      ))}
      <label className="block text-sm space-y-1" htmlFor="deliveryComments">
        <span>
          {kind === "digital" ? "Additional comments" : "Delivery instructions"}{" "}
          (optional)
        </span>
        <textarea
          id="deliveryComments"
          className={input}
          rows={3}
          value={deliveryInfo.deliveryComments ?? ""}
          onChange={(e) =>
            onDeliveryInfoChange({
              ...deliveryInfo,
              deliveryComments: e.target.value,
            })
          }
        />
      </label>
      {kind === "customer-address" && (
        <div className="space-y-3">
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={save}
              onChange={(e) => setSave(e.target.checked)}
            />
            Save this address in this browser
          </label>
          {save && (
            <>
              <label className="block text-sm">
                Address name
                <input
                  className={input}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !label.trim() || !tempoRecipientValid(kind, deliveryInfo)
                }
                onClick={() => {
                  const record = {
                    id: selected || crypto.randomUUID(),
                    label: label.trim(),
                    delivery: { ...deliveryInfo, noPhysicalDelivery: false },
                  };
                  const next = [
                    record,
                    ...saved.filter((s) => s.id !== record.id),
                  ].slice(0, 50);
                  localStorage.setItem(addressKey, JSON.stringify(next));
                  setSaved(next);
                  setSelected(record.id);
                  setStatus("Address saved in this browser.");
                }}
              >
                Save address
              </Button>
            </>
          )}
        </div>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}
