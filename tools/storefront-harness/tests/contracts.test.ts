import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeRelative,validateEdits,assertProtected,type FileSet} from '../src/files.ts';
import {resolveRequest,startPreview} from '../src/preview.ts';
import {extractEdits,modelSettings} from '../src/model.ts';
import {safeError,railwayOptions} from '../src/config.ts';
import {readInput} from '../src/input.ts';

const original:FileSet=new Map([['package.json',Buffer.from('{"dependencies":{"react":"19.1.1"}}')],['src/storefront/theme.css',Buffer.from('.shop-root {}')],['src/lib/identity.ts',Buffer.from('export const seed="protected";')]]);
test('file paths reject traversal, encodings, Windows separators and absolute paths',()=>{
  for(const p of ['../secret','src/../../x','/tmp/x','C:/x','src\\x','src/%2e%2e/x','src//x','a\u0000b'])assert.throws(()=>safeRelative(p));
  assert.equal(safeRelative('src/storefront/pages/HomePage.tsx'),'src/storefront/pages/HomePage.tsx');
});
test('merchant edits cannot replace protected identity, dependencies or build tools',()=>{
  for(const path of ['package.json','src/lib/identity.ts','vite.config.ts','tests/a.ts'])assert.throws(()=>validateEdits(original,[{path,content:'bad'}]));
  const changed=new Map(original);changed.delete('src/lib/identity.ts');assert.throws(()=>assertProtected(original,changed));
});
test('source edits reject unapproved imports and dynamic code; valid relative helpers remain usable',()=>{
  for(const content of ['import x from "node:fs";','import x from "https://example.com/x";','import x from "../../../vite.config";','import("react");','eval("x");','new Function("x");'])assert.throws(()=>validateEdits(original,[{path:'src/storefront/pages/HomePage.tsx',content}]));
  assert.doesNotThrow(()=>validateEdits(original,[{path:'src/storefront/pages/HomePage.tsx',content:'import React from "react"; import {seed} from "../../lib/identity"; export const page=<h1>{seed}</h1>;'}]));
  assert.throws(()=>validateEdits(original,[{path:'src/storefront/theme.css',content:'@import "https://bad.test/style.css";'}]));
});
test('model output must be complete structured edits, never partial or refused output',()=>{
  const valid={status:'completed',model:'test-model',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'changed',edits:[{path:'src/storefront/theme.css',content:'.shop-root{color:black}'}]})}]}]};
  assert.equal(extractEdits(valid).edits.length,1);
  assert.throws(()=>extractEdits({...valid,status:'incomplete'}));
  assert.throws(()=>extractEdits({...valid,output:[{type:'message',content:[{type:'refusal'}]}]}));
});

test('misplaced model credentials fail locally and are redacted from errors',()=>{
  const saved={OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_MODEL:process.env.OPENAI_MODEL};
  try {
    process.env.OPENAI_API_KEY='sk-test-only-api-key';process.env.OPENAI_MODEL='sk-test-only-misplaced-key';
    assert.throws(()=>modelSettings(),/model ID, not an API key/);
    assert.equal(safeError(new Error(`Invalid model ${process.env.OPENAI_MODEL}`)),'Invalid model [redacted]');
    process.env.OPENAI_MODEL='test-model';assert.equal(modelSettings().model,'test-model');
  } finally {
    for(const [name,value] of Object.entries(saved)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  }
});

test('Railway project credentials select their required auth header mode',async()=>{
  const env={RAILWAY_API_TOKEN:'test-only-project-token',RAILWAY_SANDBOX_ENVIRONMENT_ID:'6e115024-b8a5-4ff0-826b-f6e5a0f32a16'};
  assert.equal((await railwayOptions(false,{...env,RAILWAY_AUTH_TYPE:'project-token'})).authType,'project-token');
  assert.equal((await railwayOptions(false,{...env,RAILWAY_AUTH_TYPE:'bearer'})).authType,'bearer');
  await assert.rejects(railwayOptions(false,{...env,RAILWAY_AUTH_TYPE:'invalid'}),/RAILWAY_AUTH_TYPE/);
});

test('harness uses configured sandbox scope and supports the existing environment setting',async()=>{
  const production='6e115024-b8a5-4ff0-826b-f6e5a0f32a16',other='11111111-1111-4111-8111-111111111111';
  const env={RAILWAY_API_TOKEN:'test-only-token',RAILWAY_ENVIRONMENT_ID:other};
  assert.equal((await railwayOptions(false,{...env,RAILWAY_SANDBOX_ENVIRONMENT_ID:production})).environmentId,production);
  assert.equal((await railwayOptions(false,env)).environmentId,other);
  for(const value of ['', 'invalid']) await assert.rejects(railwayOptions(false,{...env,RAILWAY_SANDBOX_ENVIRONMENT_ID:value}),/environment UUID/);
  await assert.rejects(railwayOptions(false,{RAILWAY_API_TOKEN:'test-only-token'}),/environment UUID/);
});
test('two catalog fixtures use validated distinct identities and exact decimal prices',async()=>{
  const a=await readInput(undefined,'pantry'),b=await readInput(undefined,'studio');assert.notEqual(a.config.catalogSeed,b.config.catalogSeed);assert.notEqual(a.brief,b.brief);assert.equal(typeof a.products[0].Price,'string');
});
test('preview serves only the selected base; missing assets stay 404 after direct route fallback',async()=>{
  assert.equal(resolveRequest('/s/a/products/AAAAAAAAAAAAAAAAAAAAAA','/s/a/'),'index.html');
  assert.equal(resolveRequest('/s/b/products','/s/a/'),null);
  const preview=await startPreview(new Map([['index.html',Buffer.from('<h1>shop a</h1>')],['assets/app.js',Buffer.from('void 0')]]),0,'/s/a/');
  try {
    assert.equal((await fetch(preview.url+'products/AAAAAAAAAAAAAAAAAAAAAA')).status,200);
    assert.equal((await fetch(preview.url+'assets/missing.js')).status,404);
    assert.equal((await fetch(preview.url+'assets/app.js')).headers.get('content-type'),'text/javascript; charset=utf-8');
    assert.equal((await fetch(preview.url,{method:'POST'})).status,405);
  }finally{await preview.close();}
});
