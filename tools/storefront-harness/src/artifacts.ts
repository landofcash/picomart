import fs from 'node:fs/promises';
import path from 'node:path';
import {HARNESS_ROOT} from './config.ts';
import {safeRelative,sha256,sourceDigest,readSource,type FileSet} from './files.ts';
import {readDist} from './preview.ts';
import type {AttemptRecord} from './railway.ts';
export async function verifiedArtifact(id:string) {
  if(safeRelative(id).includes('/'))throw new Error('Invalid attempt ID');
  const directory=path.join(HARNESS_ROOT,'artifacts',id);
  const result:AttemptRecord=JSON.parse(await fs.readFile(path.join(directory,'result.json'),'utf8'));
  if(result.id!==id||result.status!=='ready'||result.cleanup!=='destroyed')throw new Error('Only successful attempts with confirmed VM cleanup can be used');
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'artifact-manifest.json'),'utf8'));
  if(manifest.attemptId!==id||!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(manifest.base)||!Array.isArray(manifest.files))throw new Error('Invalid artifact manifest');
  const files=await readDist(path.join(directory,'dist'));
  if(manifest.files.length!==files.size||new Set(manifest.files.map((e:{path:string})=>e.path)).size!==files.size)throw new Error('Artifact file count mismatch');
  for(const entry of manifest.files){const bytes=files.get(entry.path);if(!bytes||bytes.length!==entry.size||sha256(bytes)!==entry.sha256)throw new Error('Saved artifact integrity check failed');}
  const source=await readSource(path.join(directory,'source'));
  if(sourceDigest(source)!==manifest.sourceDigest)throw new Error('Saved source integrity check failed');
  return {directory,result,manifest,files,source};
}
export async function privateFiles(directory:string,source:FileSet) {
  const files:FileSet=new Map([...source].map(([name,data])=>[`source/${name}`,data]));
  for(const name of ['result.json','input.json','prompt.json','model.json','artifact-manifest.json','build.log','preview-check.json']) {
    try{const bytes=await fs.readFile(path.join(directory,name));files.set(name,bytes);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  return files;
}
