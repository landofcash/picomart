import type {DeliveryInfo} from "@/components/DeliveryInfoForm.tsx";
import type {OrderState} from "@/context/OrderContext";

export type OrderData = {
  deliveryInfo: DeliveryInfo;
  cartItems: {
    id: string;
    name: string;
    price: string;       // stringified bigint
    priceToken: string;  // coinType
    quantity: number;
  }[];
}

export function stateToOrderData(state: OrderState): OrderData {
  if (!state) {
    throw new Error("Invalid location state: null")
  }

  return {
    deliveryInfo: state.deliveryInfo,
    cartItems: state.cartItems.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price.toString(), // Convert bigint to string
      priceToken: item.priceToken,
      quantity: item.quantity
    }))
  }
}

