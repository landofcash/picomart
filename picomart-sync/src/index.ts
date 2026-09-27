import { startServer } from './server';
import { config } from './config';
import { initializeTempoSyncService } from './tempoSync';

async function main() {
  try {
    initializeTempoSyncService(config.syncInterval);
    const port = await startServer(config.port);
    const baseUrl = `http://localhost:${port}`;
    console.log(`🚀 Picomart Cache API running on port ${port}`);
    console.log(`🔗 System Health:  ${baseUrl}/`);
    console.log(`🔗 Wallets:        ${baseUrl}/api/v1/moderato/wallets/:wallet`);
    console.log(`🔗 Catalogs:       ${baseUrl}/api/v1/moderato/catalogs`);
    console.log(`🔗 Orders:         ${baseUrl}/api/v1/moderato/orders`);
    console.log(`🔗 CDN Upload:     ${baseUrl}/api/cdn/image`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
