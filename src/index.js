import {CHANNELS,validate,detectRisk,parseRss,score,parseAI,compareToken,gate,readiness,selectDraftTopic,validateRejection,creativeSimilarity,MAX_REVISION_DEPTH,REJECTION_REASONS,sceneBeats,scenePrompt,MAX_STORYBOARD_SCENES,SCENES_PER_REQUEST,SCENE_IMAGE_DAILY_LIMIT} from './core.js';
const utc=()=>new Date().toISOString(),uuid=()=>crypto.randomUUID();
const answer=(v,c=200)=>Response.json(v,{status:c,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const db=(env,q,...params)=>env.DB.prepare(q).bind(...params);
const row=async(e,q,...p)=>db(e,q,...p).first();
const list=async(e,q,...p)=>(await db(e,q,...p).all()).results||[];
const run=async(e,q,...p)=>db(e,q,...p).run();
async function audit(e,action,id='',detail=''){await run(e,'INSERT INTO audit(id,action,entity_id,detail,at) VALUES(?,?,?,?,?)',uuid(),action,id,String(detail).slice(0,300),utc());}
async function isPaused(e){return (await row(e,"SELECT value FROM settings WHERE key='paused'"))?.value!=='false';}

// Dedicated owner-login session; do not persist the ADMIN_TOKEN in browser storage.
// The session cookie is opaque, HttpOnly, Secure, SameSite=Strict and revocable.
const SESSION_COOKIE='__Host-ceritexa_session',SESSION_SECONDS=365*24*3600;
const sessionNow=()=>Math.floor(Date.now()/1000);
const digestHex=async value=>{
 const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
};
const cookieValue=(req,name)=>{
 const str=req.headers.get('Cookie')||'';
 const entry=str.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
 return entry?entry.slice(name.length+1):'';
};
const ownerCookie=(value,age)=>SESSION_COOKIE+'='+value+'; Path=/; Max-Age='+age+'; HttpOnly; Secure; SameSite=Strict';
const ownerJson=(data,status=200,sessionCookie=null)=>{
 const h={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(sessionCookie)h['Set-Cookie']=sessionCookie;
 return Response.json(data,{status,headers:h});
};
const newOpaqueToken=()=>{
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
};
const sessionClient=async(req,e)=>digestHex((req.headers.get('CF-Connecting-IP')||'unknown-client')+':'+e.ADMIN_TOKEN);
async function loginOwner(req,e){
 if(!e.ADMIN_TOKEN||!e.DB)return ownerJson({error:'Layanan autentikasi belum siap'},503);
 const length=Number(req.headers.get('Content-Length')||0);
 if(length>2048)return ownerJson({error:'Permintaan terlalu besar'},413);
 const client=await sessionClient(req,e),now=sessionNow();
 const rate=await row(e,'SELECT failed_attempts,reset_at,locked_until FROM admin_login_limits WHERE client_hash=?',client);
 if(Number(rate?.locked_until||0)>now)return ownerJson({error:'Terlalu banyak percobaan. Coba lagi nanti.'},429);
 let input={};
 try{input=await req.json()}catch{return ownerJson({error:'Token diperlukan'},400)}
 const supplied=typeof input.token==='string'?input.token:'';
 if(supplied.length>500||!compareToken(supplied,e.ADMIN_TOKEN)){
  const validWindow=Number(rate?.reset_at||0)>now;
  const failures=(validWindow?Number(rate?.failed_attempts||0):0)+1;
  const lock=failures>=8?now+15*60:0;
  await run(e,'INSERT INTO admin_login_limits(client_hash,failed_attempts,reset_at,locked_until) VALUES(?,?,?,?) ON CONFLICT(client_hash) DO UPDATE SET failed_attempts=excluded.failed_attempts,reset_at=excluded.reset_at,locked_until=excluded.locked_until',
    client,failures,validWindow?Number(rate.reset_at):now+15*60,lock);
  return ownerJson({error:lock?'Terlalu banyak percobaan. Coba lagi nanti.':'Admin Token tidak sesuai'},lock?429:401);
 }
 await run(e,'DELETE FROM admin_login_limits WHERE client_hash=?',client);
 const token=newOpaqueToken(),hash=await digestHex(e.ADMIN_TOKEN+':'+token),expires=now+SESSION_SECONDS;
 await run(e,'INSERT INTO admin_sessions(session_hash,created_at,expires_at,last_seen) VALUES(?,?,?,?)',hash,now,expires,now);
 await audit(e,'OWNER_LOGIN','','Owner session started using secure cookie');
 return ownerJson({authenticated:true,session:'active'},200,ownerCookie(token,SESSION_SECONDS));
}
async function readOwnerSession(req,e){
 const token=cookieValue(req,SESSION_COOKIE);
 if(!/^[a-f0-9]{64}$/.test(token)||!e.DB)return null;
 const hash=await digestHex(e.ADMIN_TOKEN+':'+token);
 const data=await row(e,'SELECT session_hash,expires_at,last_seen FROM admin_sessions WHERE session_hash=?',hash);
 const now=sessionNow();
 if(!data||Number(data.expires_at)<=now)return null;
 return {token,hash,expires:Number(data.expires_at),lastSeen:Number(data.last_seen)};
}
async function sessionStatus(req,e){
 if(!e.ADMIN_TOKEN||!e.DB)return ownerJson({authenticated:false});
 const session=await readOwnerSession(req,e);
 if(!session)return ownerJson({authenticated:false});
 const now=sessionNow();
 if(session.expires-now<90*24*3600){
  await run(e,'UPDATE admin_sessions SET expires_at=?,last_seen=? WHERE session_hash=?',
    now+SESSION_SECONDS,now,session.hash);
  return ownerJson({authenticated:true,session:'active'},200,ownerCookie(session.token,SESSION_SECONDS));
 }
 return ownerJson({authenticated:true,session:'active'});
}
async function logoutOwner(req,e){
 const session=await readOwnerSession(req,e);
 if(session)await run(e,'DELETE FROM admin_sessions WHERE session_hash=?',session.hash);
 if(e.DB)await audit(e,'OWNER_LOGOUT','','Owner signed out');
 return ownerJson({authenticated:false},200,ownerCookie('',0));
}
function sameOriginMutation(req){
 const origin=req.headers.get('Origin');
 if(origin){
  try{if(new URL(origin).origin!==new URL(req.url).origin)return false}catch{return false}
 }
 return req.headers.get('X-Ceritexa-Request')==='dashboard';
}

const seeds=['Perjuangan ibu membesarkan keluarga','Persahabatan yang diuji oleh rahasia','Pilihan berat seorang pahlawan orisinal','Warung keluarga menghadapi penutupan','Misteri fiksi tetangga baru'];
const mtext='@cf/google/gemma-4-26b-a4b-it'; // JSON/Indonesian schema verified against Cloudflare Workers AI
const mimage='@cf/black-forest-labs/flux-1-schnell';
function aiPrompt(channel,format,topic,feedback=''){return [
 'You are an expert original fiction writer for '+CHANNELS[channel].label+'.',
 'Indonesian audience. Channel identity: '+CHANNELS[channel].topic+'. Original topic: '+topic+'. Format '+format+'.',
 'Build one coherent fictional story with a surprising hook, realistic motivation, escalating conflict, an emotionally convincing resolution and warm ending. Real Indonesian dialogue. No repetitive cliches.',
 'Do not copy prior drafts. No named real people, Marvel/DC heroes, copyrighted scripts, disinformation, medical claims or spam engagement bait.',
 format==='VIDEO'?'VIDEO SHORTS: create one COMPLETE original voiceover story of 85-115 Indonesian words with a strong ending; do not output scene numbering.':'Write a vivid story of 140-220 Indonesian words with concrete scenes, not an advertisement or summary.',
 'Return only valid JSON with exactly four string keys title,story,caption,imagePrompt. Caption must be concise, original, natural and not clickbait.',
 'imagePrompt: specific English cinematic illustration of a fresh original scene, distinctive lighting, no text/lettering and vertical 9:16. Comics should have four clear story panels with no lettering.',
 feedback?'STRICT OWNER REVISION REQUEST. Improve quality based on these notes, not merely synonym swaps. '+feedback:''
 ].filter(Boolean).join('\n');}
export async function research(e){
 let items=[],source='google_trends_rss';try{
  const r=await fetch('https://trends.google.com/trending/rss?geo=ID',{headers:{Accept:'application/rss+xml'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  items=parseRss(await r.text());if(!items.length)throw Error('RSS kosong');
 }catch(err){source='editorial_seeds_not_live';items=seeds.map(topic=>({topic,url:'https://trends.google.com/trending?geo=ID'}));}
 for(const item of items)await run(e,'INSERT INTO trends(id,topic,url,source,score,created_at) VALUES(?,?,?,?,?,?)',uuid(),item.topic,item.url,source,Math.max(...Object.keys(CHANNELS).map(x=>score(item.topic,x))),utc());
 await audit(e,'RESEARCH','',source+' '+items.length);
 return {source,count:items.length};
}
async function saveAIArtwork(e,key,prompt){
 if(!e.MEDIA||!e.AI)throw Error('Media / Workers AI tidak tersedia');
 const image=await e.AI.run(mimage,{prompt:String(prompt).slice(0,1200),steps:4});
 if(!image?.image)throw Error('Image response invalid');
 const bytes=Uint8Array.from(atob(image.image),c=>c.charCodeAt(0));
 if(bytes.byteLength<1000||bytes.byteLength>8_000_000)throw Error('Ukuran gambar AI tidak valid');
 await e.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
 return {key,bytes:bytes.byteLength};
}
export async function makeDraft(e,channel,format,topic,options={}){
 validate(channel,format);
 if(!e.AI)throw Error('Cloudflare AI binding tidak tersedia');
 const limit=Math.max(1,Math.min(100,Number(e.MONTHLY_DRAFT_LIMIT||24)));
 const used=await row(e,'SELECT COUNT(*) n FROM posts WHERE created_at>=?',utc().slice(0,7)+'-01');
 if(Number(used?.n||0)>=limit)throw Error('Batas draft bulanan tercapai; coba bulan depan atau naikkan kuota secara sadar');
 let selected;
 if(options.parent)selected=options.parent.topic;
 else{
  const savedStrategy=await row(e,'SELECT value FROM settings WHERE key=?','strategy_'+channel);
  const leader=savedStrategy?.value?JSON.parse(savedStrategy.value).recommendedTopic:null;
  const recentTrends=await list(e,'SELECT topic FROM trends ORDER BY created_at DESC LIMIT 25');
  selected=selectDraftTopic(channel,{userTopic:topic,strategyTopic:leader,trends:recentTrends,dayIndex:Math.floor(Date.now()/86400000)});
 }
 const parent=options.parent||null;
 const feedback=parent?[
  'Original topic: '+parent.topic,
  'Original title: '+String(parent.title).slice(0,150),
  'Previous story to improve, never repeat verbatim: '+String(parent.story).slice(0,2600),
  'Previous caption: '+String(parent.caption).slice(0,500),
  'Rejected by owner because: '+String(options.reason||''),
  'Owner notes: '+String(options.note||''),
  'Change plot/characters/hook and camera perspective with a stronger emotional payoff. Produce a clearly DISTINCT take on the SAME TOPIC.'
 ].join('\n'):'';
 let cr=null,lastError='';
 // Rejected drafts are not reused; regenerate with feedback and check substantive difference.
 for(let attempt=0;attempt<3&&!cr;attempt++){
  for(const model of [mtext,'@cf/meta/llama-3.1-8b-instruct-fp8']){
   try{
    const result=await e.AI.run(model,{
     messages:[{role:'system',content:'Write ORIGINAL Indonesian fiction. Return ONLY valid JSON with title,story,caption,imagePrompt.'},
               {role:'user',content:aiPrompt(channel,format,selected,feedback+(attempt?' IMPORTANT: Previous revised proposal was insufficiently different. Write a completely new original narrative approach.':'') )}],
     max_tokens:1900,temperature:Math.min(0.8,0.45+attempt*0.14),
     ...(model===mtext?{chat_template_kwargs:{enable_thinking:false}}:{})
    });
    const text=result?.response||result?.choices?.[0]?.message?.content||result?.output_text||result?.text||'';
    const candidate=parseAI(text);
    const words=candidate.story.trim().split(/\s+/).length;
    if(format==='VIDEO'&&(words<65||words>145))throw Error('Naskah video bukan cerita utuh 65-145 kata');
    if(format!=='VIDEO'&&words<90)throw Error('Cerita terlalu pendek');
    if(parent&&(candidate.title.trim().toLocaleLowerCase('id-ID')===parent.title.trim().toLocaleLowerCase('id-ID')||
      creativeSimilarity(candidate.story,parent.story)>0.68||
      candidate.caption.trim()===parent.caption.trim()))throw Error('Revisi terlalu mirip draft lama');
    cr=candidate;break;
   }catch(err){lastError=String(err).slice(0,135);}
  }
 }
 if(!cr)throw Error('Regenerasi gagal memberi cerita orisinal cukup baik: '+lastError);
 const id=uuid();let mediaKey=null,mediaType=null,issue='',previewKey=null;
 // Every draft gets an illustration for owner REVIEW, even TEXT. TEXT publisher still posts text only.
 if(!e.MEDIA){if(format!=='TEXT')issue='MEDIA_STORAGE_NOT_ENABLED';}
 else{
  try{
   previewKey='images/'+id+'.jpg';
   await saveAIArtwork(e,previewKey,cr.imagePrompt);
   mediaKey=previewKey;mediaType='image/jpeg';
  }catch(err){
   if(format!=='TEXT')issue='IMAGE_GENERATION_FAILED';
   await audit(e,'PREVIEW_IMAGE_FAILED',id,String(err));
  }
 }
 if(format==='VIDEO')issue=mediaKey?'VIDEO_RENDER_REQUIRED':'VIDEO_IMAGE_REQUIRED';
 const created=utc(),state=issue?'BLOCKED':'PENDING_REVIEW';
 await run(e,'INSERT INTO posts(id,channel,format,title,story,caption,topic,image_prompt,media_key,media_type,state,license_ok,risk_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
 id,channel,format,cr.title,cr.story,cr.caption,selected,cr.imagePrompt,mediaKey,mediaType,state,0,issue,created,created);
 await run(e,'INSERT INTO draft_reviews(post_id,parent_id,revision_depth,preview_media_key,updated_at) VALUES(?,?,?,?,?)',
  id,parent?.id||null,parent?Number(options.depth||1):0,previewKey,created);
 await audit(e,parent?'DRAFT_REGENERATED':'DRAFT_CREATED',id,channel+'/'+format+(parent?'; parent='+parent.id:''));
 return {id,channel,format,status:state,issue,previewReady:!!previewKey,revisionDepth:parent?Number(options.depth||1):0,parentId:parent?.id||null};
}
async function regenerateCover(e,id){
 if(!e.MEDIA||!e.AI)throw Error('Media atau Workers AI tidak tersedia');
 const p=await row(e,'SELECT * FROM posts WHERE id=?',id);
 if(!p||!['PENDING_REVIEW','BLOCKED'].includes(p.state))throw Error('Gambar hanya dapat diperbaiki saat review');
 if(p.format==='VIDEO'&&p.media_type==='video/mp4')throw Error('Video sudah dirender; tolak draft untuk revisi visual menyeluruh');
 const count=await row(e,"SELECT COUNT(*) n FROM audit WHERE action='PREVIEW_GENERATED' AND at>=?",utc().slice(0,10));
 if(Number(count?.n||0)>=8)throw Error('Maksimal delapan perbaikan gambar per hari');
 const prompt=[p.image_prompt,'Create a specific fresh review illustration fitting title:',p.title,'Story tone:',p.story.slice(0,550),
  'No text, no logo, no trademark, no real public people, vertical 9:16, cinematic lighting.'].join(' ').slice(0,1100);
 const key='review/'+id+'/'+uuid()+'.jpg';
 await saveAIArtwork(e,key,prompt);
 await run(e,"INSERT INTO draft_reviews(post_id,preview_media_key,updated_at) VALUES(?,?,?) ON CONFLICT(post_id) DO UPDATE SET preview_media_key=excluded.preview_media_key,updated_at=excluded.updated_at",id,key,utc());
 const isVideo=p.format==='VIDEO';
 await run(e,"UPDATE posts SET media_key=?,media_type='image/jpeg',state=?,risk_note=?,updated_at=? WHERE id=?",
   key,isVideo?'BLOCKED':'PENDING_REVIEW',isVideo?'VIDEO_RENDER_REQUIRED':'',utc(),id);
 await audit(e,'PREVIEW_GENERATED',id,'Owner-generated review artwork');
 return {id,previewReady:true,updated:true};
}
async function approve(e,id){
 const p=await row(e,'SELECT * FROM posts WHERE id=?',id);
 if(!p||p.state!=='PENDING_REVIEW')throw Error('Draft tidak tersedia untuk approval');
 const problem=gate({...p,state:'APPROVED',license_ok:1});
 if(problem)throw Error('Gagal review: '+problem);
 await run(e,"UPDATE posts SET state='APPROVED',license_ok=1,updated_at=? WHERE id=? AND state='PENDING_REVIEW'",utc(),id);
 await audit(e,'APPROVED',id);return {id,state:'APPROVED'};
}
async function edit(e,id,data){
 const p=await row(e,'SELECT * FROM posts WHERE id=?',id);
 if(!p||!['PENDING_REVIEW','BLOCKED'].includes(p.state))throw Error('Hanya draft belum disetujui yang dapat diedit');
 const title=String(data.title??p.title).trim().slice(0,100);
 const story=String(data.story??p.story).trim().slice(0,6500);
 const caption=String(data.caption??p.caption).trim().slice(0,2000);
 if(!title||story.length<100||!caption)throw Error('Judul/caption wajib dan cerita minimal 100 karakter');
 if(detectRisk(title+' '+story+' '+caption))throw Error('Konten berisiko IP atau menyesatkan');
 if(p.format==='VIDEO'&&p.media_type==='video/mp4'&&story!==p.story)throw Error('Naskah video sudah dirender. Hanya judul dan caption yang dapat diubah');
 await run(e,'UPDATE posts SET title=?,story=?,caption=?,updated_at=? WHERE id=?',title,story,caption,utc(),id);
 await audit(e,'DRAFT_EDITED',id,'owner edited existing draft');
 return {id,state:p.state,updated:true};
}
async function createReplacement(e,source,reason,note,depth){
 try{
  const child=await makeDraft(e,source.channel,source.format,source.topic,{parent:source,reason,note,depth:depth+1});
  await run(e,"UPDATE draft_reviews SET regen_state='DONE',last_error=NULL,updated_at=? WHERE post_id=?",utc(),source.id);
  await audit(e,'REJECTION_REPLACED',source.id,'replacement='+child.id+'; depth='+child.revisionDepth);
  return {rejected:true,replacement:child,regenerated:true,limitReached:false};
 }catch(error){
  const message=String(error?.message||error).slice(0,250);
  await run(e,"UPDATE draft_reviews SET regen_state='FAILED',last_error=?,updated_at=? WHERE post_id=?",message,utc(),source.id);
  await audit(e,'REGENERATION_FAILED',source.id,message);
  return {rejected:true,regenerated:false,replacement:null,regenerationError:message,canRetry:true};
 }
}
async function rejectDraft(e,id,reason,note){
 const source=await row(e,'SELECT * FROM posts WHERE id=?',id);
 if(!source||!['PENDING_REVIEW','BLOCKED'].includes(source.state))throw Error('Hanya draft menunggu review yang bisa ditolak');
 const current=await row(e,'SELECT revision_depth,regen_state FROM draft_reviews WHERE post_id=?',id);
 const check=validateRejection(reason,note,current?.revision_depth||0);
 const claimed=await run(e,"UPDATE posts SET state='REJECTED',updated_at=? WHERE id=? AND state IN ('PENDING_REVIEW','BLOCKED')",utc(),id);
 if(claimed.meta?.changes!==1)throw Error('Draft sudah diproses. Segarkan halaman.');
 await run(e,"INSERT OR IGNORE INTO draft_reviews(post_id,revision_depth,updated_at) VALUES(?,?,?)",id,check.depth,utc());
 const state=check.maxReached?'LIMIT_REACHED':'GENERATING';
 await run(e,"UPDATE draft_reviews SET rejection_reason=?,rejection_note=?,regen_state=?,last_error=NULL,updated_at=? WHERE post_id=?",check.reason,check.note,state,utc(),id);
 await audit(e,'DRAFT_REJECTED',id,check.reason+'; '+check.note.slice(0,100));
 if(check.maxReached)return {id,rejected:true,regenerated:false,limitReached:true,message:'Batas 3 kali regenerasi tercapai. Pilih topik baru atau edit manual.'};
 return {id,...await createReplacement(e,source,check.reason,check.note,check.depth)};
}
async function retryRegeneration(e,id){
 const source=await row(e,'SELECT * FROM posts WHERE id=?',id);
 const meta=await row(e,'SELECT * FROM draft_reviews WHERE post_id=?',id);
 if(!source||source.state!=='REJECTED'||!meta)throw Error('Draft belum ditolak');
 if(meta.regen_state!=='FAILED'||Number(meta.revision_depth)>=MAX_REVISION_DEPTH)throw Error('Regenerasi sudah diproses atau batas revisi tercapai');
 const exists=await row(e,'SELECT post_id FROM draft_reviews WHERE parent_id=? LIMIT 1',id);
 if(exists)throw Error('Draft pengganti sudah ada');
 const claim=await run(e,"UPDATE draft_reviews SET regen_state='GENERATING',updated_at=? WHERE post_id=? AND regen_state='FAILED'",utc(),id);
 if(claim.meta?.changes!==1)throw Error('Regenerasi sedang berjalan');
 await audit(e,'REGENERATION_RETRY',id,'retry after prior failure');
 return {id,...await createReplacement(e,source,meta.rejection_reason,meta.rejection_note,Number(meta.revision_depth))};
}
async function schedule(e,id,s){
 const p=await row(e,'SELECT * FROM posts WHERE id=?',id);
 if(!p||gate(p))throw Error('Konten belum disetujui atau pemeriksaan gagal');
 const date=new Date(s);
 if(!Number.isFinite(date.getTime())||date.getTime()<Date.now()+30000)throw Error('Jadwal harus di masa depan');
 await run(e,"UPDATE posts SET state='SCHEDULED',scheduled_at=?,updated_at=? WHERE id=? AND state='APPROVED'",date.toISOString(),utc(),id);
 await audit(e,'SCHEDULED',id,date.toISOString());return {id,state:'SCHEDULED',scheduled_at:date.toISOString()};
}
async function upload(e,id,req){
 if(!e.MEDIA)throw Error('MEDIA_STORAGE_NOT_ENABLED');
 const p=await row(e,'SELECT * FROM posts WHERE id=?',id);
 if(!p||!['BLOCKED','PENDING_REVIEW'].includes(p.state))throw Error('Draft tidak dapat menerima media');
 // TEXT may carry a private review-only cover; publishing remains text-only.
 const mime=(req.headers.get('Content-Type')||'').split(';')[0],len=Number(req.headers.get('Content-Length')||0);
 if(!['image/png','image/jpeg','video/mp4'].includes(mime)||len>8_000_000)throw Error('Hanya PNG/JPEG/MP4 <=8MB');
 const arr=new Uint8Array(await req.arrayBuffer());
 if(arr.length<20||arr.length>8_000_000)throw Error('Ukuran tidak valid');
 const jpg=arr[0]===255&&arr[1]===216, png=arr[0]===137&&arr[1]===80&&arr[2]===78&&arr[3]===71,mp4=String.fromCharCode(...arr.slice(4,8))==='ftyp';
 if((mime==='image/jpeg'&&!jpg)||(mime==='image/png'&&!png)||(mime==='video/mp4'&&!mp4))throw Error('Signature media tidak valid');
 if(p.format==='VIDEO'&&!mp4)throw Error('VIDEO requires MP4');
 if(p.format!=='VIDEO'&&mp4)throw Error('Preview foto/teks/komik memerlukan gambar');
 // Versioned objects are CRITICAL: a new cinematic MP4 must not overwrite a
 // previous owner-review MP4, including legacy owner/<post-id>.mp4 media.
 const key='owner/'+id+'/'+uuid()+(mp4?'.mp4':png?'.png':'.jpg');
 await e.MEDIA.put(key,arr,{httpMetadata:{contentType:mime}});
 // A reviewer may have approved/scheduled the post while we uploaded.
 // A CAS update prevents a late upload from rolling back an approved post.
 const claim=await run(e,"UPDATE posts SET media_key=?,media_type=?,state='PENDING_REVIEW',risk_note='',updated_at=? WHERE id=? AND state IN ('BLOCKED','PENDING_REVIEW')",key,mime,utc(),id);
 if(claim.meta?.changes!==1)throw Error('Status draft berubah ketika upload. Media lama tetap aman; muat ulang.');
 if(!mp4)await run(e,"INSERT INTO draft_reviews(post_id,preview_media_key,updated_at) VALUES(?,?,?) ON CONFLICT(post_id) DO UPDATE SET preview_media_key=excluded.preview_media_key,updated_at=excluded.updated_at",id,key,utc());
 await audit(e,'MEDIA_UPLOADED',id,mime);return {id,media_key:key};
}
/** Add distinct original visual beats to an existing blocked VIDEO draft.
 * The runner can resume partial creation; existing storyboard assets are not regenerated.
 * Paid text-to-video models are deliberately NOT called.
 */
async function storyboard(e,id,generate=false){
 const p=await row(e,'SELECT * FROM posts WHERE id=?',id);
 if(!p||p.format!=='VIDEO'||!['panex','heros'].includes(p.channel))throw Error('Draft video YouTube tidak ditemukan');
 if(generate&&!(p.state==='BLOCKED'&&p.media_type==='image/jpeg'))
  throw Error('Storyboard hanya boleh dibuat pada VIDEO BLOCKED dengan cover JPEG');
 if(generate&&(!e.MEDIA||!e.AI))throw Error('Media atau Workers AI tidak tersedia');
 const beats=sceneBeats(p.story,p.channel);
 const expected=beats.length;
 let saved=await list(e,'SELECT scene_index,media_key,beat,created_at FROM video_storyboard WHERE post_id=? ORDER BY scene_index',id);
 const wasReady=saved.length===expected&&saved.every((part,i)=>part.scene_index===i&&part.beat===beats[i].beat);
 let stale=saved.some(part=>!beats[part.scene_index]||part.beat!==beats[part.scene_index].beat);
 if(p.media_type==='image/jpeg'&&saved.some(part=>part.scene_index===0&&part.media_key!==p.media_key))stale=true;
 if(generate&&stale){
  // Owner requested re-planning; retain every original media object in private KV.
  // Persist the old scene indices and KV keys in the EXISTING audit log before unlinking
  // metadata, so a previous storyboard remains traceable without duplicate tables.
  for(const part of saved)await audit(e,'STORYBOARD_SCENE_ARCHIVED',id,
   'index='+part.scene_index+'; key='+String(part.media_key).slice(0,185)+'; beat='+String(part.beat).slice(0,55));
  await run(e,'DELETE FROM video_storyboard WHERE post_id=?',id);
  await audit(e,'STORYBOARD_REPLANNED',id,'Previous plan archived; '+saved.length+' KV image objects preserved');
  saved=[];stale=false;
 }
 if(generate){
  if(!saved.some(x=>x.scene_index===0)){
   const first=p.media_key||(await row(e,'SELECT preview_media_key FROM draft_reviews WHERE post_id=?',id))?.preview_media_key;
   if(!first)throw Error('Ilustrasi cover belum tersedia. Buat gambar review terlebih dahulu.');
   await run(e,'INSERT OR IGNORE INTO video_storyboard(post_id,scene_index,media_key,beat,prompt,created_at) VALUES(?,?,?,?,?,?)',
    id,0,first,beats[0].beat,scenePrompt(p,beats[0]),utc());
   saved=await list(e,'SELECT scene_index,media_key,beat,created_at FROM video_storyboard WHERE post_id=? ORDER BY scene_index',id);
  }
  let generated=0;
  for(let i=1;i<expected;i++){
   if(saved.some(x=>x.scene_index===i))continue;
   if(generated>=SCENES_PER_REQUEST)break;
   const used=await row(e,"SELECT COUNT(*) n FROM audit WHERE action='STORYBOARD_SCENE_CREATED' AND at>=?",utc().slice(0,10));
   if(Number(used?.n||0)>=SCENE_IMAGE_DAILY_LIMIT)break;
   const scene=beats[i],prompt=scenePrompt(p,scene),key='storyboard/'+id+'/'+i+'/'+uuid()+'.jpg';
   try{
    await saveAIArtwork(e,key,prompt);
    await run(e,'INSERT OR IGNORE INTO video_storyboard(post_id,scene_index,media_key,beat,prompt,created_at) VALUES(?,?,?,?,?,?)',
     id,i,key,scene.beat,prompt,utc());
    await audit(e,'STORYBOARD_SCENE_CREATED',id,'scene '+(i+1)+' / '+expected+'; channel '+p.channel);
    generated++;
    saved.push({scene_index:i,media_key:key,beat:scene.beat,created_at:utc()});
   }catch(error){
    await audit(e,'STORYBOARD_FAILED',id,'scene '+(i+1)+'/'+expected+': '+String(error.message||error).slice(0,145));
    throw error;
   }
  }
  saved.sort((a,b)=>a.scene_index-b.scene_index);
  if(!wasReady&&saved.length===expected&&saved.every((part,i)=>part.scene_index===i&&part.beat===beats[i].beat))
   await audit(e,'STORYBOARD_READY',id,expected+' story-matched scenes prepared');
 }
 const ready=!stale&&saved.length===expected&&saved.every((part,i)=>part.scene_index===i&&part.beat===beats[i].beat);
 let dailyUsed=0;
 if(generate){
  const count=await row(e,"SELECT COUNT(*) n FROM audit WHERE action='STORYBOARD_SCENE_CREATED' AND at>=?",utc().slice(0,10));
  dailyUsed=Number(count?.n||0);
 }
 return {
  id,ready,stale,sceneCount:saved.length,plannedCount:expected,
  remaining:Math.max(0,expected-saved.length),needsContinuation:!ready,
  dailyLimitReached:!ready&&dailyUsed>=SCENE_IMAGE_DAILY_LIMIT,
  dailyRemaining:generate?Math.max(0,SCENE_IMAGE_DAILY_LIMIT-dailyUsed):undefined,
  estimatedSeconds:Math.round(beats.reduce((n,x)=>n+x.estimatedSeconds,0)),
  renderMode:'CINEMATIC_MOTION_COMIC',characterMotionGenerated:false,
  scenes:saved.map(x=>({index:x.scene_index,beat:x.beat,previewPath:'/api/posts/'+id+'/storyboard/'+x.scene_index+'/image'}))
 };
}
async function storyboardImage(e,id,index){
 const scene=await row(e,'SELECT media_key FROM video_storyboard WHERE post_id=? AND scene_index=?',id,index);
 if(!scene||!e.MEDIA)return new Response('Scene not found',{status:404});
 const file=await e.MEDIA.get(scene.media_key);
 return file?new Response(file.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}}):new Response('Scene unavailable',{status:404});
}
/** Explicit opt-in re-render: previously produced MP4 object remains in KV unchanged. */
async function upgradeVideo(e,id){
 const p=await row(e,'SELECT * FROM posts WHERE id=?',id);
 if(!p||p.format!=='VIDEO'||p.state!=='PENDING_REVIEW'||p.media_type!=='video/mp4')throw Error('Hanya video MP4 yang masih menunggu review dapat ditingkatkan');
 const meta=await row(e,'SELECT preview_media_key FROM draft_reviews WHERE post_id=?',id);
 const art=meta?.preview_media_key;
 if(!art||!e.MEDIA||!(await e.MEDIA.get(art)))throw Error('Cover asli tidak tersedia. MP4 lama dipertahankan; tidak ada perubahan.');
 const claimed=await run(e,"UPDATE posts SET media_key=?,media_type='image/jpeg',state='BLOCKED',risk_note='VIDEO_RENDER_REQUIRED',updated_at=? WHERE id=? AND state='PENDING_REVIEW' AND media_type='video/mp4'",
 art,utc(),id);
 if(claimed.meta?.changes!==1)throw Error('Draft telah berubah; muat ulang');
 await audit(e,'VIDEO_CINEMATIC_UPGRADE_REQUESTED',id,'MP4 lama disimpan; adegan adaptif menurut alur cerita + neural TTS');
 return {id,state:'BLOCKED',media_type:'image/jpeg',queued:true,existingVideoPreserved:true};
}

/** Renderer status from private GitHub Action; never changes approval or publication. */
async function renderEvent(e,id,data){
 const state=String(data.status||'').toUpperCase();
 if(!['STARTED','FAILED','COMPLETED'].includes(state))throw Error('Render status tidak valid');
 const p=await row(e,'SELECT id,channel,format,state,media_type FROM posts WHERE id=?',id);
 if(!p||p.format!=='VIDEO'||!['panex','heros'].includes(p.channel))throw Error('Draft video YouTube tidak ditemukan');
 if(state==='COMPLETED'&&!(p.state==='PENDING_REVIEW'&&p.media_type==='video/mp4'))throw Error('Render selesai hanya setelah MP4 tersimpan dan draft PENDING_REVIEW');
 if(state==='STARTED'&&p.state!=='BLOCKED')throw Error('Render hanya boleh memproses draft BLOCKED');
 const detail=String(data.detail||'').replace(/[\r\n\t]+/g,' ').slice(0,230);
 await audit(e,'RENDER_'+state,id,detail);
 return {id,status:state,accepted:true,mediaReady:p.media_type==='video/mp4'};
}
async function media(e,id,preview=false){
 const p=await row(e,'SELECT p.media_key,p.media_type,r.preview_media_key FROM posts p LEFT JOIN draft_reviews r ON r.post_id=p.id WHERE p.id=?',id);
 if(!p||!e.MEDIA)return new Response('Not found',{status:404});
 const key=preview?(p.preview_media_key||(p.media_type?.startsWith('image/')?p.media_key:null)):p.media_key;
 if(!key)return new Response('Not found',{status:404});
 const file=await e.MEDIA.get(key);
 const type=preview?(key===p.media_key&&p.media_type==='image/png'?'image/png':'image/jpeg'):(p.media_type||'application/octet-stream');
 return file?new Response(file.body,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=0','X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});
}
async function youtubeToken(e,channel){
 const rt=channel==='panex'?e.YT_REFRESH_TOKEN_PANEX:e.YT_REFRESH_TOKEN_HEROS;
 const id=channel==='panex'?e.YT_CHANNEL_ID_PANEX:e.YT_CHANNEL_ID_HEROS;
 if(!rt||!id||!e.YT_CLIENT_ID||!e.YT_CLIENT_SECRET)throw Error('Youtube OAuth channel belum siap');
 if(e.YT_CHANNEL_ID_PANEX && e.YT_CHANNEL_ID_HEROS && e.YT_CHANNEL_ID_PANEX===e.YT_CHANNEL_ID_HEROS)throw Error('Panex dan Heros tidak boleh memakai YouTube Channel ID sama');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:e.YT_CLIENT_ID,client_secret:e.YT_CLIENT_SECRET,refresh_token:rt,grant_type:'refresh_token'})});
 if(!r.ok)throw Error('YouTube token error HTTP '+r.status);
 const token=(await r.json()).access_token;
 const chk=await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers:{Authorization:'Bearer '+token}});
 if(!chk.ok)throw Error('YouTube identity unavailable '+chk.status);
 if(!(await chk.json()).items?.some(x=>x.id===id))throw Error('YouTube OAuth channel mismatch');
 return token;
}
async function facebookIdentity(e){
 if(!e.FB_PAGE_ID || !e.FB_PAGE_ACCESS_TOKEN)throw Error('Facebook Page Ceritexa belum dikonfigurasi');
 const r=await fetch('https://graph.facebook.com/v24.0/'+encodeURIComponent(e.FB_PAGE_ID)+'?fields=id,name',{
  headers:{Authorization:'Bearer '+e.FB_PAGE_ACCESS_TOKEN}
 });
 if(!r.ok)throw Error('Meta Page identity HTTP '+r.status);
 const page=await r.json();
 if(String(page.id)!==String(e.FB_PAGE_ID) || !/^ceritexa(?:[ ]|$)/i.test(String(page.name||''))){
  throw Error('Meta Page salah: hanya Ceritexa Studio diizinkan; posting dibatalkan');
 }
 return {id:String(page.id),name:String(page.name)};
}
async function verifyConnections(e){
 const result={facebook:{verified:false},panex:{verified:false},heros:{verified:false}};
 try{const page=await facebookIdentity(e);result.facebook={verified:true,id:page.id,name:page.name};}catch(error){result.facebook.error=String(error.message||error).slice(0,120);}
 for(const channel of ['panex','heros']){
  try{
   if(e.YT_CHANNEL_ID_PANEX && e.YT_CHANNEL_ID_HEROS && e.YT_CHANNEL_ID_PANEX===e.YT_CHANNEL_ID_HEROS)throw Error('Dua channel YouTube tidak boleh memakai ID yang sama');
   await youtubeToken(e,channel);
   result[channel]={verified:true,id:channel==='panex'?e.YT_CHANNEL_ID_PANEX:e.YT_CHANNEL_ID_HEROS};
  }catch(error){result[channel].error=String(error.message||error).slice(0,120);}
 }
 return result;
}
async function providerPublish(e,p){
 if(p.channel==='facebook'){
  await facebookIdentity(e);
  let url='https://graph.facebook.com/v24.0/'+encodeURIComponent(e.FB_PAGE_ID)+'/feed',body;
  if(p.format==='TEXT')body=new URLSearchParams({message:p.caption,access_token:e.FB_PAGE_ACCESS_TOKEN});
  else if(p.format==='PHOTO'||p.format==='COMIC'){
   if(!e.MEDIA)throw Error('Media storage belum aktif');
   const file=await e.MEDIA.get(p.media_key);if(!file)throw Error('Media hilang');
   url='https://graph.facebook.com/v24.0/'+encodeURIComponent(e.FB_PAGE_ID)+'/photos';
   body=new FormData();body.append('source',new Blob([await file.arrayBuffer()],{type:p.media_type}),'ceritexa.jpg');body.append('caption',p.caption);body.append('access_token',e.FB_PAGE_ACCESS_TOKEN);
  }else throw Error('Facebook video publishing belum diintegrasikan; ditahan');
  const r=await fetch(url,{method:'POST',body});
  const result=await r.json().catch(()=>({}));
  if(!r.ok||!result.id)throw Error('Facebook Graph HTTP '+r.status+' '+String(result.error?.message||''));
  return {id:result.post_id||result.id};
 }
 if(p.format!=='VIDEO'||p.media_type!=='video/mp4'||!e.MEDIA)throw Error('Youtube memerlukan MP4 di storage');
 const token=await youtubeToken(e,p.channel);
 const file=await e.MEDIA.get(p.media_key);if(!file||file.size>8_000_000)throw Error('File video hilang/terlalu besar');
 const metadata={snippet:{title:p.title.slice(0,100),description:p.caption.slice(0,4500),categoryId:'24'},status:{privacyStatus:'private',selfDeclaredMadeForKids:false,containsSyntheticMedia:true}};
 const r=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':String(file.size)},body:JSON.stringify(metadata)});
 if(!r.ok)throw Error('YouTube upload initialize HTTP '+r.status);
 const location=r.headers.get('Location');
 if(!location?.startsWith('https://www.googleapis.com/'))throw Error('Invalid upload URL');
 const put=await fetch(location,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'video/mp4'},body:await file.arrayBuffer()});
 const result=await put.json().catch(()=>({}));
 if(!put.ok||!result.id)throw Error('YouTube upload HTTP '+put.status);
 return {id:result.id,url:'https://www.youtube.com/watch?v='+result.id};
}
async function publish(e){
 if((await isPaused(e))||e.ALLOW_PUBLICATION!=='true')return {published:0,reason:'paused_or_disabled'};
 const posts=await list(e,"SELECT * FROM posts WHERE state='SCHEDULED' AND scheduled_at<=? LIMIT 3",utc());
 let published=0,uncertain=0;
 for(const p of posts){
  if(gate(p))continue;
  const claimed=await run(e,"UPDATE posts SET state='PUBLISHING',updated_at=? WHERE id=? AND state='SCHEDULED'",utc(),p.id);
  if(claimed.meta?.changes!==1)continue;
  await run(e,"INSERT OR IGNORE INTO publications(post_id,state,attempted_at) VALUES(?,'PUBLISHING',?)",p.id,utc());
  try{const res=await providerPublish(e,p);
   await run(e,"UPDATE posts SET state='PUBLISHED',updated_at=? WHERE id=?",utc(),p.id);
   await run(e,"UPDATE publications SET provider_id=?,provider_url=?,state='PUBLISHED',done_at=? WHERE post_id=?",res.id,res.url||null,utc(),p.id);
   await audit(e,'PUBLISHED',p.id,res.id);published++;
  }catch(err){
   const why=String(err).slice(0,250);
   await run(e,"UPDATE posts SET state='UNCERTAIN',risk_note=?,updated_at=? WHERE id=?",why,utc(),p.id);
   await run(e,"UPDATE publications SET state='UNCERTAIN',error=?,done_at=? WHERE post_id=?",why,utc(),p.id);
   await audit(e,'PUBLISH_UNCERTAIN',p.id,why);uncertain++;
  }
 }
 return {published,uncertain};
}
async function analytics(e){
 const pubs=await list(e,"SELECT p.id,p.channel,u.provider_id FROM posts p JOIN publications u ON u.post_id=p.id WHERE p.state='PUBLISHED' ORDER BY u.done_at DESC LIMIT 20");
 let updated=0,errors=0;
 for(const p of pubs){
  try{let stats={};
   if(p.channel==='facebook'){
    if(!e.FB_PAGE_ACCESS_TOKEN)continue;
    const u='https://graph.facebook.com/v24.0/'+encodeURIComponent(p.provider_id)+'?fields=shares,comments.summary(true),reactions.summary(true)&access_token='+encodeURIComponent(e.FB_PAGE_ACCESS_TOKEN);
    const r=await fetch(u);if(!r.ok)throw Error('FB analytics '+r.status);
    const j=await r.json();stats={shares:j.shares?.count??null,comments:j.comments?.summary?.total_count??null,likes:j.reactions?.summary?.total_count??null};
   }else{
    const t=await youtubeToken(e,p.channel);
    const r=await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics&id='+encodeURIComponent(p.provider_id),{headers:{Authorization:'Bearer '+t}});
    if(!r.ok)throw Error('YT analytics '+r.status);
    const j=await r.json(),s=j.items?.[0]?.statistics||{};
    stats={views:s.viewCount??null,likes:s.likeCount??null,comments:s.commentCount??null};
   }
   for(const [k,v]of Object.entries(stats))await run(e,'INSERT INTO metrics(post_id,metric,value,observed_at) VALUES(?,?,?,?) ON CONFLICT(post_id,metric) DO UPDATE SET value=excluded.value,observed_at=excluded.observed_at',p.id,k,v==null?null:Number(v),utc());
   updated++;
  }catch(err){errors++;await audit(e,'ANALYTICS_ERROR',p.id,String(err));}
 }
 return {updated,errors};
}
async function strategy(e){
 const rows=await list(e,`SELECT p.channel,p.topic,COUNT(DISTINCT p.id) AS posts,
 SUM(CASE WHEN m.metric='views' THEN COALESCE(m.value,0) ELSE 0 END) AS views,
 SUM(CASE WHEN m.metric='likes' THEN COALESCE(m.value,0) ELSE 0 END) AS likes,
 SUM(CASE WHEN m.metric='comments' THEN COALESCE(m.value,0) ELSE 0 END) AS comments
 FROM posts p LEFT JOIN metrics m ON m.post_id=p.id
 WHERE p.state='PUBLISHED' GROUP BY p.channel,p.topic`);
 const report={};
 for(const channel of Object.keys(CHANNELS)){
  const items=rows.filter(r=>r.channel===channel).map(r=>({...r,score:(Number(r.likes)+2*Number(r.comments))/Math.max(100,Number(r.views)||100)})).sort((a,b)=>b.score-a.score);
  const samples=items.reduce((n,r)=>n+Number(r.posts),0);
  const insight={channel,samples,ready:samples>=3&&items.some(x=>x.likes>0||x.comments>0||x.views>0),recommendedTopic:null,reason:'Belum ada 3 publikasi dengan metrik nyata',top:items.slice(0,5)};
  if(insight.ready){insight.recommendedTopic=items[0].topic;insight.reason='Topik mendapat respons tertinggi berdasarkan metrik yang tersedia. Rekomendasi bersifat eksplorasi, bukan jaminan viral.';await run(e,"INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",'strategy_'+channel,JSON.stringify(insight));}
  report[channel]=insight;
 }
 await audit(e,'STRATEGY_EVALUATED','',Object.keys(report).map(k=>k+':'+report[k].samples).join(','));
 return report;
}
const CERITEXA_LOGO='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA4KCw0LCQ4NDA0QDw4RFiQXFhQUFiwgIRokNC43NjMuMjI6QVNGOj1OPjIySGJJTlZYXV5dOEVmbWVabFNbXVn/2wBDAQ8QEBYTFioXFypZOzI7WVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVn/wAARCABgAGADASIAAhEBAxEB/8QAGwAAAgIDAQAAAAAAAAAAAAAABAUDBgABAgf/xAA8EAACAQMCAgcGBAUCBwAAAAABAgMABBEFIRIxBhNBUWFxgRQiMpGxwSNSodEHQkNTchUWJDNzgpLh8P/EABgBAAMBAQAAAAAAAAAAAAAAAAIDBAEF/8QAJhEAAgIBBAEEAgMAAAAAAAAAAQIAAxEEEiExQRMiMlEFI2Fxgf/aAAwDAQACEQMRAD8A84rYFYBU9vA8zhUUsxOAAOdUKpY4EAkDkyIKTyouKxkKCSQiKM8mfbPkOZo5o4NLGHCy3XaDusf7n9B40umuJJ5CzsWJ7TVforWMv39RO8t8epLi0j2/ElP/AIj7muluIgcC2i9ST96HihkmcJGjOx5BRk0zh6P3zgFkWL/qNg/KiVjn2iA7onzaQ9fb49+0iPkWH3rOp0+cbNLbt44dfsfrTAdGL1x7s1sT3cZH2oW86P6pZIZJbRzEP6ie+vzHKnGxemWFVZW3xOYHcaXNFEZo+GaEc5IzkDz7R60vKkc6ZW13NaSB4nZGHaO2jxbW+tKfZ1SC+/tjZJfLubw5Hwqa6tMZUy0V7upXaypZoXhco6kMDggjlURqIwMYkka8TACrGijR9OEmP+MmXKn+2p+5+lA6DaLPdhpRmKIF38h2evKo9VvHubh2c7k10KQK0NhkVh9R9g68wCWQyOSTvTDSdOW6Yy3Mwt7RD78jdp7lHaaAt4muLhIk+JzgVYZLZERI1OQgwPCt09JvYsTCus9MACNl1zSrKPqbC0lCciwUAt5k7mpIdW0+4P4pngPe6ZH6UluVj06yWaRQ00uREh/Vj4fWk8UV5qdwI41lnlO4RBnbyHKm3WV0cAyFNGl53S/xQcYEtvIssZ/mQ5FWLS+KKMySPwIo94nYV5DBPf6LeccRlt5lO4Pb4EHn6021TpVcazFDbS4tbfA60Rb8Z7du7wqG/UGxMKI6j8d6doYtwIR0wubC/uDPplsqRoxSSZRgSN349Dv21WYJWjkDKcEGvQIrbQv9nSZun6nrAxm4PfEmMBeHy/fNUCfqlmYQMzJnYsME+lRaa3epH1O2wAwRLHewLrelteoB7ZAPxwP6i/n8+/51U3XhYg1YOj+oG0vkY7odnU8mB2IoXpHYCx1KRI94j7yHvU7is3bX2H/Jtq7l3iTWTez6PO/bKwT0G5+1J5jliTvT0xA9H4m75H+1IZB72K7F6kIonKp5Zj/MN0QhLt5iNooyfLJA+9NzIVl97mTQXRVI5tXFrL8FzG0XqRkfqKmvI5bK4FvPklDwow3LD/75U/Q2KilTLHpFlRm9fzI8Mp3RIdvmc/amf8N5BHfX7tz6kb/91BoqX1jJAzAFlPA/YG/atdFJFsp76OdxDLwAcLnHI71z/wArUSNq+YrQJghG8S86pa2GsR9XeRgvyWVdmX17fWvOOkWjNo14sfWrKki8aMNsjONx2U4v+lUdsGjsQJpv7rfAvkO36edL9M0fVelF510jP1RPv3Mvwgdw7/IVxtNXbSSXPtl95rPtXuJ/bJBYm1yeAyCTHjjH3obO9elah/D22e1U6dcOsyLv1xyrn7fSvP8AULGXTryS2uAFljOGAIP0qyq1H+MmIOMmbtWxIN8b86snSaJZtE066XduExMfLcfWqxAMMD2VZ7+USdEkXHwT7eq1mqTaVYfcqrOUIi6JzJ0f2O8cxB9QP2NJHznwprorCaG5tDzkTiT/ACXf6ZpbMOFiK7dhDVKZCK8DM5hmeCZJYmKOhDKRzBFWye8i1y19pRV9oAzPF3H8y+B/Sq/pOh6jrMjLYWzShfibICr5k7VPqWiax0ekjmuYHgBOElRgVz3ZH0NSVX+m+Y6uwp/U0EaGRTC5ThJJGcE+vb613LfSPDi7t4bkqcDjj34f8lINRDVY5xi7gHH/AHItifMcvpW4VW5craGWRgpYqI2JAHM7ZroE6e0cHERbjOVEmjurGCdRHp9oTjPGzOwHoSabwdK78q6RPDFwbJwR8WfLJOKrTzRDcy58lNaXUep3gjHH2O++PIcvnmpbhSoIBBi60ydxlzutflsrIXN5NJLcyJ+DFI3b+YjsUfrVElmeeVpZWLOxLMx5k1xNNJPK0szs7sclmOSa5Brl1VqjFvJldlhfjxJ0bJAHOn183V9GLZTzkmZvQAD70itkLyAAbk026SSCJoLJTtbRhW/yO7fqcelFdliIys4UmJ7Sd7e4SWM4ZCGBo3U4lYrcwj8GbcD8p7V9PpilYpjYXSKrQXALQSfEBzU9jDxq6hwQa28yUsQJZ9WuZ7PoHpEemM0VvIC1y8RwSx7CR2Zz8hSzo3a3PSC9gsdQvLn/AE+JXm4S5wcYBCk7do8t64gv9Q0MFLeRJrSTLKGGUbxHd4iuJuk2pyzwyLJHCISSiInu77HNIekqcGCHz1Ht50c0y8s29mjh066WRFRVvlnEqlgDkZyCM5qezsdGtteutN09byOa1tZRLcdeV6w4G2B2VWpdamnMXDBYQdXKs2Y4cFmHaTU1peS/6pcX/tVok1wrK/EHwAcZ5DwrBSxmG0DuWm50/TNch0CzMDwA2nWiQSZKRrjK47Sdtzypfc6HosVpLdtZiH2ZgepF8svtCE4OOE5DDmOzspSdWu7WC1ihurVmtcCOVUbi4fy7jkaHk12Uyxutpp6FH6z3IcZf8x8RvQvQwUwkcMY5v7Gx6PwSC0tTeXd/J1cHWx8QhXbYZ/m32/8AW8t50f0ptMvlWx9juraEyK3tolckDOHUbCq0mu3yo6u6TFpBKrOCSjjkV7vKj4dXu7lbiSSG1gilXhnlWMgtkee57hS9Lp7On7+42xgT7IJoyraxtqEwBSL/AJan+d+wenM0oupmnmaRyWZiSSe00Tf3nXcMcY4IYxwomeQ7z4ntoA023GcCazcbRMroNiuaygBi4wtL9oVMbASRN8SNyPj4HxohrWC6961kCsf6chwfQ8jSgGpFkI7aqTUcbXGRFNX5WFTWU8Jw6MvmKiCOOw1PBqdxCOFZW4fyncfI0QNVJ+KGBj39WPtRgVHkHEWTYPGYBwOTyNSJZzSfChPjU76kx+GOJfJBQ015NKMPIxHdnb5Vv6V7JM0Fz4xCFit7YZmbrHH8iH6n9qgurx58A4VF2VF2C+VClya5Jpb6jI2qMCOAmE5rVZWVKYc//9k=';
// Public install metadata only. Admin tokens and draft API responses are NEVER cached.
const pwaManifest=Object.freeze({
 name:'Ceritexa AI Content Agent',
 short_name:'Ceritexa',
 id:'/',
 start_url:'/',
 scope:'/',
 display:'standalone',
 display_override:['standalone','minimal-ui'],
 orientation:'portrait',
 background_color:'#f7f8fc',
 theme_color:'#7456e8',
 description:'Dashboard privat Ceritexa Studio, YouTube Panex dan Heros Real Life untuk review konten dengan persetujuan pemilik.',
 lang:'id',
 prefer_related_applications:false,
 icons:[
  {src:'/icon-192.svg',sizes:'192x192',type:'image/svg+xml',purpose:'any maskable'},
  {src:'/icon-512.svg',sizes:'512x512',type:'image/svg+xml',purpose:'any maskable'},
  {src:'/icon-96.jpg',sizes:'96x96',type:'image/jpeg',purpose:'any'}
 ]
});
function appIcon(size){
 if(size!==192&&size!==512)throw Error('Icon size invalid');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 512 512" role="img" aria-label="Ceritexa Studio">'+
  '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101b4c"/><stop offset=".5" stop-color="#261244"/><stop offset="1" stop-color="#0c1020"/></linearGradient></defs>'+
  '<rect width="512" height="512" rx="116" fill="url(#bg)"/>'+
  '<image x="68" y="68" width="376" height="376" href="'+CERITEXA_LOGO+'" preserveAspectRatio="xMidYMid meet"/>'+
  '</svg>';
}
// All shell resources public. Never cache /api, bearer headers, story/media responses or admin secrets.
const serviceWorkerScript=`'use strict';
const CACHE='ceritexa-public-shell-v1.7.0';
const SHELL=['/','/manifest.webmanifest','/icon-192.svg','/icon-512.svg','/icon-96.jpg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ceritexa-public-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||request.headers.has('Authorization'))return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(url.pathname==='/manifest.webmanifest'||url.pathname.startsWith('/icon-')){
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
  return;
 }
 if(request.mode==='navigate'&&url.pathname==='/'){
  event.respondWith(fetch(request).catch(()=>caches.match('/')));
 }
});
`;
const pwaPublicHeaders={'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
const page="<!doctype html>\n<html lang=\"id\">\n<head>\n<meta charset=\"utf-8\" />\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\" />\n<meta name=\"color-scheme\" content=\"light\" /><meta name=\"theme-color\" content=\"#7456e8\"><link rel=\"manifest\" href=\"/manifest.webmanifest\"><link rel=\"icon\" type=\"image/svg+xml\" href=\"/icon-192.svg\">\n<title>Ceritexa Studio — AI Content Agent</title>\n<style>\n:root{--ink:#1d2035;--muted:#888da1;--line:#edf0f5;--panel:#fff;--bg:#f7f8fc;--purple:#7456e8;--purple-dark:#583ec3;--violet-soft:#f0ecff;--mint:#2d9b84;--orange:#d49155;--radius:20px;--shadow:0 16px 45px rgba(31,38,78,.04);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}\n*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#e8eaf4;color:var(--ink)}button,input,select,textarea{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #baaaff;outline-offset:2px}svg{display:block}a{color:inherit}.cx-app{display:grid;grid-template-columns:226px minmax(0,1fr);width:min(1240px,100%);height:min(900px,calc(100dvh - 20px));min-height:660px;overflow:hidden;margin:10px auto;background:var(--bg);border:1px solid #e8eaf3;border-radius:24px;box-shadow:0 20px 65px #1f245023;position:relative}\n.cx-sidebar{background:#fff;border-right:1px solid var(--line);display:flex;flex-direction:column;padding:30px 16px 20px;min-width:0}.brand{display:flex;align-items:center;gap:11px;padding:0 10px 30px}.brand-mark{display:grid;place-items:center;flex:none;width:39px;height:39px;background:linear-gradient(145deg,#7b68f7 0%,#6141d9 70%);border-radius:13px;color:#fff;font-size:27px;font-weight:850;letter-spacing:-.1em;box-shadow:0 8px 18px #7b68f73a}.brand-mark span{transform:translateX(-2px)}.brand strong{display:block;font-size:15px;letter-spacing:-.04em}.brand small{font-size:10px;letter-spacing:.16em;color:#969ab1;font-weight:700}.section-label{text-transform:uppercase;letter-spacing:.15em;color:#a5a8b7;font-size:10px;font-weight:750;padding:5px 17px 13px}.navitem{border:0;background:transparent;border-radius:12px;width:100%;display:flex;align-items:center;gap:13px;text-align:left;padding:13px 15px;margin-bottom:5px;color:#797d90;font-size:13px;font-weight:670;transition:background .18s,color .18s}.navitem svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}.navitem.active,.navitem:hover{color:var(--purple-dark);background:#f1effe}.navitem.active{font-weight:800}.nav-count{margin-left:auto;background:#f4f0ff;color:#7c64dc;font-size:10px;padding:4px 7px;border-radius:7px}.sidebar-bottom{margin-top:auto;padding:17px 10px 0;border-top:1px solid var(--line)}.profile{display:flex;gap:11px;align-items:center}.avatar{display:grid;place-items:center;width:35px;height:35px;background:#f5e6d2;color:#a96d41;font-weight:800;font-size:12px;border-radius:11px;flex:none}.profile b{display:block;font-size:12px}.profile small{color:#9da0ad;font-size:10px}.sidebar-foot{font-size:10px;color:#a1a3b2;padding:20px 4px 2px;line-height:1.5}\n.cx-main{overflow:auto;min-width:0;scrollbar-width:thin;scrollbar-color:#dee0eb transparent}.topbar{height:78px;display:flex;align-items:center;justify-content:space-between;padding:0 37px;position:sticky;top:0;z-index:10;background:#f7f8fcf5;backdrop-filter:blur(12px);border-bottom:1px solid #eef0f6}.crumb{font-size:12px;color:#9da0b0}.crumb b{color:#52566c;font-weight:700}.top-right{display:flex;align-items:center;gap:13px}.demo-tag{padding:8px 11px;border-radius:22px;border:1px solid #e6e1fc;background:#f1efff;color:#7158c9;font-size:10px;font-weight:800;letter-spacing:.04em}.top-avatar{width:31px;height:31px;border-radius:50%;background:#f3dbc8;display:grid;place-items:center;color:#9f704c;font-weight:800;font-size:10px}\n.page{max-width:1080px;padding:31px 37px 50px;margin:auto;animation:appear .24s ease both}@keyframes appear{from{opacity:.35;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}.page-kicker{font-size:10px;font-weight:800;letter-spacing:.16em;color:#927fd1;text-transform:uppercase;margin:0 0 10px}.h1{font-size:clamp(24px,3vw,33px);letter-spacing:-.055em;line-height:1.18;font-weight:820;margin:0}.subtitle{font-size:13px;color:#85899c;line-height:1.7;max-width:650px;margin:9px 0 0}.row-between{display:flex;align-items:center;justify-content:space-between;gap:16px}.primary-btn,.secondary-btn,.quiet-btn{border-radius:10px;padding:11px 16px;font-size:12px;font-weight:750;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;min-height:40px}.primary-btn{color:white;background:var(--purple);box-shadow:0 7px 13px #7657e825}.primary-btn:hover{background:#6242da}.secondary-btn{background:white;border-color:#e7e8f0;color:#565a71}.quiet-btn{background:transparent;color:#7461c9}.text-btn{border:0;background:transparent;font-size:11px;color:#7659df;font-weight:800}.small-btn{padding:8px 10px;min-height:33px;border-radius:8px;font-size:11px}.primary-btn:disabled,.secondary-btn:disabled{opacity:.45;cursor:not-allowed}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:27px 0 14px}.section-head h2{font-size:15px;font-weight:790;letter-spacing:-.025em;margin:0}.section-head p{font-size:12px;color:var(--muted);margin:4px 0 0}\n.hero{background:linear-gradient(112deg,#242448 0%,#45367d 64%,#6f55b6 100%);border-radius:21px;min-height:207px;position:relative;overflow:hidden;padding:32px 30px;display:flex;align-items:center;color:white}.hero-text{z-index:2;position:relative;max-width:420px}.hero-kicker{color:#d5cafa;font-size:10px;font-weight:770;letter-spacing:.14em}.hero h1{font-size:clamp(23px,2.8vw,31px);line-height:1.18;margin:12px 0 9px;letter-spacing:-.04em;max-width:410px}.hero p{font-size:12px;color:#ddd7f6;line-height:1.75;margin:0 0 19px;max-width:390px}.hero-btn{background:white;color:#5c42b8;border:0;border-radius:10px;padding:11px 15px;font-weight:790;font-size:11px}.hero-art{position:absolute;right:25px;top:25px;height:180px;width:260px}.orb{position:absolute;width:250px;height:250px;border-radius:50%;right:-45px;top:-90px;background:radial-gradient(circle at 30% 30%,#bea4ff66,#9870d522 55%,transparent 70%)}.stack{position:absolute;border-radius:14px;box-shadow:0 14px 40px #070b2555;border:1px solid #ffffff33;overflow:hidden}.stack.one{background:linear-gradient(145deg,#626adc,#1e255c);width:118px;height:155px;right:93px;top:5px;transform:rotate(-15deg)}.stack.two{background:linear-gradient(150deg,#ddac81,#ce7d8b 65%,#623a85);width:128px;height:159px;right:22px;top:12px;transform:rotate(11deg)}.stack.three{background:linear-gradient(165deg,#2d5173,#9d73d9);width:100px;height:130px;right:83px;top:45px;transform:rotate(1deg);display:grid;place-items:center;font-size:47px}.stack:after{content:\"\";position:absolute;left:15px;right:15px;bottom:13px;height:7px;border-radius:5px;background:#ffffff77;box-shadow:0 -12px 0 #ffffff42}.stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-top:18px}.stat-card{background:white;border:1px solid #ebeef5;border-radius:15px;padding:17px;box-shadow:var(--shadow)}.stat-label{font-size:10px;color:#9398a9;font-weight:650;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}.stat-label .tiny-icon{height:27px;width:27px;border-radius:9px;background:#f4f0ff;display:grid;place-items:center;color:#8468d9;font-size:14px}.stat-num{font-size:27px;font-weight:830;letter-spacing:-.05em}.stat-detail{font-size:10px;color:#979bae;margin-top:4px}.status-up{color:#329b80;font-weight:750}.dashboard-split{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(230px,1fr);gap:18px}.white-panel{background:white;border:1px solid #ebedf4;border-radius:17px;box-shadow:var(--shadow);padding:18px}.mini-item{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)}.mini-item:last-child{border-bottom:0;padding-bottom:2px}.mini-cover{width:47px;height:49px;flex:none;border-radius:9px;display:grid;place-items:center;font-size:24px}.mini-details{min-width:0;flex:1}.mini-details strong{display:block;font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.mini-details small{display:block;color:#999eae;font-size:10px;margin-top:5px}.mini-item button{border:0;background:#f5f2ff;color:#8063da;border-radius:8px;padding:8px 9px;font-size:10px;font-weight:760}.activity-item{display:flex;gap:10px;align-items:flex-start;padding:11px 0}.activity-item + .activity-item{border-top:1px solid var(--line)}.activity-dot{width:8px;height:8px;border-radius:50%;background:#a58af5;flex:none;margin-top:5px}.activity-item b{font-size:11px;display:block}.activity-item span{display:block;font-size:10px;color:#959aab;margin-top:4px;line-height:1.5}\n.tabs{display:inline-flex;padding:4px;border:1px solid #eceaf5;background:white;border-radius:11px;gap:3px}.tab{border:0;background:transparent;padding:9px 15px;color:#9297a6;font-size:12px;font-weight:750;border-radius:8px}.tab.active{color:#6451be;background:#f0ecff}.tab .count{font-size:10px;margin-left:5px;opacity:.75}.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.filter{padding:8px 12px;border:1px solid #e8eaf1;border-radius:9px;color:#82889a;background:white;font-size:11px;font-weight:720}.filter.active{background:#27294a;border-color:#27294a;color:white}.draft-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin-top:17px}.draft-card{background:white;border-radius:17px;border:1px solid #e9edf3;overflow:hidden;box-shadow:var(--shadow)}.draft-preview{height:130px;position:relative;display:flex;align-items:center;justify-content:center;font-size:53px;overflow:hidden}.draft-preview:before{content:\"\";position:absolute;border-radius:50%;width:190px;height:190px;top:-130px;right:-45px;background:#ffffff33}.draft-preview:after{content:\"\";position:absolute;width:180px;height:180px;border:2px solid #ffffff28;border-radius:50%;bottom:-128px;left:-50px}.cover-panex{background:linear-gradient(128deg,#282a5e,#8b68be 70%,#ca92ab)}.cover-heros{background:linear-gradient(128deg,#173954,#488eaf 65%,#87c0c0)}.cover-facebook{background:linear-gradient(128deg,#b76a65,#e5b487 75%,#f8ddaa)}.draft-format{position:absolute;left:14px;top:13px;background:#10122a80;color:white;border:1px solid #ffffff26;border-radius:7px;padding:5px 7px;font-size:9px;font-weight:850;letter-spacing:.06em}.preview-art{filter:drop-shadow(0 9px 10px #0003);position:relative;z-index:1}.draft-inner{padding:16px 16px 14px}.meta-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px}.channel-name{color:#7e6ac3;font-weight:760}.time{color:#a3a8b6}.draft-inner h3{font-size:14px;line-height:1.38;letter-spacing:-.02em;margin:9px 0 6px}.draft-inner p{font-size:11px;color:#9499ab;line-height:1.65;min-height:34px;margin:0}.draft-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:14px}.draft-actions button{font-size:10px;padding:8px 10px;min-height:32px}.approved-icon{margin-left:auto;color:#389c82;font-size:11px;font-weight:760}.empty{background:#fff;border:1px dashed #e3e4ef;border-radius:16px;padding:70px 20px;text-align:center;color:#a0a3b3}.empty strong{display:block;color:#42445c;font-size:14px;margin-bottom:5px}\n.ana-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:24px 0 18px}.ana-metric{background:white;border:1px solid #eceef5;border-radius:15px;padding:19px}.ana-metric span{display:block;color:#9398a8;font-size:11px}.ana-metric b{font-size:29px;letter-spacing:-.05em;display:block;margin:10px 0 4px}.ana-metric small{font-size:10px;color:#31997b;font-weight:700}.chart-panel{background:white;border-radius:18px;border:1px solid #eceef5;padding:23px;overflow:hidden}.chart-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.chart-head h3{font-size:14px;margin:0}.chart-head p{font-size:10px;color:#999eae;margin:6px 0 0}.periods{display:flex;gap:5px}.period{font-size:10px;background:white;border:1px solid #e6e8f1;color:#9296a9;border-radius:8px;padding:8px 10px}.period.active{color:#7359d3;background:#f0ecff;border-color:#e8e0ff}.chart-graphic{height:238px;width:100%;margin:20px 0 0}.chart-axis{display:flex;justify-content:space-between;font-size:10px;color:#b1b4c1;padding:0 5px}.channel-performance{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:15px}.channel-performance .white-panel{padding:16px}.channel-performance strong{font-size:12px}.channel-performance p{font-size:10px;color:#9a9eaf}.progress{height:6px;border-radius:20px;background:#edf0f6;overflow:hidden;margin-top:14px}.progress i{height:100%;display:block;background:#8b77e9;border-radius:20px}\n.trend-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:20px}.trend-card{border:1px solid #e9edf4;background:#fff;border-radius:16px;padding:19px;display:flex;flex-direction:column;gap:9px}.trend-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.trend-chip{font-size:10px;color:#806ac0;font-weight:760;background:#f3f0ff;border-radius:7px;padding:6px 8px}.trend-score{font-size:11px;font-weight:800;color:#459c81}.trend-card h3{font-size:15px;line-height:1.45;letter-spacing:-.02em;margin:2px 0 0}.trend-card p{font-size:11px;line-height:1.65;color:#999ead;margin:0 0 7px;flex:1}.trend-card .secondary-btn{width:max-content}.trend-tip{background:#eeebfb;border-radius:12px;padding:12px 15px;margin-top:18px;font-size:11px;color:#6c61a2;line-height:1.6}\n.mobile-nav{display:none}.modal-backdrop{position:absolute;inset:0;background:#14172c91;z-index:40;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)}.modal-backdrop[hidden]{display:none}.modal{background:#fff;border-radius:19px;padding:23px;width:min(470px,100%);max-height:90%;overflow:auto;box-shadow:0 25px 90px #0e102f44}.modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.modal-head h3{margin:0;font-size:19px;letter-spacing:-.03em}.icon-close{border:0;background:#f2f3f8;color:#73778b;width:32px;height:32px;border-radius:9px;font-weight:900}.field{display:flex;flex-direction:column;gap:7px;margin:12px 0}.field label{font-size:11px;font-weight:750;color:#555a72}.field input,.field textarea,.field select{border:1px solid #dfe3ee;border-radius:10px;padding:12px;background:white;font-size:12px;color:#42465c;width:100%;resize:vertical}.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.modal-media{height:190px;border-radius:12px;display:grid;place-items:center;color:white;font-size:70px;margin-bottom:16px}.modal-caption{font-size:12px;line-height:1.8;color:#646b7f}.demo-note{padding:11px;border-radius:10px;background:#f3f0ff;color:#7864b6;font-size:11px;line-height:1.55}.toast{position:absolute;z-index:50;left:50%;bottom:25px;transform:translateX(-50%) translateY(15px);padding:12px 16px;border-radius:11px;color:white;background:#262745;font-size:11px;min-width:180px;max-width:85%;text-align:center;box-shadow:0 10px 30px #25274e33;opacity:0;pointer-events:none;transition:all .25s}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}\n@media(max-width:990px){.cx-app{grid-template-columns:190px minmax(0,1fr)}.topbar{padding:0 22px}.page{padding:25px 22px 40px}.hero-art{transform:scale(.80);transform-origin:right center;right:0}.hero-text{max-width:350px}.stat-grid{grid-template-columns:repeat(2,1fr)}.dashboard-split{grid-template-columns:1fr}.channel-performance{grid-template-columns:repeat(3,1fr)}}\n@media(max-width:680px){html,body{background:#f7f8fc}.cx-app{display:block;height:100dvh;min-height:550px;width:100%;margin:0;border:0;border-radius:0;box-shadow:none}.cx-sidebar{display:none}.cx-main{height:100%;padding-bottom:72px}.topbar{height:65px;padding:0 19px}.page{padding:24px 18px 38px}.hero{padding:25px 20px;min-height:195px}.hero h1{font-size:24px;max-width:240px}.hero p{max-width:250px;font-size:11px}.hero-art{opacity:.6;right:-62px;top:25px;transform:scale(.7)}.hero-text{z-index:3}.stat-grid{gap:9px;margin-top:11px}.stat-card{padding:13px}.stat-num{font-size:24px}.dashboard-split{gap:11px}.draft-list,.trend-list{grid-template-columns:1fr}.draft-preview{height:145px}.row-between{align-items:flex-start}.responsive-stack{flex-direction:column}.tabs{width:100%;justify-content:space-between}.tabs .tab{flex:1}.ana-top{gap:8px}.ana-metric{padding:13px}.ana-metric b{font-size:23px}.ana-metric span{font-size:10px}.ana-metric small{font-size:9px}.chart-panel{padding:16px}.chart-graphic{height:200px}.channel-performance{grid-template-columns:1fr}.mobile-nav{display:flex;position:absolute;bottom:0;left:0;right:0;z-index:15;background:#fff;border-top:1px solid #edf0f5;padding:7px 8px calc(9px + env(safe-area-inset-bottom));justify-content:space-around}.mobile-nav .mob{border:0;background:none;display:flex;align-items:center;flex-direction:column;gap:4px;padding:6px 8px;min-width:65px;color:#a0a4b5;font-size:10px;font-weight:730}.mobile-nav .mob.active{color:var(--purple-dark)}.mobile-nav .mob svg{width:20px;height:20px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}.toast{bottom:85px}.modal-backdrop{align-items:flex-end;padding:0}.modal{border-radius:22px 22px 0 0;width:100%;max-height:89%;padding-bottom:calc(24px + env(safe-area-inset-bottom))}.top-right{gap:8px}.demo-tag{padding:7px 8px;font-size:9px}}\n@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}\n\n.mobile-brand-logo{display:none;width:33px;height:33px;object-fit:cover;border-radius:10px}.brand-logo{width:39px;height:39px;border-radius:12px;object-fit:cover;box-shadow:0 7px 19px #6047ad2c;flex:none}\n.art-scene{position:absolute;inset:0;width:100%;height:100%;z-index:1}.art-scene svg{width:100%;height:100%;display:block}.draft-preview:before,.draft-preview:after{z-index:2;pointer-events:none;opacity:.15}.draft-format{z-index:3;backdrop-filter:blur(6px)}\n.modal-media{overflow:hidden;position:relative}.modal-media svg{width:100%;height:100%;display:block}.modal-micro{font-size:9px;font-weight:800;letter-spacing:.07em;color:#9b91b8;margin-top:13px}\n.wrap-actions{flex-wrap:wrap}.storyboard-strip{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:12px 0 14px}.storyboard-strip span{width:26px;height:31px;background:linear-gradient(145deg,#3f436d,#9874c7);border-radius:6px;color:white;font-size:10px;display:grid;place-items:center;font-weight:750}.storyboard-strip small{font-size:10px;color:#9398a6;padding-left:5px}\n.ana-filters{display:flex;flex-wrap:wrap;gap:7px;margin-top:22px}.ana-top{margin-top:14px}\n.filter:hover,.secondary-btn:hover{border-color:#b7a7ed;color:#6e51cc}.draft-card:hover{border-color:#dad5f2;box-shadow:0 14px 36px #463f7a13}\n@media(max-width:680px){.topbar>.mobile-brand-logo{display:block;margin-right:8px}.topbar .crumb{margin-right:auto}.brand-logo{width:35px;height:35px}.modal-media{height:180px}.ana-filters{margin-top:18px}.draft-card .draft-preview{height:155px}.wrap-actions button{flex:1}}\n\n.live-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}.draft-format{z-index:3}.scene-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}.scene-tile{border:1px solid #e8e9f2;padding:8px;border-radius:11px}.scene-tile img{width:100%;aspect-ratio:9/16;object-fit:cover}.scene-tile p{font-size:12px;line-height:1.6}#ownerLogin{position:fixed;z-index:2000;inset:0;background:#eaeaf3e8;backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px}#ownerLogin[hidden]{display:none}.owner-login-card{width:min(440px,100%);display:flex;flex-direction:column;gap:12px;padding:28px;background:#fff;border-radius:22px;box-shadow:0 30px 100px #25244e42}.owner-login-card h1{font-size:24px;margin:0}.owner-login-card p,.owner-login-card small{font-size:12px;color:#65697b}.owner-login-card input{padding:13px;border:1px solid #dddef0;border-radius:9px}.owner-login-card label{font-weight:700;font-size:12px}.owner-login-card button{min-height:46px}#loginError{color:#ba3d58}@media(max-width:720px){.top-right .demo-tag{display:none}}\n\n/* Production integration over owner-approved visual design. */\n.live-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}.draft-format{z-index:2}.scene-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;max-height:58vh;overflow:auto}.scene-tile{padding:9px;border:1px solid #e6e8f0;border-radius:11px;background:#fff}.scene-tile img{max-width:100%;width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:8px}.scene-tile strong{font-size:12px;display:block;margin:5px 0}.scene-tile p{font-size:11px;line-height:1.6}#cxLogin{position:fixed;inset:0;z-index:1000;padding:16px;background:#edeefaef;backdrop-filter:blur(14px);display:grid;place-items:center}#cxLogin[hidden]{display:none!important}.owner-login-card{display:flex;flex-direction:column;gap:13px;width:min(410px,100%);background:white;padding:28px;border-radius:20px;box-shadow:0 20px 80px #1f28512b}.owner-login-card>img{border-radius:16px;object-fit:cover}.owner-login-card h1{margin:0;font-size:23px}.owner-login-card p,.owner-login-card small{color:#7d8197;font-size:12px;line-height:1.6}.owner-login-card input{padding:12px;border:1px solid #d7d8ea;border-radius:9px;width:100%}.owner-login-card .primary-btn{width:100%}#cxLoginError{margin:0;color:#b63d55;min-height:16px}.top-right .top-avatar{border:0;font-size:16px}.modal-media img,.modal-media video{max-width:100%;border-radius:9px}.modal-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.modal-caption{white-space:pre-wrap;line-height:1.65}.field{display:flex;flex-direction:column;gap:7px;margin:14px 0}.field label{font-size:12px;font-weight:700}.field input,.field select,.field textarea{width:100%;padding:11px;border:1px solid #d8dbe7;background:white;border-radius:8px;font-size:13px;color:#252947}.demo-note{color:#898ca0;background:#f2f0fb;border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.6}@media(max-width:640px){.top-right .demo-tag{padding:5px}.top-right .top-avatar{font-size:14px}}\n\n</style>\n</head>\n<body>\n<div class=\"cx-app\" id=\"cxDemo\">\n<svg xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" style=\"position:absolute;width:0;height:0;overflow:hidden\"><defs>\n<symbol id=\"i-home\" viewBox=\"0 0 24 24\"><path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z\"/><path d=\"M9 21v-8h6v8\"/></symbol>\n<symbol id=\"i-draft\" viewBox=\"0 0 24 24\"><rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2\"/><path d=\"M8 8h8M8 12h8M8 16h5\"/></symbol>\n<symbol id=\"i-chart\" viewBox=\"0 0 24 24\"><path d=\"M4 20V4M4 20h16M8 16l4-5 3 2 5-8\"/></symbol>\n<symbol id=\"i-trend\" viewBox=\"0 0 24 24\"><path d=\"m3 18 7-7 4 4 7-8M16 7h5v5\"/></symbol>\n</defs></svg>\n<aside class=\"cx-sidebar\">\n<div class=\"brand\"><img class=\"brand-logo\" src=\"data:image/jpeg;base64,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\" alt=\"Logo Ceritexa Studio\" /><div><strong>Ceritexa</strong><small>CREATIVE STUDIO</small></div></div>\n<div class=\"section-label\">Workspace</div>\n<nav class=\"sidenav\" aria-label=\"Navigasi dashboard\">\n<button class=\"navitem active\" data-page=\"home\"><svg><use href=\"#i-home\"/></svg> Home</button>\n<button class=\"navitem\" data-page=\"draft\"><svg><use href=\"#i-draft\"/></svg> Draft <span class=\"nav-count\" id=\"sideReviewCount\">3</span></button>\n<button class=\"navitem\" data-page=\"analytics\"><svg><use href=\"#i-chart\"/></svg> Analitik</button>\n<button class=\"navitem\" data-page=\"trends\"><svg><use href=\"#i-trend\"/></svg> Tren</button>\n</nav>\n<div class=\"sidebar-bottom\"><div class=\"profile\"><div class=\"avatar\">CS</div><div><b>Ceritexa Studio</b><small>Creative workspace</small></div></div><div class=\"sidebar-foot\">Workspace Ceritexa Studio</div></div>\n</aside>\n<div class=\"cx-main\" id=\"cxScroll\">\n<header class=\"topbar\"><img class=\"mobile-brand-logo\" src=\"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzf/wAARCAB4AHgDASIAAhEBAxEB/8QAHAAAAQUBAQEAAAAAAAAAAAAABQADBAYHAQII/8QAQRAAAQMDAgMEBgYIBQUAAAAAAQIDBAAFEQYhEjFBE1FhgQciYnGhwRQVMkKRsRYjJDNDcpLRNERSc4JTVNLh8P/EABsBAAIDAQEBAAAAAAAAAAAAAAMEAQIFBgAH/8QALBEAAQQBAwIGAQQDAAAAAAAAAQACAwQREiExE0EFImFxgfAUMpGx8SRRof/aAAwDAQACEQMRAD8AxCu0q9JGaZAVCkBXpKCelSI8Vx9aUNpKlKOAAMkmrB9XQ7M3xXEB+X/2yVYCP5yOvsjzIp2Cm+XfsgSTBu3dBIdtkyiexaUoD7SuQT7ydhUr6BDY/wATMSVDmhhPH8TgfnXJ10elgIUoJbT9ltA4UJ9wG1QCeI7mmC2CLYeYqnndycIkl22N7JivOeLjwHwA+dPtSreftW1BH+8v+9BwFHlTrainnj8aLDYGd2jHsocz1RcmyO7ORJLJ72nwr4KT864bDClpzb7k0FdG5SeyP9W6fiKEElRrvarTtkijmSu/9TP2RowByu3KzTbcsJlx1t8W6VEZSod4I2PlQ9SSOdWa1XuTCbUySl2Mv7cd5PG2r3pP5jBqa7Y4F9bLlh/UzMZVAWrPF/tKPP8AlO/cTSdikwDVGdk2ISRlqpVcqTJjOMOKQ4kpUDggjGKYIrKcMHCGQRyvNKkaVUXl6AzU+3w3JT6G20lSlEAADnUVpBUoAVftPR0WKzquzoAlOgpig/d71/IeOe6tGlX6r9+Elbn6TduTwmpfYaXjFhkpVdFJw66N+w9lPtd56ch1qlvyVuLJJJzT9xkrefWtRJJNQkjJpi3ZJPTj2AUV4dI1O3JTraSs4HWr1ZPRvcJLKJVyWITCwFJSoZcUP5enn+FRtPCFpwJmSo3026Y4m2D9iP3FR6r8Onv5TZmsdQznCUutMgn7LbQPxOatBSleASEpbnmcC2DA9SjzGlbRBThqJ26x99/1/hy+FS0JRGwG4zSAOiWkj5VVW9R3+EgPSZjHZ5/jtIwfyz5UQi+kS2vFLd0ioQeReicWPNKvkaccGw+V4H7jKwnUbz/Nq1+xP9KzRzClYRMt8R9J5hxhJ+VSJHo003fGiYaXLbII2LKuJGfFCvkRXbKzEurQl2mU1KYzuWzuk9yhzB99WSXdbfpS1qnXR0IAHqoG6lHoAOpPQfLesy/PFGzWw4TnhP5ZsiMg475WI6y0JddKEOS+zdirVwtyGj6qjzwQdwfCqtGkrjPJWhRBScgg1oGoLxd9cw7jPdCmoMFKVtxknISCoJye9W/P8NqzhxJSsg0hWtvkadXIXaOYY8ELQEsMa3gnZKb60jIUNvpaQOR9sd/3vfWfTIq47qkLSQQcEGitkmuwpTbzSyhSFAgg4wauGuLazeLW1qOEgBbmETEJH2XP9XuVz9+aXlk0PAPBR3xiVmocrLyKVOOpKVEUqss8hGNN25VxuTEZHNxYGe7xo3rK4BcwssHEdlIaaT3JGw/Hn503o39lRNnH+CwQk+0r1fyJoDcnS48ok5BrfYejWyOSsgjq2d+GqA4rJo1pS3fTZinl7NRwFE+0eX5E+VAjzq6aYUI9lCfvyFLcz3hJCf8A730tRj6tloK0TE6Rpa1SpDDZJS2MJzUl1piy2ZVzloC1qPBGYO3aLPVXckDc9/LbNRmncOJ4uZPKu604pLNrQnJQlLn9WU5+GK6W8+RsemPkrnzG5thsTuO/wqZLkSJ8kvy3CtZ2yeQHcB0HgKKP6UvbFuRcHLZIRFWMpcW2cEd9DIikrurKRgoDqUjx3r6tlzG2ypohJQfVKVDII7iK+d+JeIuqvGncLqq1cSN4Xy1ZrvcdP3FE23PKYfQeY5KHcodR4GiF11NI1JeEzL8tamgfVZYOAgHnw5zue81qWq/R7bL3xyLMW4cs7llR/VrPgfun4e6savVrlWae7DmtKafaOFIPSpr2oLgyOVaSF8O/ZbvoifpT9EpxitKRCQg/TxKOV4xtnHMd2OvjWNaok2N6Yo2OPMaaz/mXEqJ8gNvxNQoF3diWu4w0qITLQ2lQHsrCqFKVk5qKlMwSOcXE77Kz7ALcDupLLhCtjWjej6c1ID9pmK/Z5rZaVnor7p8jiszbO9WTTDikzmlJIABGcnFGtxGSI4R6b/Nj/aFahgOW+4vx3U8K21lJHiDSq5el2Clq7tzG8FMthDuR1OMH4ilQa0vUiDkGdmmQofaGFfotMWn7z6B5BKjVUkgpUrPfVzsj6f0RlAjlKTnzQf7VUJxBdOTt3111mMfjtI+8LBrhwldnuVAIzvV5tcN57RsW4xRxLgSXW3E+yrB38N9//VUgjrWj+iK6sB6bY5KgPpyAY/Fy7VIPq/8AIEjyFZtd5ifqW1VI14PdB1vodeDjJ2SMKSeaDk7H+9GIrabmwiOSO1Sria8TyI8/zAodfrSYs4GMFNttqVllGykg8wk92d8GoEC7GMkuSkEBK+A9nsodxKD8jXSGwNOmUY9e337slPEaRLtWMFAbc0tu5stuJKVpeSlQPMEKwa3+4znVTXUAnPGRjzrLbjEg3aYJ0K4x4t0yFLbknsg6ocj6wGFfiDUu8SNcXFsobti0cf7x6EAvtO/1kqIAPhiuFu+G9R+HHYLQpXooYyX8q2XrW9u0+FNlf0ucP8u0rZB9tXT3bn3VlV6uk3U96XKdb7STIUEpbaQT4BKRzona/R/epjoExKYLed1O+srySn5kVrGkbVpPRiA8ZUYTiMKly3U9p4hCRnhHu38aDF4cKbTI1pJQJPEW2n6Q4fCzK5+jDU1utiJ70IOIKeJxtlfG40PaSPlnFUx1hTasEYr6kRrK2OOIbhCRLUvPCpKChJx3E8/wrIfTFdLXJvCI0KBHZltDMt1rqs/dPQkdT3nwoNe5K+XpvG6K6DSzUdlnCBg0Ysx/aUE9DQpoZV8qIQnuB5IxjflW4WgR7qlc4cCr96SSh/TlkfByQ0tBJ8CP70qH6ycI0pZ0HqXVfFI+VKsOq3Swj1P8pqzjWhelHA/aLtFOSeyQ8kD2VYPwVVblI/WEeNEdHzW4l3Z7dWGHcsu/yKHCT5Zz5V4v8RcGe8ysYU2spOeuK7VrhLU9lmtiGnUEHVttXWXlsuJcaUULSQUqScEHvrys5NXqx+iPVl4holCOxDbWOJAmOFClDv4QCR54rHkeAeV4bcJ+NfmNUsIbmLQxd0jBUTwpk+I7ld469O6hFxiKbcLcxjJSfvDBHnzqDqrSF70lIQ3eInZocz2byFcbbmOeFd/gcGmompZzTSWJXBMYSMBL4yUjwVzH5VqU/FGtZ0phlqZdZL2aXhOFPDIDyHSpQTw8Lw4hivEdBjqdWuO05xnIKFY4fAcq9ruluf3Uw+wr2SFj5GnrjEVbux+nMzI3bth1kPR1J40Hkod4p4yUXeYPA7/QQVlSBxOw+/CiR3VoaUiQ0p1ROxK84299T7Ol9bX0RphKnHSU5ABUc+4ZoSqfGQTwpdcPjhI+deHL3LLamoxEZtQwoNZClDuKuePDlWVZnrMbpjdk8f2cJiFgzqcFe5+pm9Mwkxor6JN4SngCm8FETpz+854ck+/as5cdW84pxxRUpRySTkk01ua7nFYcUTWOLu5TcszpOeE6DiptvBW8nvzQ9Oc1Z9GW76wu8dlezfFxOKPJKRuo+QBppzsgkr0LcuARP0hOdixa4Od2IaSodxWSr8iKVAtZXMXO9SpKdkLWeAdyRskfgBSpCFmlm6JYfmQoIyvhWDVpui/ri0NXFJ4n2AlmUOpwMIX5gYPiPGqiDRex3IwZOVJDjS0lDrSuTiDzB/v0ODW7RsBpLHcFKay3KsPokt0SfryEmclK2mErfCFclKQMpz7jv5U76UtW3ydq+4RTNkx4sN9TTDDTikJAT9445k88nvoatMjT1ziXuzOcbIVxsuEc/wDUhY78HBHjkVZJ2oNE6lWmbfYj0ebwgLKOMFWO8p2V4EgGl7FYskIKGJR2Q7SNvvPpLuzUK93iSuBbWOJbizxqSjOwSOqj3nJwOuAKsbno609fIkxjT8bUNunxmytpd0jlLMnHTJGxPkeuKF2/XVisN9Quw2t1iAuP2ElaPVUvBylQSTnI3yScnPgK93TV9vat8pVv1TqWRKcSfo6FPqAaPjkDI6dTjx3pUxnsVbX6JtrRWmbDpKLdtY3GWidcWSuJFjD7Pq5HFsSeac8gM4rRtP2+LC1lYRMuFxmSl2TijCQ4laEcuMbAdMY6+NZDru/Rb/bbCxEdU45BjFt3iQRg8KB157pNWdWuYLWprJcULdWzFgrjOqDZBQTjBweY26VPQc5V6oHZODQmm71Oul+aeu6bJGcU2tltrjkPyOI8YQAD6oykcu/limpmg9LMQWr+gXlu0JdDMyNOR2L8fiIAcHq+skEjI32OQdsVy262s9sE+0R59xZt8lwyGpzGUuMuKOVp5ZxkDGx5kGolw1NaZbrEOVqS9TreMrlCUpSkSDkFKOEJGACMk9eXuDNG5sZO/wAc/CLG7U4D+VPZ0jp3Rj9wv18W1cLeja2xF4UXSoZAV0J6Dpj1qjaes+k7/FRcrhar89KmOqDrdrhlEaGM4ABAwQBjfc88ioErWVs1DFn26+M/RopIMNxDZUpvGwJA5HrttgkVOXrO0ybZamfra5W8W9CUGLCCkJe4cDmByOM+ZzvSnh8Uzs9fIdt7Y9O3uj2dDMGM5BVW13plrS+p3LbEfU/HKEusrXji4VZ2ONsgg79aJNOJ0/plalbTrijgQOqGep/5EY9wNS9QzIF6vKb66tS4DLKW8FJQXnAVHgTn3jJ6DyqmXu6PXKWt99Q4lcgNgkDYADoANq2pYunHg91EL9DNR5KHPrK1kmlTZpUihk5SBpxBwaaroOKI12FQhH7PeDFC2H0B6K7gOsqOyu4g9COhqROszbjSpdrWX4w3UMeu14KHz5H4VWkqINT4FwfiOpdYdU2sclJOK04bbXt0SjISz4iDqYm1JW2cEYrqH1o3Bx5UdTPt1wGJ7HYun+MwBg+9HL8MV06fTI9aBJYkDolK+FX9JwaIapO8TsoRnaNpBhDo93lskdm6RjwFT3NWXVTAZMpRQOnCn+1RX7DOYOHIzqfeg0z9VyMfu1fhUBlkbYKp/ju32Xh+5yXieN0nyFRFvLVzok1ZZSzsw5jv4TinV2phgZlymm/YSeNX4D5mrCtYeMuOPdFbNGNmoQhC3OQozFtkeE2mTdSUgjKI6dnHP/EeJ8s14+so8IYt7OF/9Z3CleQ5D4mhEmU4+4pbi1KUo5KlHJNSTBXGf1O/4jtJKl3a6OTVjIShpA4W2kDCW09wHz60KUcmuqVmvNZc8pldkouSeVw0qVKl1KVdpUq8F5Kug4pUqtlQnEuEU+3JWnGDSpUVsjhwVRzQUQj3yawMNSnkDuCyKeXqO4qGDMe/rNKlTIsy45S5rxE5LQoL9xkP/vXnF/zKJqIt4nrSpUJ8z3clFYxo4CaKya8E0qVAJJRgFylSpVQqVylSpVVeX//Z\" alt=\"Ceritexa\"/><div class=\"crumb\">Workspace <span style=\"margin:0 7px;color:#cbccda\">/</span> <b id=\"crumbTitle\">Home</b></div><div class=\"top-right\"><span class=\"demo-tag\"><button class=\"text-btn\" type=\"button\" data-action=\"logout\">Logout</button></span><button class=\"top-avatar\" type=\"button\" data-action=\"refresh\" aria-label=\"Refresh\">↻</button></div></header>\n<section id=\"cxView\" class=\"page\" aria-live=\"polite\"></section>\n</div>\n<nav class=\"mobile-nav\" aria-label=\"Navigasi seluler\"><button class=\"mob active\" data-page=\"home\"><svg><use href=\"#i-home\"/></svg>Home</button><button class=\"mob\" data-page=\"draft\"><svg><use href=\"#i-draft\"/></svg>Draft</button><button class=\"mob\" data-page=\"analytics\"><svg><use href=\"#i-chart\"/></svg>Analitik</button><button class=\"mob\" data-page=\"trends\"><svg><use href=\"#i-trend\"/></svg>Tren</button></nav>\n<div class=\"modal-backdrop\" id=\"modalBackdrop\" hidden><div class=\"modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"modalTitle\" id=\"modalContent\"></div></div>\n<div class=\"toast\" id=\"toast\" role=\"status\" aria-live=\"polite\"></div>\n</div>\n<script>(()=>{\n'use strict';\nconst $=id=>document.getElementById(id);\nconst root=$('cxDemo'),area=$('cxView'),scroller=$('cxScroll'),modalWrap=$('modalBackdrop'),modal=$('modalContent');\nconst escapeHTML=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nlet page='home',tab='review',filter='all',channel='all',days=7,connected=false,busy=false,toastTimer=0,installPrompt=null;\nlet posts=[],trends=[],metrics=[],events=[],status={},reasons=[],images=[];\nconst review=p=>p.state==='PENDING_REVIEW'||p.state==='BLOCKED';\nconst approved=p=>['APPROVED','SCHEDULED','PUBLISHED'].includes(p.state);\nconst name=c=>c==='panex'?'Panex':c==='heros'?'Heros Real Life':'Ceritexa Studio';\nconst icon=c=>c==='panex'?'🎬':c==='heros'?'🦸':'✦';\nconst fmt=p=>p.format==='VIDEO'?'SHORTS':p.format==='TEXT'?'CERITA':p.format;\nconst relative=t=>{const delta=Date.now()-new Date(t||Date.now()).getTime();if(delta<3600000)return 'Baru saja';if(delta<86400000)return Math.floor(delta/3600000)+' jam lalu';return Math.floor(delta/86400000)+' hari lalu';};\nconst draft=id=>posts.find(p=>p.id===id);\nconst total=which=>posts.filter(which==='review'?review:approved).length;\nfunction notice(message,err=false){const el=$('toast');el.textContent=message;el.style.background=err?'#84364b':'';el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4500);}\nasync function api(endpoint,options={}){\n if(!connected)throw Error('Silakan login kembali');\n const method=options.method||'GET',headers={...(options.headers||{})};\n if(method!=='GET'&&method!=='HEAD')headers['X-Ceritexa-Request']='dashboard';\n const res=await fetch('/api/'+endpoint,{...options,headers,credentials:'same-origin',cache:'no-store'});\n if(res.status===401){showLogin();throw Error('Sesi habis. Masuk kembali.');}\n if(!res.ok){const info=await res.json().catch(()=>({}));throw Error(info.error||'HTTP '+res.status);}\n return (res.headers.get('Content-Type')||'').includes('application/json')?res.json():res;\n}\nconst act=(path,body={})=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});\nfunction showLogin(){\n connected=false;root.inert=true;\n let overlay=$('cxLogin');\n if(!overlay){\n  overlay=document.createElement('div');overlay.id='cxLogin';overlay.innerHTML='<form id=\"cxLoginForm\" class=\"owner-login-card\"><img src=\"/icon-96.jpg\" width=\"62\" height=\"62\" alt=\"Ceritexa\"><h1>Ceritexa Studio</h1><p>Masuk untuk melanjutkan pekerjaan Anda.</p><label for=\"cxAdminKey\">Admin Token</label><input type=\"password\" id=\"cxAdminKey\" autocomplete=\"off\" spellcheck=\"false\" autocapitalize=\"off\" required placeholder=\"Masukkan token administrator\"><button type=\"submit\" class=\"primary-btn\">Masuk ke dashboard</button><p id=\"cxLoginError\" role=\"alert\"></p><small>Login dipertahankan ketika aplikasi ditutup atau halaman di-refresh. Logout tersedia di menu akun. Anda juga bisa keluar dengan menghapus cookie browser.</small></form>';\n  document.body.appendChild(overlay);\n  $('cxLoginForm').addEventListener('submit',async e=>{\n   e.preventDefault();const key=$('cxAdminKey'),button=e.target.querySelector('button'),value=key.value;key.value='';button.disabled=true;$('cxLoginError').textContent='Memeriksa akses...';\n   try{\n    const r=await fetch('/api/auth/login',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Ceritexa-Request':'dashboard'},body:JSON.stringify({token:value})});\n    const d=await r.json().catch(()=>({}));\n    if(!r.ok)throw Error(d.error||'Login gagal');\n    hideLogin();await refreshAll();setPage('home');notice('Anda berhasil masuk');\n   }catch(error){$('cxLoginError').textContent=String(error.message||error);}\n   finally{button.disabled=false;}\n  });\n }\n overlay.hidden=false;\n}\nfunction hideLogin(){connected=true;root.inert=false;if($('cxLogin'))$('cxLogin').hidden=true;}\nasync function refreshAll(){\n const [p,s]=await Promise.all([api('posts'),api('status')]);\n posts=Array.isArray(p.posts)?p.posts:[];status=s;\n const list=await Promise.allSettled([api('trends'),api('analytics'),api('audit'),api('editor-config')]);\n if(list[0].status==='fulfilled')trends=list[0].value.trends||[];\n if(list[1].status==='fulfilled')metrics=list[1].value.analytics||[];\n if(list[2].status==='fulfilled')events=list[2].value.events||[];\n if(list[3].status==='fulfilled')reasons=list[3].value.rejectionReasons||[];\n render();\n}\nasync function update(operation,message){\n if(busy)return;busy=true;\n const controls=Array.from(modal.querySelectorAll('button'));\n controls.forEach(x=>x.disabled=true);\n try{const result=await operation();closeModal();await refreshAll();notice(message||result?.message||'Berhasil disimpan');return result;}\n catch(e){notice(e.message||String(e),true);throw e;}\n finally{busy=false;controls.forEach(x=>{if(x.isConnected)x.disabled=false;});}\n}\nfunction setPage(which){if(!['home','draft','analytics','trends'].includes(which))return;page=which;render();scroller.scrollTop=0;}\nfunction shell(title){return '<div class=\"page-kicker\">'+title+'</div>';}\nfunction stat(label,value,hint){return '<div class=\"stat-card\"><div class=\"stat-label\">'+escapeHTML(label)+'<span class=\"tiny-icon\">✦</span></div><div class=\"stat-num\">'+escapeHTML(value)+'</div><div class=\"stat-detail\">'+escapeHTML(hint)+'</div></div>';}\nfunction home(){\n const today=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Makassar'}).toUpperCase();\n const focus=posts.filter(review).slice(0,3);\n const recent=events.slice(0,4).map(e=>'<div class=\"activity-item\"><i class=\"activity-dot\"></i><div><b>'+escapeHTML((e.action||'').replace(/_/g,' '))+'</b><span>'+escapeHTML(String(e.detail||'').slice(0,82))+' · '+escapeHTML(relative(e.at))+'</span></div></div>').join('');\n const week=posts.filter(p=>Date.now()-new Date(p.created_at).getTime()<7*86400000).length;\n const measures=metrics.filter(x=>/^likes|comments|shares|reactions$/i.test(x.metric));\n return shell(today)+'<div class=\"hero\"><div class=\"hero-text\"><div class=\"hero-kicker\">✦ CERITEXA CREATIVE WORKSPACE</div><h1>Satu ruang kreatif, semua cerita.</h1><p>Kelola ide, tinjau video, dan pantau konten dalam satu tempat.</p><button type=\"button\" class=\"hero-btn\" data-action=\"new\">＋ Buat draft baru</button></div><div class=\"hero-art\" aria-hidden=\"true\"><div class=\"orb\"></div><div class=\"stack one\"></div><div class=\"stack two\"></div><div class=\"stack three\">✦</div></div></div>'+\n '<div class=\"stat-grid\">'+stat('Perlu review',total('review'),'Menunggu keputusan Anda')+stat('Disetujui',total('approved'),'Termasuk jadwal dan terbit')+stat('Draft minggu ini',week,'Catatan tujuh hari terakhir')+stat('Interaksi tercatat',measures.length?Math.round(measures.reduce((a,x)=>a+Number(x.value||0),0)).toLocaleString('id-ID'):'—',measures.length?'Dari metrik tersedia':'Belum ada metrik')+'</div>'+\n '<div class=\"dashboard-split\"><div><div class=\"section-head\"><h2>Prioritas review</h2><button class=\"text-btn\" data-action=\"all-review\">Lihat semua →</button></div><div class=\"white-panel\">'+(focus.map(x=>'<div class=\"mini-item\"><div class=\"mini-cover cover-'+escapeHTML(x.channel)+'\">'+icon(x.channel)+'</div><div class=\"mini-details\"><strong>'+escapeHTML(x.title)+'</strong><small>'+escapeHTML(name(x.channel))+' · '+fmt(x)+'</small></div><button data-action=\"preview\" data-id=\"'+escapeHTML(x.id)+'\">Review</button></div>').join('')||'<div class=\"empty\">Tidak ada draft yang menunggu review.</div>')+'</div></div><div><div class=\"section-head\"><h2>Aktivitas terbaru</h2></div><div class=\"white-panel\">'+(recent||'<div class=\"empty\">Belum ada aktivitas baru.</div>')+'</div></div></div>';\n}\nfunction poster(x){return x.preview_media_key||x.media_key?'<img loading=\"lazy\" class=\"live-poster\" src=\"/api/preview/'+encodeURIComponent(x.id)+'\" alt=\"Ilustrasi draft\" onerror=\"this.style.display=\\'none\\'\">':'<span class=\"preview-art\">'+icon(x.channel)+'</span>';}\nfunction tile(x){\n const canReview=review(x);\n return '<article class=\"draft-card\"><div class=\"draft-preview cover-'+escapeHTML(x.channel)+'\"><span class=\"draft-format\">'+escapeHTML(fmt(x))+'</span>'+poster(x)+'</div><div class=\"draft-inner\"><div class=\"meta-row\"><span class=\"channel-name\">● '+escapeHTML(name(x.channel))+'</span><span class=\"time\">'+escapeHTML(relative(x.created_at))+'</span></div><h3>'+escapeHTML(x.title)+'</h3><p>'+escapeHTML(String(x.caption||x.story||'').slice(0,160))+'</p><div class=\"draft-actions\"><button class=\"secondary-btn small-btn\" data-action=\"preview\" data-id=\"'+escapeHTML(x.id)+'\">Lihat draft</button>'+\n (canReview?'<button class=\"primary-btn small-btn\" '+(x.state!=='PENDING_REVIEW'?'disabled':'')+' data-action=\"approve\" data-id=\"'+escapeHTML(x.id)+'\">Setujui</button><button class=\"quiet-btn small-btn\" data-action=\"reject\" data-id=\"'+escapeHTML(x.id)+'\">Tolak</button>':'<span class=\"approved-icon\">✓ '+escapeHTML(x.state==='APPROVED'?'Disetujui':x.state==='SCHEDULED'?'Dijadwalkan':'Terbit')+'</span>')+'</div></div></article>';\n}\nfunction draftPage(){\n const list=posts.filter(x=>(tab==='review'?review(x):approved(x))&&(filter==='all'||x.channel===filter));\n const switches=[['all','Semua'],['facebook','Ceritexa'],['panex','Panex'],['heros','Heros']];\n return shell('KONTEN & KREATIVITAS')+'<div class=\"row-between responsive-stack\"><div><h1 class=\"h1\">Draft konten</h1><p class=\"subtitle\">Tinjau konten baru atau kelola yang telah disetujui.</p></div><button class=\"primary-btn\" data-action=\"new\">＋ Buat draft</button></div><div class=\"row-between responsive-stack\" style=\"margin-top:24px\"><div class=\"tabs\" role=\"tablist\" aria-label=\"Status draft\"><button class=\"tab '+(tab==='review'?'active':'')+'\" data-tab=\"review\">Perlu review <span class=\"count\">'+total('review')+'</span></button><button class=\"tab '+(tab==='approved'?'active':'')+'\" data-tab=\"approved\">Disetujui <span class=\"count\">'+total('approved')+'</span></button></div><div class=\"filters\">'+switches.map(a=>'<button class=\"filter '+(filter===a[0]?'active':'')+'\" data-filter=\"'+a[0]+'\">'+a[1]+'</button>').join('')+'</div></div><div class=\"draft-list\">'+(list.map(tile).join('')||'<div class=\"empty\">Belum ada konten di tab ini.</div>')+'</div><p class=\"subtitle\">Draft ditolak disembunyikan dari daftar aktif. Catatan penolakannya tidak dihapus dari database.</p>';\n}\nfunction metricsFor(){\n const cutoff=Date.now()-days*86400000,postChannels=Object.fromEntries(posts.map(x=>[x.id,x.channel]));\n return metrics.filter(m=>new Date(m.observed_at).getTime()>=cutoff&&(channel==='all'||postChannels[m.post_id]===channel));\n}\nfunction sumMetrics(rows,which){const regex=which==='views'?/^(views|impressions|reach|plays)$/i:/^(likes|comments|shares|reactions)$/i;return rows.filter(x=>regex.test(x.metric)).reduce((a,x)=>a+Number(x.value||0),0);}\nfunction chart(rows){\n const counts={};for(const r of rows){if(!/^(views|plays|reach)$/i.test(r.metric))continue;const d=String(r.observed_at).slice(0,10);counts[d]=(counts[d]||0)+Number(r.value||0);}\n const vals=Object.entries(counts).sort((a,b)=>a[0].localeCompare(b[0]));\n if(vals.length<2)return '<div class=\"empty\">Grafik tersedia setelah metrik dari dua tanggal berhasil diambil.</div>';\n const max=Math.max(1,...vals.map(x=>x[1])),x=i=>20+i*690/Math.max(1,vals.length-1),y=v=>202-v/max*172;\n const route=vals.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v[1]).toFixed(1)).join(' ');\n return '<svg viewBox=\"0 0 730 230\" style=\"width:100%;height:200px\" aria-label=\"Tren tayangan dari metrik nyata\" role=\"img\"><path d=\"'+route+'\" stroke=\"#8062e8\" stroke-width=\"4\" fill=\"none\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></svg>';\n}\nfunction analyticsPage(){\n const rows=metricsFor(),views=sumMetrics(rows,'views'),interactions=sumMetrics(rows,'interactions');\n const choices=[['all','Semua'],['facebook','Ceritexa'],['panex','Panex'],['heros','Heros']];\n const hasViews=rows.some(r=>/^(views|impressions|reach|plays)$/i.test(r.metric)),hasInteractions=rows.some(r=>/^(likes|comments|shares|reactions)$/i.test(r.metric));\n return shell('PERFORMA KONTEN')+'<h1 class=\"h1\">Analitik</h1><p class=\"subtitle\">Angka diperoleh dari metrik platform yang tersedia, bukan simulasi.</p><div class=\"ana-filters\">'+choices.map(x=>'<button class=\"filter '+(channel===x[0]?'active':'')+'\" data-analytic=\"'+x[0]+'\">'+x[1]+'</button>').join('')+'</div><div class=\"ana-top\">'+[['Penayangan',hasViews?views.toLocaleString('id-ID'):'—'],['Interaksi',hasInteractions?interactions.toLocaleString('id-ID'):'—'],['Rasio interaksi',views>0?(100*interactions/views).toFixed(1)+'%':'—']].map(x=>'<div class=\"ana-metric\"><span>'+x[0]+'</span><b>'+x[1]+'</b><small>Berdasarkan data tercatat</small></div>').join('')+'</div><div class=\"chart-panel\"><div class=\"chart-head\"><div><h3>Grafik performa</h3><p>Data riil sesuai periode pilihan</p></div><div class=\"periods\">'+[7,30,90].map(x=>'<button class=\"period '+(days===x?'active':'')+'\" data-days=\"'+x+'\">'+x+' hari</button>').join('')+'</div></div><div class=\"chart-graphic\">'+chart(rows)+'</div></div><div class=\"section-head\"><h2>Detail per channel</h2></div><div class=\"channel-performance\">'+['facebook','panex','heros'].map(c=>'<div class=\"white-panel\"><strong>'+icon(c)+' '+name(c)+'</strong><p>'+Math.round(sumMetrics(metrics.filter(x=>posts.some(p=>p.id===x.post_id&&p.channel===c)),'interactions')).toLocaleString('id-ID')+' interaksi tercatat</p></div>').join('')+'</div>';\n}\nfunction trendsPage(){\n return shell('INSPIRASI CERITA')+'<div class=\"row-between responsive-stack\"><div><h1 class=\"h1\">Tren & ide</h1><p class=\"subtitle\">Riset yang dapat dipilih sebagai inspirasi konten.</p></div><button class=\"secondary-btn\" data-action=\"research\">↻ Riset terbaru</button></div><div class=\"trend-list\">'+(trends.slice(0,24).map(t=>'<article class=\"trend-card\"><div class=\"trend-head\"><span class=\"trend-chip\">'+escapeHTML(t.source)+'</span><span class=\"trend-score\">Skor '+escapeHTML(t.score)+'</span></div><h3>'+escapeHTML(t.topic)+'</h3><p>'+escapeHTML(relative(t.created_at))+'</p><button class=\"secondary-btn small-btn\" data-action=\"use-idea\" data-id=\"'+escapeHTML(t.id)+'\">＋ Gunakan ide</button></article>').join('')||'<div class=\"empty\">Belum ada tren. Coba riset terbaru.</div>')+'</div>';\n}\nfunction render(){\n if(!connected)return;area.innerHTML=({home,draft:draftPage,analytics:analyticsPage,trends:trendsPage}[page]||home)();\n $('crumbTitle').textContent=({home:'Home',draft:'Draft',analytics:'Analitik',trends:'Tren'})[page];\n $('sideReviewCount').textContent=total('review');\n root.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);b.setAttribute('aria-current',b.dataset.page===page?'page':'false');});\n}\nfunction openModal(title,body){\n modal.innerHTML='<div class=\"modal-head\"><h3 id=\"modalTitle\">'+escapeHTML(title)+'</h3><button class=\"icon-close\" data-action=\"close\" aria-label=\"Tutup\">×</button></div>'+body;\n modalWrap.hidden=false;\n}\nfunction closeModal(){const video=modal.querySelector('video');if(video)video.pause();modalWrap.hidden=true;modal.replaceChildren();images=[];}\nfunction actionBar(buttons){return '<div class=\"modal-actions\">'+buttons.join('')+'</div>';}\nfunction button(label,action,id,kind='secondary-btn'){return '<button type=\"button\" class=\"'+kind+'\" data-action=\"'+action+'\"'+(id?' data-id=\"'+escapeHTML(id)+'\"':'')+'>'+label+'</button>';}\nfunction showPreview(id){\n const p=draft(id);if(!p)return;\n const cover='/api/preview/'+encodeURIComponent(id);\n const video=p.media_type==='video/mp4';\n const media=video?'<video controls playsinline preload=\"metadata\" poster=\"'+cover+'\" style=\"max-height:55vh;width:100%\"><source src=\"/api/media/'+encodeURIComponent(id)+'\" type=\"video/mp4\">Video tidak didukung.</video>':p.media_key||p.preview_media_key?'<img alt=\"Media draft\" src=\"'+(p.format==='TEXT'?cover:'/api/media/'+encodeURIComponent(id))+'\" style=\"display:block;max-height:55vh;max-width:100%;margin:auto;object-fit:contain\">':'<div class=\"empty\">Media belum tersedia.</div>';\n const actions=[button('Tutup','close')];\n if(p.storyboard_count>0)actions.push(button('Lihat adegan','scenes',id));\n if(review(p)){\n  actions.push(button('Edit draft','edit',id),button('Ganti media','upload',id),button('Tolak','reject',id,'quiet-btn'));\n  if(p.state==='PENDING_REVIEW')actions.push(button('Setujui','approve',id,'primary-btn'));\n  if(p.state==='BLOCKED')actions.push(button('Buat storyboard','storyboard',id,'primary-btn'));\n }\n if(p.format==='VIDEO'&&video&&p.state==='PENDING_REVIEW')actions.push(button('Render ulang','upgrade',id));\n if(p.state==='APPROVED')actions.push(button('Jadwalkan','schedule',id,'primary-btn'));\n openModal(p.title,'<div class=\"modal-media\">'+media+'</div><p class=\"subtitle\">'+escapeHTML(name(p.channel))+' · '+escapeHTML(fmt(p))+' · '+escapeHTML(p.state)+'</p><p class=\"modal-caption\">'+escapeHTML(p.caption)+'</p><details><summary>Baca naskah lengkap</summary><p style=\"white-space:pre-wrap;line-height:1.65\">'+escapeHTML(p.story)+'</p></details>'+(p.format==='VIDEO'?'<p class=\"demo-note\">Storyboard '+Number(p.storyboard_count||0)+' / '+Number(p.planned_scene_count||0)+' adegan.</p>':'')+actionBar(actions));\n}\nfunction showEdit(id){\n const p=draft(id);if(!p||!review(p))return;\n openModal('Edit draft','<div class=\"field\"><label>Judul</label><input id=\"editTitle\" maxlength=\"100\" value=\"'+escapeHTML(p.title)+'\"></div><div class=\"field\"><label>Naskah</label><textarea id=\"editStory\" rows=\"6\">'+escapeHTML(p.story)+'</textarea></div><div class=\"field\"><label>Caption</label><textarea id=\"editCaption\" rows=\"4\">'+escapeHTML(p.caption)+'</textarea></div>'+actionBar([button('Batal','close'),button('Simpan','save-edit',id,'primary-btn')]));\n}\nfunction showReject(id){\n const p=draft(id);if(!p||!review(p))return;\n openModal('Tolak & buat ulang','<p class=\"subtitle\">'+escapeHTML(p.title)+'</p><div class=\"field\"><label>Alasan penolakan</label><select id=\"rejectReason\">'+reasons.map(s=>'<option value=\"'+escapeHTML(s)+'\">'+escapeHTML(s)+'</option>').join('')+'</select></div><div class=\"field\"><label>Catatan tambahan</label><textarea id=\"rejectNote\" rows=\"4\" maxlength=\"500\" placeholder=\"Perbaikan apa yang diharapkan?\"></textarea></div><p class=\"demo-note\">Draft lama hilang dari daftar aktif tetapi tetap disimpan di riwayat dan AI mencoba versi yang lebih baik.</p>'+actionBar([button('Batal','close'),button('Tolak & buat ulang','submit-reject',id,'primary-btn')]));\n}\nfunction showCreate(ch='panex',idea=''){\n openModal('Buat draft AI','<div class=\"field\"><label>Channel</label><select id=\"newChannel\"><option value=\"panex\">YouTube Panex</option><option value=\"heros\">YouTube Heros</option><option value=\"facebook\">Facebook Ceritexa</option></select></div><div class=\"field\"><label>Format</label><select id=\"newFormat\"></select></div><div class=\"field\"><label>Topik opsional</label><textarea id=\"newIdea\" rows=\"4\">'+escapeHTML(idea)+'</textarea></div><p class=\"demo-note\">Konten tetap memerlukan persetujuan sebelum dipublikasikan.</p>'+actionBar([button('Batal','close'),button('Buat draft','submit-create',null,'primary-btn')]));\n $('newChannel').value=ch;const select=$('newChannel'),types=$('newFormat');\n function options(){types.innerHTML=(select.value==='facebook'?['TEXT','PHOTO','COMIC']:['VIDEO']).map(x=>'<option>'+x+'</option>').join('');}\n select.addEventListener('change',options);options();\n}\nfunction showSchedule(id){\n const p=draft(id);if(!p||p.state!=='APPROVED')return;\n const date=new Date(Date.now()+3600000);const local=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);\n openModal('Jadwalkan konten','<p>'+escapeHTML(p.title)+'</p><div class=\"field\"><label>Waktu pada zona HP Anda</label><input id=\"scheduleTime\" type=\"datetime-local\" value=\"'+local+'\"></div>'+actionBar([button('Batal','close'),button('Simpan jadwal','submit-schedule',id,'primary-btn')]));\n}\nfunction showUpload(id){\n openModal('Ganti / tambah media','<div class=\"field\"><label>Foto atau video (maksimum 8 MB)</label><input id=\"fileMedia\" type=\"file\" accept=\"image/jpeg,image/png,video/mp4\"></div>'+actionBar([button('Batal','close'),button('Unggah media','submit-upload',id,'primary-btn')]));\n}\nasync function showScenes(id){\n const d=draft(id);if(!d)return;const s=await api('posts/'+id+'/storyboard');\n openModal('Storyboard · '+d.title,'<p class=\"subtitle\">'+s.sceneCount+'/'+s.plannedCount+' adegan'+(s.ready?' · Siap':' · Belum lengkap')+'</p><div class=\"scene-gallery\">'+s.scenes.map(x=>'<article class=\"scene-tile\"><img loading=\"lazy\" src=\"'+escapeHTML(x.previewPath)+'\" alt=\"Adegan '+(x.index+1)+'\"><strong>Adegan '+(x.index+1)+'</strong><p>'+escapeHTML(x.beat)+'</p></article>').join('')+'</div>'+actionBar([button('Tutup','close'),...(d.state==='BLOCKED'?[button('Lanjutkan storyboard','storyboard',id,'primary-btn')]:[])]));\n}\nasync function generateScenes(id){\n let progress=null,previous=-1;\n for(let i=0;i<9;i++){progress=await act('posts/'+id+'/storyboard',{});notice('Adegan '+progress.sceneCount+'/'+progress.plannedCount);if(progress.ready||progress.dailyLimitReached)break;if(progress.sceneCount<=previous)throw Error('Storyboard tidak bertambah');previous=progress.sceneCount;}\n return progress;\n}\nasync function perform(kind,id){\n switch(kind){\n case 'new':showCreate();break;\n case 'all-review':tab='review';filter='all';setPage('draft');break;\n case 'preview':showPreview(id);break;\n case 'close':closeModal();break;\n case 'edit':showEdit(id);break;\n case 'reject':showReject(id);break;\n case 'approve':if(confirm('Setujui konten ini? Ini belum mempublikasikan konten.'))await update(()=>act('posts/'+id+'/approve',{}),'Draft disetujui');break;\n case 'scenes':await showScenes(id);break;\n case 'storyboard':await update(()=>generateScenes(id),'Storyboard diperbarui');break;\n case 'upgrade':if(confirm('Render ulang video secara sinematik? File sebelumnya tetap tersimpan.'))await update(()=>act('posts/'+id+'/upgrade-video',{}),'Render ulang disiapkan');break;\n case 'schedule':showSchedule(id);break;\n case 'upload':showUpload(id);break;\n case 'save-edit':await update(()=>act('posts/'+id+'/edit',{title:$('editTitle').value,story:$('editStory').value,caption:$('editCaption').value}),'Draft disimpan');break;\n case 'submit-reject':await update(()=>act('posts/'+id+'/reject',{reason:$('rejectReason').value,note:$('rejectNote').value}),'Draft ditolak dan revisi diminta');break;\n case 'submit-create':await update(()=>act('generate',{channel:$('newChannel').value,format:$('newFormat').value,topic:$('newIdea').value.trim()}),'Draft AI baru dibuat');break;\n case 'submit-schedule':await update(()=>act('posts/'+id+'/schedule',{date:new Date($('scheduleTime').value).toISOString()}),'Jadwal tersimpan');break;\n case 'submit-upload':await update(async()=>{const file=$('fileMedia').files[0];if(!file)throw Error('Pilih file terlebih dahulu');if(file.size>8000000)throw Error('Maksimal 8 MB');return api('posts/'+id+'/media',{method:'POST',headers:{'Content-Type':file.type},body:file});},'Media diperbarui');break;\n case 'use-idea':{const t=trends.find(x=>x.id===id);if(t)showCreate('panex',t.topic);break;}\n case 'research':await update(()=>act('research',{}),'Tren diperbarui');break;\n case 'refresh':await refreshAll();notice('Data terbaru tersedia');break;\n case 'logout':if(confirm('Keluar dari dashboard Ceritexa?')){try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-Ceritexa-Request':'dashboard'},cache:'no-store'});}finally{posts=[];metrics=[];events=[];trends=[];closeModal();showLogin();notice('Anda telah logout');}}break;\n }\n}\nroot.addEventListener('click',e=>{\n const pageButton=e.target.closest('[data-page]');if(pageButton){setPage(pageButton.dataset.page);return;}\n const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;render();return;}\n const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;render();return;}\n const c=e.target.closest('[data-analytic]');if(c){channel=c.dataset.analytic;render();return;}\n const d=e.target.closest('[data-days]');if(d){days=Number(d.dataset.days);render();return;}\n const actButton=e.target.closest('[data-action]');if(actButton)Promise.resolve().then(()=>perform(actButton.dataset.action,actButton.dataset.id)).catch(ex=>notice(ex.message||String(ex),true));\n});\nmodalWrap.addEventListener('click',e=>{if(e.target===modalWrap)closeModal();});\ndocument.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modalWrap.hidden)closeModal();});\nwindow.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});\nif('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});\n(async()=>{try{const r=await fetch('/api/auth/me',{cache:'no-store',credentials:'same-origin'});const d=await r.json();if(!d.authenticated){showLogin();return;}hideLogin();await refreshAll();}catch(e){showLogin();notice('Gagal terhubung. Periksa koneksi internet.',true);}})();\n})();</script>\n</body></html>";
function mediaEnv(e){
 if(e.MEDIA||!e.MEDIAKV)return e;
 return {...e, MEDIA:{
   async get(key){const value=await e.MEDIAKV.get(key,'arrayBuffer');return value?{body:value,size:value.byteLength,arrayBuffer:async()=>value}:null;},
   async put(key,bytes){return e.MEDIAKV.put(key,bytes);}
 }};
}
async function handle(request,e){
 e=mediaEnv(e);
 const url=new URL(request.url),p=url.pathname,method=request.method;
 if(method==='GET'&&p==='/manifest.webmanifest')return new Response(JSON.stringify(pwaManifest),{headers:{...pwaPublicHeaders,'Content-Type':'application/manifest+json; charset=utf-8'}});
 if(method==='GET'&&p==='/sw.js')return new Response(serviceWorkerScript,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache','Service-Worker-Allowed':'/','X-Content-Type-Options':'nosniff'}});
 if(method==='GET'&&(p==='/icon-192.svg'||p==='/icon-512.svg'))return new Response(appIcon(p==='/icon-192.svg'?192:512),{headers:{...pwaPublicHeaders,'Content-Type':'image/svg+xml; charset=utf-8'}});
 if(method==='GET'&&p==='/icon-96.jpg')return new Response(Uint8Array.from(atob(CERITEXA_LOGO.split(',')[1]),c=>c.charCodeAt(0)),{headers:{...pwaPublicHeaders,'Content-Type':'image/jpeg'}});
 if(p==='/')return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
 if(p==='/api/health')return answer({ok:true,service:'ceritexa-content-agent',isolated:true,d1:!!e.DB,r2:!!e.MEDIAKV||!!e.MEDIA,mediaBackend:e.MEDIAKV?'KV':e.MEDIA?'R2':null,ai:!!e.AI,publishingConfigured:e.ALLOW_PUBLICATION==='true'});
 if(!p.startsWith('/api/'))return answer({error:'Not found'},404);
 if(method==='POST'&&p==='/api/auth/login')return loginOwner(request,e);
 if(method==='GET'&&p==='/api/auth/me')return sessionStatus(request,e);
 if(method==='POST'&&p==='/api/auth/logout'){
  if(!sameOriginMutation(request))return answer({error:'Cross-site request not permitted'},403);
  return logoutOwner(request,e);
 }
 if(!e.ADMIN_TOKEN)return answer({error:'ADMIN_TOKEN not configured'},503);
 if(!e.DB)return answer({error:'D1 missing'},503);
 const bearer=request.headers.get('Authorization')||'';
 const bearerOk=bearer.startsWith('Bearer ')&&compareToken(bearer.slice(7),e.ADMIN_TOKEN);
 const ownerSession=bearerOk?null:await readOwnerSession(request,e);
 if(!bearerOk&&!ownerSession)return answer({error:'Unauthorized'},401);
 // Browser-cookie sessions cannot be used for cross-site POSTs. GitHub Actions
 // continues using the existing Authorization Bearer contract unchanged.
 if(!bearerOk&&!['GET','HEAD'].includes(method)&&!sameOriginMutation(request))
  return answer({error:'Cross-site request not permitted'},403);
 if(method==='GET'&&p==='/api/editor-config')return answer({rejectionReasons:REJECTION_REASONS});
 if(method==='GET'&&p==='/api/readiness')return answer(readiness(e,await isPaused(e)));
 if(method==='GET'&&p==='/api/connections/verify')return answer(await verifyConnections(e));
 if(method==='GET'&&p==='/api/status')return answer({paused:await isPaused(e),publicationEnabled:e.ALLOW_PUBLICATION==='true',mediaReady:!!e.MEDIA,mediaBackend:e.MEDIAKV?'KV':e.MEDIA?'R2':null,aiReady:!!e.AI,facebookReady:!!(e.FB_PAGE_ID&&e.FB_PAGE_ACCESS_TOKEN),panexReady:!!(e.YT_REFRESH_TOKEN_PANEX&&e.YT_CHANNEL_ID_PANEX),herosReady:!!(e.YT_REFRESH_TOKEN_HEROS&&e.YT_CHANNEL_ID_HEROS),channels:CHANNELS});
 if(method==='GET'&&p==='/api/posts')return answer({posts:(await list(e,"SELECT p.*,r.parent_id,r.revision_depth,r.rejection_reason,r.rejection_note,r.regen_state,r.preview_media_key,r.last_error,(SELECT a.action||': '||a.detail FROM audit a WHERE a.entity_id=p.id AND a.action IN ('RENDER_STARTED','RENDER_FAILED','RENDER_COMPLETED') ORDER BY a.at DESC LIMIT 1) AS render_event,(SELECT COUNT(*) FROM video_storyboard vs WHERE vs.post_id=p.id) AS storyboard_count FROM posts p LEFT JOIN draft_reviews r ON r.post_id=p.id ORDER BY p.created_at DESC LIMIT 100")).map(post=>{let planned=0;if(post.format==='VIDEO')try{planned=sceneBeats(post.story,post.channel).length;}catch{}return {...post,planned_scene_count:planned};})});
 if(method==='GET'&&p==='/api/editor-config')return answer({rejectionReasons:REJECTION_REASONS});
 if(method==='GET'&&p==='/api/trends')return answer({trends:await list(e,'SELECT * FROM trends ORDER BY created_at DESC LIMIT 30')});
 if(method==='GET'&&p==='/api/analytics')return answer({analytics:await list(e,'SELECT * FROM metrics ORDER BY observed_at DESC LIMIT 100')});
 if(method==='GET'&&p==='/api/strategy')return answer(await strategy(e));
 if(method==='GET'&&p==='/api/audit')return answer({events:await list(e,'SELECT * FROM audit ORDER BY at DESC LIMIT 40')});
 if(method==='GET'){
  const storyboardMatch=p.match(/^\/api\/posts\/([0-9a-f-]{36})\/storyboard$/);
  if(storyboardMatch)return answer(await storyboard(e,storyboardMatch[1],false));
  const sceneMatch=p.match(/^\/api\/posts\/([0-9a-f-]{36})\/storyboard\/(\d{1,2})\/image$/);
  if(sceneMatch)return storyboardImage(e,sceneMatch[1],Number(sceneMatch[2]));
 }
 if(method==='GET'&&p.startsWith('/api/media/'))return media(e,p.slice('/api/media/'.length));
 if(method==='GET'&&p.startsWith('/api/preview/'))return media(e,p.slice('/api/preview/'.length),true);
 if(method==='POST'){
  const l=Number(request.headers.get('Content-Length')||0);
  if(l>8_000_000)return answer({error:'Payload too large'},413);
  let data={};
  if(p!=='/api/research'&&p!=='/api/publish'&&p!=='/api/metrics'&&p!=='/api/strategy'&&!p.endsWith('/media')){if(l>12000)return answer({error:'JSON too large'},413);data=await request.json();}
  if(p==='/api/research')return answer(await research(e));
  if(p==='/api/generate')return answer(await makeDraft(e,data.channel,data.format,data.topic),201);
  if(p==='/api/pause'){if(typeof data.paused!=='boolean')throw Error('paused harus boolean');await run(e,"INSERT INTO settings(key,value) VALUES('paused',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(data.paused));await audit(e,'PAUSE',String(data.paused));return answer({paused:data.paused});}
  if(p==='/api/publish')return answer(await publish(e));
  if(p==='/api/metrics')return answer(await analytics(e));
  if(p==='/api/strategy')return answer(await strategy(e));
  const match=p.match(/^\/api\/posts\/([0-9a-f-]{36})\/(approve|schedule|media|edit|reject|regenerate|preview|render-event|storyboard|upgrade-video)$/);
  if(match){
   if(match[2]==='approve')return answer(await approve(e,match[1]));
   if(match[2]==='reject')return answer(await rejectDraft(e,match[1],data.reason,data.note));
   if(match[2]==='regenerate')return answer(await retryRegeneration(e,match[1]));
   if(match[2]==='preview')return answer(await regenerateCover(e,match[1]));
   if(match[2]==='render-event')return answer(await renderEvent(e,match[1],data));
   if(match[2]==='storyboard')return answer(await storyboard(e,match[1],true));
   if(match[2]==='upgrade-video')return answer(await upgradeVideo(e,match[1]));
   if(match[2]==='edit')return answer(await edit(e,match[1],data));
   if(match[2]==='schedule')return answer(await schedule(e,match[1],data.date));
   if(match[2]==='media')return answer(await upload(e,match[1],request));
  }
 }
 return answer({error:'Not found'},404);
}
export default{
 async fetch(request,e){try{return await handle(request,e);}catch(error){return answer({error:String(error?.message||error).slice(0,240)},400);}},
 async scheduled(event,e,ctx){e=mediaEnv(e);if(!e.DB)return;ctx.waitUntil((async()=>{
  if(event.cron==='0 0 * * *'){
   await analytics(e);await strategy(e);await research(e);
   if(e.ALLOW_DAILY_DRAFTS==='true'&&!(await isPaused(e))){
    const rotation=[['facebook','TEXT'],['facebook','PHOTO'],['panex','VIDEO'],['facebook','COMIC'],['heros','VIDEO'],['facebook','TEXT'],['panex','VIDEO']];
    const day=Math.floor(Date.now()/86400000),[channel,format]=rotation[day%rotation.length];
    await makeDraft(e,channel,format,'');
   }
  }
  else await publish(e);
 })().catch(async er=>{await audit(e,'CRON_ERROR','',String(er));}));}
};
