const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(__dirname + '/server.js', 'utf8').split("server.listen(port, '0.0.0.0'")[0];
function harness(options = {}) {
  const kv = options.kv || new Map();
  const sets = options.sets || new Map();
  const messages = [], calls = [], logs = [], requests = [], worksectionCalls = [];
  let planCalls = 0, submissions = 0, uploads = 0, failSubmit = false;
  const context = { require, URL, URLSearchParams, Buffer, AbortSignal, TextDecoder, Uint8Array, setInterval, Blob, FormData,
    process: { env: { SESSION_SECRET: 'test-session', TELEGRAM_BOT_TOKEN: 'test-bot', TELEGRAM_CHAT_ID: '42', OPENAI_API_KEY: 'test-openai', PUBLIC_BASE_URL: 'https://bot.example.com', UPSTASH_REDIS_REST_URL: 'https://redis.example.com', UPSTASH_REDIS_REST_TOKEN: 'test-redis', ...(options.env || {}) } },
    console: { log: x => logs.push(x), error: x => logs.push(x) }
  };
  const response = body => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body, body: { cancel: async () => {} } });
  context.fetch = async (url, opts = {}) => {
    if (url === 'https://assets.example.com/creative.png') return new Response(options.generatedImage || Buffer.from('mock-image-bytes'), { headers: { 'content-type': 'image/png' } });
    if (String(url).startsWith('https://demo-workspace.example.com/api/oauth2?action=download&')) return options.badReference
      ? new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } })
      : new Response(Buffer.from('89504e470d0a1a0a00000000', 'hex'), { headers: { 'content-type': 'application/octet-stream' } });
    if (String(url).startsWith('https://api.telegram.org/file/bottest-bot/')) return new Response(options.logoImage || Buffer.from('89504e470d0a1a0a00000000', 'hex'), { headers: { 'content-type': 'image/png' } });
    if (url === 'https://ak-data.magnific.com/private-reference') {
      assert.equal(opts.method, 'PUT');
      assert.equal(opts.headers['Content-Type'], 'image/png');
      assert.ok(Buffer.from(opts.body).length > 0);
      uploads++;
      return new Response(null, { status: 200 });
    }
    if (url === 'https://api.telegram.org/bottest-bot/sendDocument') {
      assert.ok(opts.body instanceof FormData);
      assert.match(opts.body.get('document').name, /^creative-\d+\.png$/);
      messages.push({ method: 'sendDocument', payload: { chat_id: opts.body.get('chat_id') } });
      return response({ ok: true, result: { message_id: 1 } });
    }
    const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
    if (url === 'https://api.openai.com/v1/responses') {
      planCalls++;
      requests.push(body);
      assert.equal(body.store, false);
      const n = (options.creatives || [{}]).length;
      const concepts = Array.from({ length: n * 2 }, (_, i) => ({ id: `idea-${i + 1}`, title: `Idea ${i + 1}`, hook: `Distinct hook ${i + 1}`, story: `Distinct narrative mechanism ${i + 1}`, visual_assembly: `Intentional composition ${i + 1}`, style: 'Requested style', placement: 'Main', reference_use: options.references ? 'Use logo only' : 'No image reference supplied', novelty: `Different narrative ${i + 1}` }));
      const name = body.text.format.name;
      const value = name === 'task_conversation' ? (typeof options.chatReply === 'function' ? options.chatReply(JSON.parse(body.input[0].content[0].text)) : options.chatReply || { reply: 'Let us develop a stronger hook.', action: 'discuss', working_brief: '', selected_numbers: [] }) : name === 'concept_exploration'
        ? (options.exploration || { needs_clarification: !!options.clarify, question: options.clarify ? 'Which offer?' : '', requested_outputs: n, chosen_mode: options.mode || 'original', hard_constraints: ['Static square image'], reference_policy: 'Use assets for their explicit role', concepts: options.clarify ? [] : concepts })
        : name === 'concept_critique'
          ? (options.critique || { acceptable: true, feedback: '', selected_ids: concepts.slice(0, n).map(c => c.id), evaluations: concepts.map(c => ({ concept_id: c.id, reason: 'Distinct hook and visual execution, grounded in supplied brief.' })) })
          : { needs_clarification: false, question: '', design_summary: 'One square desktop ad with the supplied offer and localized CTA.', creatives: options.creatives || [{ label: 'Main creative', prompt: 'Create a premium ad with the exact approved offer and compact CTA. Square layout, 10% safe margins.', aspect_ratio: '1:1' }] };
      return response({ status: 'completed', usage: { input_tokens: 10000, input_tokens_details: { cached_tokens: 2000 }, output_tokens: 1000 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
    }
    assert.equal(url, 'https://mcp.magnific.com');
    if (opts.method === 'DELETE') return response({});
    if (body.method === 'initialize') return response({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25', capabilities: {} } });
    if (body.method === 'notifications/initialized') return response({});
    assert.equal(body.method, 'tools/call');
    calls.push(body.params);
    const { name, arguments: args } = body.params;
    let result;
    if (name === 'images_models_list') result = { models: options.noGrok ? [] : [{ slug: 'grok-imagine-2', name: 'Grok Imagine 2.0', aspectRatios: ['1:1', '16:9'] }] };
    else if (name === 'account_balance') result = { credits: { available: 1000 }, plan: {} };
    else if (name === 'creations_request_upload') {
      assert.equal(args.mimeType, 'image/png');
      assert.equal(args.count, 1);
      result = { uploads: [{ proxyUploadUrl: 'https://ak-data.magnific.com/private-reference', path: 'temp/private-reference.png', mimeType: 'image/png' }] };
    }
    else if (name === 'creations_finalize_upload') {
      assert.equal(args.path, 'temp/private-reference.png');
      assert.match(args.fileName, /\.(png|jpe?g|webp)$/i);
      assert.equal(args.visible, false);
      result = { identifier: 'uploaded-ref', status: 'completed' };
    }
    else if (name === 'images_generate') {
      submissions++;
      assert.equal(args.mode, 'grok-imagine-2');
      assert.equal(args.count, 1);
      assert.equal(args.quality, 'medium');
      assert.equal(args.resolution, undefined);
      if (failSubmit) throw new Error('Network interrupted');
      result = { creation: { identifier: 'grok-' + submissions, status: 'queued' } };
    } else if (name === 'creation_status') result = { status: 'completed', results: { url: 'https://assets.example.com/creative.png' } };
    else throw new Error('Unexpected tool ' + name);
    return response({ jsonrpc: '2.0', id: 2, result: { structuredContent: result } });
  };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.api = { enqueueCreative, runCreativeWorker, readJob, encrypt, decrypt, handleTelegramUpdate, notifyTaskEvent, serveReference, referenceUrl, parseMcpResponse, magnificAuthRoute, magnificAccessToken, safeError, creativeKnowledge, creativeMemoryCommand, confirmCreativeGeneration, recentConcepts, creativeCommand, conversationCommand, runTaskChatWorker, readTaskConversation, mergeReferences, readTelegramRefs, saveTelegramRefs, critiqueWithAgent, configureTelegramWebhook, insertExactBrandLogo };', context);
  context.mockRedis = async command => {
    const [op, key, ...args] = command;
    if (op === 'GET') return kv.get(key) ?? null;
    if (op === 'GETDEL') { const value = kv.get(key); kv.delete(key); return value ?? null; }
    if (op === 'SET') { if (args.includes('NX') && kv.has(key)) return null; kv.set(key, args[0]); return 'OK'; }
    if (op === 'LINDEX') { const list = kv.get(key) || []; return list.at(Number(args[0])) ?? null; }
    if (op === 'EVAL' && key.includes('-- chat_enqueue')) {
      const [seen, queue, active] = command.slice(3, 6);
      const [raw, session] = command.slice(6);
      if (kv.has(seen)) return 0;
      if ((kv.get(queue) || []).length >= 20) return -1;
      kv.set(seen, 'queued'); kv.set(queue, [raw, ...(kv.get(queue) || [])]);
      if (!sets.has(active)) sets.set(active, new Set()); sets.get(active).add(session); return 1;
    }
    if (op === 'EVAL' && key.includes('-- chat_finish')) {
      const [queue, active, raw, session] = command.slice(3);
      const list = kv.get(queue) || [];
      if (list.at(-1) === raw) list.pop();
      kv.set(queue, list);
      if (!list.length) sets.get(active)?.delete(session);
      return 1;
    }
    if (op === 'DEL' || op === 'EVAL') { kv.delete(op === 'EVAL' ? args[1] : key); return 1; }
    if (op === 'SADD') { if (!sets.has(key)) sets.set(key, new Set()); sets.get(key).add(args[0]); return 1; }
    if (op === 'SREM') { sets.get(key)?.delete(args[0]); return 1; }
    if (op === 'SMEMBERS') return [...(sets.get(key) || [])];
    if (op === 'LRANGE') return (kv.get(key) || []).slice(Number(args[0]), Number(args[1]) + 1);
    if (op === 'LPUSH') { kv.set(key, [args[0], ...(kv.get(key) || [])]); return kv.get(key).length; }
    if (op === 'LTRIM') { kv.set(key, (kv.get(key) || []).slice(Number(args[0]), Number(args[1]) + 1)); return 'OK'; }
    throw new Error('Unexpected Redis command ' + op);
  };
  context.mockTelegram = async (method, payload) => { messages.push({ method, payload }); return method === 'getFile' ? { file_path: 'reference.png' } : { message_id: 1 }; };
  context.mockWorksection = async (action, params) => {
    worksectionCalls.push({ action, params });
    if (action === 'me') return { data: { email: 'owner@example.com' } };
    if (action === 'get_task_tags') return { data: options.taskTags || [] };
    if (action === 'update_task_tags') return { data: {} };
    if (action === 'complete_task') return { data: {} };
    return { data: options.task || { name: 'Updated brief', text: 'Make a new creative', files: [], user_to: { email: 'owner@example.com' } }, accountUrl: 'https://demo-workspace.example.com' };
  };
  vm.runInContext('redisCommand = mockRedis; telegramApi = mockTelegram; worksectionApi = mockWorksection;', context);
  const api = context.api;
  const rawWorker = api.runCreativeWorker;
  api.rawWorker = rawWorker;
  // Existing integration cases drain text-only planning passes, then exercise image stages individually.
  api.runCreativeWorker = async () => {
    for (let pass = 0; pass < 7; pass++) {
      await rawWorker();
      const job = await api.readJob('123');
      if (!job || job.status !== 'active' || job.phase !== 'queued') return;
    }
  };
  if (!options.disconnected) kv.set('magnific:mcp:oauth', api.encrypt({ tokens: { access_token: 'test-token', expires_at: Date.now() + 3600000 } }));
  if (!kv.has('worksection:oauth')) kv.set('worksection:oauth', api.encrypt({ access_token: 'test-worksection-token', account_url: 'https://demo-workspace.example.com', expires_at: Date.now() + 3600000 }));
  const brief = { task: { name: 'Test task', text: 'Create a square image advertising our app. CTA: View demo.', files: options.references ? [{ id: '7', name: 'logo.png' }] : [] }, accountUrl: 'https://demo-workspace.example.com' };
  if (!kv.has('creative:brief:123')) kv.set('creative:brief:123', api.encrypt(brief));
  return { api, context, kv, sets, messages, calls, logs, requests, worksectionCalls, metrics: () => ({ planCalls, submissions, uploads }), setFail: v => { failSubmit = v; } };
}
const statusTags = [
  { id: '10', title: 'Queued', group: { id: '1', type: 'status' } },
  { id: '11', title: 'In progress', group: { id: '1', type: 'status' } },
  { id: '12', title: 'Awaiting review', group: { id: '1', type: 'status' } },
  { id: '13', title: 'Done', group: { id: '1', type: 'status' } },
  { id: '99', title: 'Important', group: { id: '2', type: 'label' } }
];
test('Task notification and delivered files identify the task creator separately from the assignee', async () => {
  const task = { name: 'Brand campaign', text: 'Brief', files: [], status: 'active', user_from: { name: 'Project Manager', email: 'manager@example.com' }, user_to: { email: 'owner@example.com' } };
  const h = harness({ task });
  await h.api.notifyTaskEvent({ action: 'post', object: { type: 'task', id: 123 } });
  assert.match(h.messages.find(m => m.payload.text?.includes('New Worksection task')).payload.text, /Created by: Project Manager \(manager@example\.com\)\nAssigned to: owner@example\.com/);
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text: '/task 123' } });
  assert.ok(h.messages.some(m => m.payload.text?.includes('Created by: Project Manager (manager@example.com)')));
});
test('Logo upload is identified directly and retained as an asset, not a new offer', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text: '/logo 123' } });
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, message_id: 515, document: { file_id: 'logo-file', file_unique_id: 'unique-logo', file_name: 'approved.png', mime_type: 'image/png' } } });
  assert.equal(h.messages.some(m => m.payload.text?.includes('what is this image?')), false);
  await h.api.runTaskChatWorker();
  const refs = await h.api.readTelegramRefs('123');
  assert.equal(refs.at(-1).role, 'brand_logo');
  assert.equal(h.messages.some(m => m.payload.text?.includes('saved this upload as the exact brand logo')), true);
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const job = await h.api.readJob('123');
  assert.equal(job.references.at(-1).role, 'brand_logo');
  assert.equal(h.calls.filter(c => c.name === 'creations_request_upload').length, 0);
  assert.ok(h.requests.some(r => String(r.instructions).includes('EXACT BRAND ASSET OVERRIDE')));
  await h.api.confirmCreativeGeneration('123', job.run, '42');
  await h.api.rawWorker();
  const generation = h.calls.find(c => c.name === 'images_generate');
  assert.ok(generation);
  assert.equal(generation.arguments.references, undefined);
  assert.match(generation.arguments.prompt, /exact approved logo will be inserted/i);
});
test('A logo requested in Talk is accepted on the next uncaptioned upload without another role prompt', async () => {
  const h = harness({ chatReply: { reply: 'Please upload the exact approved logo artwork to use.', action: 'discuss', working_brief: '', selected_numbers: [] } });
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text: '/talk 123' } });
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, message_id: 604, text: 'Correct only the logo.' } });
  await h.api.runTaskChatWorker();
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, message_id: 605, document: { file_id: 'exact', file_name: 'studio.png', mime_type: 'image/png' } } });
  assert.equal(h.messages.filter(m => m.payload.text?.includes('what is this image?')).length, 0);
  await h.api.runTaskChatWorker();
  assert.equal((await h.api.readTelegramRefs('123')).at(-1).role, 'brand_logo');
});
test('mark_logo reuses an existing saved Telegram image and invalidates an old ungenerated plan', async () => {
  const h = harness();
  await h.api.saveTelegramRefs('123', [{ source: 'telegram', file_id: 'old-logo', file_unique_id: 'old-logo', name: 'approved.png', role: 'visual_reference' }]);
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).status, 'awaiting_approval');
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text: '/mark_logo 123' } });
  assert.equal((await h.api.readTelegramRefs('123')).at(-1).role, 'brand_logo');
  assert.equal((await h.api.readJob('123')).status, 'needs_changes');
  assert.ok(h.messages.some(m => m.payload.text?.includes('approved.png is now the exact brand logo')));
});
test('Exact logo artwork is composited as pixels after generation', async () => {
  const sharp = require('sharp');
  const generatedImage = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#002244' } }).png().toBuffer();
  const logoImage = await sharp({ create: { width: 80, height: 20, channels: 4, background: '#ef0000' } }).png().toBuffer();
  const h = harness({ generatedImage, logoImage });
  const result = await h.api.insertExactBrandLogo(generatedImage, { source: 'telegram', file_id: 'brand', name: 'logo.png' });
  const platePixel = await sharp(result).extract({ left: 80, top: 34, width: 1, height: 1 }).raw().toBuffer();
  assert.deepEqual([...platePixel].slice(0, 3), [239, 0, 0]);
  const untouchedPixel = await sharp(result).extract({ left: 350, top: 350, width: 1, height: 1 }).raw().toBuffer();
  assert.deepEqual([...untouchedPixel].slice(0, 3), [0, 34, 68]);
});
test('New assigned task offers only Queue/In work status controls, preserving other tags', async () => {
  const task = { name: 'New creative', text: 'Offer details', files: [], status: 'active', user_to: { email: 'owner@example.com' }, tags: { 12: 'Awaiting review', 99: 'Important' } };
  const h = harness({ task, taskTags: statusTags });
  await h.api.notifyTaskEvent({ action: 'post', object: { type: 'task', id: 123 } });
  const notification = h.messages.find(m => m.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'status:123:queue');
  assert.ok(notification);
  assert.deepEqual(Array.from(notification.payload.reply_markup.inline_keyboard[0], item => item.callback_data), ['status:123:queue', 'status:123:work']);
  await h.api.handleTelegramUpdate({ callback_query: { id: 'status1', message: { chat: { id: 42 } }, data: 'status:123:work' } });
  assert.deepEqual(JSON.parse(JSON.stringify(h.worksectionCalls.find(call => call.action === 'update_task_tags').params)), { id_task: '123', plus: '11', minus: '12' });
  assert.equal(h.worksectionCalls.some(call => call.action === 'complete_task'), false);
  assert.equal(h.metrics().submissions, 0);
});
test('Status update rejects reassigned tasks; status-change webhook does not offer another choice', async () => {
  const task = { name: 'Task', status: 'active', text: 'Brief', files: [], user_to: { email: 'owner@example.com' }, tags: { 10: 'Queued' } };
  const h = harness({ task, taskTags: statusTags });
  await h.api.notifyTaskEvent({ action: 'post', object: { type: 'task', id: 123 } });
  await h.api.notifyTaskEvent({ action: 'update', object: { type: 'task', id: 123 } });
  assert.equal(h.messages.filter(m => m.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'status:123:queue').length, 1);
  task.user_to.email = 'another@example.com';
  await h.api.handleTelegramUpdate({ callback_query: { id: 'status2', message: { chat: { id: 42 } }, data: 'status:123:work' } });
  assert.equal(h.worksectionCalls.some(call => call.action === 'update_task_tags'), false);
});
test('Worksection completion requires delivered creatives and an explicit button', async () => {
  const task = { name: 'Task', status: 'active', text: 'Brief', files: [], user_to: { email: 'owner@example.com' }, tags: {} };
  const h = harness({ task });
  await h.api.handleTelegramUpdate({ callback_query: { id: 'complete-before', message: { chat: { id: 42 } }, data: 'complete:123' } });
  assert.equal(h.worksectionCalls.some(call => call.action === 'complete_task'), false);
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const plan = await h.api.readJob('123');
  await h.api.confirmCreativeGeneration('123', plan.run, '42');
  await h.api.runCreativeWorker();
  await h.api.runCreativeWorker();
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).status, 'done');
  assert.ok(h.messages.some(m => m.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'complete:123'));
  assert.equal(h.worksectionCalls.some(call => call.action === 'complete_task'), false);
  await h.api.handleTelegramUpdate({ callback_query: { id: 'complete-after', message: { chat: { id: 42 } }, data: 'complete:123' } });
  assert.equal(h.worksectionCalls.filter(call => call.action === 'complete_task').length, 1);
});
test('Planning and chat keep English explanations separate from target-language artwork copy', async () => {
  const h = harness();
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const byName = Object.fromEntries(h.requests.map(request => [request.text.format.name, request.instructions]));
  assert.match(byName.concept_exploration, /every concept's title, hook, story, visual_assembly/);
  assert.match(byName.concept_critique, /evaluation reasons in English/);
  assert.match(byName.creative_plan, /all image-prompt instructions in English/);
  assert.match(byName.creative_plan, /requested language/);
  await h.api.handleTelegramUpdate({ message: { message_id: 670, chat: { id: 42 }, text: '/talk 123' } });
  await h.api.handleTelegramUpdate({ message: { message_id: 671, chat: { id: 42 }, text: 'Explain this plan in English; the ad stays in a requested target language.' } });
  await h.api.runTaskChatWorker();
  const chat = h.requests.find(request => request.text.format.name === 'task_conversation');
  assert.ok(chat);
  assert.match(chat.instructions, /Always write your reply and explanatory working_brief in English/);
  assert.match(chat.instructions, /summarize the actual existing plan in English/);
  assert.match(chat.instructions, /visible ad copy/);
});
test('Cancel invalidates an ungenerated plan, queued chat and its old Generate button', async () => {
  const h = harness();
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const before = await h.api.readJob('123');
  assert.equal(before.status, 'awaiting_approval');
  await h.api.handleTelegramUpdate({ message: { message_id: 700, chat: { id: 42 }, text: '/talk 123' } });
  await h.api.handleTelegramUpdate({ message: { message_id: 701, chat: { id: 42 }, text: 'Explain this offer.' } });
  assert.equal(h.kv.get('creative:chat:queue:42:123').length, 1);
  await h.api.handleTelegramUpdate({ message: { message_id: 702, chat: { id: 42 }, text: '/cancel 123' } });
  assert.equal((await h.api.readJob('123')).status, 'cancelled');
  assert.equal(h.kv.has('creative:chat:queue:42:123'), false);
  await h.api.confirmCreativeGeneration('123', before.run, '42');
  await h.api.runCreativeWorker();
  await h.api.runTaskChatWorker();
  assert.equal(h.metrics().submissions, 0);
  assert.equal(h.metrics().planCalls, 3);
  assert.ok(h.messages.some(m => m.payload.text?.includes('No image generation was started')));
});
test('Cancel after paid approval stops later submissions and reports possible provider charge', async () => {
  const h = harness({ creatives: Array.from({ length: 2 }, (_, i) => ({ label: `Ad ${i + 1}`, prompt: `Make ad ${i + 1}`, aspect_ratio: '1:1' })) });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const plan = await h.api.readJob('123');
  await h.api.confirmCreativeGeneration('123', plan.run, '42');
  await h.api.rawWorker();
  assert.equal(h.metrics().submissions, 1);
  await h.api.handleTelegramUpdate({ message: { message_id: 703, chat: { id: 42 }, text: '/cancel 123' } });
  await h.api.rawWorker();
  assert.equal((await h.api.readJob('123')).status, 'cancelled');
  assert.equal(h.metrics().submissions, 1);
  assert.ok(h.messages.some(m => m.payload.text?.includes('may still consume credits')));
});
test('Guided market adaptation uses completed source concepts and requires new generation approval', async () => {
  const h = harness({ mode: 'preserve', creatives: [
    { label: 'Paper reveal', prompt: 'Print target-language Sample Notes offer in a paper reveal layout.', aspect_ratio: '1:1' },
    { label: 'Feature cards', prompt: 'Print target-language offer on a three-feature board.', aspect_ratio: '1:1' }
  ] });
  h.kv.set('creative:job:123', h.api.encrypt({ id: '123', run: 'original-run', status: 'done', phase: 'complete',
    title: 'Sample Notes', description: 'Offer: Explore a fictional note-taking workspace.', correction: '', references: [],
    items: [
      { label: 'Paper reveal', prompt: 'Print target-language Sample Notes offer in a paper reveal layout.', aspect_ratio: '1:1', concept: { title: 'Paper arrangement', story: 'A sheet unfolds to reveal a fictional workspace.' } },
      { label: 'Feature cards', prompt: 'Print target-language offer on a three-feature board.', aspect_ratio: '1:1', concept: { title: 'Number board', story: 'A sequence of three sample feature cards.' } }
    ], index: 2, count: 2 }));
  const send = async text => h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text } });
  await send('/adapt');
  await send('Demo Region A | Demo Language A | Keep original numeric terms.');
  await send('123');
  let job = await h.api.readJob('123');
  assert.equal(job.marketAdaptation.country, 'Demo Region A');
  assert.equal(job.marketAdaptation.language, 'Demo Language A');
  assert.equal(job.marketAdaptation.sourceItems.length, 2);
  assert.equal(job.directionMode, 'preserve');
  assert.equal(h.metrics().submissions, 0);
  await h.api.runCreativeWorker();
  job = await h.api.readJob('123');
  assert.equal(job.status, 'awaiting_approval');
  assert.equal(job.items.length, 2);
  assert.equal(h.metrics().submissions, 0);
  for (const request of h.requests) {
    assert.match(request.instructions, /MARKET ADAPTATION/);
    assert.match(request.input[0].content[0].text, /Demo Region A/);
    assert.match(request.input[0].content[0].text, /Paper reveal/);
  }
  assert.ok(h.messages.some(m => /Adaptation for Demo Region A \(Demo Language A\)/.test(m.payload.text)));
  await h.api.confirmCreativeGeneration('123', 'original-run', '42');
  assert.equal(h.metrics().submissions, 0);
  await h.api.confirmCreativeGeneration('123', job.run, '42');
  await h.api.rawWorker();
  assert.equal(h.metrics().submissions, 1);
});

