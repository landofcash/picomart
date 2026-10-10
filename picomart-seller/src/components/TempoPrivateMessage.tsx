import { formatUnits } from "ethers";
import { getCurrency } from "@picomart/config";
import type { TempoMessagePayload } from "@picomart/order-protocol/tempo-protocol";
export default function TempoPrivateMessage({
  message,
}: {
  message: TempoMessagePayload;
}) {
  const data = message.data;
  if ("items" in data) {
    const currency = getCurrency(data.payment.tokenAddress),
      money = (value: string) =>
        `${formatUnits(value, currency.decimals)} ${currency.symbol}`,
      f = data.fulfillment;
    const fields =
      f.type === "digital"
        ? {
            Email: data.delivery.email,
            Comments: data.delivery.deliveryComments,
          }
        : f.type === "customer-address"
          ? {
              Name: data.delivery.fullName,
              Address: data.delivery.address,
              City: data.delivery.city,
              "Postal code": data.delivery.postalCode,
              Country: data.delivery.country,
              Phone: data.delivery.phone,
              Email: data.delivery.email,
              Comments: data.delivery.deliveryComments,
            }
          : {
              Name: data.delivery.fullName,
              Phone: data.delivery.phone,
              Email: data.delivery.email,
              Comments: data.delivery.deliveryComments,
            };
    return (
      <section className="space-y-5">
        <div className="space-y-3">
          <h3 className="font-semibold">Customer</h3>
          <dl className="space-y-2 text-sm">
            {Object.entries(fields)
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words">{value}</dd>
                </div>
              ))}
          </dl>
        </div>
        <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">Items</h3>
          {data.items.map((item) => (
            <div
              className="flex justify-between gap-4 text-sm"
              key={item.productId}
            >
              <span>
                {item.name} × {item.quantity}
              </span>
              <span className="shrink-0 font-semibold">
                {money(item.lineAmount)}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">Delivery</h3>
          <p>
            {f.name}
            {f.optionName ? ` · ${f.optionName}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {f.optionDescription || f.description}
          </p>
          {f.address && (
            <p className="text-sm whitespace-pre-wrap">{f.address}</p>
          )}
          {f.schedule && <p className="text-sm">{f.schedule}</p>}
        </div>
        <dl className="border-t pt-4 space-y-2 text-sm">
          {[
            [
              "Items subtotal",
              money(
                data.items
                  .reduce((sum, i) => sum + BigInt(i.lineAmount), 0n)
                  .toString(),
              ),
            ],
            [
              "Delivery fee",
              data.deliveryAmount === "0" ? "Free" : money(data.deliveryAmount),
            ],
            ["Order total", money(data.payment.amount)],
          ].map(([label, value]) => (
            <div className="flex justify-between gap-3" key={label}>
              <dt>{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">
        {message.binding.messageType === "seller-delivery"
          ? "Delivery update"
          : "Message from the shop"}
      </h3>
      {"shipmentCode" in data && data.shipmentCode && (
        <p>Tracking: {data.shipmentCode}</p>
      )}
      <p className="whitespace-pre-wrap break-words">{data.customInfo}</p>
    </section>
  );
}
