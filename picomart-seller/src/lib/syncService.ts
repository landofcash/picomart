import {getCurrentConfig} from "@/config.ts";

export interface WalletInfo {
  wallet: string
  network: string
  productCount: number
}

export interface WalletsResponse {
  success: boolean
  data: WalletInfo[]
}

export interface CatalogData {
  version: number
  seed: string
  shopWallet: string
  catalogUrl: string
  sellerPubKey: string
}

export interface CatalogResponseData {
  shopWallet: string
  networkName: string
  catalogs: CatalogData[]
  meta: {
    revision: number
    created: number
    version: number
  }
  $loki: number
}

export interface CatalogsResponse {
  success: boolean
  data: CatalogResponseData
}

// Order-related interfaces
export interface Order {
  messages?: OrderMessageRef[]
  version: string
  catalogSeed: string
  status: string
  price: string
  priceToken: string
  seller: string
  buyer: string
  payer: string
  buyerPubKey: string
  sellerPubKey: string
  encryptedSymKeyBuyer: string
  encryptedSymKeySeller: string
  symKeyHash: string
  payloadHashBuyer: string
  payloadHashSeller: string
  createdDate: string
  updatedDate: string
  seed: string
  buyerWallet: string
  sellerWallet: string
  amount: string
}

export interface OrderMessageRef {
  topicId: string
  sequenceNumber: number
  consensusTimestamp: string
  sender: string
  role: number
  type: number
}

export interface BuyerOrderGroup {
  buyerWallet: string
  networkName: string
  orders: Order[]
  meta: {
    revision: number
    created: number
    version: number
    updated: number
  }
  $loki: number
}

export interface SellerOrdersResponse {
  success: boolean
  data: BuyerOrderGroup[]
}


/**
 * Fetches catalogs for a specific wallet address
 */
export async function fetchProductsForWallet(walletAddress: string): Promise<CatalogData[]> {
  try {
    const {apiUrl} = getCurrentConfig()
    const response = await fetch(`${apiUrl}/catalogs/${walletAddress}`)

    if (!response.ok) {
      if (response.status === 404) {
        // No products found for this wallet
        return []
      }
      throw new Error(`Failed to fetch products: ${response.status} ${response.statusText}`)
    }

    const data: CatalogsResponse = await response.json()

    if (!data.success) {
      throw new Error('API returned unsuccessful response')
    }

    return data.data.catalogs
  } catch (error) {
    console.error(`Error fetching products for wallet ${walletAddress}:`, error)
    throw new Error(`Failed to fetch products: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Fetches all catalogs from the connected wallet
 */
export async function fetchUserCatalogues(walletAddress: string): Promise<CatalogData[]> {
  try {
    return await fetchProductsForWallet(walletAddress)
  } catch (error) {
    console.error('Error fetching user catalogs:', error)
    throw new Error(`Failed to fetch catalogs: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Fetches orders for a specific seller wallet address
 */
export async function fetchSellerOrders(sellerWallet: string): Promise<Order[]> {
  try {
    const {apiUrl} = getCurrentConfig()
    const response = await fetch(`${apiUrl}/orders/seller/${sellerWallet}`)

    if (!response.ok) {
      if (response.status === 404) {
        // No orders found for this seller
        return []
      }
      throw new Error(`Failed to fetch orders: ${response.status} ${response.statusText}`)
    }

    const data: SellerOrdersResponse = await response.json()
    console.log(data)
    if (!data.success) {
      throw new Error('API returned unsuccessful response')
    }

    // Flatten all orders from all buyer groups into a single array
    const allOrders: Order[] = []
    for (const buyerGroup of data.data) {
      allOrders.push(...buyerGroup.orders)
    }

    return allOrders
  } catch (error) {
    console.error(`Error fetching orders for seller ${sellerWallet}:`, error)
    throw new Error(`Failed to fetch orders: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