test('An unfinished job cannot be adapted; cancel selection leaves its plan alone', async () => {
  const h = harness();
  const send = async text => h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text } });
  await send('/adapt'); await send('Demo Region A | Demo Language A'); await send('123');
  assert.equal(await h.api.readJob('123'), null);
  assert.ok(h.messages.some(m => /no completed creative batch/.test(m.payload.text)));
  await send('/adapt'); await send('/adapt cancel');
  assert.equal(h.kv.has('creative:adapt:pending:42'), false);
});
test('A second market starts from the original creative, and regeneration keeps its target market', async () => {
  const h = harness({ mode: 'preserve' });
  h.kv.set('creative:job:123', h.api.encrypt({ id: '123', run: 'original', status: 'done', title: 'Sample Notes',
    description: 'Original offer', correction: '', references: [], items: [{ label: 'Paper', prompt: 'target-language paper layout', aspect_ratio: '1:1' }], index: 1, count: 1 }));
  const send = async text => h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text } });
  await send('/adapt'); await send('Demo Region A | Demo Language A'); await send('123');
  let job = await h.api.readJob('123');
  job.status = 'done'; job.items = [{ label: 'Demo Language A variation', prompt: 'Demo Language A street poster', aspect_ratio: '1:1' }];
  h.kv.set('creative:job:123', h.api.encrypt(job));
  await send('/adapt'); await send('Demo Region B | Demo Language B'); await send('123');
  job = await h.api.readJob('123');
  assert.equal(job.marketAdaptation.country, 'Demo Region B');
  assert.equal(job.marketAdaptation.sourceItems[0].prompt, 'target-language paper layout');
  job.status = 'needs_changes'; h.kv.set('creative:job:123', h.api.encrypt(job));
  await send('/regenerate 123');
  const revised = await h.api.readJob('123');
  assert.equal(revised.marketAdaptation.country, 'Demo Region B');
  assert.equal(revised.marketAdaptation.sourceItems[0].prompt, 'target-language paper layout');
  assert.notEqual(revised.run, job.run);
});
test('Help buttons guide task selection, switch actions, and list commands in Telegram', async () => {
  const h = harness();
  const send = async text => h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text } });
  const click = async action => h.api.handleTelegramUpdate({ callback_query: { id: 'menu-test', message: { chat: { id: 42 } }, data: `menu:${action}` } });
  await h.api.configureTelegramWebhook();
  const registered = h.messages.find(m => m.method === 'setMyCommands');
  assert.ok(registered.payload.commands.some(c => c.command === 'help'));
  assert.ok(registered.payload.commands.some(c => c.command === 'adapt'));
  await send('/start');
  assert.ok(h.messages.some(m => m.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'menu:plan'));
  await click('talk');
  assert.equal(h.kv.get('creative:menu:pending:42'), 'talk');
  await send('123');
  assert.equal(h.kv.get('creative:chat:task:42'), '123');
  await click('job');
  await send('/help');
  assert.equal(h.kv.has('creative:menu:pending:42'), false);
  await click('adapt');
  assert.ok(h.kv.has('creative:adapt:pending:42'));
  await click('commands');
  assert.equal(h.kv.has('creative:adapt:pending:42'), false);
  assert.ok(h.messages.some(m => m.payload.text?.includes('/clear_refs TASK_ID')));
});
test('Approval → prompts → exact Grok model → restart → original Telegram file; duplicate approval does not charge', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate({ callback_query: { id: 'query1', message: { chat: { id: 42 } }, data: 'approve:123' } });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const plan = await h.api.readJob('123');
  assert.equal(plan.status, 'awaiting_approval');
  assert.equal(h.metrics().submissions, 0);
  await h.api.confirmCreativeGeneration('123', plan.run, '42');
  await h.api.runCreativeWorker();
  assert.deepEqual(h.metrics(), { planCalls: 3, submissions: 1, uploads: 0 });
  const restarted = harness({ kv: h.kv, sets: h.sets });
  await restarted.api.runCreativeWorker();
  await restarted.api.runCreativeWorker();
  const job = await restarted.api.readJob('123');
  assert.equal(job.status, 'done');
  assert.equal(job.index, 1);
  assert.equal(restarted.messages.filter(m => m.method === 'sendDocument').length, 1);
  await restarted.api.enqueueCreative('123', '42');
  await restarted.api.runCreativeWorker();
  assert.equal(restarted.metrics().submissions, 0);
});
test('Interrupted paid request is not automatically submitted again', async () => {
  const h = harness();
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  await h.api.confirmCreativeGeneration('123', (await h.api.readJob('123')).run, '42');
  h.setFail(true);
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).status, 'failed');
  await h.api.runCreativeWorker();
  await h.api.enqueueCreative('123', '42');
  assert.equal(h.metrics().submissions, 1);
  h.setFail(false);
  await h.api.enqueueCreative('123', '42', 'retry');
  await h.api.runCreativeWorker();
  assert.equal(h.metrics().submissions, 2);
  assert.equal((await h.api.readJob('123')).phase, 'waiting');
});
test('Missing exact model stops before OpenAI or image generation', async () => {
  const h = harness({ noGrok: true });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).status, 'failed');
  assert.equal(h.metrics().submissions, 0);
  assert.equal(h.metrics().planCalls, 0);
});
test('Disconnected account and unauthorized chat cannot start generation', async () => {
  const h = harness({ disconnected: true });
  await h.api.enqueueCreative('123', '42');
  await h.api.enqueueCreative('123', '99');
  assert.equal(await h.api.readJob('123'), null);
  assert.equal(h.metrics().submissions, 0);
});
test('Clarification pauses before paid images', async () => {
  const h = harness({ clarify: true });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).status, 'needs_changes');
  assert.equal(h.metrics().submissions, 0);
});
test('Reference assets uploaded once and passed to exact Grok generator', async () => {
  const h = harness({ references: true });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  await h.api.runCreativeWorker();
  await h.api.confirmCreativeGeneration('123', (await h.api.readJob('123')).run, '42');
  await h.api.runCreativeWorker();
  assert.equal(h.metrics().uploads, 1);
  assert.ok(h.calls.some(c => c.name === 'creations_request_upload'));
  assert.ok(h.calls.some(c => c.name === 'creations_finalize_upload'));
  assert.equal(h.calls.find(c => c.name === 'creations_finalize_upload').arguments.fileName, 'logo.png');
  assert.equal(h.calls.some(c => c.name === 'creations_upload_image'), false);
  const call = h.calls.find(c => c.name === 'images_generate');
  assert.equal(call.arguments.references[0].identifier, 'uploaded-ref');
});
test('Malformed reference URLs are rejected without retrieving a file', async () => {
  const h = harness();
  let status;
  const res = { writeHead: s => { status = s; }, end: () => {} };
  await h.api.serveReference({ method: 'GET' }, res, new URL('https://bot.example.com/references/123/abcdef/0?expires=1&sig=bad'));
  assert.equal(status, 403);
});
test('Private attachment returning an HTML sign-in page stops before upload or paid images', async () => {
  const h = harness({ references: true, badReference: true });
  await h.api.enqueueCreative('123', '42');
  await h.api.rawWorker();
  assert.equal((await h.api.readJob('123')).status, 'failed');
  assert.equal(h.metrics().uploads, 0);
  assert.equal(h.metrics().submissions, 0);
  assert.ok(h.messages.some(m => m.payload.text?.includes('No image generation was submitted')));
});
test('SSE result reader returns matching JSON-RPC response and cancels stream', async () => {
  const h = harness();
  const bytes = new TextEncoder().encode('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"status":"ready"}}\n\n');
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
  const result = await h.api.parseMcpResponse(response, 2);
  assert.equal(result.status, 'ready');
});
test('Unauthorized OAuth callback cannot replace token', async () => {
  const h = harness();
  const before = h.kv.get('magnific:mcp:oauth');
  let status;
  const res = { writeHead: s => { status = s; }, end: () => {} };
  await h.api.magnificAuthRoute({ method: 'GET' }, res, new URL('https://bot.example.com/magnific/callback?code=bad&state=invalid'));
  assert.equal(status, 400);
  assert.equal(h.kv.get('magnific:mcp:oauth'), before);
});
test('Magnific OAuth: discovery, dynamic registration, PKCE, callback and model access check', async () => {
  const h = harness({ disconnected: true });
  const originalFetch = h.context.fetch;
  const reply = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  let challenge, verifier;
  h.context.fetch = async (url, opts = {}) => {
    if (url === 'https://mcp.magnific.com/.well-known/oauth-protected-resource') return reply({ resource: 'https://mcp.magnific.com', authorization_servers: ['https://mcp.magnific.com'], scopes_supported: ['mcp'] });
    if (url === 'https://mcp.magnific.com/.well-known/oauth-authorization-server') return reply({ issuer: 'https://mcp.magnific.com', authorization_endpoint: 'https://mcp.magnific.com/authorize', token_endpoint: 'https://mcp.magnific.com/token', registration_endpoint: 'https://mcp.magnific.com/register', code_challenge_methods_supported: ['S256'] });
    if (url === 'https://mcp.magnific.com/register') {
      const body = JSON.parse(opts.body);
      assert.equal(body.redirect_uris[0], 'https://bot.example.com/magnific/callback');
      assert.equal(body.token_endpoint_auth_method, 'none');
      return reply({ client_id: 'registered-client', token_endpoint_auth_method: 'none' });
    }
    if (url === 'https://mcp.magnific.com/token') {
      const body = new URLSearchParams(opts.body);
      verifier = body.get('code_verifier');
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('client_id'), 'registered-client');
      assert.equal(body.get('resource'), 'https://mcp.magnific.com');
      return reply({ access_token: 'new-access-token', refresh_token: 'new-refresh-token', expires_in: 3600 });
    }
    return originalFetch(url, opts);
  };
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = require('node:crypto').createHmac('sha256', 'test-session').update(`${ts}:42`).digest('hex');
  let status, headers;
  const res = { writeHead: (s, h) => { status = s; headers = h; }, end: () => {} };
  await h.api.magnificAuthRoute({ method: 'GET' }, res, new URL(`https://bot.example.com/magnific/connect?ts=${ts}&chat=42&sig=${sig}`));
  assert.equal(status, 302);
  const target = new URL(headers.Location);
  challenge = target.searchParams.get('code_challenge');
  const state = target.searchParams.get('state');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  await h.api.magnificAuthRoute({ method: 'GET' }, res, new URL(`https://bot.example.com/magnific/callback?state=${state}&code=authorization-code`));
  assert.equal(status, 200);
  assert.equal(challenge, require('node:crypto').createHash('sha256').update(verifier).digest('base64url'));
  const record = h.api.decrypt(h.kv.get('magnific:mcp:oauth'));
  assert.equal(record.tokens.access_token, 'new-access-token');
  assert.equal(record.verifier, undefined);
  assert.equal(h.kv.has(`magnific:state:${state}`), false);
  assert.equal(h.metrics().submissions, 0);
});
test('Expired Magnific OAuth tokens refresh without generation', async () => {
  const h = harness();
  h.kv.set('magnific:mcp:oauth', h.api.encrypt({ auth: { resource: 'https://mcp.magnific.com', metadata: { token_endpoint: 'https://mcp.magnific.com/token' } }, client: { client_id: 'client', token_endpoint_auth_method: 'none' }, tokens: { access_token: 'expired', refresh_token: 'refresh', expires_at: 0 } }));
  h.context.fetch = async (url, options) => {
    assert.equal(url, 'https://mcp.magnific.com/token');
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('grant_type'), 'refresh_token');
    assert.equal(form.get('refresh_token'), 'refresh');
    return new Response(JSON.stringify({ access_token: 'refreshed', expires_in: 3600 }), { headers: { 'content-type': 'application/json' } });
  };
  assert.equal(await h.api.magnificAccessToken(), 'refreshed');
  assert.equal(h.api.decrypt(h.kv.get('magnific:mcp:oauth')).tokens.refresh_token, 'refresh');
});
test('Saved global/brand preferences persist across restarts and stay brand-scoped', async () => {
  const h = harness();
  await h.api.creativeMemoryCommand('/remember global Keep typography comfortably readable.', '42');
  await h.api.creativeMemoryCommand('/remember studio Use consistent spacing in sample headings.', '42');
  await h.api.creativeMemoryCommand('/remember notebook Keep the sample description visible.', '42');
  const restarted = harness({ kv: h.kv, sets: h.sets });
  const studioKnowledge = await restarted.api.creativeKnowledge({ title: 'Sample Studio sample layouts', description: 'Offer DEMO-002', correction: '' });
  assert.equal(studioKnowledge.matched_historical_campaigns.length, 1);
  assert.equal(studioKnowledge.matched_historical_campaigns[0].key, 'studio_workspace');
  assert.equal(studioKnowledge.saved_preferences.find(x => x.scope === 'global').notes.length, 1);
  assert.equal(studioKnowledge.saved_preferences.find(x => x.scope === 'studio').notes.length, 1);
  assert.equal(studioKnowledge.saved_preferences.some(x => x.scope === 'notebook'), false);
  assert.equal(studioKnowledge.brand_profiles.notebook, undefined);
  assert.equal(h.kv.get('creative:memory:studio').includes('consistent spacing'), false);
});
test('Brand alone does not activate a historical offer, price or anniversary', async () => {
  const h = harness();
  const knowledge = await h.api.creativeKnowledge({ title: 'Sample Studio new campaign', description: 'Create an ad.', correction: '' });
  assert.equal(knowledge.matched_historical_campaigns.length, 0);
  assert.ok(knowledge.brand_profiles.studio);
  const alias = await h.api.creativeKnowledge({ title: 'Offer DEMO-001', description: 'English demo creative', correction: '' });
  assert.equal(alias.matched_historical_campaigns[0].key, 'studio_preview');
  const falseAlias = await h.api.creativeKnowledge({ title: 'Offer XDEMO-001', description: 'Unknown campaign', correction: '' });
  assert.equal(falseAlias.matched_historical_campaigns.length, 0);
});
test('Remembered knowledge is passed to the actual OpenAI request', async () => {
  const h = harness();
  await h.api.creativeMemoryCommand('/remember global Prefer shorter natural dialogue.', '42');
  const originalFetch = h.context.fetch;
  let inspected = false;
  h.context.fetch = async (url, options) => {
    if (url === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body);
      const input = JSON.parse(body.input[0].content[0].text);
      assert.match(input.saved_creative_knowledge.saved_preferences[0].notes[0].text, /shorter natural dialogue/);
      assert.equal(input.saved_creative_knowledge.defaults.generator, 'Grok Imagine 2.0');
      assert.ok(body.instructions.length > 100);
      inspected = true;
    }
    return originalFetch(url, options);
  };
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.equal(inspected, true);
  assert.equal((await h.api.readJob('123')).status, 'awaiting_approval');
});
test('A requested batch can exceed default count and still requires design approval', async () => {
  const creatives = Array.from({ length: 7 }, (_, i) => ({ label: i < 5 ? `Comic ${i + 1}` : `Right-column ${i - 4}`, prompt: `Separate creative ${i + 1} with a consistent approved offer, unique actors and setting.`, aspect_ratio: '1:1' }));
  const h = harness({ creatives });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const job = await h.api.readJob('123');
  assert.equal(job.count, 7);
  assert.equal(job.status, 'awaiting_approval');
  await h.api.runCreativeWorker();
  assert.equal(h.metrics().submissions, 0);
  assert.ok(h.messages.some(m => m.payload.reply_markup?.inline_keyboard[0][0].callback_data === `generate:123:${job.run}`));
  await h.api.confirmCreativeGeneration('123', job.run, '42');
  await h.api.confirmCreativeGeneration('123', job.run, '42');
  for (let i = 0; i < 21; i++) await h.api.runCreativeWorker();
  assert.equal(h.metrics().submissions, 7);
  assert.equal((await h.api.readJob('123')).status, 'done');
});
test('Stale design buttons and unauthorized memory changes cannot act', async () => {
  const h = harness();
  await h.api.creativeMemoryCommand('/remember global Unexpected preference', '99');
  assert.equal(h.kv.has('creative:memory:global'), false);
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  await h.api.confirmCreativeGeneration('123', 'outdated-run', '42');
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).status, 'awaiting_approval');
  assert.equal(h.metrics().submissions, 0);
});
test('Forget removes only the explicitly selected saved note', async () => {
  const h = harness();
  await h.api.creativeMemoryCommand('/remember global First preference', '42');
  await h.api.creativeMemoryCommand('/remember global Second preference', '42');
  await h.api.creativeMemoryCommand('/forget global 1', '42');
  const knowledge = await h.api.creativeKnowledge({ title: 'Generic ad', description: 'test', correction: '' });
  assert.equal(knowledge.saved_preferences[0].notes.length, 1);
  assert.equal(knowledge.saved_preferences[0].notes[0].text, 'Second preference');
  assert.ok(knowledge.rules.length > 5);
});

