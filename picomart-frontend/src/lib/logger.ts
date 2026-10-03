import { APP_KEY_PREFIX } from '@/config';

export type LogEntry = {
  ts: number;
  message: string;
};

function keyFor(category: string): string {
  return `${APP_KEY_PREFIX}-log:${category}`;
}

export function log(category: string, message: string): void {
  try {
    const k = keyFor(category);
    const arr: LogEntry[] = JSON.parse(localStorage.getItem(k) || '[]');
    arr.push({ ts: Date.now(), message });
    // Cap to last 300 entries to avoid bloat
    while (arr.length > 300) arr.shift();
    localStorage.setItem(k, JSON.stringify(arr));
  } catch {
    // ignore storage failures
  }
}

export function getLogs(category: string): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(keyFor(category)) || '[]');
  } catch {
    return [];
  }
}

export function clearLogs(category: string): void {
  try {
    localStorage.removeItem(keyFor(category));
  } catch {
    // ignore
  }
}
