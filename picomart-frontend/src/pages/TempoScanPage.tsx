import {useEffect,useRef,useState} from 'react';
import {BrowserMultiFormatReader} from '@zxing/browser';
import {useNavigate} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Camera,ScanLine} from 'lucide-react';
import TempoMarketShell from '@/components/TempoMarketShell';
import {parseCatalogLink} from '@/lib/tempoMarket';

export default function TempoScanPage() {
  const navigate=useNavigate(),video=useRef<HTMLVideoElement>(null),[scanning,setScanning]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(!scanning||!video.current)return;
    let live=true,controls:{stop:()=>void}|undefined;
    const reader=new BrowserMultiFormatReader();
    void reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}}},video.current,result=>{
      if(!result||!live)return;
      try{parseCatalogLink(result.getText());const url=new URL(result.getText());setScanning(false);navigate(url.pathname+url.hash);}
      catch{setError('This QR code is not a supported Picomart Tempo catalog link.');}
    }).then(value=>{controls=value;if(!live)controls.stop();}).catch(()=>{if(live){setError('Camera unavailable. Allow camera access or open the product link directly.');setScanning(false);}});
    return ()=>{live=false;controls?.stop();};
  },[scanning,navigate]);
  return <TempoMarketShell title="Scan QR Code">
    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted flex items-center justify-center">
      <video ref={video} autoPlay playsInline muted className={`h-full w-full object-cover ${scanning?'':'hidden'}`}/>
      {!scanning&&<div className="text-center text-muted-foreground space-y-3"><Camera className="mx-auto h-16 w-16"/><p>Scan a product or catalog QR code</p></div>}
    </div>
    <Button className="w-full" size="lg" onClick={()=>{setError('');setScanning(value=>!value);}}><ScanLine className="h-5 w-5"/>{scanning?'Stop camera':'Start camera'}</Button>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </TempoMarketShell>;
}
