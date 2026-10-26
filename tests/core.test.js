import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANNELS,validate,detectRisk,parseRss,score,parseAI,compareToken,gate,readiness,selectDraftTopic,EDITORIAL_TOPICS,validateRejection,creativeSimilarity,MAX_REVISION_DEPTH,REJECTION_REASONS} from '../src/core.js';
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
