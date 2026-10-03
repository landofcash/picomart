import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useLocation, useParams, useSearchParams} from 'react-router-dom';
import {ArrowLeft, ExternalLink, Monitor, Smartphone, Sparkles, Loader2, RefreshCw, Send, Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import WalletAuth from '@/components/WalletAuth';
import DesignPanel from '@/components/storefront/DesignPanel';
import PublicationControls from '@/components/storefront/PublicationControls';
import {panelPreferences} from '@/lib/storefront/panelPreferences';
import {useStorefrontSession} from '@/lib/storefront/sessionContext';
import {activeJob, BuilderError, generationError, stageLabel} from '@/lib/storefront/client';
import {useMutation} from '@/lib/storefront/useMutation';
import type {GenerationJob, PreviewResponse, Revision, Shop, SubmitJob, PublicationStatus} from '@/lib/storefront/contracts';
import './storefront-workspace.css';

type Bundle = {shop: Shop; jobs: GenerationJob[]; revisions: Revision[]; publications: PublicationStatus};
type GenerationInput = {brief: string; baseRevisionId: string | null; expectedShopVersion?: number};
export default function StorefrontWorkspacePage() {
  const {shopId = ''} = useParams();
  return <Workspace key={shopId} shopId={shopId}/>;
}
function Workspace({shopId}: {shopId: string}) {
  const {client} = useStorefrontSession(), location = useLocation(), [params, setParams] = useSearchParams();
  const [bundle, setBundle] = useState<Bundle | null>(null), [error, setError] = useState<string | null>(null), [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(params.get('draft'));
  const [brief, setBrief] = useState<string>(() => typeof location.state?.initialBrief === 'string' ? location.state.initialBrief : '');
  const [size, setSize] = useState<'desktop' | 'mobile'>('desktop');
  const preferencesKey = `picomart-storefront-panel:${client.network}:${shopId}`;
  const [collapsed, setCollapsed] = useState(() => panelPreferences(preferencesKey).collapsed);
  const workspace = useRef<HTMLDivElement>(null), live = useRef(true);
  const [preview, setPreview] = useState<PreviewResponse | null>(null), [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false), [previewRefresh, setPreviewRefresh] = useState(0), [frameLoading, setFrameLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const generate = useMutation<GenerationInput>(), cancel = useMutation<string>();
  const previewRevisionId = bundle?.revisions.find(revision => revision.id === selected)?.id ?? null;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>, failures = 0;
    async function poll() {
      try {
        const [shop, jobs, revisions, publications] = await Promise.all([client.shop(shopId), client.jobs(shopId), client.revisions(shopId), client.publications(shopId)]);
        if (stopped) return;
        setBundle({shop, publications, jobs: jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), revisions: revisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))});
        setSelected(value => value && revisions.some(revision => revision.id === value) ? value : revisions.find(revision => revision.id === shop.selectedDraftId)?.id ?? revisions.at(-1)?.id ?? null);
        failures = 0; setError(null);
      } catch (failure) {
        if (!stopped) { failures++; setError(failure instanceof Error ? failure.message : 'Could not refresh this storefront.'); }
        if (failure instanceof BuilderError && [400, 403, 404].includes(failure.status)) return;
      }
      if (!stopped) timer = setTimeout(() => void poll(), document.hidden ? 30000 : Math.min(30000, 4000 * Math.max(1, failures)));
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [client, shopId, refresh]);
  useEffect(() => {
    if (!previewRevisionId) { setPreview(null); setPreviewError(null); setPreviewBusy(false); return; }
    let stopped = false; setPreviewBusy(true); setPreviewError(null); setPreview(null);
    void client.preview(shopId, previewRevisionId).then(result => {
      if (stopped) return;
      const url = new URL(result.url);
      if (url.origin === window.location.origin || url.origin === client.origin || result.revisionId !== previewRevisionId ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('The private preview address is not configured correctly.');
      setPreview(result); setFrameLoading(true);
    }).catch(failure => { if (!stopped) setPreviewError(failure instanceof Error ? failure.message : 'Could not open the preview.'); })
      .finally(() => { if (!stopped) setPreviewBusy(false); });
    return () => { stopped = true; };
  }, [client, previewRevisionId, shopId, previewRefresh]);
  function select(id: string) {
    setSelected(id); const next = new URLSearchParams(params); next.set('draft', id); setParams(next, {replace: true});
  }
  async function submit(input: GenerationInput) {
    const result = await generate.run(input, async (request, key) => {
      // Capture the version once; an interrupted response must replay the same payload.
      request.expectedShopVersion ??= (await client.shop(shopId)).recordVersion;
      return client.generate(shopId, request as SubmitJob, key);
    });
    if (!live.current) return;
    if (result) setBrief('');
    setRefresh(value => value + 1);
  }
  async function cancelJob(id: string) {
    await cancel.run(id, (jobId, key) => client.cancel(shopId, jobId, key));
    if (live.current) setRefresh(value => value + 1);
  }
  function onSubmit(event: FormEvent) { event.preventDefault(); void submit({brief: brief.trim(), baseRevisionId: selected}); }
  const revisions = bundle?.revisions ?? [], jobs = bundle?.jobs ?? [], pending = jobs.filter(activeJob), selectedRevision = revisions.find(revision => revision.id === selected);
  const draftName = (id: string | null) => { const index = revisions.findIndex(revision => revision.id === id); return index >= 0 ? `Draft ${index + 1}` : 'Starter template'; };
  const expired = !!preview && Date.parse(preview.expiresAt) <= now;
  const locked = generate.busy || generate.uncertain;
  return <div className="storefront-workspace">
    <header className="storefront-workspace-header">
      <Link to="/storefronts" className="storefront-back" aria-label="Back to Storefronts"><ArrowLeft size={18}/><span>Storefronts</span></Link>
      <div className="storefront-shop-title"><strong>{bundle?.shop.config.branding.name ?? (error ? 'Storefront unavailable' : 'Your storefront')}</strong><span>{bundle || error ? `${client.network} · Private workspace` : 'Loading…'}</span></div>
      <label className="sr-only" htmlFor="storefront-draft">Preview revision</label><select id="storefront-draft" className="storefront-revision-select" value={selected ?? ''} onChange={event => select(event.target.value)} disabled={!revisions.length || locked}>
        {!revisions.length && <option value="">No drafts yet</option>}{revisions.map((revision, index) => <option key={revision.id} value={revision.id}>Draft {index + 1}{revision.id === bundle?.shop.publishedRevisionId ? ' · Published' : ''}</option>)}
      </select>
      <div className="storefront-device-controls" aria-label="Preview size"><button aria-label="Desktop preview" aria-pressed={size === 'desktop'} onClick={() => setSize('desktop')}><Monitor size={17}/></button><button aria-label="Mobile preview" aria-pressed={size === 'mobile'} onClick={() => setSize('mobile')}><Smartphone size={17}/></button></div>
      <button className="storefront-icon-button" onClick={() => setPreviewRefresh(value => value + 1)} disabled={!previewRevisionId || previewBusy} aria-label="Refresh preview"><RefreshCw size={17}/></button>
      {preview && !expired ? <a className="storefront-open" href={preview.url} target="_blank" rel="noopener noreferrer" aria-label="Open preview in new tab"><ExternalLink size={17}/><span>Open</span></a> : <span className="storefront-open is-disabled"><ExternalLink size={17}/><span>Open</span></span>}
      <button className="storefront-design-toggle" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed} aria-label={collapsed ? 'Show Design panel' : 'Hide Design panel'}><Sparkles size={16}/><span>Design</span></button>
      <div className="storefront-wallet"><WalletAuth/></div>
    </header>
    {bundle && <PublicationControls shop={bundle.shop} revisions={bundle.revisions} selected={selected} status={bundle.publications} refresh={() => setRefresh(value => value + 1)}/>}
    {error && <div className="storefront-notice" role="alert">{error}<button onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
    {(expired || previewError) && <div className="storefront-notice" role="status">{expired ? 'This preview link has expired. Refresh it to keep browsing.' : previewError}<button onClick={() => setPreviewRefresh(value => value + 1)}>Refresh preview</button></div>}
    <div ref={workspace} className={`storefront-preview-workspace ${size === 'mobile' ? 'mobile-preview' : ''}`}>
      <div className="storefront-preview-canvas">
        {preview && preview.revisionId === selected ? <iframe key={selected} title={`${draftName(selected)} storefront preview`} src={preview.url} className="storefront-preview-frame" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" onLoad={() => setFrameLoading(false)}/> : <div className="storefront-preview-placeholder">
          {previewBusy ? <Loader2 size={32} className="animate-spin"/> : <Sparkles size={36}/>}<h1>{previewBusy ? 'Opening your draft…' : selected ? 'Your preview will appear here' : 'Make this space yours.'}</h1>
          <p>{selected ? 'Browse the actual storefront, then describe what you would like to change.' : 'Describe your shop in the Design panel. We’ll bring your catalog to life.'}</p>
        </div>}
      </div>
      {frameLoading && preview && <div className="storefront-preview-loading" role="status"><Loader2 size={14} className="animate-spin"/>Loading preview</div>}
      <DesignPanel workspace={workspace} storageKey={preferencesKey} active={pending.length > 0 || generate.busy} collapsed={collapsed} onCollapse={setCollapsed}>
        <div className="storefront-request-history">
          {!jobs.length && <div className="storefront-welcome"><p className="storefront-mini-label">Start with an idea</p><h2>What should your shop feel like?</h2><p>Describe the colors, layout and mood. Your catalog supplies the products.</p>
            {bundle && <p className="storefront-catalog-label">Catalog <span>{bundle.shop.catalogSeed}</span></p>}</div>}
          {jobs.map(job => <article key={job.id} className={`storefront-request ${activeJob(job) ? 'is-active' : ''}`}>
            <p className="storefront-mini-label">{draftName(job.baseRevisionId)} · {new Date(job.createdAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
            <p className="storefront-request-brief">{job.brief}</p>
            <div className="storefront-job-status" role={activeJob(job) ? 'status' : undefined}>{activeJob(job) ? <Loader2 size={14} className="animate-spin"/> : job.state === 'ready' ? <Check size={14}/> : null}<span>{stageLabel(job)}</span>{activeJob(job) && <span className="storefront-elapsed">{Math.max(0, Math.floor((now - Date.parse(job.createdAt)) / 60000))}m {Math.max(0, Math.floor((now - Date.parse(job.createdAt)) / 1000) % 60)}s</span>}</div>
            {job.state === 'ready' && job.revisionId && <button className="storefront-view-draft" onClick={() => select(job.revisionId!)} disabled={locked}>{draftName(job.revisionId)} ready — View</button>}
            {activeJob(job) && <button className="storefront-text-action" disabled={cancel.busy || cancel.uncertain} onClick={() => void cancelJob(job.id)}>Cancel</button>}
            {job.state === 'failed' && <p className="storefront-job-error">{generationError(job.errorCode)}</p>}
            {['failed', 'canceled'].includes(job.state) && <button className="storefront-text-action" disabled={locked} onClick={() => void submit({brief: job.brief, baseRevisionId: job.baseRevisionId})}>Retry generation</button>}
          </article>)}
        </div>
        <form onSubmit={onSubmit} className="storefront-prompt-form">
          <p className="storefront-mini-label">{selectedRevision ? `Based on ${draftName(selected)}` : 'New design from your catalog'}</p>
          <label htmlFor="storefront-prompt">{revisions.length ? 'What would you like to change?' : 'Describe your storefront'}</label>
          <Textarea id="storefront-prompt" value={brief} onChange={event => setBrief(event.target.value)} maxLength={12000} placeholder={revisions.length ? 'Make the header simpler and give product photos more space…' : 'A warm, minimal shop with cream backgrounds and generous product photos…'} disabled={locked} required={!generate.uncertain}/>
          {generate.error && <p className="storefront-job-error" role="alert">{generate.error}</p>}
          {cancel.error && <p className="storefront-job-error" role="alert">{cancel.error}{cancel.uncertain && <button type="button" className="storefront-text-action" onClick={() => void cancelJob('')} disabled={cancel.busy}>Retry cancellation</button>}</p>}
          <Button type="submit" className="w-full" disabled={!bundle || generate.busy || (!brief.trim() && !generate.uncertain)}>{generate.busy ? <Loader2 size={16} className="animate-spin"/> : <Send size={15}/>} {generate.uncertain ? 'Retry request' : selected ? 'Generate revision' : 'Generate storefront'}</Button>
        </form>
      </DesignPanel>
    </div>
  </div>;
}
