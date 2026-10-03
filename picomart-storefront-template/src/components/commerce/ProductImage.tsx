import {useState} from 'react';
import {ImageOff} from 'lucide-react';

export function ProductImage({src, name, priority = false}: {src: string; name: string; priority?: boolean}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <div className="shop-product-image">
    {src && src !== failedSrc
      ? <img src={src} alt={name} loading={priority ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedSrc(src)}/>
      : <div className="shop-image-fallback" role="img" aria-label={`Image unavailable for ${name}`}><ImageOff size={28}/><span>Image unavailable</span></div>}
  </div>;
}
