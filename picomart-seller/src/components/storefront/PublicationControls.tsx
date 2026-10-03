import {useState} from 'react';
import {ExternalLink, Globe, Loader2} from 'lucide-react';
import {useStorefrontSession} from '@/lib/storefront/sessionContext';
import {useMutation} from '@/lib/storefront/useMutation';
import {errorMessage} from '@/lib/storefront/client';
import type {Publication, PublicationStatus, PublishRequest, Revision, Shop} from '@/lib/storefront/contracts';

type Action = {publish: PublishRequest} | {retry: string};
const active = (operation: Publication) => !['completed', 'failed'].includes(operation.state);
const labels: Record<Publication['state'], string> = {pending: 'Waiting to publish', uploading: 'Preparing public website', switching: 'Checking live shop', restoring: 'Restoring previous publication', completed: 'Publication complete', failed: 'Publication failed'};
export default function PublicationControls({shop, revisions, selected, status, refresh}: {
  shop: Shop; revisions: Revision[]; selected: string | null; status: PublicationStatus; refresh: () => void;
}) {
  const {client} = useStorefrontSession(), mutation = useMutation<Action>();
  const [confirmation, setConfirmation] = useState<PublishRequest | null>(null);
  const [accepted, setAccepted] = useState<Publication | null>(null);
  const operations = [...status.operations];
  if (accepted && !operations.some(item => item.id === accepted.id && item.recordVersion >= accepted.recordVersion)) {
    const index = operations.findIndex(item => item.id === accepted.id);
    if (index >= 0) operations[index] = accepted; else operations.push(accepted);
  }
  const pending = operations.find(active), latest = [...operations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const locked = !!pending || mutation.busy || mutation.uncertain;
  const draftName = (id: string | null) => { const index = revisions.findIndex(item => item.id === id); return index >= 0 ? `Draft ${index + 1}` : 'No published draft'; };
  const publishedBefore = operations.some(item => item.state === 'completed' && item.requestedRevisionId === selected);
  async function send(action: Action) {
    const result = await mutation.run(action, (input, key) => 'publish' in input ? client.publish(shop.id, input.publish, key) : client.retryPublication(shop.id, input.retry, key));
    if (result) { setAccepted(result); setConfirmation(null); }
    refresh();
  }
  const failed = !pending && latest?.state === 'failed' ? latest : null;
  return <div className="storefront-publication" aria-label="Publication controls">
    <div className="storefront-publication-row">
      <span className="storefront-publication-label"><Globe size={15}/>{shop.publishedRevisionId ? `${draftName(shop.publishedRevisionId)} published` : 'Your shop is private'}</span>
      {status.liveUrl && <a href={status.liveUrl} target="_blank" rel="noopener noreferrer" className="storefront-open">Open live shop<ExternalLink size={14}/></a>}
      <span className="storefront-publication-progress" role="status">{pending && <><Loader2 size={14} className="animate-spin"/>{labels[pending.state]}</>}</span>
      <button className="storefront-publish-button" disabled={!status.enabled || !selected || selected === shop.publishedRevisionId || locked || !!confirmation}
        onClick={() => setConfirmation({revisionId: selected!, expectedPublishedRevisionId: shop.publishedRevisionId, intent: publishedBefore ? 'rollback' : 'publish'})}>
        {selected === shop.publishedRevisionId && selected ? 'Published' : publishedBefore ? 'Roll back to this draft' : 'Publish draft'}
      </button>
    </div>
    {!status.enabled && <p>Publishing will be available when public hosting is configured.</p>}
    {confirmation && <div className="storefront-publication-confirm" role="group" aria-label="Confirm publication">
      <p>{confirmation.intent === 'rollback' ? 'Restore' : 'Publish'} <strong>{draftName(confirmation.revisionId)}</strong>? {confirmation.expectedPublishedRevisionId ? <>It will replace <strong>{draftName(confirmation.expectedPublishedRevisionId)}</strong> on your live shop.</> : 'This will make your shop publicly accessible.'}</p>
      <button className="storefront-publish-button" disabled={locked} onClick={() => void send({publish: confirmation})}>Confirm {confirmation.intent === 'rollback' ? 'rollback' : 'publish'}</button>
      <button className="storefront-text-action" disabled={mutation.busy || mutation.uncertain} onClick={() => setConfirmation(null)}>Cancel publication</button>
    </div>}
    {mutation.error && <p role="alert">{mutation.error} {mutation.uncertain && <button className="storefront-text-action" disabled={mutation.busy} onClick={() => void send({retry: ''})}>Retry request</button>}</p>}
    {failed && !confirmation && <p role="alert">{errorMessage(failed.errorCode ?? 'publication_failed')} {shop.publishedRevisionId === failed.previousRevisionId && <button className="storefront-text-action" disabled={locked} onClick={() => void send({retry: failed.id})}>Retry publication</button>}</p>}
  </div>;
}