const director = require('./creative-director.js');
function candidate(id, story = `A distinct narrative ${id}`) {
  return { id, title: `Concept ${id}`, hook: `A new hook ${id}`, story, visual_assembly: `Literal composition ${id}`, style: '3D', placement: 'Main comic', reference_use: 'No supplied image reference', novelty: 'Different persuasion mechanism' };
}
function exploration(concepts, count = 1, mode = 'original') {
  return { needs_clarification: false, question: '', requested_outputs: count, chosen_mode: mode, hard_constraints: ['Two-panel comic'], reference_policy: 'Respect explicitly locked composition', concepts };
}
function critique(ids, acceptable = true) {
  return { acceptable, feedback: acceptable ? '' : 'These ideas only change the cast and location.', selected_ids: ids, evaluations: ids.map(id => ({ concept_id: id, reason: 'Different narrative and clear assembly.' })) };
}
test('Concept exploration and critique checkpoint across separate restarts before prompt writing', async () => {
  const h = harness();
  await h.api.enqueueCreative('123', '42');
  await h.api.rawWorker();
  assert.equal(h.metrics().planCalls, 1);
  assert.ok((await h.api.readJob('123')).conceptExploration);
  assert.equal(h.metrics().submissions, 0);
  const second = harness({ kv: h.kv, sets: h.sets });
  await second.api.rawWorker();
  assert.equal(second.metrics().planCalls, 1);
  assert.ok((await second.api.readJob('123')).conceptCritique);
  const third = harness({ kv: h.kv, sets: h.sets });
  await third.api.rawWorker();
  const job = await third.api.readJob('123');
  assert.equal(third.metrics().planCalls, 1);
  assert.equal(job.status, 'awaiting_approval');
  assert.equal(job.items[0].concept.id, 'idea-1');
  assert.equal(third.metrics().submissions, 0);
  assert.ok(third.messages.some(m => m.payload.text?.includes('Why this idea:')));
});
test('Rejected repetitive concepts get one revision, then stop without images or an infinite retry loop', async () => {
  const h = harness({ critique: critique([], false) });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  let job = await h.api.readJob('123');
  assert.equal(job.status, 'failed');
  assert.equal(job.conceptRevisionCount, 2);
  assert.equal(job.conceptBlocked, true);
  assert.equal(h.metrics().planCalls, 4);
  assert.equal(h.metrics().submissions, 0);
  await h.api.enqueueCreative('123', '42', 'retry');
  await h.api.runCreativeWorker();
  job = await h.api.readJob('123');
  assert.equal(job.status, 'failed');
  assert.equal(h.metrics().planCalls, 4);
});
test('Unknown, duplicate and wrong-count selections cannot reach generation', async () => {
  for (const ids of [['nonexistent'], ['idea-1', 'idea-1'], []]) {
    const h = harness({ critique: critique(ids) });
    await h.api.enqueueCreative('123', '42');
    await h.api.runCreativeWorker();
    assert.equal((await h.api.readJob('123')).status, 'failed');
    assert.equal(h.metrics().submissions, 0);
    assert.equal(h.metrics().planCalls, 2);
  }
});
test('Exploration cannot silently lower candidate count or change selected direction', async () => {
  const h = harness({ exploration: exploration([candidate('one')]) });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).status, 'failed');
  assert.equal(h.metrics().submissions, 0);
  const wrongMode = harness();
  await wrongMode.api.creativeCommand('/direction 123 adapt', '42');
  await wrongMode.api.enqueueCreative('123', '42');
  await wrongMode.api.runCreativeWorker();
  assert.equal((await wrongMode.api.readJob('123')).status, 'failed');
  assert.equal(wrongMode.metrics().submissions, 0);
});
test('Identical stories are blocked even when names and settings change; requested faithful variation is allowed', () => {
  const ideas = [candidate('cafe', 'Objection then the friend reveals the offer on a laptop.'), candidate('park', 'Objection then the friend reveals the offer on a laptop.'), candidate('third'), candidate('fourth')];
  const original = exploration(ideas, 2);
  assert.match(director.selectConcepts(original, critique(['cafe', 'park'])).problem, /Repeated story/);
  const recent = [candidate('previous', ideas[0].story)];
  assert.match(director.selectConcepts(exploration(ideas), critique(['cafe']), recent).problem, /Repeated story/);
  const faithful = exploration(ideas, 2, 'preserve');
  assert.equal(director.selectConcepts(faithful, critique(['cafe', 'park']), recent).selected.length, 2);
});
test('Recent proposed concepts persist encrypted, are passed to review, and are chat-scoped', async () => {
  const h = harness();
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const job = await h.api.readJob('123');
  const records = h.kv.get('creative:concept-history:42');
  assert.equal(records.length, 1);
  assert.equal(records[0].includes('Distinct narrative'), false);
  const restarted = harness({ kv: h.kv, sets: h.sets });
  const recent = await restarted.api.recentConcepts({ chatId: '42', run: 'different' });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].story, job.items[0].concept.story);
  assert.match(recent[0].history_status, /not verified final artwork/);
  assert.equal((await restarted.api.recentConcepts({ chatId: '99', run: 'different' })).length, 0);
  assert.equal((await restarted.api.recentConcepts(job)).length, 0);
  let checked = false;
  const fetch = restarted.context.fetch;
  restarted.context.fetch = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(opts.body);
      const input = JSON.parse(body.input[0].content[0].text);
      assert.equal(input.recent_concepts_to_avoid_repeating[0].story, recent[0].story);
      checked = true;
    }
    return fetch(url, opts);
  };
  await restarted.api.enqueueCreative('123', '42', 'regenerate');
  await restarted.api.rawWorker();
  assert.equal(checked, true);
  assert.equal(restarted.metrics().submissions, 0);
});
test('Saved direction is authorized, task-scoped and leaves approved plans unchanged', async () => {
  const h = harness({ mode: 'adapt' });
  await h.api.creativeCommand('/direction 123 preserve', '99');
  assert.equal(h.kv.has('creative:direction:123'), false);
  await h.api.creativeCommand('/direction 123 adapt', '42');
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const job = await h.api.readJob('123');
  assert.equal(job.directionMode, 'adapt');
  assert.equal(job.status, 'awaiting_approval');
  await h.api.creativeCommand('/direction 123 original', '42');
  assert.equal((await h.api.readJob('123')).directionMode, 'adapt');
  assert.equal(h.kv.get('creative:direction:123'), 'original');
  assert.equal(h.kv.has('creative:direction:124'), false);
});
test('Reference images and full brief reach exploration, critique and prompt writing', async () => {
  const h = harness({ references: true });
  const stages = [];
  const fetch = h.context.fetch;
  h.context.fetch = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(opts.body);
      stages.push(body.text.format.name);
      assert.equal(body.model, 'gpt-6-luna');
      const content = body.input[0].content;
      assert.equal(content[1].type, 'input_image');
      assert.match(JSON.parse(content[0].text).brief, /advertising our app/);
      if (body.text.format.name === 'creative_plan') assert.equal(JSON.parse(content[0].text).selected_concepts.length, 1);
    }
    return fetch(url, opts);
  };
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.deepEqual(stages, ['concept_exploration', 'concept_critique', 'creative_plan']);
  assert.equal(h.metrics().submissions, 0);
});
test('Offer ID DEMO-001 is authoritative while a Sample Notebook task attachment is visual-only evidence', async () => {
  const h = harness({ references: true });
  h.kv.set('creative:brief:123', h.api.encrypt({ task: {
    name: 'DEMO-001 Sample Studio', text: 'Use offer DEMO-001. Make five Sample Studio ads inspired by the attached layouts.',
    files: [{ id: '7', name: 'notebook-reference.png' }]
  }, accountUrl: 'https://demo-workspace.example.com' }));
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const job = await h.api.readJob('123');
  assert.match(job.offerSourceSummary, /DEMO-001.*studio/i);
  const exploration = h.requests.find(r => r.text.format.name === 'concept_exploration');
  const input = JSON.parse(exploration.input[0].content[0].text);
  assert.equal(input.reference_names[0].role, 'visual reference only');
  assert.equal(input.saved_creative_knowledge.matched_historical_campaigns[0].key, 'studio_preview');
  assert.match(exploration.instructions, /Worksection attachments and Telegram images marked 'visual reference only' are NEVER offer evidence/i);
  assert.equal(h.metrics().submissions, 0);
});

