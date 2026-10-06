import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
export const TEMPO_UI_DEPLOYMENT = PICOMART_TEMPO_CONFIG.deployment;
export const TEMPO_UI_ENABLED = import.meta.env.VITE_TEMPO_COMMERCE_ENABLED === 'true';
