import express from 'express';
import multer from 'multer';
import axios from 'axios';
import dotenv from 'dotenv';
import {tempoAddress} from '../../tempoIdentity';
import {storageConfig,CATALOG_CDN,IMAGE_LIMIT,CatalogInputError,sha256,authorizeUpload,imageType,catalogBytes,storagePath} from '../../catalogStorage';

dotenv.config();
type Transport = Pick<typeof axios,'put'|'get'>;
export function createCatalogUploadRouter(transport:Transport=axios,env:NodeJS.ProcessEnv=process.env) {
  const router=express.Router();
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:IMAGE_LIMIT,files:1,fields:3,fieldSize:512,parts:5}});
  let active=0;
  router.get('/status',(_req,res)=>{
    res.setHeader('Cache-Control','no-store');
    let ready=false;try{storageConfig(env);ready=true;}catch{/* Do not expose credentials/configuration internals. */}
    res.json({success:true,enabled:env.BUNNY_UPLOAD_ENABLED==='true',ready,publicBase:CATALOG_CDN,version:1});
  });
  router.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(env.BUNNY_UPLOAD_ENABLED!=='true')return void res.status(503).json({error:'Catalog uploads are disabled.'});
    const origins=(env.CATALOG_UPLOAD_ORIGINS||'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,https://seller.picomart.zkbytes.com').split(',').map(s=>s.trim());
    if(req.headers.origin&&!origins.includes(req.headers.origin))return void res.status(403).json({error:'Catalog upload origin is not allowed.'});
    try{storageConfig(env);}catch{return void res.status(503).json({error:'Catalog storage configuration is incomplete or invalid.'});}
    if(active>=8)return void res.status(503).json({error:'Catalog uploads are busy. Try again shortly.'});
    active++;let released=false;
    res.locals.releaseUpload=()=>{if(!released){released=true;active--;}};
    res.once('close',()=>{if(!res.locals.publishing)res.locals.releaseUpload();});next();
  });
  async function publish(bytes:Buffer,account:string,kind:'image'|'json',extension:string,mime:string) {
    const config=storageConfig(env),hash=sha256(bytes),path=storagePath(account,kind,hash,extension),url=`${config.baseUrl}/${path}`;
    const options={headers:{AccessKey:config.key},maxRedirects:0,timeout:30_000,maxContentLength:IMAGE_LIMIT,maxBodyLength:IMAGE_LIMIT};
    const result=await transport.put(url,bytes,{...options,headers:{...options.headers,'Content-Type':mime,Checksum:hash.toUpperCase()}});
    if(result.status!==201)throw new Error('Unexpected storage upload response');
    const readBack=await transport.get(url,{...options,responseType:'arraybuffer'});
    if(readBack.status!==200||sha256(Buffer.from(readBack.data))!==hash)throw new Error('Storage read-back differs');
    return {success:true,version:1,url:`${config.publicBase}/${path}`,sha256:hash};
  }
  router.post('/image',upload.single('file'),async(req,res)=>{
    try {
      if(!req.file||req.body.path)throw new CatalogInputError('Use a signed upload without a client-selected path.');
      const bytes=req.file.buffer,type=imageType(bytes),account=authorizeUpload(req.body,'image',sha256(bytes));
      res.locals.publishing=true;res.json(await publish(bytes,account,'image',type.extension,type.mime));
    }catch(err){res.status(err instanceof CatalogInputError?400:502).json({error:err instanceof CatalogInputError?err.message:'Catalog storage upload or read-back failed. Retry the same content.'});}
    finally{res.locals.releaseUpload?.();}
  });
  router.post('/json',async(req,res)=>{
    try {
      if(!req.body||req.body.path)throw new CatalogInputError('Use a signed upload without a client-selected path.');
      let account:string;try{account=tempoAddress(req.body.account);}catch{throw new CatalogInputError('Invalid wallet address.');}
      const bytes=catalogBytes(req.body.content,account);
      authorizeUpload(req.body,'json',sha256(bytes));
      res.locals.publishing=true;res.json(await publish(bytes,account,'json','json','application/json'));
    }catch(err){res.status(err instanceof CatalogInputError?400:502).json({error:err instanceof CatalogInputError?err.message:'Catalog storage upload or read-back failed. Retry the same content.'});}
    finally{res.locals.releaseUpload?.();}
  });
  router.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    res.locals.releaseUpload?.();
    res.status(400).json({error:err instanceof multer.MulterError?'Image exceeds the upload limits.':'Invalid upload request.'});
  });
  return router;
}
export default createCatalogUploadRouter();