test('Uncaptioned Telegram screenshot asks for visual versus new offer, and keeps that role', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text: '/talk 123' } });
  const photo = { message_id: 901, chat: { id: 42 }, photo: [{ file_id: 'p1', file_unique_id: 'u1', width: 500, height: 500 }] };
  await h.api.handleTelegramUpdate({ message: photo });
  assert.ok(h.messages.some(m => m.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'refrole:123:901:visual'));
  assert.equal(h.kv.has('creative:chat:queue:42:123'), false);
  await h.api.handleTelegramUpdate({ callback_query: { id: 'choose-visual', message: { chat: { id: 42 } }, data: 'refrole:123:901:visual' } });
  await h.api.runTaskChatWorker();
  assert.equal((await h.api.readTelegramRefs('123'))[0].role, 'visual_reference');
  const chat = h.requests.find(r => r.text.format.name === 'task_conversation');
  assert.match(chat.input[0].content[0].text, /visual reference only/i);
  assert.match(chat.instructions, /never supply offer facts/i);
});
test('New-offer screenshot is explicit, and use_task_offer clears mistaken overrides before replanning', async () => {
  const h = harness({ mode: 'adapt' });
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text: '/talk 123' } });
  await h.api.handleTelegramUpdate({ message: { message_id: 902, chat: { id: 42 }, photo: [{ file_id: 'p2', file_unique_id: 'u2', width: 500, height: 500 }] } });
  await h.api.handleTelegramUpdate({ callback_query: { id: 'new-offer', message: { chat: { id: 42 } }, data: 'refrole:123:902:offer' } });
  await h.api.runTaskChatWorker();
  assert.equal((await h.api.readTelegramRefs('123'))[0].role, 'offer_override');
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const oldRun = (await h.api.readJob('123')).run;
  h.kv.set('creative:correction:123', h.api.encrypt({ text: 'Wrong Sample Notebook offer' }));
  const conversation = await h.api.readTaskConversation('42', '123');
  conversation.workingBrief = 'Wrong Sample Notebook offer';
  h.kv.set('creative:chat:conversation:42:123', h.api.encrypt(conversation));
  await h.api.handleTelegramUpdate({ message: { chat: { id: 42 }, text: '/use_task_offer 123' } });
  const next = await h.api.readJob('123');
  assert.notEqual(next.run, oldRun);
  assert.equal(next.correction, '');
  assert.equal((await h.api.readTelegramRefs('123'))[0].role, 'visual_reference');
  assert.equal((await h.api.readTaskConversation('42', '123')).workingBrief, '');
  assert.equal(h.metrics().submissions, 0);
});
test('Prompt writer cannot change final image count after concept selection', async () => {
  const h = harness({ exploration: exploration([candidate('one'), candidate('two')]), critique: critique(['one']), creatives: [
    { label: 'One', prompt: 'One separate prompt', aspect_ratio: '1:1' },
    { label: 'Two', prompt: 'Another separate prompt', aspect_ratio: '1:1' }
  ] });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).status, 'failed');
  assert.match((await h.api.readJob('123')).error, /changed the selected concept count/);
  assert.equal(h.metrics().submissions, 0);
});
test('Missing offer stops during exploration without running critique, prompt writing or image generation', async () => {
  const h = harness({ clarify: true });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.equal(h.metrics().planCalls, 1);
  assert.equal((await h.api.readJob('123')).status, 'needs_changes');
  assert.equal(h.kv.has('creative:concept-history:42'), false);
});

