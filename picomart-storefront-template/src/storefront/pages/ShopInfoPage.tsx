import {useShop} from '@/lib/shop/context';

export function ShopInfoPage() {
  const {config} = useShop();
  return <section className="shop-container shop-page shop-about"><p className="shop-eyebrow">About the shop</p><h1>{config.branding.name}</h1><p className="shop-hero-description">{config.branding.description}</p>
    {config.branding.story && <p className="shop-product-copy">{config.branding.story}</p>}
    {config.links.length > 0 && <div className="shop-contact-links"><h2>Find out more</h2>{config.links.map(link => <a key={link.url} className="shop-text-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>}
  </section>;
}
