// OrderContext.tsx
import {createContext, useContext, useState, type ReactNode} from 'react'
import {type CartItem} from '@/lib/cartStorage'
import {type DeliveryInfo} from '@/components/DeliveryInfoForm'

export interface OrderState {
  cartItems: CartItem[]
  deliveryInfo: DeliveryInfo
  tokenTotals: Record<string, bigint>
}

interface OrderContextValue {
  order: OrderState | null
  setOrder: (order: OrderState) => void
  clearOrder: () => void
}

const OrderContext = createContext<OrderContextValue | undefined>(undefined)

// SessionStorage key for persisting order state
const ORDER_STORAGE_KEY = 'picomart_current_order'

// Helper functions for sessionStorage management
function saveOrderToStorage(order: OrderState): void {
  try {
    // Convert bigint to string for JSON serialization
    const serializedOrder = JSON.stringify(order, (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }
      return value
    })
    sessionStorage.setItem(ORDER_STORAGE_KEY, serializedOrder)
  } catch (error) {
    console.error('Error saving order to sessionStorage:', error)
  }
}

function loadOrderFromStorage(): OrderState | null {
  try {
    const storedOrder = sessionStorage.getItem(ORDER_STORAGE_KEY)
    if (!storedOrder) return null

    // Parse and convert price strings back to bigint
    const parsedOrder = JSON.parse(storedOrder, (key, value) => {
      // Convert price back to bigint when loading from sessionStorage
      if (key === 'price' && typeof value === 'string') {
        return BigInt(value)
      }
      // Convert tokenTotals values back to bigint
      if (key === 'tokenTotals' && typeof value === 'object' && value !== null) {
        const converted: Record<string, bigint> = {}
        for (const [tokenType, amount] of Object.entries(value)) {
          converted[tokenType] = BigInt(amount as string)
        }
        return converted
      }
      return value
    })

    return parsedOrder as OrderState
  } catch (error) {
    console.error('Error loading order from sessionStorage:', error)
    // Clear corrupted data
    sessionStorage.removeItem(ORDER_STORAGE_KEY)
    return null
  }
}

function clearOrderFromStorage(): void {
  try {
    sessionStorage.removeItem(ORDER_STORAGE_KEY)
  } catch (error) {
    console.error('Error clearing order from sessionStorage:', error)
  }
}

export function OrderProvider({children}: { children: ReactNode }) {
  // Restore before the first render so checkout routes can validate the saved order.
  const [order, setOrderState] = useState<OrderState | null>(loadOrderFromStorage)

  const setOrder = (newOrder: OrderState) => {
    setOrderState(newOrder)
    saveOrderToStorage(newOrder)
  }

  const clearOrder = () => {
    setOrderState(null)
    clearOrderFromStorage()
  }

  return (
    <OrderContext.Provider value={{order, setOrder, clearOrder}}>
      {children}
    </OrderContext.Provider>
  )
}

export function useOrder() {
  const ctx = useContext(OrderContext)
  if (!ctx) throw new Error('useOrder must be used within OrderProvider')
  return ctx
}
