import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANNELS,validate,detectRisk,parseRss,score,parseAI,compareToken,gate} from '../src/core.js';
test('kanal terisolasi',()=>{assert.match(CHANNELS.panex.topic,/keluarga/);assert.match(CHANNELS.heros.topic,/superhero/);assert.throws(()=>validate('panex','TEXT'));assert.equal(validate('facebook','PHOTO'),true)});
test('mengurai RSS',()=>{const x='<item><title><![CDATA[Drama &amp; Keluarga]]></title><link>https://example.org/a</link></item>';assert.equal(parseRss(x)[0].topic,'Drama & Keluarga')});
test('menolak IP eksternal',()=>{assert.ok(detectRisk('Batman'));assert.equal(score('Marvel hero','heros'),0)});
test('memvalidasi naskah AI',()=>{const x={title:'Kisah',story:'a'.repeat(130),caption:'Ini adalah fiksi',imagePrompt:'cinematic scene'};assert.equal(parseAI(JSON.stringify(x)).title,'Kisah');assert.throws(()=>parseAI('{}'))});
test('persetujuan, lisensi, media gate',()=>{const p={channel:'facebook',format:'TEXT',state:'APPROVED',license_ok:1,title:'Kisah',story:'a'.repeat(120),caption:'Cerita'};assert.equal(gate(p),'');assert.equal(gate({...p,license_ok:0}),'LICENSE_REVIEW_REQUIRED');assert.equal(gate({...p,format:'PHOTO'}),'MEDIA_REQUIRED')});
test('admin token',()=>{const t='abcdefghijklmnopqrstuvwxyz123456';assert.equal(compareToken(t,t),true);assert.equal(compareToken(t,t+'0'),false);assert.equal(compareToken('abc','abc'),false)});
