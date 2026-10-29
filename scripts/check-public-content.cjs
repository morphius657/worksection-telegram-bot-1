'use strict';
// Generic checks only; project-specific private audit terms are not distributed.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),issues=[];
const skip=new Set(['node_modules','.git','coverage','demo-output']);
function visit(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(skip.has(entry.name))continue;
  const file=path.join(dir,entry.name),relative=path.relative(root,file);
  if(entry.isDirectory()){visit(file);continue;}
  if(entry.name==='.env'||(entry.name.startsWith('.env.')&&entry.name!=='.env.example')){issues.push(relative+': local environment file');continue;}
  if(!/\.(?:js|cjs|json|md|html|yml|yaml|example)$/.test(entry.name))continue;
  const text=fs.readFileSync(file,'utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))issues.push(relative+': private key');
  if(/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/.test(text))issues.push(relative+': possible API credential');
  for(const match of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)){
   if(!/(^|\.)example\.(com|org|net)$|\.invalid$/i.test(match[1]))issues.push(relative+': non-example email address');
  }
 }
}
visit(root);
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
else console.log('No generic credential/contact-data findings in distributable source.');
