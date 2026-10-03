import {validateSelection,type CheckoutSelection} from './tempoMarket';
export const tempoCartKey='picomart_tempo_public_cart_v1';
export const tempoSelectionKey='picomart_tempo_public_checkout_selection_v1';
export function readTempoCart():CheckoutSelection[] {
  const input:unknown=JSON.parse(localStorage.getItem(tempoCartKey)??'[]');
  if(!Array.isArray(input))throw new Error('Saved cart is invalid.');
  input.forEach(validateSelection);return input;
}
export function saveTempoCart(cart:CheckoutSelection[]) {
  cart.forEach(validateSelection);localStorage.setItem(tempoCartKey,JSON.stringify(cart));
}
export function addTempoSelection(selection:CheckoutSelection) {
  validateSelection(selection);
  const cart=readTempoCart(),key=selection.catalog.catalogId;
  const existing=cart.findIndex(group=>group.catalog.catalogId===key);
  if(existing>=0){
    const saved=cart[existing];
    if(saved.catalog.sellerIdentityId!==selection.catalog.sellerIdentityId)throw new Error('Catalog receiving identity changed. Remove its saved products before adding again.');
    const products=saved.products.map(p=>({...p}));
    for(const item of selection.products){
      const index=products.findIndex(p=>p.ProductId===item.ProductId);
      if(index>=0)products[index]={...item,quantity:products[index].quantity+item.quantity};else products.push({...item});
    }
    cart[existing]={catalog:selection.catalog,products};
  }else cart.push(selection);
  saveTempoCart(cart);
}
export function removePaidSelection(selection:CheckoutSelection,hash:string) {
  const marker=`picomart_tempo_cart_receipt_${hash}`;if(localStorage.getItem(marker))return;
  const quantities=new Map(selection.products.map(p=>[p.ProductId,p.quantity]));
  const remaining=readTempoCart().flatMap(group=>{
    if(group.catalog.catalogId!==selection.catalog.catalogId||group.catalog.sellerIdentityId!==selection.catalog.sellerIdentityId)return [group];
    const products=group.products.flatMap(p=>{const quantity=p.quantity-(quantities.get(p.ProductId)??0);return quantity>0?[{...p,quantity}]:[];});
    return products.length?[{...group,products}]:[];
  });
  saveTempoCart(remaining);localStorage.setItem(marker,'confirmed');
}
