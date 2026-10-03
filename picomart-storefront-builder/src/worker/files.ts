import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {limits} from './config.ts';

export type FileSet = Map<string, Buffer>;
const ROOT_FILES = new Set(['package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'eslint.config.js', 'playwright.config.ts', '.nvmrc', 'README.md', '.gitignore']);
const ROOT_DIRS = new Set(['src', 'public', 'tests', 'template', 'tooling', 'vendor']);
export function sha256(bytes: Uint8Array | string) { return createHash('sha256').update(bytes).digest('hex'); }
export function safeRelative(file: string): string {
  if (!file || file.length > 240 || /[\\\x00-\x1f:%?#]/.test(file) || file.startsWith('/') || file.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`Unsafe file path: ${file}`);
  return file;
}
export function sourcePath(file: string): boolean {
  safeRelative(file);
  if (file.split('/').some(p => p.startsWith('.env') || ['node_modules', '.git', 'artifacts', '.state'].includes(p))) return false;
  return ROOT_FILES.has(file) || ROOT_DIRS.has(file.split('/')[0]);
}
export function editable(file: string): boolean {
  safeRelative(file);
  return file === 'src/storefront/theme.css' || /^src\/storefront\/(pages|sections)\/[A-Za-z0-9/_-]+\.tsx$/.test(file);
}
export async function readSource(root: string): Promise<FileSet> {
  const files: FileSet = new Map();
  let total = 0;
  async function visit(relative: string) {
    const absolute = path.join(root, relative);
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Source symlink rejected: ${relative}`);
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(absolute)) await visit(relative ? `${relative}/${entry}` : entry);
    } else {
      if (!stat.isFile() || stat.nlink !== 1) throw new Error(`Source must be a regular file: ${relative}`);
      if (stat.size > limits().fileBytes || (total += stat.size) > limits().sourceBytes || files.size>=2000) throw new Error('Source size limit exceeded');
      files.set(safeRelative(relative), await fs.readFile(absolute));
    }
  }
  for (const name of [...ROOT_FILES, ...ROOT_DIRS]) {
    try { await fs.lstat(path.join(root, name)); } catch { continue; }
    await visit(name);
  }
  if (!files.has('package-lock.json') || !files.has('src/App.tsx')) throw new Error('Incomplete template source');
  for (const name of files.keys()) if (!sourcePath(name)) throw new Error(`Unexpected source file: ${name}`);
  return files;
}
export function sourceDigest(files: FileSet): string {
  return sha256([...files].sort(([a],[b])=>a.localeCompare(b)).map(([name,data])=>`${name}:${sha256(data)}`).join('\n'));
}
export function assertProtected(before: FileSet, after: FileSet) {
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    if (!sourcePath(name)) throw new Error(`Unexpected source path: ${name}`);
    if (!editable(name) && (!before.get(name) || !after.get(name) || !before.get(name)!.equals(after.get(name)!))) throw new Error(`Protected file changed: ${name}`);
  }
}
export function validateEdits(original: FileSet, edits: Array<{path: string; content: string}>): FileSet {
  if (!edits.length || edits.length > 30) throw new Error('Generation must return 1-30 source edits');
  const changed = new Map(original);
  const seen = new Set<string>();
  const pkg = JSON.parse(original.get('package.json')!.toString());
  const packages = Object.keys(pkg.dependencies);
  for (const edit of edits) {
    if (!editable(edit.path) || seen.has(edit.path) || Buffer.byteLength(edit.content) > limits().fileBytes) throw new Error(`Invalid edit: ${edit.path}`);
    seen.add(edit.path);
    if (edit.path.endsWith('.tsx')) {
      const source = ts.createSourceFile(edit.path, edit.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function inspect(node: ts.Node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier) {
            if (!ts.isStringLiteral(node.moduleSpecifier)) throw new Error('Nonliteral import rejected');
            const specifier = node.moduleSpecifier.text;
            const resolved = specifier.startsWith('@/') ? `src/${specifier.slice(2)}` : specifier.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(edit.path), specifier)) : null;
            if (resolved ? (!resolved.startsWith('src/') || /[\\?#:]/.test(resolved)) : !packages.some(p=>specifier === p || specifier.startsWith(`${p}/`))) throw new Error(`Unapproved import in ${edit.path}: ${specifier}`);
          }
        }
        if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && ['require','eval','Function'].includes(node.expression.text)))) throw new Error('Dynamic code/imports are outside the template contract');
        ts.forEachChild(node, inspect);
      }
      inspect(source);
    } else if (/@import|@plugin|@source|@config/i.test(edit.content)) throw new Error('CSS may not change the toolchain or import external styles');
    changed.set(edit.path, Buffer.from(edit.content));
  }
  assertProtected(original, changed);
  if([...changed.values()].reduce((total,file)=>total+file.length,0)>limits().sourceBytes) throw new Error('Generated source size limit exceeded');
  if (sourceDigest(original) === sourceDigest(changed)) throw new Error('Model returned an unchanged design');
  return changed;
}
export async function saveFiles(directory: string, files: FileSet) {
  for (const [name, data] of files) {
    const target = path.join(directory, safeRelative(name));
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, data);
  }
}
