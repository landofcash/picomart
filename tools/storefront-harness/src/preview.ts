import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {safeRelative, type FileSet} from './files.ts';

export const contentType = (file:string) => ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'}[path.extname(file)] || 'application/octet-stream');
export function shopRoute(route:string): boolean {return route==='' || route==='about' || route==='products' || /^products\/[A-Za-z0-9_-]{22}$/.test(route) || /^collections\/[A-Za-z0-9_-]+$/.test(route);}
export function resolveRequest(raw:string, base='/'): string | null {
  let pathname: string;
  try {pathname=decodeURIComponent(raw.split('?')[0]);} catch {return null;}
  if(!pathname.startsWith(base)) return null;
  const relative=pathname.slice(base.length).replace(/\/$/,'');
  if(!relative) return 'index.html';
  try {safeRelative(relative);} catch {return null;}
  return shopRoute(relative) ? 'index.html' : relative;
}
export async function startPreview(files:FileSet, port=4178, base='/') {
  const server=http.createServer((request,response)=>{
    if(!['GET','HEAD'].includes(request.method || '')) {response.writeHead(405);response.end();return;}
    const key=resolveRequest(request.url||'/',base);
    const bytes=key ? files.get(key) : undefined;
    if(!bytes) {response.writeHead(404,{'Content-Type':'text/plain'});response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':contentType(key!), 'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(request.method==='HEAD' ? undefined : bytes);
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const address=server.address();
  if(!address || typeof address==='string') throw new Error('Preview listener unavailable');
  return {url:`http://127.0.0.1:${address.port}${base}`,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
export async function readDist(root:string):Promise<FileSet> {
  const files:FileSet=new Map();let total=0;
  async function walk(directory:string,relative='') {
    for(const item of await fs.readdir(directory,{withFileTypes:true})) {
      const name=relative ? `${relative}/${item.name}` : item.name;
      const absolute=path.join(directory,item.name);
      const stat=await fs.lstat(absolute);
      if(stat.isSymbolicLink()) throw new Error('Preview symlinks are not supported');
      if(stat.isDirectory()) await walk(absolute,name);
      else {if(!stat.isFile() || stat.nlink!==1 || stat.size>5*1024*1024 || (total+=stat.size)>50*1024*1024 || files.size>=2000) throw new Error('Invalid preview files'); files.set(safeRelative(name),await fs.readFile(absolute));}
    }
  }
  await walk(root);
  if(!files.has('index.html')) throw new Error('Preview index is missing');
  return files;
}
