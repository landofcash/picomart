import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {ArrowUpRight, Store, Plus, RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {catalogs as loadSellerCatalogs,type MarketCatalog} from '@/lib/tempoMarket';
import {useWallet} from '@/context/WalletContext';
import {useStorefrontSession} from '@/lib/storefront/sessionContext';
import {useMutation} from '@/lib/storefront/useMutation';
import type {CreateShop, Shop} from '@/lib/storefront/contracts';


export default function StorefrontsPage() {
  const {client, signOut} = useStorefrontSession(), {walletAddress, network} = useWallet();
  const [params] = useSearchParams(), navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]), [catalogs, setCatalogs] = useState<MarketCatalog[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(!!params.get('catalog')), [seed, setSeed] = useState(params.get('catalog') ?? '');
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [brief, setBrief] = useState('');
  const mutation = useMutation<CreateShop>(), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void Promise.all([client.shops(controller.signal), loadSellerCatalogs(walletAddress!.toLowerCase(),controller.signal)]).then(([nextShops, nextCatalogs]) => {
      if (controller.signal.aborted) return;
      setShops(nextShops.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); setCatalogs(nextCatalogs);
      setSeed(current => current || nextCatalogs[0]?.seed || '');
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load storefronts.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client, network, walletAddress, reload]);
  async function create(event: FormEvent) {
    event.preventDefault();
    const shop = await mutation.run({catalogSeed: seed, design: {branding: {name: name.trim(), description: description.trim(), headline: name.trim()}, collections: [], featuredProductIds: [], links: []}}, (input, key) => client.create(input, key));
    if (shop && live.current) navigate(`/storefronts/${shop.id}`, {state: {initialBrief: brief}});
  }
  const locked = mutation.busy || mutation.uncertain;
  return <div className="mx-auto max-w-7xl px-6 py-10">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">Your brand, brought to life</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Storefronts</h1>
      <p className="mt-2 text-muted-foreground">Turn your Picomart catalog into a shop that feels like yours.</p></div><div className="flex gap-2">
      <Button variant="ghost" onClick={signOut}>Sign out</Button><Button variant="outline" onClick={() => setReload(value => value + 1)} disabled={loading} aria-label="Refresh storefronts"><RefreshCw size={16}/></Button>
      <Button onClick={() => setCreating(true)}><Plus size={16}/>Create storefront</Button></div></div>
    {error && <p role="alert" className="mb-6 rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    {creating && <form onSubmit={event => void create(event)} className="mb-8 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">Create your storefront</h2><Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={locked}>Close</Button></div>
      <div className="grid gap-5 md:grid-cols-2"><div className="space-y-4">
        <label className="block text-sm font-medium">Catalog<select className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={seed} onChange={event => setSeed(event.target.value)} required disabled={locked || loading}>
          <option value="">Select a catalog</option>{catalogs.map(catalog => <option key={catalog.seed} value={catalog.seed}>{catalog.seed}</option>)}
        </select></label>
        {!loading && !catalogs.length && <p className="text-sm text-muted-foreground">Create and register a catalog first. <Link className="text-primary underline" to="/edit-product-catalogue">Create catalog</Link></p>}
        <label className="block text-sm font-medium">Shop name<Input className="mt-2" value={name} onChange={event => setName(event.target.value)} placeholder="My Pantry" maxLength={100} required disabled={locked}/></label>
        <label className="block text-sm font-medium">Short description<Input className="mt-2" value={description} onChange={event => setDescription(event.target.value)} placeholder="Good ingredients for everyday cooking" maxLength={500} required disabled={locked}/></label>
      </div><label className="block text-sm font-medium">Design brief <span className="font-normal text-muted-foreground">(optional for now)</span><Textarea className="mt-2 min-h-44" value={brief} onChange={event => setBrief(event.target.value)} maxLength={12000} placeholder="Warm colors, generous product photos and a simple, welcoming layout…" disabled={locked}/><span className="mt-2 block text-xs font-normal text-muted-foreground">You can refine the brief in your workspace before generating.</span></label></div>
      {mutation.error && <p className="mt-4 text-sm text-destructive" role="alert">{mutation.error}</p>}
      <Button className="mt-5" disabled={mutation.busy || loading || !catalogs.some(catalog => catalog.seed === seed)}>{mutation.busy ? 'Creating…' : mutation.uncertain ? 'Retry request' : 'Create and open workspace'}<ArrowUpRight size={16}/></Button>
    </form>}
    {loading ? <p role="status" className="py-14 text-center text-muted-foreground">Loading your storefronts…</p> : shops.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{shops.map(shop => <Link key={shop.id} to={`/storefronts/${shop.id}`} className="group rounded-2xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div className="mb-8 flex items-center justify-between"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Store size={24}/></div><ArrowUpRight className="text-muted-foreground group-hover:text-primary" size={20}/></div>
      <h2 className="text-xl font-semibold">{shop.config.branding.name}</h2><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{shop.config.branding.description}</p>
      <div className="mt-6 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{shop.publishedRevisionId ? 'Published' : shop.selectedDraftId ? 'Draft ready' : 'Ready to design'}</span><span>{new Date(shop.updatedAt).toLocaleDateString()}</span></div>
    </Link>)}</div> : !error && <div className="rounded-2xl border border-dashed px-6 py-16 text-center"><Store className="mx-auto mb-4 text-primary" size={32}/><h2 className="text-xl font-semibold">A new home for your products</h2><p className="mx-auto mt-2 max-w-md text-muted-foreground">Choose a catalog and describe the look you have in mind. Your first draft starts here.</p><Button className="mt-6" onClick={() => setCreating(true)}>Create storefront</Button></div>}
  </div>;
}
