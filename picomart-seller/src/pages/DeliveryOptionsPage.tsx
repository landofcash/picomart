import {useEffect, useRef, useState, type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {formatUnits} from 'ethers';
import {getCurrency, PICOMART_TEMPO_CONFIG} from '@picomart/config';
import type {TempoDeliveryMethod, TempoDeliveryService, TempoPickupLocation} from '@picomart/order-protocol/tempo-protocol';
import {AlertCircle, ArrowLeft, ChevronDown, Copy, Eye, Mail, Package, Plus, Save, Store, Trash2, Truck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import AccountDialog from '@/components/wallet/AccountDialog';
import TokenIcon from '@/components/TokenIcon';
import {currencyLabel} from '@/lib/currencyLabel';
import {currencyAmount} from '@/lib/catalogStorage';
import {deliverySetErrors} from '@/lib/deliverySetValidation';
import {loadDeliverySets, saveDeliverySets, newDeliverySet, type DeliverySet} from '@/lib/deliverySets';

const input = 'w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const methodInfo = {
  'customer-address': {title:'Delivery to customer address', description:'Ship a physical product with one or more delivery services.', icon:Truck},
  'shop-pickup': {title:'Shop pickup', description:'Deliver the product to a shop where the customer comes to collect it.', icon:Store},
  'pickup-box': {title:'Pickup box', description:'Deliver the product to a pickup box where the customer collects it.', icon:Package},
  digital: {title:'Digital delivery', description:'Send a URL or code by email or in the order’s delivery comments.', icon:Mail},
};
const starts = [
  {value:'physical', title:'Physical delivery', description:'Start with shipping and shop pickup.', icon:Truck},
  {value:'pickup', title:'Shop pickup', description:'Start with collection from a shop.', icon:Store},
  {value:'digital', title:'Digital delivery', description:'Send a URL or code digitally.', icon:Mail},
] as const;
const placeholderAddresses = ['Enter the collection address', 'Enter the pickup box address'];

function isPickupLocation(option:TempoDeliveryService): option is TempoPickupLocation {
  return 'address' in option && typeof option.address === 'string';
}

function Field({id, label, error, hint, children}: {id:string; label:string; error?:string; hint?:string; children:ReactNode}) {
  return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}</label>{children}
    {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p id={`${id}-error`} className="text-xs font-medium text-destructive">{error}</p>}
  </div>;
}

function CurrencySelect({id, value, onChange}: {id:string; value:string; onChange:(value:string)=>void}) {
  return <div className="flex items-center gap-2"><TokenIcon assetId={value} size={24} alt=""/><select id={id} className={input} value={value} onChange={event=>onChange(event.target.value)}>
    {PICOMART_TEMPO_CONFIG.paymentTokens.map(token=><option key={token.tokenId} value={token.tokenId}>{currencyLabel(token)}</option>)}
  </select></div>;
}

