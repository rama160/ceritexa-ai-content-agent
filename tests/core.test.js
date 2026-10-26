import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANNELS,validate,detectRisk,parseRss,score,parseAI,compareToken,gate,readiness,selectDraftTopic,EDITORIAL_TOPICS,validateRejection,creativeSimilarity,MAX_REVISION_DEPTH,REJECTION_REASONS,sceneBeats,scenePrompt,MAX_STORYBOARD_SCENES,SCENE_IMAGE_DAILY_LIMIT,SCENES_PER_REQUEST} from '../src/core.js';
test('kanal terisolasi',()=>{assert.match(CHANNELS.panex.topic,/keluarga/);assert.match(CHANNELS.heros.topic,/superhero/);assert.throws(()=>validate('panex','TEXT'));assert.equal(validate('facebook','PHOTO'),true)});
test('mengurai RSS',()=>{const x='<item><title><![CDATA[Drama &amp; Keluarga]]></title><link>https://example.org/a</link></item>';assert.equal(parseRss(x)[0].topic,'Drama & Keluarga')});
test('menolak IP eksternal',()=>{assert.ok(detectRisk('Batman'));assert.equal(score('Marvel hero','heros'),0)});
test('memvalidasi naskah AI',()=>{const x={title:'Kisah',story:'a'.repeat(130),caption:'Ini adalah fiksi',imagePrompt:'cinematic scene'};assert.equal(parseAI(JSON.stringify(x)).title,'Kisah');assert.throws(()=>parseAI('{}'))});
test('persetujuan, lisensi, media gate',()=>{const p={channel:'facebook',format:'TEXT',state:'APPROVED',license_ok:1,title:'Kisah',story:'a'.repeat(120),caption:'Cerita'};assert.equal(gate(p),'');assert.equal(gate({...p,license_ok:0}),'LICENSE_REVIEW_REQUIRED');assert.equal(gate({...p,format:'PHOTO'}),'MEDIA_REQUIRED')});
test('admin token',()=>{const t='abcdefghijklmnopqrstuvwxyz123456';assert.equal(compareToken(t,t),true);assert.equal(compareToken(t,t+'0'),false);assert.equal(compareToken('abc','abc'),false)});

test('MP4 and image MIME review gate',()=>{
 const p={channel:'panex',format:'VIDEO',state:'APPROVED',license_ok:1,title:'Cerita',story:'x'.repeat(150),caption:'Fiksi',media_key:'assets/file.jpg',media_type:'image/jpeg'};
 assert.equal(gate(p),'MP4_REQUIRED');
 assert.equal(gate({...p,media_type:'video/mp4'}),'');
 const fb={...p,channel:'facebook',format:'VIDEO',media_type:'video/mp4'};
 assert.equal(gate(fb),'FACEBOOK_REELS_API_NOT_CONNECTED');
 const image={...p,channel:'facebook',format:'PHOTO',media_type:'video/mp4'};
 assert.equal(gate(image),'IMAGE_REQUIRED');
});

test('readiness checks never expose secret values or mark provider tests verified',()=>{
 const fake={DB:{},MEDIAKV:{},AI:{},ADMIN_TOKEN:'z'.repeat(30),FB_PAGE_ID:'123',FB_PAGE_ACCESS_TOKEN:'TOP_SECRET_DO_NOT_SHOW',ALLOW_PUBLICATION:'false'};
 const report=readiness(fake,false);
 assert.equal(report.publicationEnabled,false);
 assert.equal(report.checks.find(x=>x.id==='database').ready,true);
 assert.equal(report.checks.find(x=>x.id==='facebook').ready,true);
 assert.equal(report.checks.find(x=>x.id==='panex').ready,false);
 assert.equal(report.checks.find(x=>x.id==='provider_e2e').ready,false);
 assert.equal(JSON.stringify(report).includes('TOP_SECRET_DO_NOT_SHOW'),false);
 assert.equal(readiness(fake,true).checks.find(x=>x.id==='review').ready,false);
});

test('dashboard inline JavaScript must compile',()=>{
 const workerSource=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const inline=workerSource.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
 const hydrated=inline?.replace(/\$\{JSON\.stringify\(REJECTION_REASONS\)\}/g,JSON.stringify(REJECTION_REASONS));
 assert.ok(inline,'Dashboard inline script found');
 assert.doesNotThrow(()=>new vm.Script(hydrated));
});

