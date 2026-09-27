import dotenv from 'dotenv';
import { hederaConfigManager } from './hederaConfig';

// Load environment variables
dotenv.config();

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  environment: process.env.NODE_ENV || 'development',
  syncInterval: process.env.SYNC_INTERVAL ? parseInt(process.env.SYNC_INTERVAL, 10) * 1000 : 12 * 1000, // Convert seconds to milliseconds
  hedera: (network: string) => hederaConfigManager.getConfig(network),
  getAllConfigs: () => hederaConfigManager.getAllConfigs()
};
