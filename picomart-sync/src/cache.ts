import Loki from 'lokijs';
import {CatalogStore, CatalogCacheEntry, OrderStore, OrderCacheEntry, OrderMessageRef} from './types/types';
import { normalizeWalletId } from './walletIdentity';

interface ChainCursor {
  key: string;
  blockNumber: number;
  logIndex: number;
}

interface MessageCursor {
  key: string;
  sequenceNumber: number;
}

class AppDatabase {
  private db: Loki;
  private catalogs!: Collection<CatalogStore>;
  private orders!: Collection<OrderStore>;
  private chainCursors!: Collection<ChainCursor>;
  private messageCursors!: Collection<MessageCursor>;
  private initialized: boolean = false;

  constructor() {
    // Initialize Loki without file persistence
    this.db = new Loki('memory-db');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize the collections directly in memory
    this.catalogs = this.db.addCollection('catalogs', {
      unique: ['id'],
      indices: ['sellerWallet', 'networkName', 'id']
    });

    this.orders = this.db.addCollection('orders', {
      unique: ['id'],
      indices: ['buyerWallet', 'networkName', 'id']
    });

    this.chainCursors = this.db.addCollection('chainCursors', {
      unique: ['key'],
      indices: ['key']
    });

    this.messageCursors = this.db.addCollection('messageCursors', {
      unique: ['key'],
      indices: ['key']
    });

    this.initialized = true;
  }

  async getCatalogsByWallet(sellerWallet: string, networkName: string): Promise<CatalogStore | null> {
    await this.ensureInitialized();
    const key = `${normalizeWalletId(sellerWallet)}-${networkName}`;
    return this.catalogs.findOne({id: key}) || null;
  }

  async getOrdersByWallet(buyerWallet: string, networkName: string): Promise<OrderStore | null> {
    await this.ensureInitialized();
    const key = `${normalizeWalletId(buyerWallet)}-${networkName}`;
    return this.orders.findOne({id: key}) || null;
  }

  async upsertCatalogs(
    sellerWallet: string,
    networkName: string,
    newProducts: CatalogCacheEntry[],
    replace: boolean = false
  ): Promise<void> {
    await this.ensureInitialized();

    const key = `${normalizeWalletId(sellerWallet)}-${networkName}`;
    const existing = this.catalogs.findOne({id: key});
    if (existing) {
      if (replace) {
        // Replace the entire product list
        existing.catalogs = newProducts;
      } else {
        // Merge new catalogs with existing ones
        const updatedProducts = [...existing.catalogs];
        for (const newProduct of newProducts) {
          const index = updatedProducts.findIndex(p => p.seed === newProduct.seed);
          if (index >= 0) {
            updatedProducts[index] = newProduct;
          } else {
            updatedProducts.push(newProduct);
          }
        }
        existing.catalogs = updatedProducts;
      }
      existing.networkName = networkName;
      this.catalogs.update(existing);
    } else {
      this.catalogs.insert({
        id: key,
        sellerWallet,
        networkName,
        catalogs: newProducts
      });
    }
  }

  async upsertOrders(
    buyerWallet: string,
    networkName: string,
    newOrders: OrderCacheEntry[],
    replace: boolean = false
  ): Promise<void> {
    await this.ensureInitialized();

    const key = `${normalizeWalletId(buyerWallet)}-${networkName}`;
    const existing = this.orders.findOne({id: key});
    if (existing) {
      if (replace) {
        // Replace the entire orders list
        existing.orders = newOrders;
      } else {
        // Merge new orders with existing ones
        const updatedOrders = [...existing.orders];
        for (const newOrder of newOrders) {
          const index = updatedOrders.findIndex(o => o.seed === newOrder.seed);
          if (index >= 0) {
            updatedOrders[index] = {
              ...newOrder,
              messages: updatedOrders[index].messages ?? newOrder.messages,
            };
          } else {
            updatedOrders.push(newOrder);
          }
        }
        existing.orders = updatedOrders;
      }
      existing.networkName = networkName;
      this.orders.update(existing);
    } else {
      this.orders.insert({
        id: key,
        buyerWallet,
        networkName,
        orders: newOrders
      });
    }
  }

  async getAllCatalogs(networkName: string): Promise<CatalogStore[]> {
    await this.ensureInitialized();
    return this.catalogs.find({"networkName": networkName});
  }

  async getAllOrders(networkName: string): Promise<OrderStore[]> {
    await this.ensureInitialized();
    return this.orders.find({"networkName": networkName});
  }

  async getAllChainCursors(): Promise<ChainCursor[]> {
    await this.ensureInitialized();
    return this.chainCursors.find({});
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.catalogs.clear();
    this.orders.clear();
    this.chainCursors.clear();
    this.messageCursors.clear();
  }

  // Chain cursors (Hedera EVM logs) by key
  async getChainCursor(key: string): Promise<{ blockNumber: number; logIndex: number } | null> {
    await this.ensureInitialized();
    const row = this.chainCursors.findOne({ key });
    return row ? { blockNumber: row.blockNumber, logIndex: row.logIndex } : null;
  }

  async setChainCursor(key: string, cursor: { blockNumber: number; logIndex: number }): Promise<void> {
    await this.ensureInitialized();
    const existing = this.chainCursors.findOne({ key });
    if (existing) {
      existing.blockNumber = cursor.blockNumber;
      existing.logIndex = cursor.logIndex;
      this.chainCursors.update(existing);
    } else {
      this.chainCursors.insert({ key, blockNumber: cursor.blockNumber, logIndex: cursor.logIndex });
    }
  }

  async getMessageCursor(key: string): Promise<number | null> {
    await this.ensureInitialized();
    const row = this.messageCursors.findOne({ key });
    return row ? row.sequenceNumber : null;
  }

  async setMessageCursor(key: string, sequenceNumber: number): Promise<void> {
    await this.ensureInitialized();
    const existing = this.messageCursors.findOne({ key });
    if (existing) {
      existing.sequenceNumber = sequenceNumber;
      this.messageCursors.update(existing);
    } else {
      this.messageCursors.insert({ key, sequenceNumber });
    }
  }

  async findOrderBySeed(networkName: string, seed: string): Promise<OrderCacheEntry | null> {
    await this.ensureInitialized();
    const stores = this.orders.find({ networkName });
    for (const store of stores) {
      const match = store.orders.find(order => order.seed === seed);
      if (match) {
        return match;
      }
    }
    return null;
  }

  async findCatalogBySeed(networkName: string, seed: string): Promise<CatalogCacheEntry | null> {
    await this.ensureInitialized();
    const stores = this.catalogs.find({ networkName });
    for (const store of stores) {
      const match = store.catalogs.find(catalog => catalog.seed === seed);
      if (match) return match;
    }
    return null;
  }

  async appendOrderMessageRef(networkName: string, seed: string, ref: OrderMessageRef): Promise<void> {
    await this.ensureInitialized();
    const stores = this.orders.find({ networkName });
    for (const store of stores) {
      const order = store.orders.find(entry => entry.seed === seed);
      if (!order) {
        continue;
      }
      const exists = order.messages.some(message =>
        message.topicId === ref.topicId && message.sequenceNumber === ref.sequenceNumber,
      );
      if (!exists) {
        order.messages.push(ref);
        order.messages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.orders.update(store);
      }
      return;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export a singleton instance
export const appDb = new AppDatabase();