export default function DeliveryOptionsPage() {
  const [sets, setSets] = useState<DeliverySet[]>(()=>loadDeliverySets());
  const [selected, setSelected] = useState(()=>sets[0]?.id ?? '');
  const [openCurrencies, setOpenCurrencies] = useState<Record<string, boolean>>(()=>sets[0] ? {[sets[0].options.currency]:true} : {});
  const [saved, setSaved] = useState(()=>JSON.stringify(sets));
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false), [newName, setNewName] = useState(''), [createError, setCreateError] = useState('');
  const [newCurrency, setNewCurrency] = useState<string>(PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId);
  const [template, setTemplate] = useState<'physical'|'digital'|'pickup'>('physical');
  const [showErrors, setShowErrors] = useState(false), [focusRequest, setFocusRequest] = useState(0);
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});
  const editor = useRef<HTMLDivElement>(null);
  const active = sets.find(set=>set.id===selected);
  const currency = getCurrency(active?.options.currency ?? newCurrency);
  const fieldId = (key:string)=>`delivery-${selected}-${key.replaceAll('.', '-')}`;

  function errorsFor(set:DeliverySet) {
    const errors = deliverySetErrors(set);
    set.options.methods.forEach((method, methodIndex)=>{
      if(method.type==='digital') return;
      const list=method.type==='customer-address' ? 'services' : 'locations';
      (method.type==='customer-address' ? method.services : method.locations).forEach((option, optionIndex)=>{
        const value=feeDrafts[`${set.id}|${method.id}|${option.id}`];
        if(value===undefined) return;
        try { currencyAmount(value, set.options.currency, true); }
        catch { errors[`options.methods.${methodIndex}.${list}.${optionIndex}.amount`] = `Enter a non-negative fee with up to ${getCurrency(set.options.currency).decimals} decimal places.`; }
      });
    });
    return errors;
  }
  const errors = active ? errorsFor(active) : {};
  const visibleError = (key:string)=>showErrors ? errors[key] : undefined;
  const fieldProps = (key:string)=>({id:fieldId(key), 'aria-invalid':Boolean(visibleError(key)), 'aria-describedby':visibleError(key) ? `${fieldId(key)}-error` : undefined});
  const dirty = JSON.stringify(sets)!==saved || Object.keys(feeDrafts).some(key=>{
    const set = sets.find(item=>key.startsWith(`${item.id}|`));
    if (!set) return false;
    try { currencyAmount(feeDrafts[key], set.options.currency, true); return false; } catch { return true; }
  });
  useEffect(()=>{
    if (!focusRequest) return;
    const frame = requestAnimationFrame(()=>{
      const field = editor.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      field?.focus(); field?.scrollIntoView({block:'center', behavior:'smooth'});
    });
    return ()=>cancelAnimationFrame(frame);
  }, [focusRequest, selected]);

  function selectSet(set:DeliverySet) {
    setSelected(set.id); setOpenCurrencies(current=>({...current, [set.options.currency]:true}));
    setShowErrors(false); setStatus(''); setError('');
  }
  function change(fn:(set:DeliverySet)=>DeliverySet) {
    setSets(current=>current.map(set=>set.id===selected ? fn(set) : set)); setStatus(''); setError('');
  }
  function methodChange(id:string, fn:(method:TempoDeliveryMethod)=>TempoDeliveryMethod) {
    change(set=>({...set, options:{...set.options, methods:set.options.methods.map(method=>method.id===id ? fn(method) : method)}}));
  }
  function optionChange(methodId:string, optionId:string, patch:Partial<TempoPickupLocation>) {
    methodChange(methodId, method=>method.type==='digital' ? method : method.type==='customer-address'
      ? {...method, services:method.services.map(option=>option.id===optionId ? {...option, ...patch} : option)}
      : {...method, locations:method.locations.map(option=>option.id===optionId ? {...option, ...patch} : option)});
  }
  function clearFees(prefix:string) {
    setFeeDrafts(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(prefix))));
  }
  async function run(work:()=>Promise<void>) {
    setError(''); setStatus(''); setBusy(true);
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Delivery sets could not be updated.'); }
    finally { setBusy(false); }
  }
  function save() {
    const invalid = sets.find(set=>Object.keys(errorsFor(set)).length);
    if (invalid) {
      selectSet(invalid); setShowErrors(true); setFocusRequest(value=>value+1);
      setError(`Complete the highlighted fields in “${invalid.name || 'Unnamed set'}” before saving.`); return;
    }
    void run(async()=>{saveDeliverySets(sets); setSaved(JSON.stringify(sets)); setStatus('All delivery sets saved on this device.');});
  }
  function changeCurrency(value:string) {
    if (!active) return;
    if(Object.entries(feeDrafts).some(([key, amount])=>{
      if(!key.startsWith(`${active.id}|`)) return false;
      try {currencyAmount(amount, active.options.currency, true); return false;} catch {return true;}
    })) {setShowErrors(true); setError('Correct the highlighted fees before changing currency.'); return;}
    try {
      const methods = active.options.methods.map(method=>{
        const convert = (option:TempoDeliveryService)=>({...option, amount:currencyAmount(formatUnits(option.amount, currency.decimals), value, true)});
        return method.type==='digital' ? method : method.type==='customer-address' ? {...method, services:method.services.map(convert)} : {...method, locations:method.locations.map(option=>({...option, ...convert(option)}))};
      });
      change(set=>({...set, options:{...set.options, currency:value, methods}}));
      clearFees(`${selected}|`); setOpenCurrencies(current=>({...current, [value]:true}));
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Currency could not be changed.');}
  }

  return <div className="seller-page space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Delivery sets</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">Create custom delivery choices for fees or pickup locations. Free physical and digital defaults are already available in each catalog. Published catalogs keep their saved delivery terms.</p></div>
      <Link className="inline-flex items-center gap-1 text-sm underline" to="/edit-product-catalogue"><ArrowLeft className="h-4 w-4"/>Back to catalog</Link>
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      <Card className="min-w-0 lg:sticky lg:top-6"><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-lg">Your sets</CardTitle>
        <Button size="sm" variant="outline" disabled={busy} onClick={()=>{setNewName(''); setNewCurrency(active?.options.currency ?? PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId); setCreateError(''); setTemplate('physical'); setCreating(true);}}><Plus className="h-4 w-4"/>Create set</Button>
      </div></CardHeader><CardContent className="space-y-3">
        {!sets.length && <p className="text-sm text-muted-foreground">No custom sets yet. Use a free default in your catalog, or create a set for your own delivery choices.</p>}
        {PICOMART_TEMPO_CONFIG.paymentTokens.map(token=>{
          const group = sets.filter(set=>set.options.currency===token.tokenId);
          if (!group.length) return null;
          return <div key={token.tokenId} className="space-y-2"><button type="button" className="flex w-full items-center gap-2 rounded-md py-2 text-left text-sm font-medium" aria-expanded={Boolean(openCurrencies[token.tokenId])} onClick={()=>setOpenCurrencies(current=>({...current, [token.tokenId]:!current[token.tokenId]}))}>
            <TokenIcon assetId={token.tokenId} size={18}/><span className="min-w-0 flex-1 truncate">{token.symbol} <span className="text-muted-foreground">({group.length})</span></span><ChevronDown className={`h-4 w-4 transition-transform ${openCurrencies[token.tokenId] ? 'rotate-180' : ''}`}/>
          </button>{openCurrencies[token.tokenId] && group.map(set=>{
            const invalid = Object.keys(errorsFor(set)).length>0;
            return <button type="button" key={set.id} disabled={busy} aria-pressed={selected===set.id} className={`block w-full rounded-lg border p-3 text-left transition-colors ${selected===set.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`} onClick={()=>selectSet(set)}>
              <span className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-medium">{set.name || 'Unnamed set'}</span>{invalid && <AlertCircle aria-label="Incomplete set" className="h-4 w-4 shrink-0 text-destructive"/>}</span>
              {set.description && <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{set.description}</span>}
              <span className="mt-2 block text-xs text-muted-foreground">{set.options.methods.filter(method=>!set.disabledTypes.includes(method.type)).length} delivery {set.options.methods.filter(method=>!set.disabledTypes.includes(method.type)).length===1 ? 'method' : 'methods'}</span>
            </button>;
          })}</div>;
        })}
      </CardContent></Card>
      {active ? <div className="min-w-0 space-y-4" ref={editor}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-lg">Set details</CardTitle><div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={()=>{const next={...structuredClone(active), id:crypto.randomUUID(), name:`${active.name} copy`.slice(0,200)}; setSets(current=>[...current,next]); selectSet(next);}}><Copy className="h-4 w-4"/>Duplicate</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={()=>{
              if (!window.confirm(`Delete “${active.name || 'Unnamed set'}”? Save changes to keep this deletion.`)) return;
              const remaining=sets.filter(set=>set.id!==selected); setSets(remaining); clearFees(`${selected}|`);
              if (remaining[0]) selectSet(remaining[0]); else {setSelected(''); setShowErrors(false);}
            }}><Trash2 className="h-4 w-4"/>Delete</Button>
          </div></div></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id={fieldId('name')} label="Set name" error={visibleError('name')}><input {...fieldProps('name')} className={input} maxLength={200} value={active.name} onChange={event=>change(set=>({...set,name:event.target.value}))}/></Field>
            <Field id="set-currency" label="Currency" hint="All delivery fees in this set use this currency."><CurrencySelect id="set-currency" value={active.options.currency} onChange={changeCurrency}/></Field>
            <div className="sm:col-span-2"><Field id={fieldId('description')} label="Internal description (optional)" hint="Only you see this description when choosing a set." error={visibleError('description')}><textarea {...fieldProps('description')} className={input} rows={2} maxLength={2000} value={active.description} onChange={event=>change(set=>({...set,description:event.target.value}))}/></Field></div>
          </CardContent></Card>
          <div><h2 className="font-semibold">Delivery methods</h2><p className="mt-1 text-sm text-muted-foreground">Enable the methods customers can choose. Shipping, shop pickup, and pickup boxes deliver physical products.</p>{visibleError('methods') && <p role="alert" className="mt-2 text-sm text-destructive">{errors.methods}</p>}</div>
          {active.options.methods.map((method, index)=>{
            const info=methodInfo[method.type], Icon=info.icon, enabled=!active.disabledTypes.includes(method.type), prefix=`options.methods.${index}`;
            const invalidSavedFields=showErrors && Object.keys(errors).some(key=>key.startsWith(`${prefix}.`));
            return <Card key={method.id} className={enabled ? '' : 'bg-muted/20'}><CardHeader><div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="h-5 w-5 text-muted-foreground"/></span><div><CardTitle className="text-base">{info.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{info.description}</p></div></div>
              <button type="button" role="switch" aria-checked={enabled} aria-label={`${info.title} enabled`} aria-invalid={Boolean(visibleError('methods'))} className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`} onClick={()=>{
                change(set=>({...set,disabledTypes:enabled ? [...set.disabledTypes,method.type] : set.disabledTypes.filter(type=>type!==method.type)}));
                if(enabled) clearFees(`${selected}|${method.id}|`);
              }}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : ''}`}/></button>
            </div></CardHeader>{(enabled || invalidSavedFields) && <CardContent className="space-y-4">
              {!enabled && <p className="text-sm text-destructive">Complete these saved fields before saving. This method is still disabled for buyers.</p>}
              <Field id={fieldId(`${prefix}.name`)} label="Buyer-facing name" error={visibleError(`${prefix}.name`)}><input {...fieldProps(`${prefix}.name`)} className={input} maxLength={200} value={method.name} onChange={event=>methodChange(method.id,value=>({...value,name:event.target.value}))}/></Field>
              <Field id={fieldId(`${prefix}.description`)} label="Buyer-facing description" error={visibleError(`${prefix}.description`)}><textarea {...fieldProps(`${prefix}.description`)} className={input} maxLength={2000} rows={2} value={method.description} onChange={event=>methodChange(method.id,value=>({...value,description:event.target.value}))}/></Field>
              {method.type==='digital' ? <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Digital delivery has no separate delivery fee. Send the URL or code to the customer’s email or add it to the order’s delivery comments.</p> : <>
                <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{method.type==='customer-address' ? 'Delivery services' : 'Pickup locations'}</h3><Button size="sm" variant="outline" disabled={(method.type==='customer-address' ? method.services : method.locations).length>=50} onClick={()=>methodChange(method.id,value=>{
                  const option={id:crypto.randomUUID(),name:value.type==='customer-address' ? 'New service' : 'New location',description:'',amount:'0'};
                  return value.type==='digital' ? value : value.type==='customer-address' ? {...value,services:[...value.services,option]} : {...value,locations:[...value.locations,{...option,address:'Enter the collection address',schedule:''}]};
                })}><Plus className="h-4 w-4"/>Add {method.type==='customer-address' ? 'service' : 'location'}</Button></div>
                {visibleError(`${prefix}.${method.type==='customer-address' ? 'services' : 'locations'}`) && <p className="text-sm text-destructive">{visibleError(`${prefix}.${method.type==='customer-address' ? 'services' : 'locations'}`)}</p>}
                {(method.type==='customer-address' ? method.services : method.locations).map((option, optionIndex)=>{
                  const optionPrefix=`${prefix}.${method.type==='customer-address' ? 'services' : 'locations'}.${optionIndex}`, feeKey=`${active.id}|${method.id}|${option.id}`;
                  return <div key={option.id} className="space-y-3 rounded-lg border bg-background p-3 sm:p-4">
                    <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><Field id={fieldId(`${optionPrefix}.name`)} label={method.type==='customer-address' ? 'Service name' : 'Location name'} error={visibleError(`${optionPrefix}.name`)}><input {...fieldProps(`${optionPrefix}.name`)} className={input} maxLength={200} value={option.name} onChange={event=>optionChange(method.id,option.id,{name:event.target.value})}/></Field></div>
                      <Button variant="ghost" size="icon" className="mt-6 shrink-0 text-destructive" aria-label={`Remove ${option.name || 'option'}`} disabled={(method.type==='customer-address' ? method.services : method.locations).length===1} onClick={()=>{
                        clearFees(`${selected}|${method.id}|${option.id}`); methodChange(method.id,value=>value.type==='digital' ? value : value.type==='customer-address' ? {...value,services:value.services.filter(item=>item.id!==option.id)} : {...value,locations:value.locations.filter(item=>item.id!==option.id)});
                      }}><Trash2 className="h-4 w-4"/></Button></div>
                    <Field id={fieldId(`${optionPrefix}.description`)} label="Buyer-facing description (optional)" error={visibleError(`${optionPrefix}.description`)}><textarea {...fieldProps(`${optionPrefix}.description`)} className={input} maxLength={2000} rows={2} value={option.description} onChange={event=>optionChange(method.id,option.id,{description:event.target.value})}/></Field>
                    {isPickupLocation(option) && <>
                      <Field id={fieldId(`${optionPrefix}.address`)} label="Pickup address" error={visibleError(`${optionPrefix}.address`)}><textarea {...fieldProps(`${optionPrefix}.address`)} className={input} rows={2} maxLength={2048} placeholder="Street address, city, postal code" value={placeholderAddresses.includes(option.address) ? '' : option.address} onChange={event=>optionChange(method.id,option.id,{address:event.target.value || 'Enter the collection address'})}/></Field>
                      <Field id={fieldId(`${optionPrefix}.schedule`)} label="Collection hours (optional)" error={visibleError(`${optionPrefix}.schedule`)}><input {...fieldProps(`${optionPrefix}.schedule`)} className={input} maxLength={512} placeholder="For example: Mon–Fri, 9am–6pm" value={option.schedule} onChange={event=>optionChange(method.id,option.id,{schedule:event.target.value})}/></Field>
                    </>}
                    <Field id={fieldId(`${optionPrefix}.amount`)} label={method.type==='customer-address' ? 'Delivery fee' : 'Pickup fee'} error={visibleError(`${optionPrefix}.amount`)} hint="Enter 0 for free delivery."><div className="flex items-center overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                      <span className="flex items-center gap-1.5 border-r px-3 py-2 text-sm"><TokenIcon assetId={currency.tokenId} size={18}/>{currency.symbol}</span>
                      <input {...fieldProps(`${optionPrefix}.amount`)} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none" inputMode="decimal" value={feeDrafts[feeKey] ?? formatUnits(option.amount,currency.decimals)} onChange={event=>{
                        const value=event.target.value; setFeeDrafts(current=>({...current,[feeKey]:value}));
                        try {optionChange(method.id,option.id,{amount:currencyAmount(value,currency.tokenId,true)});} catch {setShowErrors(true);}
                      }}/>
                    </div></Field>
                  </div>;
                })}
              </>}
            </CardContent>}</Card>;
          })}
        </fieldset>
      </div> : <Card className="lg:col-span-1 xl:col-span-2"><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><Truck className="h-10 w-10 text-muted-foreground"/><h2 className="text-lg font-semibold">Set up your delivery choices</h2><p className="max-w-sm text-sm text-muted-foreground">Create a set, name it, and choose how customers receive their products.</p></CardContent></Card>}
      {active && <Card className="min-w-0 lg:col-start-2 xl:col-start-auto xl:sticky xl:top-6"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Eye className="h-4 w-4"/>Buyer preview</CardTitle><p className="text-xs text-muted-foreground">The delivery choices shown at checkout.</p></CardHeader><CardContent className="space-y-3">
        {Object.keys(errors).length>0 && <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">This set is incomplete. Finish its details before saving.</p>}
        {!active.options.methods.some(method=>!active.disabledTypes.includes(method.type)) && <p className="text-sm text-muted-foreground">Enable a method to preview your delivery choices.</p>}
        {active.options.methods.filter(method=>!active.disabledTypes.includes(method.type)).map(method=>{
          const Icon=methodInfo[method.type].icon;
          return <div key={method.id} className="space-y-2 rounded-lg border p-3"><div className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/><div className="min-w-0"><h3 className="break-words text-sm font-medium">{method.name || methodInfo[method.type].title}</h3><p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{method.description}</p></div></div>
            {method.type!=='digital' && (method.type==='customer-address' ? method.services : method.locations).map(option=><div key={option.id} className="space-y-1 rounded-md bg-muted/50 p-2 text-xs"><div className="flex justify-between gap-2"><span className="min-w-0 break-words font-medium">{option.name || 'Unnamed option'}</span><span className="shrink-0 font-medium">{option.amount==='0' ? 'Free' : `${formatUnits(option.amount,currency.decimals)} ${currency.symbol}`}</span></div>
              {option.description && <p className="whitespace-pre-wrap break-words text-muted-foreground">{option.description}</p>}
              {isPickupLocation(option) && <><p className="whitespace-pre-wrap break-words text-muted-foreground">{placeholderAddresses.includes(option.address) ? 'Pickup address required' : option.address}</p>{option.schedule && <p className="break-words text-muted-foreground">{option.schedule}</p>}</>}
            </div>)}
          </div>;
        })}
      </CardContent></Card>}
    </div>
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{dirty ? 'Unsaved changes' : 'Saved on this device'}</p><p className="text-xs text-muted-foreground">Saving updates all sets. Published catalogs keep their current terms.</p>{status && <p role="status" className="mt-1 text-sm text-primary">{status}</p>}{error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}</div>
      <Button disabled={busy || !dirty} onClick={save}><Save className="h-4 w-4"/>{busy ? 'Working…' : 'Save changes'}</Button>
    </div>
    <AccountDialog open={creating} title="Create delivery set" onClose={()=>setCreating(false)}>
      <form className="space-y-5" onSubmit={event=>{event.preventDefault(); if(!newName.trim()){setCreateError('Enter a set name.'); return;} const next={...newDeliverySet(newCurrency,template),name:newName.trim()}; setSets(current=>[...current,next]); selectSet(next); setCreating(false);}}>
        <Field id="new-set-name" label="Set name" error={createError}><input id="new-set-name" className={input} autoFocus maxLength={200} placeholder="For example: Local delivery & pickup" aria-invalid={Boolean(createError)} aria-describedby={createError ? 'new-set-name-error' : undefined} value={newName} onChange={event=>{setNewName(event.target.value);setCreateError('');}}/></Field>
        <Field id="new-set-currency" label="Currency"><CurrencySelect id="new-set-currency" value={newCurrency} onChange={setNewCurrency}/></Field>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Starting setup</legend>{starts.map(start=>{const Icon=start.icon; return <label key={start.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${template===start.value ? 'border-primary bg-primary/5' : ''}`}><input type="radio" name="starting-setup" value={start.value} checked={template===start.value} onChange={()=>setTemplate(start.value)}/><Icon className="h-5 w-5 shrink-0 text-muted-foreground"/><span><span className="block text-sm font-medium">{start.title}</span><span className="block text-xs text-muted-foreground">{start.description}</span></span></label>;})}</fieldset>
        <p className="text-xs text-muted-foreground">You can combine or disable methods after creating the set. Add a pickup address before saving a set with pickup enabled.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setCreating(false)}>Cancel</Button><Button type="submit">Create set</Button></div>
      </form>
    </AccountDialog>
  </div>;
}