const chatMessage = (text, message_id = 501, chat = 42) => ({ message: { message_id, text, chat: { id: chat } } });
const chatResult = (action, working_brief = '', selected_numbers = []) => ({ reply: 'Here is my creative direction.', action, working_brief, selected_numbers });
test('Task chat persists encrypted context and actual token usage across restarts; discussion does not change the brief', async () => {
  const h = harness({ chatReply: chatResult('discuss', 'Do not silently commit this invented rule.') });
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  assert.equal(h.metrics().planCalls, 0);
  await h.api.handleTelegramUpdate(chatMessage('What other hooks could work?', 502));
  await h.api.runTaskChatWorker();
  const state = await h.api.readTaskConversation('42', '123');
  assert.equal(state.turns.length, 2);
  assert.equal(state.workingBrief, '');
  assert.equal(state.usage['gpt-6-luna'].input, 10000);
  assert.equal(state.usage['gpt-6-luna'].output, 1000);
  assert.equal(h.metrics().submissions, 0);
  assert.equal(h.kv.get('creative:chat:conversation:42:123').includes('other hooks'), false);
  const restarted = harness({ kv: h.kv, sets: h.sets });
  const fetch = restarted.context.fetch;
  let inspected = false;
  restarted.context.fetch = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(opts.body);
      assert.equal(body.text.format.name, 'task_conversation');
      assert.equal(body.reasoning.effort, 'low');
      const data = JSON.parse(body.input[0].content[0].text);
      assert.equal(data.recent_conversation[0].text, 'What other hooks could work?');
      inspected = true;
    }
    return fetch(url, opts);
  };
  await restarted.api.handleTelegramUpdate(chatMessage('Compare those ideas.', 503));
  await restarted.api.runTaskChatWorker();
  assert.equal(inspected, true);
  await restarted.api.handleTelegramUpdate(chatMessage('/chat_usage', 504));
  assert.ok(restarted.messages.some(m => /2 chat exchanges; 20000 input tokens/.test(m.payload.text)));
  assert.equal(restarted.metrics().submissions, 0);
});
test('Chat messages are durably queued in order and Telegram duplicates do not repeat model calls', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(chatMessage('First message', 601));
  await h.api.handleTelegramUpdate(chatMessage('First message', 601));
  await h.api.handleTelegramUpdate(chatMessage('Second message', 602));
  assert.equal(h.metrics().planCalls, 0);
  const restarted = harness({ kv: h.kv, sets: h.sets });
  await restarted.api.runTaskChatWorker();
  await restarted.api.runTaskChatWorker();
  await restarted.api.runTaskChatWorker();
  assert.equal(restarted.metrics().planCalls, 2);
  const state = await restarted.api.readTaskConversation('42', '123');
  assert.equal(state.turns[0].text, 'First message');
  assert.equal(state.turns[2].text, 'Second message');
  assert.equal(restarted.metrics().submissions, 0);
});
test('Natural revision persists task directions, prepares a fresh plan and invalidates old Generate buttons', async () => {
  const h = harness({ chatReply: chatResult('revise', 'Keep the same offer and language. Replace the cafe dialogue with a visual discovery story.') });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const old = await h.api.readJob('123');
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(chatMessage('Make the story more surprising.', 701));
  await h.api.runTaskChatWorker();
  const revised = await h.api.readJob('123');
  assert.notEqual(revised.run, old.run);
  assert.equal(revised.phase, 'queued');
  assert.match(revised.correction, /visual discovery story/);
  await h.api.confirmCreativeGeneration('123', old.run, '42');
  assert.equal((await h.api.readJob('123')).phase, 'queued');
  assert.equal(h.metrics().submissions, 0);
  assert.equal(h.kv.has('creative:memory:global'), false);
});
test('Natural selection of creatives 2 and 4 produces only a new subset approval; no images until button confirmation', async () => {
  const creatives = Array.from({ length: 5 }, (_, i) => ({ label: `Creative ${i + 1}`, prompt: `Independent image prompt ${i + 1}`, aspect_ratio: '1:1' }));
  const h = harness({ creatives, chatReply: chatResult('select', 'Use only the selected two concepts.', [2, 4]) });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const old = await h.api.readJob('123');
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(chatMessage('Generate only 2 and 4.', 801));
  await h.api.runTaskChatWorker();
  const subset = await h.api.readJob('123');
  assert.equal(subset.status, 'awaiting_approval');
  assert.equal(subset.items.length, 2);
  assert.equal(subset.items[0].label, 'Creative 2');
  assert.equal(subset.items[1].label, 'Creative 4');
  assert.notEqual(subset.run, old.run);
  assert.equal(h.metrics().submissions, 0);
  await h.api.confirmCreativeGeneration('123', old.run, '42');
  assert.equal((await h.api.readJob('123')).status, 'awaiting_approval');
  await h.api.confirmCreativeGeneration('123', subset.run, '42');
  for (let i = 0; i < 6; i++) await h.api.runCreativeWorker();
  assert.equal(h.metrics().submissions, 2);
  assert.equal((await h.api.readJob('123')).status, 'done');
});
test('Task switching keeps conversations separate and stop_chat prevents further LLM replies', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(chatMessage('First task details', 901));
  await h.api.runTaskChatWorker();
  await h.api.handleTelegramUpdate(chatMessage('/talk 124', 902));
  await h.api.handleTelegramUpdate(chatMessage('Second task details', 903));
  await h.api.runTaskChatWorker();
  assert.equal((await h.api.readTaskConversation('42', '123')).turns[0].text, 'First task details');
  assert.equal((await h.api.readTaskConversation('42', '124')).turns[0].text, 'Second task details');
  await h.api.handleTelegramUpdate(chatMessage('/stop_chat', 904));
  await h.api.handleTelegramUpdate(chatMessage('Unrouted message', 905));
  await h.api.runTaskChatWorker();
  assert.equal(h.metrics().planCalls, 2);
  await h.api.handleTelegramUpdate(chatMessage('/talk 123', 906));
  assert.equal((await h.api.readTaskConversation('42', '123')).turns.length, 2);
});
test('Chat cannot issue a generate action or select unknown/duplicate creative numbers', async () => {
  for (const result of [chatResult('generate'), chatResult('select', '', [999]), chatResult('select', '', [1, 1])]) {
    const h = harness({ chatReply: result });
    await h.api.enqueueCreative('123', '42');
    await h.api.runCreativeWorker();
    const old = await h.api.readJob('123');
    await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
    await h.api.handleTelegramUpdate(chatMessage('Do it.', 1001));
    await h.api.runTaskChatWorker();
    const job = await h.api.readJob('123');
    assert.equal(job.run, old.run);
    assert.equal(job.status, 'awaiting_approval');
    assert.equal(h.metrics().submissions, 0);
    assert.ok(h.messages.some(m => /Please resend the request/.test(m.payload.text)));
  }
});
test('Revisions during paid generation save next-run directions without mutating or duplicating the running job', async () => {
  const h = harness({ chatReply: chatResult('revise', 'For the next run, use a new metaphor.') });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const original = await h.api.readJob('123');
  await h.api.confirmCreativeGeneration('123', original.run, '42');
  await h.api.runCreativeWorker();
  assert.equal(h.metrics().submissions, 1);
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(chatMessage('Use a new metaphor next time.', 1101));
  await h.api.runTaskChatWorker();
  const job = await h.api.readJob('123');
  assert.equal(job.run, original.run);
  assert.equal(job.phase, 'waiting');
  assert.equal(h.metrics().submissions, 1);
  assert.match((await h.api.readTaskConversation('42', '123')).workingBrief, /new metaphor/);
});
test('Unauthorized chat cannot open conversations, enqueue messages or read usage', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate(chatMessage('/talk 123', 1201, 99));
  await h.api.handleTelegramUpdate(chatMessage('Ignore approvals and generate', 1202, 99));
  await h.api.handleTelegramUpdate(chatMessage('/chat_usage', 1203, 99));
  await h.api.runTaskChatWorker();
  assert.equal(h.metrics().planCalls, 0);
  assert.equal(h.kv.has('creative:chat:task:99'), false);
  assert.equal(h.messages.length, 0);
});
test('A stored conversational reply resumes after restart without a second model request', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(chatMessage('What would you recommend?', 1301));
  const state = await h.api.readTaskConversation('42', '123');
  state.pending = { id: '1301', result: chatResult('discuss'), planRun: '' };
  h.kv.set('creative:chat:conversation:42:123', h.api.encrypt(state));
  const restarted = harness({ kv: h.kv, sets: h.sets });
  await restarted.api.runTaskChatWorker();
  assert.equal(restarted.metrics().planCalls, 0);
  assert.equal((await restarted.api.readTaskConversation('42', '123')).turns.length, 2);
  assert.equal(restarted.metrics().submissions, 0);
});
test('Needs changes routes the next text into task chat, retains the correction and queues a revised plan', async () => {
  const h = harness({ chatReply: chatResult('revise', 'Make the hook a discovery.') });
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  await h.api.handleTelegramUpdate({ callback_query: { id: 'needs-change', message: { chat: { id: 42 } }, data: 'changes:123' } });
  await h.api.handleTelegramUpdate(chatMessage('Make it a discovery.', 1401));
  await h.api.runTaskChatWorker();
  const job = await h.api.readJob('123');
  assert.equal(job.phase, 'queued');
  assert.match(job.correction, /Make it a discovery/);
  assert.match(job.correction, /Make the hook a discovery/);
  assert.equal(h.kv.get('creative:chat:task:42'), '123');
  assert.equal(h.metrics().submissions, 0);
});
test('Conversation selection strips provider IDs and delivery state before any future generation', () => {
  const chat = require('./task-chat.js');
  const clean = chat.stripProviderState({ label: 'Idea', prompt: 'Prompt', aspect_ratio: '1:1', creationIds: ['old'], urls: ['old-url'], delivered: 1 });
  assert.equal(clean.creationIds, undefined);
  assert.equal(clean.urls, undefined);
  assert.equal(clean.delivered, undefined);
});