test('channel editorial filter rejects unrelated viral football trends',()=>{
 const trends=[{topic:'klasemen liga jerman'},{topic:'skor pertandingan sepak bola'}];
 assert.equal(score(trends[0].topic,'heros'),0);
 assert.equal(score(trends[0].topic,'panex'),0);
 assert.equal(selectDraftTopic('heros',{trends,dayIndex:0}),EDITORIAL_TOPICS.heros[0]);
 assert.equal(selectDraftTopic('panex',{trends,dayIndex:1}),EDITORIAL_TOPICS.panex[1]);
 assert.notEqual(selectDraftTopic('heros',{trends,dayIndex:0}),selectDraftTopic('panex',{trends,dayIndex:0}));
});
test('draft selector honors explicit owner topic and genuinely relevant channel trends',()=>{
 assert.equal(selectDraftTopic('facebook',{userTopic:'Cerita pilihan saya',trends:[{topic:'klasemen liga jerman'}]}),'Cerita pilihan saya');
 assert.match(selectDraftTopic('heros',{trends:[{topic:'klasemen liga jerman'},{topic:'Superhero orisinal menyelamatkan kota'}]}),/Superhero orisinal/);
 assert.throws(()=>selectDraftTopic('heros',{userTopic:'Batman'}));
});

test('rejection choices and hard depth cap',()=>{
 assert.ok(REJECTION_REASONS.length>=6);
 assert.equal(MAX_REVISION_DEPTH,3);
 assert.equal(validateRejection('Cerita kurang menyentuh','buat lebih hangat',0).maxReached,false);
 assert.equal(validateRejection('Judul kurang menarik','',3).maxReached,true);
 assert.throws(()=>validateRejection('Alasan lain','',0),/catatan/);
 assert.throws(()=>validateRejection('invalid','',0),/alasan/);
 assert.equal(validateRejection('Gambar kurang cocok','a'.repeat(1000),2).note.length,500);
});
test('regenerated text must be different from rejected original',()=>{
 const original='Seorang ibu penjual nasi mengorbankan uangnya untuk membayar sekolah seorang anak dan keluarga bahagia';
 const similar=creativeSimilarity(original,original);
 const different=creativeSimilarity(original,'Pahlawan cahaya berjuang melindungi kota dari monster yang tak terlihat');
 assert.equal(similar,1);
 assert.ok(different<0.68);
});
test('Worker single module and authenticated preview/reject routes parse',()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
 const original=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const inlineCore=core.replace(/^export /gm,'');
 const worker=original.replace(/^import[^\n]*\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 assert.doesNotThrow(()=>new vm.Script(inlineCore+'\n'+worker));
 assert.match(original,/\/api\/preview\//);
 assert.match(original,/async function rejectDraft/);
 assert.match(original,/async function retryRegeneration/);
 assert.match(original,/data-reject/);
 assert.match(original,/id="brandLogo"/);
});

test('review UI includes cover generation, reject reason and retry pathway',()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../migrations/0002_review_feedback.sql',import.meta.url),'utf8');
 assert.match(src,/data-gencover/);
 assert.match(src,/async function regenerateCover/);
 assert.match(src,/async function rejectDraft/);
 assert.match(src,/async function retryRegeneration/);
 assert.match(src,/regen_state='FAILED'/);
 assert.match(src,/state='REJECTED'/);
 assert.match(src,/async function saveAIArtwork/);
 assert.match(src,/data-poster/);
 assert.match(src,/id="brandLogo"/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS draft_reviews/);
 assert.match(migration,/INSERT OR IGNORE INTO draft_reviews/);
});

