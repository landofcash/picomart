import {z} from 'zod';
import {StorageError} from './storage/bunny.ts';
import {BuildFailure} from './worker/provider.ts';

// Only fixed application messages are safe for public operational logs. Parser
// and provider messages can contain credentials, URLs, or private journal bytes.
const messages = new Set([
  'A Railway volume must be mounted at /coordinator before starting this coordinator',
  'Configure separate public Bunny storage and its CDN URL',
  'API, preview and public listeners need separate ports',
  'Configure private Bunny zone credentials',
  'RAILWAY_API_TOKEN is required',
  'RAILWAY_SANDBOX_ENVIRONMENT_ID must be a configured Railway environment UUID',
  'This storage prefix requires exactly one coordinator',
  'Expected HTTPS origin or local HTTP origin',
  'Invalid builder storage prefix',
  'Preview origin must be dedicated to generated websites',
  'Public origin must be dedicated to published websites',
  'Invalid journal prefix', 'Journal operation limit exceeded', 'Unexpected journal entry',
  'Conflicting coordinator sequence', 'Committed operation integrity failure', 'Broken journal history',
  'Invalid record version', 'Invalid record history', 'Duplicate committed request',
  'Private object exceeds size limit', 'Sandbox inventory unavailable',
  'Invalid sandbox pagination', 'Sandbox inventory limit exceeded', 'Cannot identify sandbox',
  'Attempt not found', 'Job not found', 'Coordinator already started',
  'Candidate integrity', 'Candidate scope', 'Storage recovery required',
]);
const systemCodes = new Set(['EACCES', 'EPERM', 'ENOENT', 'EADDRINUSE', 'EADDRNOTAVAIL', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);

export function startupDiagnostic(stage: string, error: unknown) {
  const detail: Record<string, unknown> = {event: 'builder_startup_failed', stage};
  if (error instanceof z.ZodError) {
    detail.type = 'validation';
    // Do not emit issue messages, received values, unrecognized keys, or paths:
    // journal record keys and JSON parse failures may include merchant data.
    detail.issueCodes = error.issues.slice(0, 10).map(issue => issue.code);
    detail.issueCount = error.issues.length;
  } else if (error instanceof StorageError) {
    detail.type = 'storage'; detail.status = error.status;
  } else if (error instanceof BuildFailure) {
    detail.type = 'build';
    if (/^[a-z_]{1,80}$/.test(error.code)) detail.code = error.code;
  } else if (error instanceof Error) {
    detail.type = error instanceof SyntaxError ? 'invalid_json_or_syntax' : 'error';
    if (messages.has(error.message)) detail.message = error.message;
    for (const candidate of [error, error.cause]) {
      if (candidate && typeof candidate === 'object' && 'code' in candidate && typeof candidate.code === 'string' && systemCodes.has(candidate.code)) detail.code = candidate.code;
    }
    if (error.name === 'TimeoutError' || error.name === 'AbortError') detail.type = error.name;
  } else detail.type = 'unknown';
  return JSON.stringify(detail);
}