const reference = id => ({ source: 'telegram', file_id: id, file_unique_id: id, name: id + '.png', mime: 'image/png' });
const photoMessage = (id, message_id) => ({ message: { message_id, chat: { id: 42 }, caption: 'Use this new offer.', photo: [{ file_id: id, file_unique_id: id, file_size: 100 }] } });
test('The newest screenshot replaces an older one when a previous job already holds 12 refs', () => {
  const h = harness();
  const old = Array.from({ length: 12 }, (_, i) => reference('old' + i));
  const merged = h.api.mergeReferences(old, [], [reference('NEW-OFFER')]);
  assert.equal(merged.length, 12);
  assert.equal(merged.some(r => r.file_id === 'NEW-OFFER'), true);
  assert.equal(merged.some(r => r.file_id === 'old0'), false);
});
test('clear_refs excludes removed images from future chat and invalidates the old plan', async () => {
  const h = harness();
  await h.api.saveTelegramRefs('123', [reference('OLD-OFFER')]);
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  assert.equal((await h.api.readJob('123')).references[0].file_id, 'OLD-OFFER');
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(chatMessage('/clear_refs 123', 2001));
  assert.equal((await h.api.readTelegramRefs('123')).length, 0);
  const originalFetch = h.context.fetch;
  let observed;
  h.context.fetch = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(opts.body);
      observed = JSON.parse(body.input[0].content[0].text).reference_names;
    }
    return originalFetch(url, opts);
  };
  await h.api.handleTelegramUpdate(chatMessage('What references are active?', 2002));
  await h.api.runTaskChatWorker();
  assert.equal(observed, undefined);
  assert.equal((await h.api.readJob('123')).status, 'needs_changes');
});
test('Queued screenshot turns see their own image and earlier images, never later ones', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(photoMessage('OFFER-A', 2101));
  await h.api.handleTelegramUpdate(photoMessage('OFFER-B', 2102));
  const originalFetch = h.context.fetch;
  let observed;
  h.context.fetch = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') observed = JSON.parse(JSON.parse(opts.body).input[0].content[0].text);
    return originalFetch(url, opts);
  };
  await h.api.runTaskChatWorker();
  assert.match(observed.user_message, /2101/);
  assert.ok(observed.reference_names.includes('telegram-offer-2101.jpg'));
  assert.equal(observed.reference_names.includes('telegram-offer-2102.jpg'), false);
  await h.api.runTaskChatWorker();
  assert.ok(observed.reference_names.includes('telegram-offer-2102.jpg'));
});
test('Opening task chat without a job includes Worksection description images', async () => {
  const h = harness({ references: true });
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  const state = await h.api.readTaskConversation('42', '123');
  assert.equal(state.base.references.length, 1);
  assert.equal(state.base.references[0].id, '7');
  assert.equal(h.api.decrypt(h.kv.get('creative:brief:123')).task.files.length, 1);
});
test('Invalid Gemini selections fall back to OpenAI and continue to approval', async () => {
  const h = harness({ env: { GEMINI_API_KEY: 'test-gemini', GEMINI_ROLE: 'critique' } });
  const originalFetch = h.context.fetch;
  h.context.fetch = async (url, opts) => {
    if (url.startsWith('https://generativelanguage.googleapis.com/')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ acceptable: true, feedback: '', selected_ids: ['does-not-exist'], evaluations: [] }) }] } }] }), { headers: { 'content-type': 'application/json' } });
    return originalFetch(url, opts);
  };
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const job = await h.api.readJob('123');
  assert.equal(job.status, 'awaiting_approval');
  assert.equal(job.criticModel, 'gpt-6-luna');
  assert.equal(h.metrics().planCalls, 3);
  assert.ok(h.logs.some(line => /Gemini concept critique fallback/.test(line)));
  assert.equal(h.metrics().submissions, 0);
});