test('mocked Worker reject-to-regenerate retains original, creates one linked replacement and blocks double rejection',async()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const app=new Function(core+'\n'+idx+'\nreturn __worker;')();
 const id='11111111-1111-4111-8111-111111111111',posts=new Map(),reviews=new Map(),auditRows=[];
 const now=new Date().toISOString();
 posts.set(id,{id,channel:'facebook',format:'TEXT',title:'Ibu di Warung',story:'Seorang ibu menjalani hari di warungnya dan berharap keluarganya hidup bahagia. '.repeat(12),caption:'Cerita tentang seorang ibu',topic:'Perjuangan ibu pekerja keras',image_prompt:'A small Indonesian stall',media_key:null,media_type:null,state:'PENDING_REVIEW',license_ok:0,risk_note:'',created_at:now,updated_at:now});
 reviews.set(id,{post_id:id,revision_depth:0,regen_state:'NONE'});
 const result=changes=>({meta:{changes}});
 function query(sql,a,type){
  const q=sql.toLowerCase();
  if(type==='first'){
   if(q.includes('select * from posts where id'))return posts.get(a[0])||null;
   if(q.includes('select revision_depth,regen_state from draft_reviews'))return reviews.get(a[0])||null;
   if(q.includes('select count(*) n from posts'))return {n:posts.size};
   return null;
  }
  if(type==='all')return {results:[]};
  if(q.startsWith('insert into audit')){auditRows.push(a);return result(1);}
  if(q.includes("update posts set state='rejected'")){
   const p=posts.get(a[1]);if(!p||p.state==='REJECTED')return result(0);
   p.state='REJECTED';return result(1);
  }
  if(q.startsWith('insert or ignore into draft_reviews')){if(!reviews.has(a[0]))reviews.set(a[0],{post_id:a[0],revision_depth:a[1],regen_state:'NONE'});return result(1);}
  if(q.includes('update draft_reviews set rejection_reason')){Object.assign(reviews.get(a[4]),{rejection_reason:a[0],rejection_note:a[1],regen_state:a[2]});return result(1);}
  if(q.startsWith('insert into posts')){
   const keys=sql.match(/posts\(([^)]+)\)/i)[1].split(',');
   posts.set(a[0],Object.fromEntries(keys.map((key,i)=>[key.trim(),a[i]])));return result(1);
  }
  if(q.startsWith('insert into draft_reviews')){reviews.set(a[0],{post_id:a[0],parent_id:a[1],revision_depth:a[2],regen_state:'NONE'});return result(1);}
  if(q.includes("update draft_reviews set regen_state='done'")){reviews.get(a[1]).regen_state='DONE';return result(1);}
  if(q.includes("update draft_reviews set regen_state='failed'")){reviews.get(a[2]).regen_state='FAILED';return result(1);}
  throw Error('Unmocked SQL '+sql.slice(0,70));
 }
 const env={ADMIN_TOKEN:'A_TEST_ONLY_LONG_NONPRODUCTION_TOKEN_123456',MONTHLY_DRAFT_LIMIT:'24',ALLOW_PUBLICATION:'false',AI:{run:async()=>({response:JSON.stringify({
  title:'Surat Cahaya di Tepi Sawah',story:Array.from({length:112},(_,i)=>['Hujan','membawa','pesan','rahasia','kepada','guru','desa','dan','tetangga','membantu','membuka','jalan','baru','untuk','keluarga'][i%15]).join(' '),
  caption:'Kisah baru mengenai harapan dan keberanian',imagePrompt:'Original warm cinematic village scene'
 })})},DB:{prepare(sql){return {bind(...a){return {first:async()=>query(sql,a,'first'),all:async()=>query(sql,a,'all'),run:async()=>query(sql,a,'run')}}}}}};
 const request=()=>new Request('https://ceritexa.local/api/posts/'+id+'/reject',{method:'POST',headers:{Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({reason:'Cerita kurang menyentuh',note:'Buat lebih emosional'})});
 const response=await app.fetch(request(),env);
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.regenerated,true);
 assert.equal(posts.get(id).state,'REJECTED');
 assert.equal(reviews.get(id).regen_state,'DONE');
 assert.equal(reviews.get(data.replacement.id).parent_id,id);
 assert.equal(reviews.get(data.replacement.id).revision_depth,1);
 assert.equal(posts.get(data.replacement.id).state,'PENDING_REVIEW');
 assert.equal(posts.size,2);
 const duplicate=await app.fetch(request(),env);
 assert.equal(duplicate.status,400);
 assert.equal(posts.size,2);
 assert.ok(auditRows.length>=2);
});

