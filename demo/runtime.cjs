'use strict';
// Offline adapters around the actual orchestration code. Never forwards fetch.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const localRequire = createRequire(path.join(root, 'server.js'));
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8').split("server.listen(port, '0.0.0.0'")[0];
const clone = value => JSON.parse(JSON.stringify(value));
const CHAT = '42', TASK = '123';

function createRuntime() {
  const kv = new Map(), sets = new Map(), messages = [], calls = [], documents = [], logs = [];
  let updateId = 100, submissions = 0, modelCalls = 0, iterations = 0;
  const task = {
    id: TASK, name: 'Sample Studio - workspace preview',
    text: 'DEMO-001. Create two separate square English demonstration cards for the fictional Sample Studio. Use only: Sample Studio; Organize sample ideas in one place.; View demo. No pricing or promotional claims.',
    status: 'active', files: [], tags: { '10': 'Queued' },
    user_from: { name: 'Demo Requester', email: 'requester@example.com' },
    user_to: { name: 'Demo Designer', email: 'designer@example.com' }
  };
  const statusTags = [
    { id:'10',title:'Queued',group:{id:'1',type:'status'} },
    { id:'11',title:'In progress',group:{id:'1',type:'status'} }
  ];
  const response = body => new Response(JSON.stringify(body), { headers: { 'content-type':'application/json' } });
  const env = {
    SESSION_SECRET:'offline-demo-session-only', TELEGRAM_BOT_TOKEN:'offline-demo-bot', TELEGRAM_CHAT_ID:CHAT,
    OPENAI_API_KEY:'offline-demo-model', PUBLIC_BASE_URL:'https://bot.example.com',
    UPSTASH_REDIS_REST_URL:'https://redis.example.com', UPSTASH_REDIS_REST_TOKEN:'offline-demo-store',
    CREATIVE_COUNT:'2', MAX_CREATIVE_COUNT:'6', GEMINI_ROLE:'off'
  };
  const artSvg = index => `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><rect width="900" height="900" fill="${index % 2 ? '#e6f5ed' : '#e9eafa'}"/><rect x="70" y="70" width="760" height="760" rx="32" fill="#fff"/><text x="120" y="155" font-family="sans-serif" font-size="25" fill="#596477">SIMULATED OUTPUT / FICTIONAL EXAMPLE</text><text x="120" y="265" font-family="sans-serif" font-size="58" font-weight="bold" fill="#172638">Sample Studio</text><rect x="120" y="330" width="${index % 2 ? 450 : 560}" height="210" rx="20" fill="${index % 2 ? '#39866b' : '#6069b9'}"/><path d="M170 395h300m-300 60h200" stroke="white" stroke-width="16" stroke-linecap="round"/><text x="120" y="625" font-family="sans-serif" font-size="31" fill="#172638">Organize sample ideas in one place.</text><rect x="120" y="680" width="220" height="70" rx="15" fill="#172638"/><text x="153" y="726" font-family="sans-serif" font-size="26" fill="white">View demo</text></svg>`;
  const imagePromises = new Map();
  const imageBytes = (index=0) => {
    if(!imagePromises.has(index))imagePromises.set(index,localRequire('sharp')(Buffer.from(artSvg(index))).png().toBuffer());
    return imagePromises.get(index);
  };

  const context = {
    require:localRequire, URL,URLSearchParams,Buffer,AbortSignal,TextDecoder,Uint8Array,Blob,FormData,
    setInterval:() => ({unref(){}}), process:{env},
    console:{log:m=>logs.push(String(m)),error:m=>logs.push(String(m))}
  };
  context.fetch = async (url, opts={}) => {
    const u=String(url);
    if (/^https:\/\/assets\.example\.com\/creative-\d+\.png$/.test(u) || u.startsWith('https://api.telegram.org/file/botoffline-demo-bot/')) {
      const index=Number(/creative-(\d+)/.exec(u)?.[1]||0);
      return new Response(await imageBytes(index),{headers:{'content-type':'image/png'}});
    }
    if (u==='https://assets.example.com/upload' && opts.method==='PUT') return new Response(null,{status:200});
    if (u==='https://api.telegram.org/botoffline-demo-bot/sendDocument') {
      const form=opts.body, blob=form.get('document');
      documents.push({name:blob.name,bytes:Buffer.from(await blob.arrayBuffer()),caption:form.get('caption')});
      messages.push({method:'sendDocument',payload:{text:form.get('caption'),asset:documents.length-1}});
      return response({ok:true,result:{message_id:++updateId}});
    }
    const body=typeof opts.body==='string' ? JSON.parse(opts.body) : {};
    if (u==='https://api.openai.com/v1/responses') {
      modelCalls++;
      const data=JSON.parse(body.input[0].content[0].text), name=body.text.format.name;
      calls.push({service:'mock model',action:name});
      let value;
      if (name==='task_conversation') {
        const turns=data.conversation || data.messages || [];
        const latest=String(data.message || data.user_message || turns.at?.(-1)?.content || '');
        value={reply:'This is a simulated discussion using the fictional task. The brief, references and approval state remain separate. Use the plan button to review concepts; Generate is always a separate action.',action:'discuss',working_brief:'',selected_numbers:[]};
        if (/revise|change|simplify/i.test(latest)) value={reply:'I will prepare a revised fictional plan for review. No images have been submitted.',action:'revise',working_brief:'Use a simpler demonstration layout with clear spacing.',selected_numbers:[]};
      } else if (name==='concept_exploration') {
        iterations++;
        const n=data.default_outputs || 2;
        const titles=['Paper reveal','Board assembly','Spotlight card','Overview grid'];
        const concepts=Array.from({length:n*2},(_,i)=>({id:`demo-${iterations}-${i+1}`,title:titles[i%titles.length],hook:`Synthetic example ${i+1}`,story:`Fictional demonstration ${iterations}: ${titles[i%titles.length]} shows a sample workspace.`,visual_assembly:`A ${titles[i%titles.length].toLowerCase()} with generous spacing and a reserved text area.`,style:'Simple editorial illustration',placement:'Square demonstration card',reference_use:'Use the declared reference role only.',novelty:`Distinct example layout ${i+1}`}));
        value={needs_clarification:false,question:'',requested_outputs:n,chosen_mode:data.market_adaptation?'preserve':'original',hard_constraints:['Fictional examples only','No additional claims'],reference_policy:'Visual references do not replace task facts.',concepts};
      } else if (name==='concept_critique') {
        const e=data.exploration;
        value={acceptable:true,feedback:'Synthetic review completed.',selected_ids:e.concepts.filter((_,i)=>i%2===0).slice(0,e.requested_outputs).map(c=>c.id),evaluations:e.concepts.map(c=>({concept_id:c.id,reason:'Fits the fictional brief and uses a different example composition.'}))};
      } else if (name==='creative_plan') {
        value={needs_clarification:false,question:'',design_summary:'Fictional Sample Studio workspace preview: two separate English cards. Copy: Sample Studio; Organize sample ideas in one place.; View demo. Outputs in this demo are deterministic placeholders, not generated by an external model.',creatives:data.selected_concepts.map(c=>({label:c.title,prompt:`Fictional Sample Studio demonstration card. Exact copy: Sample Studio; Organize sample ideas in one place.; View demo. Layout: ${c.visual_assembly} No additional claims.`,aspect_ratio:'1:1'}))};
      } else throw new Error('Unimplemented demo model operation');
      return response({status:'completed',usage:{input_tokens:100,output_tokens:50},output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
    }
    if (u==='https://mcp.magnific.com') {
      if (opts.method==='DELETE') return response({});
      if (body.method==='initialize') return response({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-11-25',capabilities:{}}});
      if (body.method==='notifications/initialized') return response({});
      if (body.method!=='tools/call') throw new Error('Unsupported demo protocol operation');
      const {name,arguments:args}=body.params;calls.push({service:'mock image provider',action:name});let result;
      if (name==='images_models_list') result={models:[{slug:'grok-imagine-2',name:'Grok Imagine 2.0',aspectRatios:['1:1']}]};
      else if(name==='account_balance') result={credits:{available:1000},plan:{},simulated:true};
      else if(name==='images_generate'){submissions++;result={creation:{identifier:`demo-image-${submissions}`,status:'queued'}};}
      else if(name==='creation_status') result={status:'completed',results:{url:`https://assets.example.com/creative-${Number(/(\d+)$/.exec(args.creationIdentifier)?.[1]||0)}.png`}};
      else if(name==='creations_request_upload') result={uploads:[{proxyUploadUrl:'https://assets.example.com/upload',path:'demo-reference.png',mimeType:'image/png'}]};
      else if(name==='creations_finalize_upload') result={identifier:'demo-reference',status:'completed'};
      else throw new Error('Unsupported demo image operation: '+name);
      return response({jsonrpc:'2.0',id:body.id,result:{structuredContent:result}});
    }
    throw new Error('Offline demo blocked an unsupported network operation');
  };
  vm.createContext(context);
  vm.runInContext(source+'\nglobalThis.api={encrypt,decrypt,readJob,readTaskConversation,readTelegramRefs,enqueueCreative,confirmCreativeGeneration,handleTelegramUpdate,notifyTaskEvent,runCreativeWorker,runTaskChatWorker};',context);
  context.mockRedis=async command=>{
    const [op,key,...args]=command;
    if(op==='GET')return kv.get(key)??null;
    if(op==='GETDEL'){const v=kv.get(key);kv.delete(key);return v??null;}
    if(op==='SET'){if(args.includes('NX')&&kv.has(key))return null;kv.set(key,args[0]);return 'OK';}
    if(op==='LINDEX')return (kv.get(key)||[]).at(Number(args[0]))??null;
    if(op==='EVAL'&&key.includes('-- chat_enqueue')){
      const [seen,queue,active]=command.slice(3,6),[raw,session]=command.slice(6);
      if(kv.has(seen))return 0;if((kv.get(queue)||[]).length>=20)return -1;
      kv.set(seen,'queued');kv.set(queue,[raw,...(kv.get(queue)||[])]);if(!sets.has(active))sets.set(active,new Set());sets.get(active).add(session);return 1;
    }
    if(op==='EVAL'&&key.includes('-- chat_finish')){
      const [queue,active,raw,session]=command.slice(3),list=kv.get(queue)||[];
      if(list.at(-1)===raw)list.pop();kv.set(queue,list);if(!list.length)sets.get(active)?.delete(session);return 1;
    }
    if(op==='DEL'||op==='EVAL'){kv.delete(op==='EVAL'?args[1]:key);return 1;}
    if(op==='SADD'){if(!sets.has(key))sets.set(key,new Set());sets.get(key).add(args[0]);return 1;}
    if(op==='SREM'){sets.get(key)?.delete(args[0]);return 1;}
    if(op==='SMEMBERS')return [...(sets.get(key)||[])];
    if(op==='LRANGE')return (kv.get(key)||[]).slice(Number(args[0]),Number(args[1])+1);
    if(op==='LPUSH'){kv.set(key,[args[0],...(kv.get(key)||[])]);return kv.get(key).length;}
    if(op==='LTRIM'){kv.set(key,(kv.get(key)||[]).slice(Number(args[0]),Number(args[1])+1));return 'OK';}
    throw new Error('Unsupported demo storage operation');
  };
  context.mockTelegram=async(method,payload)=>{if(method!=='answerCallbackQuery')messages.push({method,payload:clone(payload)});return method==='getFile'?{file_path:'reference.png'}:{message_id:++updateId};};
  context.mockWorksection=async(action,params={})=>{
    calls.push({service:'mock task system',action});
    if(action==='me')return {data:{email:'designer@example.com'}};
    if(action==='get_task_tags')return {data:statusTags};
    if(action==='update_task_tags'){task.tags={[params.plus]:statusTags.find(t=>t.id===String(params.plus))?.title};return {data:{}};}
    if(action==='complete_task'){task.status='done';return {data:{}};}
    if(action==='get_task')return {data:clone(task),accountUrl:'https://demo-workspace.example.com'};
    throw new Error('Unsupported demo task operation');
  };
  vm.runInContext('redisCommand=mockRedis;telegramApi=mockTelegram;worksectionApi=mockWorksection;',context);
  const api=context.api;
  kv.set('magnific:mcp:oauth',api.encrypt({tokens:{access_token:'offline-demo-only',expires_at:Date.now()+3600000}}));
  kv.set('worksection:oauth',api.encrypt({access_token:'offline-demo-only',account_url:'https://demo-workspace.example.com',expires_at:Date.now()+3600000}));
  return {
    api, task, calls, messages, documents,
    async notify(){await api.notifyTaskEvent({action:'post',object:{type:'task',id:TASK}});},
    async send(text){await api.handleTelegramUpdate({message:{message_id:++updateId,chat:{id:Number(CHAT)},text}});},
    async callback(data){await api.handleTelegramUpdate({callback_query:{id:String(++updateId),message:{chat:{id:Number(CHAT)}},data}});},
    async reference(){await api.handleTelegramUpdate({message:{message_id:++updateId,chat:{id:Number(CHAT)},photo:[{file_id:'demo-reference',file_unique_id:'demo-reference',width:900,height:900}]}});},
    async tick(count=1){for(let i=0;i<count;i++){await api.runTaskChatWorker();await api.runCreativeWorker();}},
    async state(){const job=await api.readJob(TASK);return clone({demo:true,task,job,messages,metrics:{modelCalls,submissions,deliveries:documents.length,externalNetworkRequests:0},calls: calls.slice(-30),logs:logs.slice(-10)});},
    preview:index=>artSvg(index),
  };
}
module.exports={createRuntime};
