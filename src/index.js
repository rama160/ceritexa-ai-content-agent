import {CHANNELS,validate,detectRisk,parseRss,score,parseAI,compareToken,gate,readiness,selectDraftTopic,validateRejection,creativeSimilarity,MAX_REVISION_DEPTH,REJECTION_REASONS} from './core.js';
const utc=()=>new Date().toISOString(),uuid=()=>crypto.randomUUID();
const answer=(v,c=200)=>Response.json(v,{status:c,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const db=(env,q,...params)=>env.DB.prepare(q).bind(...params);
const row=async(e,q,...p)=>db(e,q,...p).first();
const list=async(e,q,...p)=>(await db(e,q,...p).all()).results||[];
const run=async(e,q,...p)=>db(e,q,...p).run();
async function audit(e,action,id='',detail=''){await run(e,'INSERT INTO audit(id,action,entity_id,detail,at) VALUES(?,?,?,?,?)',uuid(),action,id,String(detail).slice(0,300),utc());}
async function isPaused(e){return (await row(e,"SELECT value FROM settings WHERE key='paused'"))?.value!=='false';}
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
 const key='owner/'+id+(mp4?'.mp4':png?'.png':'.jpg');
 await e.MEDIA.put(key,arr,{httpMetadata:{contentType:mime}});
 await run(e,"UPDATE posts SET media_key=?,media_type=?,state='PENDING_REVIEW',risk_note='',updated_at=? WHERE id=?",key,mime,utc(),id);
 if(!mp4)await run(e,"INSERT INTO draft_reviews(post_id,preview_media_key,updated_at) VALUES(?,?,?) ON CONFLICT(post_id) DO UPDATE SET preview_media_key=excluded.preview_media_key,updated_at=excluded.updated_at",id,key,utc());
 await audit(e,'MEDIA_UPLOADED',id,mime);return {id,media_key:key};
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
const CERITEXA_LOGO='data:image/jpeg;base64,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';
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
 background_color:'#0c1020',
 theme_color:'#0c1020',
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
const CACHE='ceritexa-public-shell-v1.4.0';
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
const page=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0c1020"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="/icon-192.svg"><link rel="apple-touch-icon" href="/icon-96.jpg"><title>Ceritexa Studio — AI Content Agent</title><style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#eaf0ff;background:#0c1020}*{box-sizing:border-box}body{margin:0}header{padding:20px;background:linear-gradient(120deg,#203361,#321750);border-bottom:1px solid #3a4264}h1{margin:4px 0;font-size:24px}.install-card{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;background:#17234b;border:1px solid #4e69ae;border-radius:12px;padding:13px;margin:13px 0}.install-card h2{font-size:16px;margin:0}.install-card p{font-size:12px;color:#b5c7e8;margin:4px 0;line-height:1.5}.install-card button{background:#385cac;font-weight:600}[hidden]{display:none!important}.brandbar{display:flex;align-items:center;gap:14px}.brandbar img{border-radius:18px;border:1px solid rgba(220,240,255,.25);object-fit:cover;box-shadow:0 7px 22px rgba(24,91,255,.18)}small,.muted{color:#aeb8d3}main{max-width:1050px;margin:auto;padding:16px}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}button,select,input,textarea{font:inherit;padding:10px;border-radius:9px;border:1px solid #4e5a83;color:#eaf0ff;background:#1c2544}textarea{width:100%;display:block;margin:8px 0}button{cursor:pointer}button:hover{background:#2b3b65}button.primary{background:#374ea1}input{max-width:100%}article{background:#171d35;border:1px solid #313b60;border-radius:13px;padding:14px;margin:12px 0}.draft-card{overflow:hidden;padding:0}.draft-body{padding:15px}.draft-poster{position:relative;display:grid;place-items:center;background:linear-gradient(125deg,#102852,#17132f);height:210px;overflow:hidden}.draft-poster img{width:100%;height:100%;object-fit:cover;display:block}.draft-poster img.fallback{width:120px;height:120px;object-fit:contain;border-radius:17px}.draft-poster small{position:absolute;bottom:8px;right:10px;background:rgba(9,13,32,.84);padding:3px 7px;border-radius:6px}.reject-toggle{color:#ffd2d2}.rejection-form{padding:12px;margin:10px 0;background:#2a1932;border:1px solid #87516b;border-radius:12px}.rejection-form select{max-width:100%}.danger{background:#7f2948;border-color:#b64b6d}.danger:hover{background:#9a345c}.rejected-card{border-color:#624457;opacity:.83}.revision-badge{color:#ffe0a1}.poster-hint{display:block;padding:4px 0;color:#bac8ed}.play-cover{position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);background:rgba(13,33,88,.92);font-weight:700;border-radius:99px;padding:13px 22px;white-space:nowrap;box-shadow:0 8px 25px #0008}.video-notice{padding:10px;border:1px solid #8b7740;border-radius:9px;background:#302c1e;color:#f4e1b1;font-size:13px}.video-notice a{color:#b8dcff}#mediaDialog{box-sizing:border-box;width:min(96vw,850px);max-height:94dvh;overflow:auto;background:#131a34;color:#eaf0ff;border:1px solid #596995;border-radius:15px;padding:14px;box-shadow:0 20px 70px rgba(0,0,0,.7)}#mediaDialog::backdrop{background:rgba(0,0,0,.85)}.media-dialog-top{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:9px}.media-dialog-top h2{font-size:17px;line-height:1.3;margin:0}#mediaDialogContent{display:grid;place-items:center;min-height:64px}#mediaDialogContent img,#mediaDialogContent video{display:block;width:auto;max-width:100%;max-height:73dvh;border-radius:8px;object-fit:contain}#mediaDialogStatus{margin:9px 0;color:#cdd9f3;font-size:13px;line-height:1.5}#mediaDialogClose{min-height:44px;min-width:72px;background:#3653a1}section{margin:20px 0}.card{background:#121830;border:1px solid #313b60;padding:14px;border-radius:12px;margin:10px 0}h3{margin:5px 0}.tag{color:#b8dcff;font-size:12px}p{overflow-wrap:anywhere}pre{white-space:pre-wrap;max-height:300px;overflow:auto}#notice{min-height:24px;color:#d8ed9a}label{font-size:13px;color:#b6c6ed}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}@media(max-width:520px){header{padding:14px}main{padding:12px}h1{font-size:20px}}
</style></head><body><header><div class="brandbar"><img id="brandLogo" src="${CERITEXA_LOGO}" width="68" height="68" alt="Logo resmi Ceritexa Studio"><div><h1>Ceritexa Studio</h1><small>AI Content Agent · Panex · Heros Real Life</small></div></div></header><main><div class="install-card" id="pwaInstallBox"><div><h2><span id="pwaStatus">Pasang Ceritexa di HP</span></h2><p id="pwaHint">Buka Chrome ⋮ → Tambahkan ke layar utama → Instal aplikasi. Dashboard perlu internet untuk mengelola draft.</p></div><button id="installPwa" type="button" hidden>Instal Ceritexa</button></div><article><div class="bar"><label for="token">Admin token (hanya di memori halaman)</label><input type="password" id="token" autocomplete="off" placeholder="Masukkan ADMIN_TOKEN"><button class="primary" id="refresh">Hubungkan</button></div><p id="notice">Masukkan token setelah dibuat di Cloudflare Dashboard. Public posting OFF.</p></article><section><h2>Status & kendali</h2><div id="status" class="cols"></div><div class="bar"><button id="pause">Pause All</button><button id="resume">Resume Drafting</button><button id="trends">Riset Tren</button><button id="metrics">Ambil Statistik</button><button id="verify">Uji koneksi sosial</button><button id="strategy">Evaluasi strategi</button><button id="publish">Periksa Jadwal</button></div></section><section><h2>Kesiapan Integrasi</h2><div id="readiness"></div><pre id="verifyResults">Belum ada verifikasi akun sosial.</pre></section><section><h2>Buat draft AI</h2><article><div class="bar"><select id="channel"><option value="facebook">Facebook Ceritexa</option><option value="panex">YouTube Panex</option><option value="heros">YouTube Heros</option></select><select id="format"><option>TEXT</option><option>PHOTO</option><option>COMIC</option><option>VIDEO</option></select><input id="topic" placeholder="Topik opsional"><button class="primary" id="generate">Buat draft</button></div><small>AI hanya membuat draft. Foto/komik menggunakan media KV; video memerlukan renderer. YouTube hanya menerima VIDEO.</small></article></section><section><h2>Konten dan persetujuan</h2><div id="posts"></div></section><section><h2>Strategi berbasis metrik</h2><pre id="strategyResult">Belum dievaluasi.</pre></section><section><h2>Tren</h2><div id="trendlist"></div></section></main><dialog id="mediaDialog" aria-labelledby="mediaDialogTitle"><div class="media-dialog-top"><h2 id="mediaDialogTitle">Pratinjau media</h2><button type="button" id="mediaDialogClose" aria-label="Tutup pratinjau">Tutup ✕</button></div><p id="mediaDialogStatus" role="status" aria-live="polite">Memuat media...</p><div id="mediaDialogContent"></div></dialog><script>
let token='';const el=id=>document.getElementById(id);const logoFallback=document.getElementById('brandLogo').src;const rejectionReasons=${JSON.stringify(REJECTION_REASONS)};let posterURLs=[];const safe=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function api(path,opts={}){if(!token)throw Error('Masukkan ADMIN_TOKEN');const r=await fetch('/api/'+path,{...opts,headers:{'Authorization':'Bearer '+token,...(opts.headers||{})}});let data=await r.json().catch(()=>({error:'Respons bukan JSON'}));if(!r.ok)throw Error(data.error||'HTTP '+r.status);return data}
async function action(path,data){return api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data||{})})}
async function work(fn){el('notice').textContent='Menjalankan...';try{const v=await fn();el('notice').textContent=JSON.stringify(v).slice(0,250);await refresh();}catch(e){el('notice').textContent='Error: '+e.message}}
let activeMediaUrl=null;
let activeMediaRequest=0;
function closeMediaViewer(){
 activeMediaRequest++;
 const dialog=el('mediaDialog'),container=el('mediaDialogContent');
 const video=container.querySelector('video');if(video)video.pause();
 container.replaceChildren();
 if(activeMediaUrl){URL.revokeObjectURL(activeMediaUrl);activeMediaUrl=null;}
 if(dialog.open)dialog.close();
}
el('mediaDialogClose').onclick=closeMediaViewer;
el('mediaDialog').addEventListener('close',()=>{
 activeMediaRequest++;
 const container=el('mediaDialogContent'),video=container.querySelector('video');
 if(video)video.pause();
 container.replaceChildren();
 if(activeMediaUrl){URL.revokeObjectURL(activeMediaUrl);activeMediaUrl=null;}
});
async function openMediaViewer(id,label,mediaType){
 const dialog=el('mediaDialog'),container=el('mediaDialogContent');
 if(dialog.open)closeMediaViewer();
 const ticket=++activeMediaRequest;
 el('mediaDialogTitle').textContent=label||'Pratinjau media';
 container.replaceChildren();
 el('mediaDialogStatus').textContent='Memuat file media privat...';
 dialog.showModal();
 try{
  if(!token)throw Error('Masuk ulang menggunakan ADMIN_TOKEN lalu coba lagi.');
  const response=await fetch('/api/media/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)throw Error(response.status===404?'File media tidak ditemukan di penyimpanan.':response.status===401?'Sesi tidak valid. Silakan login ulang.':'Gagal memuat file (HTTP '+response.status+').');
  const blob=await response.blob();
  if(ticket!==activeMediaRequest)return;
  const actualType=blob.type||mediaType||'';
  if(!actualType.startsWith('image/')&&!actualType.startsWith('video/'))throw Error('Format media tidak dapat ditampilkan: '+actualType);
  if(!blob.size)throw Error('File media kosong.');
  const url=URL.createObjectURL(blob);activeMediaUrl=url;
  const item=document.createElement(actualType.startsWith('video/')?'video':'img');
  item.src=url;
  if(item.tagName==='VIDEO'){
   item.controls=true;item.playsInline=true;item.preload='metadata';
   item.setAttribute('aria-label','Video pratinjau Ceritexa');
   item.onerror=()=>{el('mediaDialogStatus').textContent='Video tidak dapat diputar. Periksa codec MP4 dan hasil GitHub Actions.'};
   el('mediaDialogStatus').textContent='Video MP4 siap dipreview. Tekan Play untuk memutar.';
  }else{
   item.alt='Ilustrasi resolusi penuh Ceritexa';
   item.onerror=()=>{el('mediaDialogStatus').textContent='Gambar tidak dapat dibuka. Coba buat ulang ilustrasi.'};
   el('mediaDialogStatus').textContent=mediaType==='image/jpeg'||mediaType==='image/png'?'Ini adalah gambar asli. Untuk draft VIDEO, MP4 belum tersedia sampai proses render selesai.':'Gambar resolusi penuh.';
  }
  container.replaceChildren(item);
 }catch(error){
  if(ticket===activeMediaRequest){container.replaceChildren();el('mediaDialogStatus').textContent='Gagal membuka media: '+String(error.message||error);}
 }
}
async function refresh(){const [s,p,t,ready]=await Promise.all([api('status'),api('posts'),api('trends'),api('readiness')]);el('status').innerHTML='<div class="card">Mode: <b>'+safe(s.paused?'PAUSED':'REVIEW')+'</b></div><div class="card">Publication: <b>'+safe(s.publicationEnabled?'Configured':'DISABLED')+'</b></div><div class="card">Media: <b>'+safe(s.mediaReady?'ready ('+s.mediaBackend+')':'not enabled')+'</b></div><div class="card">Drafts: <b>'+safe(p.posts.length)+'</b></div>';
el('readiness').innerHTML=ready.checks.map(x=>'<div class="card"><strong>'+(x.ready?'✓ ':'○ ')+safe(x.label)+'</strong>'+(x.ready?' <small>Siap dikonfigurasi</small>':'<p class="muted">'+safe(x.next)+'</p>')+'</div>').join('');

function renderDraft(x){
 const id=safe(x.id),reviewable=['PENDING_REVIEW','BLOCKED'].includes(x.state);
 const reasonSelect='<select data-reason="'+id+'">'+rejectionReasons.map(r=>'<option value="'+safe(r)+'">'+safe(r)+'</option>').join('')+'</select>';
 const isMp4=x.media_type==='video/mp4';
 const viewLabel=isMp4?'Putar video MP4':x.format==='VIDEO'?'Lihat ilustrasi (MP4 belum siap)':'Perbesar gambar asli';
 const actions=(reviewable?'<button data-gencover="'+id+'">'+(x.preview_media_key?'Ganti ilustrasi AI':'Buat gambar review AI')+'</button>':'')+(x.media_key?'<button type="button" data-view="'+id+'" data-media-label="'+safe(viewLabel)+'" data-media-type="'+safe(x.media_type||'')+'">'+safe(viewLabel)+'</button>':'')+
  (reviewable?'<input type="file" data-file="'+id+'" accept="'+(x.format==='VIDEO'?'video/mp4':'image/jpeg,image/png')+'"><button data-upload="'+id+'">Ganti / tambah media</button>':'')+
  (x.state==='PENDING_REVIEW'?'<button data-approve="'+id+'">Setujui setelah review</button>':'')+
  (x.state==='APPROVED'?'<input type="datetime-local" data-date="'+id+'"><button data-schedule="'+id+'">Jadwalkan (WITA perangkat)</button>':'');
 const revision=x.parent_id?'<p class="revision-badge">Revisi otomatis #'+safe(x.revision_depth)+' — berdasarkan alasan penolakan</p>':'';
 const feedback=x.state==='REJECTED'?'<p class="revision-badge">Ditolak: '+safe(x.rejection_reason||'Alasan tidak dicatat')+(x.rejection_note?' · '+safe(x.rejection_note):'')+'</p>':'';
 const retry=x.state==='REJECTED'&&x.regen_state==='FAILED'?'<button data-retry="'+id+'">Coba buat ulang</button>':'';
 const reject=reviewable?'<details class="rejection-form"><summary class="reject-toggle">Tolak draft &amp; buat versi lebih baik</summary><p class="muted">Draft ini disimpan sebagai REJECTED, lalu agen membuat pengganti baru. Batas 3 kali regenerasi.</p><label>Alasan penolakan</label>'+reasonSelect+'<label>Catatan tambahan (opsional)</label><textarea rows="3" maxlength="500" data-note="'+id+'" placeholder="Contoh: ubah karakter, visual lebih hangat, alur lebih menyentuh"></textarea><button class="danger" data-reject="'+id+'">Tolak &amp; buat ulang</button></details>':'';
 const editForm=reviewable?'<details><summary>Edit draft</summary><label>Judul</label><input data-title="'+id+'" value="'+safe(x.title)+'"><label>Caption</label><textarea rows="3" data-caption="'+id+'">'+safe(x.caption)+'</textarea><label>Naskah</label><textarea rows="7" data-story="'+id+'">'+safe(x.story)+'</textarea><button data-save="'+id+'">Simpan revisi</button></details>':'';
 const hasPreview=!!(x.preview_media_key||((x.media_type||'').startsWith('image/')&&x.media_key));
 const playOverlay=isMp4?'<button type="button" class="play-cover" data-view="'+id+'" data-media-label="Putar video MP4" data-media-type="video/mp4" aria-label="Putar video MP4 '+safe(x.title)+'">▶ Putar MP4</button>':'';
 const poster='<div class="draft-poster"><img class="fallback" data-poster="'+id+'" data-has-preview="'+hasPreview+'" src="'+logoFallback+'" alt="Preview cerita '+safe(x.title)+'" loading="lazy"><small>'+(hasPreview?'Preview ilustrasi AI':'Logo fallback')+'</small>'+playOverlay+'</div>';
 const status='<span class="tag">'+safe(x.channel)+' · '+safe(x.format)+' · '+safe(x.state)+'</span>';
 const videoNotice=x.format==='VIDEO'&&!isMp4?'<p class="video-notice">Ini masih ilustrasi AI, bukan video MP4. Render melalui <a href="https://github.com/rama160/ceritexa-ai-content-agent/actions/workflows/render-video.yml" target="_blank" rel="noopener noreferrer">GitHub Actions Ceritexa</a> untuk membuat video sebelum review dan upload.</p>':'';
 const renderFeedback=x.format==='VIDEO'&&x.state==='BLOCKED'&&x.render_event?'<p class="video-notice">'+safe(x.render_event)+'</p>':'';
 return '<article class="draft-card '+(x.state==='REJECTED'?'rejected-card':'')+'" id="draft-'+id+'">'+poster+'<div class="draft-body">'+status+revision+feedback+'<h3>'+safe(x.title)+'</h3><p>'+safe(x.caption)+'</p>'+videoNotice+renderFeedback+'<details><summary>Baca naskah</summary><p>'+safe(x.story)+'</p></details><small>'+safe(x.risk_note||'')+'</small><div class="bar">'+actions+retry+'</div>'+reject+editForm+'</div></article>';
}
async function loadPosters(){
 for(const url of posterURLs)URL.revokeObjectURL(url);
 posterURLs=[];
 const images=[...document.querySelectorAll('[data-poster][data-has-preview="true"]')].slice(0,35);
 await Promise.allSettled(images.map(async img=>{
  const id=img.dataset.poster;
  const r=await fetch('/api/preview/'+id,{headers:{Authorization:'Bearer '+token}});
  if(!r.ok)return;
  const blob=await r.blob();
  if(!blob.type.startsWith('image/'))return;
  const url=URL.createObjectURL(blob);
  posterURLs.push(url);
  if(img.isConnected){img.src=url;img.classList.remove('fallback');}
 }));
}
el('posts').innerHTML=p.posts.length?p.posts.map(renderDraft).join(''):'<p class="muted">Belum ada konten.</p>';
await loadPosters();
el('trendlist').innerHTML=t.trends.map(x=>'<div class="card"><b>'+safe(x.topic)+'</b><br><small>'+safe(x.source)+'</small></div>').join('')||'<p class="muted">Belum ada riset.</p>';
document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>work(()=>action('posts/'+b.dataset.save+'/edit',{title:document.querySelector('[data-title="'+b.dataset.save+'"]').value,caption:document.querySelector('[data-caption="'+b.dataset.save+'"]').value,story:document.querySelector('[data-story="'+b.dataset.save+'"]').value})));
document.querySelectorAll('[data-gencover]').forEach(b=>b.onclick=()=>work(()=>action('posts/'+b.dataset.gencover+'/preview',{})));
document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>work(()=>action('posts/'+b.dataset.reject+'/reject',{reason:document.querySelector('[data-reason="'+b.dataset.reject+'"]').value,note:document.querySelector('[data-note="'+b.dataset.reject+'"]').value})));
document.querySelectorAll('[data-retry]').forEach(b=>b.onclick=()=>work(()=>action('posts/'+b.dataset.retry+'/regenerate',{})));
document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>work(()=>action('posts/'+b.dataset.approve+'/approve')));
document.querySelectorAll('[data-schedule]').forEach(b=>b.onclick=()=>work(()=>{const v=document.querySelector('[data-date="'+b.dataset.schedule+'"]')?.value;if(!v)throw Error('Pilih tanggal dan jam');return action('posts/'+b.dataset.schedule+'/schedule',{date:new Date(v).toISOString()})}));
document.querySelectorAll('[data-upload]').forEach(b=>b.onclick=()=>work(async()=>{const file=document.querySelector('[data-file="'+b.dataset.upload+'"]')?.files?.[0];if(!file)throw Error('Pilih gambar atau MP4');const r=await fetch('/api/posts/'+b.dataset.upload+'/media',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':file.type},body:file});const j=await r.json();if(!r.ok)throw Error(j.error||'Upload gagal');return j;}));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>openMediaViewer(b.dataset.view,b.dataset.mediaLabel,b.dataset.mediaType));
}
el('refresh').onclick=()=>{token=el('token').value;el('token').value='';work(async()=>{await refresh();return {connected:true}})};
el('pause').onclick=()=>work(()=>action('pause',{paused:true}));el('resume').onclick=()=>work(()=>action('pause',{paused:false}));
el('trends').onclick=()=>work(()=>action('research'));el('metrics').onclick=()=>work(()=>action('metrics'));el('verify').onclick=()=>work(async()=>{const v=await api('connections/verify');el('verifyResults').textContent=JSON.stringify(v,null,2);return {connectionChecksComplete:true}});el('strategy').onclick=()=>work(async()=>{const v=await action('strategy');el('strategyResult').textContent=JSON.stringify(v,null,2);return {strategyEvaluated:true}});el('publish').onclick=()=>work(()=>action('publish'));
el('generate').onclick=()=>work(()=>action('generate',{channel:el('channel').value,format:el('format').value,topic:el('topic').value}));
el('channel').onchange=()=>{if(el('channel').value!=='facebook')el('format').value='VIDEO'};

let deferredPwaPrompt=null;
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
function syncPwaInstall(){
 if(standalone()){
  el('pwaStatus').textContent='Ceritexa terpasang';
  el('pwaHint').textContent='Aplikasi terbuka dalam mode standalone. Draft dan tindakan admin tetap memerlukan koneksi internet.';
  el('installPwa').hidden=true;
 }else{
  el('installPwa').hidden=!deferredPwaPrompt;
  el('pwaHint').textContent=deferredPwaPrompt?'Tekan Instal Ceritexa untuk menambahkan aplikasi ke HP.':'Chrome Android: tekan menu ⋮ → Tambahkan ke layar utama → Instal aplikasi. Jika hanya ada pintasan, gunakan Chrome terbaru dan muat ulang halaman.';
 }
}
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();deferredPwaPrompt=event;syncPwaInstall();
});
window.addEventListener('appinstalled',()=>{deferredPwaPrompt=null;syncPwaInstall()});
el('installPwa').onclick=async()=>{
 if(!deferredPwaPrompt)return;
 const prompt=deferredPwaPrompt;deferredPwaPrompt=null;
 await prompt.prompt();await prompt.userChoice;syncPwaInstall();
};
if('serviceWorker' in navigator&&window.isSecureContext){
 window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{
  el('pwaHint').textContent='Pemasangan belum tersedia. Gunakan Chrome versi terbaru lalu muat ulang.';
 }));
}
syncPwaInstall();
</script></body></html>`;
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
 const auth=request.headers.get('Authorization')||'';
 if(!e.ADMIN_TOKEN)return answer({error:'ADMIN_TOKEN not configured'},503);
 if(!compareToken(auth.startsWith('Bearer ')?auth.slice(7):'',e.ADMIN_TOKEN))return answer({error:'Unauthorized'},401);
 if(!e.DB)return answer({error:'D1 missing'},503);
 if(method==='GET'&&p==='/api/readiness')return answer(readiness(e,await isPaused(e)));
 if(method==='GET'&&p==='/api/connections/verify')return answer(await verifyConnections(e));
 if(method==='GET'&&p==='/api/status')return answer({paused:await isPaused(e),publicationEnabled:e.ALLOW_PUBLICATION==='true',mediaReady:!!e.MEDIA,mediaBackend:e.MEDIAKV?'KV':e.MEDIA?'R2':null,aiReady:!!e.AI,facebookReady:!!(e.FB_PAGE_ID&&e.FB_PAGE_ACCESS_TOKEN),panexReady:!!(e.YT_REFRESH_TOKEN_PANEX&&e.YT_CHANNEL_ID_PANEX),herosReady:!!(e.YT_REFRESH_TOKEN_HEROS&&e.YT_CHANNEL_ID_HEROS),channels:CHANNELS});
 if(method==='GET'&&p==='/api/posts')return answer({posts:await list(e,"SELECT p.*,r.parent_id,r.revision_depth,r.rejection_reason,r.rejection_note,r.regen_state,r.preview_media_key,r.last_error,(SELECT a.action||': '||a.detail FROM audit a WHERE a.entity_id=p.id AND a.action IN ('RENDER_STARTED','RENDER_FAILED','RENDER_COMPLETED') ORDER BY a.at DESC LIMIT 1) AS render_event FROM posts p LEFT JOIN draft_reviews r ON r.post_id=p.id ORDER BY p.created_at DESC LIMIT 100")});
 if(method==='GET'&&p==='/api/trends')return answer({trends:await list(e,'SELECT * FROM trends ORDER BY created_at DESC LIMIT 30')});
 if(method==='GET'&&p==='/api/analytics')return answer({analytics:await list(e,'SELECT * FROM metrics ORDER BY observed_at DESC LIMIT 100')});
 if(method==='GET'&&p==='/api/strategy')return answer(await strategy(e));
 if(method==='GET'&&p==='/api/audit')return answer({events:await list(e,'SELECT * FROM audit ORDER BY at DESC LIMIT 40')});
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
  const match=p.match(/^\/api\/posts\/([0-9a-f-]{36})\/(approve|schedule|media|edit|reject|regenerate|preview|render-event)$/);
  if(match){
   if(match[2]==='approve')return answer(await approve(e,match[1]));
   if(match[2]==='reject')return answer(await rejectDraft(e,match[1],data.reason,data.note));
   if(match[2]==='regenerate')return answer(await retryRegeneration(e,match[1]));
   if(match[2]==='preview')return answer(await regenerateCover(e,match[1]));
   if(match[2]==='render-event')return answer(await renderEvent(e,match[1],data));
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
