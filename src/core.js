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
export function score(topic,channel){
 if(!CHANNELS[channel]||detectRisk(topic))return 0;
 const words=CHANNELS[channel].topic.split(/[ ,]+/).filter(w=>w.length>3);
 return Math.min(100,25+words.filter(w=>topic.toLowerCase().includes(w)).length*15);
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
