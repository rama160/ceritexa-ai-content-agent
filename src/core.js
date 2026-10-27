export const CHANNELS={
 facebook:{label:'Ceritexa Studio',topic:'drama kehidupan, cerita dan komik orisinal',network:'facebook'},
 panex:{label:'Panex',topic:'drama keluarga dan kisah kehidupan manusia',network:'youtube'},
 heros:{label:'Heros Real Life',topic:'superhero orisinal dan aksi fantasi',network:'youtube'}
};
export function validate(channel,format){
 if(!CHANNELS[channel])throw Error('Kanal tidak dikenal');
 if(!['TEXT','PHOTO','COMIC','VIDEO'].includes(format))throw Error('Format tidak dikenal');
 if(channel!=='facebook'&&format!=='VIDEO')throw Error('YouTube memerlukan VIDEO');
 return true;
}
export function detectRisk(text){
 return /(spider[ -]?man|marvel|batman|superman|avengers|hulk|wonder woman|dc comics|berita nyata padahal fiksi)/i.test(String(text||''))?'THIRD_PARTY_IP_OR_MISLEADING':'';
}
export function parseRss(xml){
 return [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,15).map(m=>{
  const find=(tag)=>m[1].match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1]||'';
  const clean=v=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/<[^>]+>/g,'').trim();
  return {topic:clean(find('title')).slice(0,150),url:clean(find('link')).slice(0,500)};
 }).filter(x=>x.topic&&x.url.startsWith('https://'));
}
/** Owner-approved editorial topic seeds. Reuse this list instead of copying channel prompts elsewhere. */
export const EDITORIAL_TOPICS=Object.freeze({
 facebook:[
  'Seorang ibu penjual nasi diam-diam membantu anak kurang mampu bersekolah',
  'Persahabatan lama diuji oleh rahasia keluarga yang terungkap',
  'Perjuangan seorang ayah membahagiakan anaknya dengan cara sederhana',
  'Misteri surat tua yang mengubah kehidupan sebuah keluarga',
  'Kebaikan pemilik warung kecil yang menyentuh hati para tetangga',
  'Seorang sahabat kembali setelah bertahun-tahun membawa permintaan maaf'
 ],
 panex:[
  'Anak perantau pulang dan mengetahui pengorbanan ibunya',
  'Dua sahabat berjuang mempertahankan usaha kecil mereka',
  'Seorang ayah pekerja keras berusaha memperbaiki hubungan dengan anaknya',
  'Rahasia keluarga terungkap ketika sebuah surat lama ditemukan',
  'Keputusan sulit seorang ibu demi masa depan anak',
  'Perjuangan pemuda mencari pekerjaan dan menemukan persahabatan baru'
 ],
 heros:[
  'Pahlawan orisinal berkekuatan cahaya harus memilih menyelamatkan sahabat atau kota',
  'Seorang superhero orisinal menyembunyikan identitas ketika monster menyerang kota',
  'Robot pelindung dengan jiwa manusia belajar makna keberanian',
  'Seorang pahlawan remaja memperoleh kekuatan unik dan menghadapi dilema keadilan',
  'Petualangan superhero orisinal di dunia fantasi dengan ancaman misterius',
  'Pahlawan penjaga langit menghadapi musuh yang ternyata membutuhkan pertolongan'
 ]
});
/** Indonesia/Indonesian audience-specific niche discovery.
 * Google News RSS returns related headlines, NOT measured social virality.
 * Fallback editorial themes are clearly labeled as not live trends.
 */
export const NICHE_RESEARCH_QUERIES=Object.freeze({
 facebook:'("kisah inspiratif" OR "drama keluarga" OR "perjuangan hidup" OR "kebaikan masyarakat") when:7d',
 panex:'("kisah keluarga" OR "kisah perjuangan" OR "pengorbanan ibu" OR "usaha kecil") when:7d',
 heros:'("film superhero" OR "komik pahlawan" OR "film fantasi" OR "science fiction Indonesia") when:7d'
});
const CHANNEL_KEYWORDS=Object.freeze({
 facebook:['ibu','ayah','anak','keluarga','kehidupan','kisah','cerita','drama','sahabat','persahabatan','sekolah','warung','pekerja','perjuangan','cinta','misteri','tetangga','kebaikan','usaha','korban','harapan'],
 panex:['ibu','ayah','anak','keluarga','kehidupan','kisah','cerita','drama','sahabat','persahabatan','sekolah','warung','pekerja','perjuangan','cinta','teman','hubungan','usaha','pengorbanan','harapan'],
 heros:['pahlawan','superhero','fantasi','kekuatan','robot','monster','petualangan','keadilan','penyelamat','superpower','villain','hero','penjaga','ajaib']
});
export function score(topic,channel){
 if(!CHANNELS[channel]||detectRisk(topic))return 0;
 const content=String(topic||'').toLocaleLowerCase('id-ID');
 const matches=CHANNEL_KEYWORDS[channel].filter(word=>content.includes(word)).length;
 return Math.min(100,matches*40);
}
/** Prefer explicit owner request, then actual channel-relevant learning/trends, then evergreen originals.
 * A general viral trend is NOT automatically suitable for superhero or life-story channels.
 */
