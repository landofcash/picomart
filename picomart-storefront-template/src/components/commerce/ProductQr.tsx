import {useState} from 'react';
import {Copy, QrCode} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import type {NetworkId} from '@/context/wallet/types';
import {getBuyerProductUrl} from '@/lib/buyer/links';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';

export function ProductQr({catalogSeed, productId, network}: {catalogSeed: string; productId: string; network: NetworkId}) {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const url = getBuyerProductUrl(catalogSeed, productId, network);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopyStatus('Link copied'); }
    catch { setCopyStatus('Copy the link from the field below.'); }
  }
  return <Modal title="Open this product on your phone" description="Scan the QR code to continue in Picomart."
    open={open} onOpenChange={value => {setOpen(value); setCopyStatus('');}}
    trigger={<Button aria-label="Show product QR code"><QrCode size={18}/> QR code</Button>}>
    <div className="shop-qr" role="img" aria-label="Product QR code" data-buyer-url={url}>
      <QRCodeSVG value={url} size={208} level="H" marginSize={4}/>
    </div>
    <label className="shop-label" htmlFor="buyer-product-url">Product link</label>
    <input id="buyer-product-url" className="shop-input" value={url} readOnly onFocus={event => event.currentTarget.select()}/>
    <Button onClick={() => void copy()}><Copy size={16}/> Copy link</Button>
    <p role="status" className="shop-muted">{copyStatus}</p>
  </Modal>;
}
