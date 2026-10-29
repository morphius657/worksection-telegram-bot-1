const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRuntime}=require('./runtime.cjs');
const {createDemoServer}=require('./server.cjs');

test('Offline demo uses real approval gating, delivers two files and completes only on explicit callback',async()=>{
  const r=createRuntime();await r.notify();await r.callback('approve:123');await r.tick(8);
  let state=await r.state();assert.equal(state.job.status,'awaiting_approval');assert.equal(state.metrics.submissions,0);
  await r.tick(12);assert.equal((await r.state()).metrics.submissions,0);
  const button=`generate:123:${state.job.run}`;await r.callback(button);await r.tick(12);
  state=await r.state();assert.equal(state.job.status,'done');assert.equal(state.metrics.submissions,2);assert.equal(state.metrics.deliveries,2);assert.equal(state.task.status,'active');
  assert.notDeepEqual(r.documents[0].bytes,r.documents[1].bytes);
  await r.callback(button);await r.tick(4);assert.equal((await r.state()).metrics.submissions,2);
  await r.callback('complete:123');assert.equal((await r.state()).task.status,'done');assert.equal((await r.state()).metrics.externalNetworkRequests,0);
});
test('Offline cancellation invalidates the old Generate button',async()=>{
  const r=createRuntime();await r.callback('approve:123');await r.tick(8);const job=(await r.state()).job;
  await r.send('/cancel 123');await r.callback(`generate:123:${job.run}`);await r.tick(8);
  const state=await r.state();assert.equal(state.job.status,'cancelled');assert.equal(state.metrics.submissions,0);
});
test('Sample reference needs an explicit role and does not start paid work',async()=>{
  const r=createRuntime();await r.send('/talk 123');await r.reference();let state=await r.state();
  const buttons=state.messages.flatMap(m=>(m.payload.reply_markup?.inline_keyboard||[]).flat());
  const visual=buttons.find(b=>b.callback_data?.endsWith(':visual'));assert.ok(visual);
  await r.callback(visual.callback_data);await r.tick(3);
  assert.equal((await r.api.readTelegramRefs('123')).at(-1).role,'visual_reference');assert.equal((await r.state()).metrics.submissions,0);
});
test('Local HTTP demo renders, exposes only synthetic state and rejects unknown actions and cross-origin mutation',async t=>{
  const server=createDemoServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(base)).text(),/OFFLINE DEMO/);
  const state=await (await fetch(base+'/api/state')).json();assert.equal(state.demo,true);assert.equal(state.metrics.submissions,0);
  const send=body=>fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await send({action:'notify'})).status,200);assert.equal((await send({action:'not-an-action'})).status,400);
  assert.equal((await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json',origin:'http://unrelated.example.com'},body:'{"action":"reset"}'})).status,403);
});