export function selectDraftTopic(channel,{userTopic='',strategyTopic='',trends=[],dayIndex=0}={}){
 if(!CHANNELS[channel])throw Error('Kanal tidak dikenal');
 const requested=String(userTopic||'').trim().slice(0,150);
 if(requested){
  if(detectRisk(requested))throw Error('Topik berisiko hak cipta');
  return requested;
 }
 const strategy=String(strategyTopic||'').trim();
 if(strategy&&score(strategy,channel)>=40)return strategy.slice(0,150);
 const candidates=trends.map(item=>typeof item==='string'?item:item?.topic).filter(Boolean).map(topic=>({topic,rank:score(topic,channel)})).filter(item=>item.rank>=40).sort((a,b)=>b.rank-a.rank);
 if(candidates.length)return candidates[0].topic.slice(0,150);
 const topics=EDITORIAL_TOPICS[channel];
 const index=Math.abs(Math.trunc(Number(dayIndex)||0))%topics.length;
 return topics[index];
}
export function parseAI(result){
 let obj;const s=String(result||'').replace(/^```(?:json)?/,'').replace(/```$/,'').trim();
 try{obj=JSON.parse(s);}catch{const m=s.match(/\{[\s\S]*\}/);if(!m)throw Error('AI tidak memberi JSON');obj=JSON.parse(m[0]);}
 for(const k of ['title','story','caption','imagePrompt'])if(typeof obj[k]!=='string'||!obj[k].trim())throw Error('JSON AI field '+k+' tidak valid');
 if(obj.story.length<100)throw Error('Cerita terlalu pendek');
 if(detectRisk(Object.values(obj).join(' ')))throw Error('Hasil AI mengandung IP pihak ketiga');
 return {title:obj.title.slice(0,100),story:obj.story.slice(0,6500),caption:obj.caption.slice(0,2000),imagePrompt:obj.imagePrompt.slice(0,1000)};
}
export function compareToken(a,b){
 a=String(a||'');b=String(b||'');let diff=a.length===b.length?0:1;
 const n=Math.max(32,a.length,b.length);for(let i=0;i<n;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return diff===0&&a.length>=24;
}
export function gate(p){
 validate(p.channel,p.format);
 if(p.state!=='APPROVED'&&p.state!=='SCHEDULED')return 'REQUIRES_APPROVAL';
 if(!p.license_ok)return 'LICENSE_REVIEW_REQUIRED';
 if(detectRisk([p.title,p.story,p.caption].join(' ')))return 'IP_BLOCKED';
 if(p.story?.length<100)return 'STORY_TOO_SHORT';
 if(p.format!=='TEXT'&&!p.media_key)return 'MEDIA_REQUIRED';
 if(p.format==='VIDEO'&&p.media_type!=='video/mp4')return 'MP4_REQUIRED';
 if(['PHOTO','COMIC'].includes(p.format)&&!['image/jpeg','image/png'].includes(p.media_type))return 'IMAGE_REQUIRED';
 if(p.channel==='facebook'&&p.format==='VIDEO')return 'FACEBOOK_REELS_API_NOT_CONNECTED';
 return '';
}

/** Return non-sensitive setup checks for the owner dashboard. No secret values are exposed. */
export function readiness(env, paused) {
 const ready = (id, label, ok, next) => ({id, label, ready: Boolean(ok), next: ok ? '' : next});
 const facebook=Boolean(env.FB_PAGE_ID && env.FB_PAGE_ACCESS_TOKEN);
 const ytShared=Boolean(env.YT_CLIENT_ID && env.YT_CLIENT_SECRET);
 return {
  project: 'Ceritexa AI Content Agent',
  reviewRequired: true,
  publicationEnabled: env.ALLOW_PUBLICATION === 'true',
  checks: [
   ready('database','Database D1 Ceritexa',env.DB,'Periksa binding DB pada Worker Ceritexa'),
   ready('media','Storage media KV / R2',env.MEDIA || env.MEDIAKV,'Periksa binding MEDIAKV khusus Ceritexa'),
   ready('ai','Workers AI',env.AI,'Periksa binding AI pada Worker Ceritexa'),
   ready('admin','Admin Secret',env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 24,'Atur ADMIN_TOKEN sebagai Cloudflare secret >=24 karakter'),
   ready('review','Drafting tidak dijeda',!paused,'Tekan Resume Drafting di dashboard'),
   ready('facebook','Facebook Page Ceritexa',facebook,'Atur FB_PAGE_ID dan FB_PAGE_ACCESS_TOKEN khusus Ceritexa Studio'),
   ready('panex','OAuth YouTube Panex',ytShared && env.YT_CHANNEL_ID_PANEX && env.YT_REFRESH_TOKEN_PANEX,'Atur client OAuth, YT_CHANNEL_ID_PANEX dan YT_REFRESH_TOKEN_PANEX'),
   ready('heros','OAuth YouTube Heros',ytShared && env.YT_CHANNEL_ID_HEROS && env.YT_REFRESH_TOKEN_HEROS,'Atur client OAuth, YT_CHANNEL_ID_HEROS dan YT_REFRESH_TOKEN_HEROS'),
   ready('renderer','Video draft GitHub Actions',false,'Tambahkan CERITEXA_ADMIN_TOKEN di GitHub Actions Secrets, jalankan dan periksa workflow render-video'),
   ready('provider_e2e','Uji posting resmi Facebook dan YouTube',false,'Jalankan tes terkontrol dengan akun resmi sebelum aktifkan publikasi')
  ]
 };
}

/** Canonical rejection contract. Reject + regenerate is bounded and preserves the original draft. */
export const MAX_REVISION_DEPTH=3;
export const REJECTION_REASONS=Object.freeze([
 'Judul kurang menarik',
 'Cerita kurang menyentuh',
 'Caption kurang bagus',
 'Gambar kurang cocok',
 'Terlalu mirip draft sebelumnya',
 'Kurang sesuai brand Ceritexa',
 'Alasan lain'
]);
export function validateRejection(reason,note,depth){
 const selected=String(reason||'').trim();
 if(!REJECTION_REASONS.includes(selected))throw Error('Pilih alasan penolakan yang tersedia');
 const text=String(note||'').trim().slice(0,500);
 if(selected==='Alasan lain'&&text.length<8)throw Error('Berikan catatan minimal 8 karakter');
 const n=Number(depth||0);
 if(!Number.isInteger(n)||n<0||n>MAX_REVISION_DEPTH)throw Error('Jumlah revisi tidak valid');
 return {reason:selected,note:text,depth:n,maxReached:n>=MAX_REVISION_DEPTH};
}
export function creativeSimilarity(a,b){
 const words=s=>new Set(String(s||'').toLocaleLowerCase('id-ID').match(/[a-z\u00c0-\u024f]+/g)?.filter(w=>w.length>=4)||[]);
 const x=words(a),y=words(b);
 if(!x.size||!y.size)return 0;
 let common=0;for(const w of x)if(y.has(w))common++;
 return common/(x.size+y.size-common);
}

/** Variable-length visual story plan. Each scene is chosen from narrative transitions,
 * punctuation, action and pacing; the complete source story is preserved word-for-word.
 * A technical safety ceiling prevents pathological Shorts prompts, NOT a fixed shot count.
 */
export const MAX_STORYBOARD_SCENES=24;
export const SCENE_IMAGE_DAILY_LIMIT=12;
export const SCENES_PER_REQUEST=3;
const NARRATIVE_TURNS=/^(?:tiba-tiba|mendadak|namun|tetapi|akhirnya|kemudian|selanjutnya|lantas|ternyata|seketika|sementara|ketika|setelah|sebelum|keesokan|paginya|malamnya|justru|lalu|begitu)\b/i;
const DRAMATIC_ACTIONS=/\b(?:serang|berlari|melompat|menyelamatkan|menangis|jatuh|meledak|pertarungan|berkelahi|teriak|berteriak|terkejut|rahasia|menghilang|terungkap|menemukan|menyadari|memeluk|mengorbankan|berubah)\w*/gi;
function wordCount(text){return String(text||'').trim().split(/\s+/).filter(Boolean).length;}
export function sceneBeats(story,channel='panex'){
 if(!['panex','heros'].includes(channel))throw Error('Storyboard hanya untuk channel YouTube');
 const words=String(story||'').trim().split(/\s+/).filter(Boolean);
 if(words.length<32)throw Error('Naskah terlalu pendek untuk storyboard yang utuh');
 // Heros needs shorter energetic cuts; Panex holds emotional shots longer.
 const actionCount=(String(story).match(DRAMATIC_ACTIONS)||[]).length;
 const turns=words.filter(w=>NARRATIVE_TURNS.test(w.replace(/[“"'(]/g,''))).length;
 const base=Math.max(7,(channel==='heros'?11:14)-Math.min(3,Math.floor((actionCount+turns)/5)));
 const min=Math.max(4,Math.floor(base*.6)),max=Math.ceil(base*1.45);
 const segments=[];
 let begin=0;
 while(begin<words.length){
  const left=words.length-begin;
  if(left<=max || left<=base+min){
   segments.push({start:begin,end:words.length});break;
  }
  const lo=begin+min,hi=Math.min(words.length-min,begin+max);
  if(lo>hi)throw Error('Narasi tidak dapat dibagi menjadi adegan layak');
  let best=lo,bestScore=-1e10;
  for(let cut=lo;cut<=hi;cut++){
   const previous=words[cut-1],next=words[cut]||'';
   const punctuation=/[.!?…]["'”’)]*$/.test(previous)?11:/[,;:]["'”’)]*$/.test(previous)?6:0;
   const pivot=NARRATIVE_TURNS.test(next.replace(/[“"'(]/g,''))?8:0;
   const dramatic=/^(?:serang|berlari|melompat|menyelamatkan|menangis|jatuh|meledak|rahasia|memeluk|mendadak)/i.test(next)?3:0;
   const rhythm=-Math.abs((cut-begin)-base)*.6;
   // Avoid starting a new scene with a closing connective, unless punctuation forces it.
   const badOpening=/^(?:dan|yang|untuk|dengan|karena|agar|atau|sehingga)$/i.test(next)?-7:0;
   const score=punctuation+pivot+dramatic+rhythm+badOpening;
   if(score>bestScore){bestScore=score;best=cut;}
  }
  if(best<=begin)throw Error('Perencanaan adegan tidak berkembang');
  segments.push({start:begin,end:best});begin=best;
  if(segments.length>MAX_STORYBOARD_SCENES)
   throw Error('Narasi terlalu panjang untuk satu Shorts; pecah menjadi episode, jangan potong adegan secara diam-diam');
 }
 if(segments.length>MAX_STORYBOARD_SCENES)
  throw Error('Adegan melebihi batas keamanan Shorts, pertimbangkan cerita berseri');
 const total=segments.length;
 const shots=[
  'intimate emotional medium shot, expressive eyes and authentic body language',
  'environmental wide shot showing changed setting and action',
  'dramatic low-angle action frame with original character choreography',
  'over-the-shoulder perspective showing the important consequence',
  'tension-building close-up with distinct blocking and lighting'
 ];
 return segments.map((part,index)=>{
  const beat=words.slice(part.start,part.end).join(' ');
  const action=(beat.match(DRAMATIC_ACTIONS)||[]).length>0;
  return {index,total,beat,words:part.end-part.start,
    estimatedSeconds:Math.round((part.end-part.start)/2.35*10)/10,
    shot:index===0?'establishing cinematic wide shot introducing characters and location'
     :index===total-1?'emotional concluding composition with the narrative consequence'
     :shots[(index+(action?2:0))%shots.length],
    action};
 });
}
export function scenePrompt(post,scene){
 const channel=post.channel;
 if(!['panex','heros'].includes(channel))throw Error('Storyboard hanya untuk channel YouTube');
 if(!Number.isInteger(scene.index)||!Number.isInteger(scene.total)||
    scene.index<0||scene.index>=scene.total||scene.total<2||
    scene.total>MAX_STORYBOARD_SCENES)throw Error('Nomor/jumlah adegan tidak valid');
 const style=channel==='heros'
  ?'high-end original superhero fantasy concept art, vivid cinematic light, expressive original heroic costume, dramatic atmosphere'
  :'high-end cinematic realistic Indonesian life-drama film still, warm natural human expression, tactile environment, film lighting';
 const base=String(post.image_prompt||'').slice(0,300);
 return [style,'Portrait 9:16 vertical composition. A distinct narrative scene',scene.index+1,'of',scene.total+'.',
 'Maintain consistent original character face, outfit colors and setting across the story.',
 'Visual identity reference:',base,
 'Narrative moment (illustrate the action and emotion without adding lettering):',scene.beat,
 'Shot direction:',scene.shot,
 'A visually DIFFERENT meaningful moment, no duplicate pose or reused frame.',
 'NO captions, NO lettering, NO watermarks, NO logos, NO recognized copyrighted superhero characters.'].join(' ').slice(0,1400);
}