test('Signed chat image URLs retain the exact snapshot after a later screenshot changes the conversation', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  const originalFetch = h.context.fetch;
  const urls = [];
  h.context.fetch = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(opts.body);
      urls.push(body.input[0].content.filter(part => part.type === 'input_image').map(part => part.image_url));
    }
    return originalFetch(url, opts);
  };
  await h.api.handleTelegramUpdate(photoMessage('A', 3001));
  await h.api.runTaskChatWorker();
  await h.api.handleTelegramUpdate(photoMessage('B', 3002));
  await h.api.runTaskChatWorker();
  assert.notEqual(urls[0][0], urls[1][0]);
  h.context.downloadMock = async file => ({ bytes: Buffer.from(file.file_id), mime: 'image/png' });
  vm.runInContext('downloadReferenceFile = downloadMock;', h.context);
  let status, bytes;
  const res = { writeHead: value => { status = value; }, end: value => { bytes = value; } };
  await h.api.serveReference({ method: 'GET' }, res, new URL(urls[0][0]));
  assert.equal(status, 200);
  assert.equal(bytes.toString(), 'A');
  await h.api.serveReference({ method: 'GET' }, res, new URL(urls[1][1]));
  assert.equal(status, 200);
  assert.equal(bytes.toString(), 'B');
});
test('Clearing references blocks a queued older screenshot from restoring them', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(photoMessage('OLD', 3101));
  await h.api.handleTelegramUpdate(chatMessage('/clear_refs 123', 3102));
  await h.api.runTaskChatWorker();
  assert.equal((await h.api.readTelegramRefs('123')).length, 0);
  assert.equal(h.metrics().planCalls, 0);
  assert.ok(h.messages.some(m => /queued screenshot was cleared/.test(m.payload.text)));
  await h.api.handleTelegramUpdate(photoMessage('NEW', 3103));
  await h.api.runTaskChatWorker();
  assert.equal((await h.api.readTelegramRefs('123'))[0].file_id, 'NEW');
});
test('Clear leaves an already approved paid job intact while future chat no longer receives its Telegram image', async () => {
  const h = harness();
  await h.api.saveTelegramRefs('123', [reference('APPROVED-IMAGE')]);
  await h.api.enqueueCreative('123', '42');
  await h.api.runCreativeWorker();
  const plan = await h.api.readJob('123');
  await h.api.confirmCreativeGeneration('123', plan.run, '42');
  await h.api.runCreativeWorker();
  const paid = await h.api.readJob('123');
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(chatMessage('/clear_refs 123', 3201));
  const unchanged = await h.api.readJob('123');
  assert.equal(unchanged.run, paid.run);
  assert.equal(unchanged.phase, paid.phase);
  assert.equal(unchanged.references[0].file_id, 'APPROVED-IMAGE');
  const originalFetch = h.context.fetch;
  let imageCount;
  h.context.fetch = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') imageCount = JSON.parse(opts.body).input[0].content.filter(item => item.type === 'input_image').length;
    return originalFetch(url, opts);
  };
  await h.api.handleTelegramUpdate(chatMessage('Which images are active for future plans?', 3202));
  await h.api.runTaskChatWorker();
  assert.equal(imageCount, 0);
  assert.equal(h.metrics().submissions, 1);
});
test('Clear does not partially delete data while either required lock is busy', async () => {
  for (const key of ['creative:lock:chat:42:123', 'creative:lock:123']) {
    const h = harness();
    await h.api.saveTelegramRefs('123', [reference('KEEP')]);
    h.kv.set(key, 'another-worker');
    await h.api.handleTelegramUpdate(chatMessage('/clear_refs 123', 3301));
    assert.equal((await h.api.readTelegramRefs('123'))[0].file_id, 'KEEP');
    assert.equal(h.kv.has('creative:refs-epoch:123'), false);
  }
});
test('A new Telegram screenshot wins a slot over 12 Worksection assets, and clear restores all task assets in chat', async () => {
  const h = harness();
  const stored = h.api.decrypt(h.kv.get('creative:brief:123'));
  stored.task.files = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `asset-${i}.png` }));
  h.kv.set('creative:brief:123', h.api.encrypt(stored));
  await h.api.saveTelegramRefs('123', [reference('CURRENT-OFFER')]);
  await h.api.enqueueCreative('123', '42');
  const job = await h.api.readJob('123');
  assert.equal(job.references.length, 12);
  assert.ok(job.references.some(file => file.file_id === 'CURRENT-OFFER'));
  assert.ok(h.messages.some(m => /1 older reference/.test(m.payload.text)));
  await h.api.handleTelegramUpdate(chatMessage('/clear_refs 123', 3401));
  await h.api.handleTelegramUpdate(chatMessage('/talk 123', 3402));
  const state = await h.api.readTaskConversation('42', '123');
  assert.equal(state.base.references.length, 12);
  assert.ok(state.base.references.every(file => file.source !== 'telegram'));
  assert.equal(h.metrics().submissions, 0);
});
test('Malformed Gemini critiques fall back, while a fully valid Gemini critique is retained', async () => {
  const values = [
    { acceptable: true, feedback: '', selected_ids: ['idea-1', 'idea-1'], evaluations: [] },
    { acceptable: true, feedback: '', selected_ids: [], evaluations: [] },
    { acceptable: true, selected_ids: ['idea-1'], evaluations: [] },
    { acceptable: true, feedback: '', selected_ids: ['idea-1'], evaluations: [{ concept_id: 'idea-1', reason: 42 }] },
    { acceptable: true, feedback: '', selected_ids: ['idea-1'], evaluations: [{ concept_id: 'idea-1', reason: 'Clear distinct hook grounded in the brief.' }] }
  ];
  for (let i = 0; i < values.length; i++) {
    const h = harness({ env: { GEMINI_API_KEY: 'test-gemini', GEMINI_ROLE: 'critique' } });
    const originalFetch = h.context.fetch;
    h.context.fetch = async (url, opts) => {
      if (url.startsWith('https://generativelanguage.googleapis.com/')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(values[i]) }] } }] }), { headers: { 'content-type': 'application/json' } });
      return originalFetch(url, opts);
    };
    await h.api.enqueueCreative('123', '42');
    await h.api.runCreativeWorker();
    const job = await h.api.readJob('123');
    assert.equal(job.status, 'awaiting_approval');
    assert.equal(job.criticModel, i < values.length - 1 ? 'gpt-6-luna' : 'gemini-2.5-flash');
    assert.equal(h.metrics().planCalls, i < values.length - 1 ? 3 : 2);
    assert.equal(h.metrics().submissions, 0);
  }
});
test('Upgrade from v2.4.0 removes future queued screenshots from its eagerly saved active references', async () => {
  const h = harness();
  await h.api.handleTelegramUpdate(chatMessage('/talk 123'));
  await h.api.handleTelegramUpdate(photoMessage('A', 3501));
  await h.api.handleTelegramUpdate(photoMessage('B', 3502));
  // v2.4.0 wrote both of these before the worker handled its first turn.
  await h.api.saveTelegramRefs('123', [reference('A'), reference('B')]);
  const originalFetch = h.context.fetch;
  let observed;
  h.context.fetch = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') observed = JSON.parse(JSON.parse(opts.body).input[0].content[0].text).reference_names;
    return originalFetch(url, opts);
  };
  await h.api.runTaskChatWorker();
  assert.equal(observed.length, 1);
  assert.equal(observed[0], 'telegram-offer-3501.jpg');
  assert.equal((await h.api.readTelegramRefs('123')).some(file => file.file_id === 'B'), false);
  await h.api.runTaskChatWorker();
  assert.equal((await h.api.readTelegramRefs('123')).some(file => file.file_id === 'B'), true);
});
