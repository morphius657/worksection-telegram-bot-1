'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createRuntime}=require('./runtime.cjs');
function createDemoServer(){
  let runtime=createRuntime(),pending=Promise.resolve();
  const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  return http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'index.html')));}
    if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,await runtime.state());
    const asset=/^\/assets\/delivered\/(\d+)\.png$/.exec(url.pathname);
    if(req.method==='GET'&&asset){const item=runtime.documents[Number(asset[1])];if(!item)return json(res,404,{error:'Preview not found'});res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'});return res.end(item.bytes);}
    if(req.method!=='POST'||url.pathname!=='/api/action')return json(res,404,{error:'Not found'});
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Use the local demo page'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'JSON required'});
    try{
      let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw new Error('Request too large');}
      const input=JSON.parse(body||'{}');
      const operation=async()=>{
        if(input.action==='reset')runtime=createRuntime();
        else if(input.action==='notify')await runtime.notify();
        else if(input.action==='plan'){await runtime.callback('approve:123');await runtime.tick(8);}
        else if(input.action==='work')await runtime.tick(12);
        else if(input.action==='reference'){await runtime.send('/talk 123');await runtime.reference();}
        else if(input.action==='send'){if(typeof input.text!=='string'||input.text.length>3500)throw new Error('Use a short text message');await runtime.send(input.text);await runtime.tick(8);}
        else if(input.action==='callback'){if(typeof input.data!=='string'||input.data.length>200)throw new Error('Invalid button');await runtime.callback(input.data);await runtime.tick(8);}
        else throw new Error('Unknown demo action');
        return runtime.state();
      };
      const work=pending.then(operation);pending=work.catch(()=>{});return json(res,200,await work);
    }catch(error){return json(res,400,{error:error.message});}
  });
}
if(require.main===module){
  const port=Number(process.env.DEMO_PORT||process.env.PORT||3001);
  createDemoServer().listen(port,'127.0.0.1',()=>console.log(`Offline portfolio demo: http://127.0.0.1:${port}\nFictional data; simulated services; no external API requests.`));
}
module.exports={createDemoServer};
