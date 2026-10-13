import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('./',import.meta.url));
const output=path.resolve(root,'_site');
if(path.dirname(output)!==path.resolve(root)||path.basename(output)!=='_site')throw Error('Invalid output folder');
const files=JSON.parse(fs.readFileSync(path.join(root,'app-files.json'),'utf8'));
const resources=JSON.parse(fs.readFileSync(path.join(root,'resources.json'),'utf8'));
if(resources.version!==1||!Array.isArray(resources.archives)||!resources.archives.length)throw Error('Invalid resources.json');
const packed=new Set(resources.archives.flatMap(archive=>archive.files.map(file=>file.path)));
if(!Array.isArray(files)||!files.includes('index.html')||new Set(files).size!==files.length)throw Error('Invalid app-files.json');
for(const name of files){
 if(typeof name!=='string'||path.basename(name)!==name||name.startsWith('.')||/[\\/]/.test(name))throw Error('Invalid app file '+name);
 if(!packed.has(name)){
  const item=fs.lstatSync(path.join(root,name));
  if(!item.isFile()||item.isSymbolicLink())throw Error('Missing regular app file '+name);
 }
}
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});
for(const name of files)if(!packed.has(name))fs.copyFileSync(path.join(root,name),path.join(output,name));
// Small archives hold libraries, previews, schematic indexes and large data files.
// Editable application logic stays as ordinary root files in this repository.
const extract=String.raw`
from pathlib import Path
import sys,zipfile,json,hashlib
repository,destination=map(Path,sys.argv[1:])
allowed={'fontes-previas','jci-decodificado','schematics','schematics-pins','vendor'}
root_data={'component-catalog.json','capacitor-catalog.json','board-dados.js'}
resources=json.loads((repository/'resources.json').read_text('utf-8'))
seen=set()
for descriptor in resources['archives']:
 archive=repository/descriptor['path']
 if archive.parent.resolve()!=repository.resolve():raise ValueError('Invalid archive location')
 raw=archive.read_bytes()
 if len(raw)!=descriptor['size'] or hashlib.sha256(raw).hexdigest()!=descriptor['sha256']:raise ValueError('Resource archive hash mismatch')
 expected={f['path']:f for f in descriptor['files']}
 with zipfile.ZipFile(archive) as z:
  if set(z.namelist())!=set(expected) or len(z.namelist())!=len(expected):raise ValueError('Resource entries mismatch')
  for item in z.infolist():
   name=item.filename;parts=name.split('/')
   if '\\' in name or not parts or not(parts[0] in allowed or name in root_data) or any(p in ('','.','..') for p in parts):raise ValueError('Invalid archive path: '+name)
   if name in seen or item.is_dir() or ((item.external_attr >> 16) & 0o170000)==0o120000:raise ValueError('Invalid or duplicate asset: '+name)
   seen.add(name)
   data=z.read(item);entry=expected[name]
   if len(data)!=entry['size'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('Asset hash mismatch: '+name)
   target=destination.joinpath(*parts)
   if not target.resolve().is_relative_to(destination.resolve()):raise ValueError('Invalid extraction path')
   target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
print('Assets extracted and verified:',len(seen))
`;
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
execFileSync(python,['-c',extract,root,output],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'build-offline.mjs'),output],{stdio:'inherit'});
fs.writeFileSync(path.join(output,'.nojekyll'),'');
console.log('GitHub Pages ready: '+output);
