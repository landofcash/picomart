import {publicSource} from './source.ts';
import {serveHosting} from './server.ts';

try {
  const port=Number(process.env.PORT||8080);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
  const server=await serveHosting(publicSource(),port,'0.0.0.0');
  console.log(`Storefront resolver listening on port ${port}`);
  let closing=false;
  const close=()=>{if(closing)return;closing=true;const deadline=setTimeout(()=>process.exit(1),10000);server.close().then(()=>{clearTimeout(deadline);process.exitCode=0;});};
  process.once('SIGTERM',close);process.once('SIGINT',close);
}catch{console.error('Storefront resolver failed to start. Check public storage configuration.');process.exitCode=1;}