test('pwa manifest remains installable and branded with same-origin icons',()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const setup=new Function(core+'\n'+idx+'\nreturn {manifest:pwaManifest,sw:serviceWorkerScript,appIcon,logo:CERITEXA_LOGO};')();
 assert.equal(setup.manifest.name,'Ceritexa AI Content Agent');
 assert.equal(setup.manifest.display,'standalone');
 assert.equal(setup.manifest.scope,'/');
 assert.equal(setup.manifest.start_url,'/');
 assert.equal(setup.manifest.id,'/');
 assert.equal(setup.manifest.prefer_related_applications,false);
 assert.ok(setup.manifest.icons.some(icon=>icon.sizes==='192x192'));
 assert.ok(setup.manifest.icons.some(icon=>icon.sizes==='512x512'));
 assert.match(setup.appIcon(192),/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
 assert.match(setup.appIcon(512),/Ceritexa Studio/);
 assert.ok(setup.logo.startsWith('data:image/jpeg;base64,'));
});
test('pwa offline cache is public shell only and never stores private API data',()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const sw=new Function(core+'\n'+idx+'\nreturn serviceWorkerScript;')();
 assert.doesNotThrow(()=>new vm.Script(sw));
 assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
 assert.match(sw,/request\.headers\.has\('Authorization'\)/);
 assert.match(sw,/request\.mode==='navigate'/);
 assert.match(sw,/cache\.addAll\(SHELL\)/);
 assert.ok(!sw.includes('localStorage'));
 assert.ok(!sw.includes('ADMIN_TOKEN'));
 assert.ok(!sw.includes('MEDIAKV'));
});
test('dashboard pwa install UI and routes remain independent of authorization',()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const app=new Function(core+'\n'+idx+'\nreturn __worker;')();
 const e={};
 const get=path=>app.fetch(new Request('https://ceritexa.test'+path,{method:'GET'}),e);
 return Promise.all([get('/manifest.webmanifest'),get('/sw.js'),get('/icon-192.svg'),get('/icon-512.svg'),get('/icon-96.jpg'),get('/')]).then(async responses=>{
  for(const r of responses)assert.equal(r.status,200);
  assert.match(responses[0].headers.get('Content-Type'),/manifest\+json/);
  assert.match(responses[1].headers.get('Content-Type'),/javascript/);
  assert.match(responses[2].headers.get('Content-Type'),/svg\+xml/);
  assert.match(responses[3].headers.get('Content-Type'),/svg\+xml/);
  assert.match(responses[4].headers.get('Content-Type'),/image\/jpeg/);
  const html=await responses[5].text();
  assert.match(html,/beforeinstallprompt/);
  assert.match(html,/id="installPwa"/);
  assert.match(html,/rel="manifest"/);
  assert.match(html,/serviceWorker\.register/);
  const protectedResponse=await get('/api/posts');
  assert.equal(protectedResponse.status,503);
  assert.match(responses[5].headers.get('Content-Security-Policy'),/worker-src 'self'/);
 });
});

test('media view modal shows image or video with correct CSP and Android-friendly controls',async()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const app=new Function(core+'\n'+idx+'\nreturn __worker;')();
 const response=await app.fetch(new Request('https://ceritexa.test/',{method:'GET'}),{});
 const html=await response.text();
 assert.match(response.headers.get('Content-Security-Policy'),/media-src 'self' blob:/);
 assert.match(html,/id="mediaDialog"/);
 assert.match(html,/id="mediaDialogClose"/);
 assert.match(html,/id="mediaDialogStatus"/);
 assert.match(html,/id="mediaDialogContent"/);
 assert.match(html,/data-media-type/);
 assert.match(html,/Putar video MP4/);
 assert.match(html,/MP4 belum siap/);
 assert.match(html,/dialog\.showModal\(\)/);
 assert.match(html,/item\.playsInline=true/);
 assert.match(html,/item\.controls=true/);
 assert.match(html,/URL\.revokeObjectURL\(activeMediaUrl\)/);
 assert.ok(!html.includes('window.open('));
});
test('all currently unrendered VIDEO draft buttons show illustration status, not Play',()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const setup=new Function(core+'\n'+idx+'\nreturn {page};')();
 assert.match(setup.page,/MP4 belum siap/);
 assert.match(setup.page,/Render melalui/);
 assert.match(setup.page,/github\.com\/rama160\/ceritexa-ai-content-agent\/actions\/workflows\/render-video\.yml/);
});

