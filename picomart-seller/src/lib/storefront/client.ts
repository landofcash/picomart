import type {ChallengeResponse, CreateShop, GenerationJob, PreviewResponse, Revision, SessionResponse, Shop, SubmitJob, Publication, PublicationStatus, PublishRequest} from './contracts';

export class BuilderError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(errorMessage(code)); this.status = status; this.code = code; }
}
export function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    authentication_required: 'Sign in with your internal wallet to continue.', session_expired: 'Your storefront session expired. Sign in again.',
    invalid_session: 'Please sign in again.', account_key_changed: 'The wallet key changed. Sign in again.',
    unsupported_network: 'Storefronts are not enabled on this network yet.', origin_not_allowed: 'This seller address has not been enabled for the storefront builder.',
    catalog_not_owned: 'This catalog does not belong to the connected wallet.', shop_not_found: 'This storefront was not found for your wallet and network.',
    revision_not_found: 'That draft is no longer available.', record_version_conflict: 'The storefront changed in another request. Refresh and try again.',
    shop_job_limit: 'This shop has too many queued requests. Wait for a build to finish.', rate_limited: 'Too many requests. Wait a minute and try again.',
    coordinator_recovering: 'The builder is starting. Please try again shortly.', invalid_request: 'Check the catalog, shop details and design brief.',
    preview_limit: 'Too many previews are open. Wait a few minutes and try again.', network_error: 'Could not reach the storefront builder. Check your connection and try again.',
    publication_not_configured: 'Publishing is not configured for this builder yet.', publication_in_progress: 'A publication is already in progress. Wait for it to finish.',
    published_revision_conflict: 'The live shop changed. Review the current published draft before trying again.', revision_already_published: 'This draft is already published.',
    revision_not_previously_published: 'Choose a previously published draft to roll back.', revision_incomplete: 'This draft has incomplete website files. Generate another draft.',
    immutable_asset_conflict: 'This draft changes an asset that an older published shop still uses. Generate a revision with a new asset filename.',
    public_artifact_mismatch: 'The uploaded website could not be verified. Retry publication.', public_delivery_unavailable: 'The public website could not be reached. Check public delivery and retry.',
    public_route_mismatch: 'The live website did not match the selected draft. The previous publication is being restored.',
  };
  return messages[code] ?? 'The request could not be completed. Please try again.';
}
export const activeJob = (job: GenerationJob) => !['ready', 'failed', 'canceled'].includes(job.state);
export function stageLabel(job: GenerationJob) {
  const labels: Record<GenerationJob['state'], string> = {queued: 'Waiting to start', running: 'Creating design', provisioning: 'Waiting to start', generating: 'Creating design',
    building: 'Preparing pages', validating: 'Checking pages', uploading: 'Preparing preview', ready: 'Draft ready', failed: 'Generation failed', canceled: 'Canceled'};
  return labels[job.state];
}
export function generationError(code?: string | null) {
  if (code?.includes('timeout') || code?.includes('deadline')) return 'This build took too long. You can retry with the same request.';
  if (code?.includes('base_revision')) return 'This draft cannot be used with the current template. Start a fresh design or choose another draft.';
  return 'We could not finish this design. Your previous draft is still available. Try the request again or adjust your brief.';
}
export function builderOrigin() {
  const value = import.meta.env.VITE_STOREFRONT_BUILDER_ORIGIN || (import.meta.env.DEV ? 'http://127.0.0.1:4180' : '');
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return null;
    return value;
  } catch { return null; }
}
export class BuilderClient {
  readonly origin: string;
  readonly network: string;
  readonly token: string | null;
  #unauthorized: () => void;
  constructor(origin: string, network: string, token: string | null = null, unauthorized = () => {}) {
    this.origin = origin; this.network = network; this.token = token; this.#unauthorized = unauthorized;
  }
  async request<T>(path: string, method = 'GET', body?: unknown, requestId?: string, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.origin}/api/v1/${encodeURIComponent(this.network)}${path}`, {method, signal: signal ?? AbortSignal.timeout(30000), credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: {...(this.token ? {Authorization: `Bearer ${this.token}`} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {}), ...(requestId ? {'Idempotency-Key': requestId} : {})},
        body: body === undefined ? undefined : JSON.stringify(body)});
    } catch (error) { if (signal?.aborted) throw error; throw new BuilderError(0, 'network_error'); }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      if (response.status === 401 && this.token) this.#unauthorized();
      throw new BuilderError(response.ok ? 0 : response.status, result?.error ?? 'invalid_response');
    }
    return result.data as T;
  }
  challenge(accountId: string) { return this.request<ChallengeResponse>('/auth/challenge', 'POST', {accountId}); }
  verify(accountId: string, challengeId: string, signature: string) { return this.request<SessionResponse>('/auth/verify', 'POST', {accountId, challengeId, signature}); }
  logout() { return this.request('/auth/logout', 'POST', {}); }
  shops(signal?: AbortSignal) { return this.request<Shop[]>('/shops', 'GET', undefined, undefined, signal); }
  create(input: CreateShop, requestId: string) { return this.request<Shop>('/shops', 'POST', input, requestId); }
  shop(id: string) { return this.request<Shop>(`/shops/${id}`); }
  jobs(id: string) { return this.request<GenerationJob[]>(`/shops/${id}/jobs`); }
  revisions(id: string) { return this.request<Revision[]>(`/shops/${id}/revisions`); }
  generate(id: string, input: SubmitJob, requestId: string) { return this.request<GenerationJob>(`/shops/${id}/jobs`, 'POST', input, requestId); }
  cancel(id: string, jobId: string, requestId: string) { return this.request<GenerationJob>(`/shops/${id}/jobs/${jobId}/cancel`, 'POST', {}, requestId); }
  preview(id: string, revisionId: string) { return this.request<PreviewResponse>(`/shops/${id}/revisions/${revisionId}/preview`, 'POST', {}); }
  publications(id: string) { return this.request<PublicationStatus>(`/shops/${id}/publications`); }
  publish(id: string, input: PublishRequest, requestId: string) { return this.request<Publication>(`/shops/${id}/publications`, 'POST', input, requestId); }
  retryPublication(id: string, operationId: string, requestId: string) { return this.request<Publication>(`/shops/${id}/publications/${operationId}/retry`, 'POST', {}, requestId); }
}