test('renderer cannot report COMPLETED unless MP4 has been verified in D1',async()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const app=new Function(core+'\n'+idx+'\nreturn __worker;')();
 const id='11111111-1111-4111-8111-111111111111',events=[];
 let media_type='image/jpeg',state='BLOCKED';
 const env={ADMIN_TOKEN:'THIS_IS_A_TEST_ADMIN_TOKEN_NEVER_PRODUCTION',DB:{
  prepare(sql){return {bind(...args){return {
   first:async()=>({id,channel:'panex',format:'VIDEO',state,media_type}),
   run:async()=>{if(sql.startsWith('INSERT INTO audit'))events.push(args);return {meta:{changes:1}};},
   all:async()=>({results:[]})
  }}}}
 }};
 const send=(status)=>app.fetch(new Request('https://ceritexa.test/api/posts/'+id+'/render-event',{
  method:'POST',headers:{Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'},
  body:JSON.stringify({status,detail:'Renderer diagnostics'})
 }),env);
 assert.equal((await send('STARTED')).status,200);
 assert.equal(events.length,1);
 assert.equal((await send('COMPLETED')).status,400);
 assert.equal(events.length,1);
 assert.equal((await send('FAILED')).status,200);
 media_type='video/mp4';state='PENDING_REVIEW';
 assert.equal((await send('COMPLETED')).status,200);
 assert.equal(events.length,3);
 const unauthorized=await app.fetch(new Request('https://ceritexa.test/api/posts/'+id+'/render-event',{
  method:'POST',headers:{'Content-Type':'application/json'},body:'{"status":"COMPLETED"}'
 }),env);
 assert.equal(unauthorized.status,401);
});
test('renderer failures are explicit and live card distinguishes MP4 from JPEG',async()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const py=readFileSync(new URL('../tools/render_video.py',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/render-video.yml',import.meta.url),'utf8');
 assert.match(src,/RENDER_FAILED/);
 assert.match(src,/render_event/);
 assert.match(src,/playOverlay=isMp4/);
 assert.match(src,/data-media-label="Putar video MP4"/);
 assert.match(py,/def verify_upload/);
 assert.match(py,/def verify_mp4/);
 assert.match(py,/sys\.exit\(main\(\)\)/);
 assert.match(py,/failures \+= 1/);
 assert.match(py,/::error::/);
 assert.match(workflow,/python tools\/render_video\.py --self-test/);
 assert.match(workflow,/Validate Ceritexa GitHub secret/);
 assert.match(workflow,/Render adaptive story scenes, neural narration and verify MP4/);
});

test('narrative-driven variable scenes preserve full original story and consistent channel prompts',()=>{
 const story=Array.from({length:120},(_,i)=>['Seorang','pemuda','menemukan','cahaya','misterius','di','desa','kemudian','menolong','keluarganya'][i%10]).join(' ');
 const beats=sceneBeats(story);
 assert.ok(beats.length>4&&beats.length<=MAX_STORYBOARD_SCENES);
 assert.ok(beats.every((b,i)=>b.index===i&&b.total===beats.length&&b.words>=4));
 assert.equal(beats.map(x=>x.beat).join(' ').replace(/\s+/g,' '),story);
 const a=scenePrompt({channel:'panex',image_prompt:'Indonesian teenager with blue shirt'},beats[1]);
 const b=scenePrompt({channel:'heros',image_prompt:'Original blue-cloaked guardian'},beats[2]);
 assert.match(a,/realistic Indonesian/);
 assert.match(b,/original superhero/);
 assert.match(b,/NO lettering/);
 assert.notEqual(a,b);
 assert.throws(()=>scenePrompt({channel:'facebook'},beats[0]));
 assert.throws(()=>sceneBeats('too short'));
});
test('storyboard routes and opt-in video upgrade never auto-publish',()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../migrations/0003_video_storyboard.sql',import.meta.url),'utf8');
 const py=readFileSync(new URL('../tools/render_video.py',import.meta.url),'utf8');
 const wf=readFileSync(new URL('../.github/workflows/render-video.yml',import.meta.url),'utf8');
 assert.match(src,/async function storyboard\(/);
 assert.match(src,/async function storyboardImage\(/);
 assert.match(src,/async function upgradeVideo\(/);
 assert.match(src,/data-upgradevideo/);
 assert.match(src,/data-storyboard/);
 assert.match(src,/existingVideoPreserved:true/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS video_storyboard/);
 assert.match(migration,/PRIMARY KEY\(post_id, scene_index\)/);
 assert.match(py,/def synthesize_neural/);
 assert.match(py,/def get_storyboard_images/);
 assert.match(py,/def motion_graph/);
 assert.match(py,/concat=n=/);
 assert.match(py,/fade=t=in/);
 assert.match(py,/no.*robotic/i);
 assert.ok(!py.includes('espeak-ng'));
 assert.match(wf,/edge-tts/);
 assert.ok(!wf.includes('espeak-ng'));
 assert.match(wf,/CERITEXA_VOICE_PANEX/);
});
test('storyboard GET and renderer assets need an Admin bearer',async()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const app=new Function(core+'\n'+idx+'\nreturn __worker;')();
 const id='11111111-1111-4111-8111-111111111111';
 const env={ADMIN_TOKEN:'TEST_ADMIN_KEY_UNSAFE_FOR_PROD_NEVER_REAL',DB:{prepare:()=>{throw Error('Unauthorized endpoint invoked database')}}};
 for(const path of ['/api/posts/'+id+'/storyboard','/api/posts/'+id+'/storyboard/0/image']){
  const r=await app.fetch(new Request('https://ceritexa.test'+path),env);
  assert.equal(r.status,401);
 }
 const p=await app.fetch(new Request('https://ceritexa.test/api/posts/'+id+'/upgrade-video',
  {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(p.status,401);
});

test('owner cinematic upgrade preserves original MP4 while returning draft to BLOCKED',async()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const app=new Function(core+'\n'+idx+'\nreturn __worker;')();
 const id='11111111-1111-4111-8111-111111111111',oldKey='owner/archive/old-video.mp4',picture='images/cover-original.jpg';
 const post={id,channel:'panex',format:'VIDEO',state:'PENDING_REVIEW',media_type:'video/mp4',media_key:oldKey};
 const mediaObjects=new Set([picture,oldKey]),events=[];
 const env={ADMIN_TOKEN:'CeritexaTestSuperLongAdminToken00001',MEDIA:{get:async key=>mediaObjects.has(key)?{body:'untouched'}:null},
  DB:{prepare(sql){return {bind(...args){return {
   first:async()=>sql.includes('FROM draft_reviews')?{preview_media_key:picture}:post,
   all:async()=>({results:[]}),
   run:async()=>{if(sql.startsWith('INSERT INTO audit'))events.push(args);if(sql.startsWith('UPDATE posts')){post.media_key=args[0];post.state='BLOCKED';post.media_type='image/jpeg';}return {meta:{changes:1}};}
  }}}}}
 };
 const req=()=>new Request('https://ceritexa.test/api/posts/'+id+'/upgrade-video',{method:'POST',headers:{Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'},body:'{}'});
 const response=await app.fetch(req(),env),json=await response.json();
 assert.equal(response.status,200);
 assert.equal(json.existingVideoPreserved,true);
 assert.equal(post.state,'BLOCKED');
 assert.equal(post.media_key,picture);
 assert.equal(post.media_type,'image/jpeg');
 assert.ok(mediaObjects.has(oldKey));
 assert.ok(events.length>0);
 assert.equal((await app.fetch(req(),env)).status,400);
});
test('adaptive storyboard generation batches preserve progress and remain idempotent',async()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const app=new Function(core+'\n'+idx+'\nreturn __worker;')();
 const id='11111111-1111-4111-8111-111111111111';
 const script=Array.from({length:90},(_,i)=>['Seorang','pemuda','berani','mencari','rumah','di','tengah','hutan'][i%8]).join(' ');
 const post={id,channel:'heros',format:'VIDEO',state:'BLOCKED',media_type:'image/jpeg',media_key:'images/cover.jpg',story:script,image_prompt:'Original gold-coated hero'};
 const sceneRows=[],logs=[],kv=new Map([['images/cover.jpg',new Uint8Array(1500)]]);
 let generated=0;
 const media={get:async key=>kv.has(key)?{body:kv.get(key)}:null,put:async(key,value)=>kv.set(key,value)};
 const payload=Buffer.alloc(1600,90).toString('base64');
 const env={ADMIN_TOKEN:'CeritexaTestSuperLongAdminToken00001',MEDIA:media,AI:{run:async()=>{generated++;return {image:payload};}},
  DB:{prepare(sql){return {bind(...args){return {
   first:async()=>sql.includes('SELECT COUNT(*) n FROM audit')?{n:logs.filter(x=>x[0]==='STORYBOARD_SCENE_CREATED').length}:post,
   all:async()=>({results:sceneRows.slice().sort((a,b)=>a.scene_index-b.scene_index)}),
   run:async()=>{if(sql.startsWith('INSERT INTO audit')){logs.push(args);return {meta:{changes:1}};}
     if(sql.startsWith('INSERT OR IGNORE INTO video_storyboard')){if(!sceneRows.some(x=>x.scene_index===args[1]))sceneRows.push({scene_index:args[1],media_key:args[2],beat:args[3],prompt:args[4]});return {meta:{changes:1}};}
     throw Error('Unexpected test SQL '+sql.slice(0,75));}
  }}}}}
 };
 const req=()=>new Request('https://ceritexa.test/api/posts/'+id+'/storyboard',{method:'POST',headers:{Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'},body:'{}'});
 const first=await app.fetch(req(),env);let plan=await first.json();
 assert.equal(first.status,200);
 assert.ok(plan.plannedCount>4);
 assert.equal(plan.sceneCount,SCENES_PER_REQUEST+1);
 assert.equal(plan.ready,false);
 assert.equal(plan.characterMotionGenerated,false);
 assert.equal(generated,SCENES_PER_REQUEST);
 let attempts=0;
 while(!plan.ready&&attempts++<16){
   const result=await app.fetch(req(),env);assert.equal(result.status,200);
   plan=await result.json();
   if(plan.dailyLimitReached)throw Error('Fixture hit daily quota unexpectedly');
 }
 assert.equal(plan.ready,true);
 assert.equal(plan.sceneCount,plan.plannedCount);
 assert.equal(sceneRows.length,plan.plannedCount);
 assert.equal(generated,plan.plannedCount-1);
 const again=await app.fetch(req(),env);
 assert.equal(again.status,200);assert.equal(generated,plan.plannedCount-1);
 assert.equal(sceneRows.length,plan.plannedCount);
 const mediaRes=await app.fetch(new Request('https://ceritexa.test/api/posts/'+id+'/storyboard/2/image',{headers:{Authorization:'Bearer '+env.ADMIN_TOKEN}}),env);
 assert.equal(mediaRes.status,200);
 assert.match(mediaRes.headers.get('Content-Type'),/image\/jpeg/);
});

test('storyboard gallery keeps scene images private and cleans up blob URLs',()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(src,/async function openStoryboardGallery/);
 assert.match(src,/data-viewscenes/);
 assert.match(src,/scene\.previewPath/);
 assert.match(src,/Authorization:'Bearer '\+token/);
 assert.match(src,/activeSceneUrls\.push/);
 assert.match(src,/activeSceneUrls\)URL\.revokeObjectURL/);
 assert.match(src,/scene-gallery/);
 assert.match(src,/Gerakan kamera|gerakan kamera/);
});

test('scene count responds to narrative pacing, action and transitions without fixed 4',()=>{
 const calm=Array.from({length:112},(_,i)=>['Seorang','ibu','memandang','rumah','di','ujung','desa','dan','mengingat','keluarganya'][i%10]).join(' ');
 const action=Array.from({length:112},(_,i)=>['Tiba-tiba','pahlawan','berlari','menyelamatkan','warga','namun','ledakan','mengubah','jalan','pulang'][i%10]).join(' ');
 const calmPanex=sceneBeats(calm,'panex');
 const activeHeros=sceneBeats(action,'heros');
 assert.ok(calmPanex.length>4);
 assert.ok(activeHeros.length>calmPanex.length);
 assert.ok(activeHeros.every(x=>x.total===activeHeros.length));
 assert.equal(activeHeros.map(x=>x.beat).join(' '),action);
 assert.equal(calmPanex.map(x=>x.beat).join(' '),calm);
 assert.ok(activeHeros.every(x=>x.estimatedSeconds>0));
 assert.equal(SCENES_PER_REQUEST,3);
 assert.equal(SCENE_IMAGE_DAILY_LIMIT,12);
 assert.ok(MAX_STORYBOARD_SCENES>=20);
});
test('dynamic storyboard schema migrates previous four records without introducing a parallel permanent table',()=>{
 const migration=readFileSync(new URL('../migrations/0004_dynamic_storyboard.sql',import.meta.url),'utf8');
 assert.match(migration,/INSERT OR IGNORE INTO video_storyboard_flexible_stage/);
 assert.match(migration,/SELECT post_id,scene_index,media_key,beat,prompt,created_at FROM video_storyboard/);
 assert.match(migration,/ALTER TABLE video_storyboard_flexible_stage RENAME TO video_storyboard/);
 assert.match(migration,/scene_index BETWEEN 0 AND 63/);
});
test('renderer supports variable length story images and proportional narration timing',()=>{
 const py=readFileSync(new URL('../tools/render_video.py',import.meta.url),'utf8');
 assert.match(py,/def scene_durations/);
 assert.match(py,/def motion_graph\(durations/);
 assert.match(py,/concat=n=\{len\(durations\)\}/);
 assert.match(py,/dailyLimitReached/);
 assert.match(py,/len\(scenes\) != planned/);
 assert.ok(!py.includes('len(scenes) != 4'));
 assert.ok(!py.includes('scene_count != 4'));
 assert.match(py,/scene_count=\{len\(scenes\)\}/);
});

test('versioned MP4 upload keeps previous videos and never rolls back approved status',async()=>{
 const core=readFileSync(new URL('../src/core.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const idx=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace(/^export /gm,'').replace('default{','const __worker={');
 const app=new Function(core+'\n'+idx+'\nreturn __worker;')();
 const id='aaaa0000-bbbb-4000-8000-cccc00000001',oldKey='owner/'+id+'.mp4',admin='TestAdminTokenLongEnough123456789';
 const post={id,channel:'panex',format:'VIDEO',media_key:oldKey,media_type:'video/mp4',state:'PENDING_REVIEW'};
 const keys=new Set([oldKey]);let forceRace=false,recorded=[];
 const env={ADMIN_TOKEN:admin,MEDIA:{
   put:async key=>{keys.add(key);if(forceRace)post.state='APPROVED';}
  },DB:{
   prepare(sql){return{bind(...p){return{
    first:async()=>post,
    all:async()=>({results:[]}),
    run:async()=>{
     if(sql.startsWith('UPDATE posts SET media_key')){
      if(!['PENDING_REVIEW','BLOCKED'].includes(post.state))return{meta:{changes:0}};
      post.media_key=p[0];post.media_type=p[1];post.state='PENDING_REVIEW';return{meta:{changes:1}};
     }
     if(sql.startsWith('INSERT INTO audit'))recorded.push(p);
     return {meta:{changes:1}};
    }
   }}}}
  }};
 const bytes=new Uint8Array(512);bytes.set([102,116,121,112],4);
 const request=()=>new Request('https://ceritexa.test/api/posts/'+id+'/media',
  {method:'POST',headers:{Authorization:'Bearer '+admin,'Content-Type':'video/mp4'},body:bytes});
 const first=await app.fetch(request(),env);assert.equal(first.status,200);
 const key1=(await first.json()).media_key;
 assert.ok(key1.endsWith('.mp4'));assert.notEqual(key1,oldKey);
 const second=await app.fetch(request(),env);assert.equal(second.status,200);
 const key2=(await second.json()).media_key;assert.notEqual(key2,key1);
 assert.ok(keys.has(key1)&&keys.has(key2)&&keys.has(oldKey));
 assert.equal(post.media_key,key2);
 forceRace=true;
 const stale=await app.fetch(request(),env);assert.equal(stale.status,400);
 assert.equal(post.state,'APPROVED');assert.equal(post.media_key,key2);
 assert.ok(recorded.length>=2);
});
