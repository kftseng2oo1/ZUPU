/* 曾氏族譜 3D 祠堂 — 祭祀雲端後端（Cloudflare Worker + KV）
 *
 * 併入 arcar：
 *   1. arcar 新增 KV 綁定：ZUPU_KV
 *   2. 把本檔 handleZupu / withZupuCors / ZUPU_CORS（與輔助函式）貼進 arcar
 *   3. 在 arcar 的 fetch 最前面（全域 CORS 之前）加：
 *        if (url.pathname.startsWith('/zupu')) {
 *          if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ZUPU_CORS });
 *          return withZupuCors(await handleZupu(request, env, url.pathname.slice(5), url));
 *        }
 *
 * KV 結構（f = 家族代號，預設 longshan）
 *   s:<f>              祭祀狀態 JSON {total, days{日期:上香次數}, byPid{牌位:上香次數}, od{日期:{供品:次數}}, recent[], voices{牌位:[...]}}
 *   v:<f>:<voiceId>    錄音原始內容；metadata {m: mime}
 *   k:<f>:<voiceId>    刪除金鑰的 SHA-256
 *
 * API（路徑在 /zupu 之後，皆帶 ?f=家族代號）
 *   GET    /state                                   → {ok, state}
 *   POST   /offer     JSON {pid, name, who, type}   → {ok, state}   type：incense 上香／tea 奉茶／flower 獻花／fruit 供果／candle 點燭
 *   POST   /incense   JSON {pid, name, who}         → 同 /offer（type=incense，相容舊版）
 *   POST   /voice?pid=&who=&title=&dur=   原始音訊   → {ok, voice, key, state}
 *   GET    /voice/:id                               → 音訊
 *   DELETE /voice/:id?key=                          → {ok, state}
 */

const ZUPU_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const ZUPU_MAX_VOICE = 5 * 1024 * 1024;
const ZUPU_MAX_VOICES_PER_PID = 30;
const ZUPU_RECENT = 40;
const ZUPU_DAYS_KEEP = 400;
const ZUPU_OD_KEEP = 30;
const ZUPU_TYPES = ['incense', 'tea', 'flower', 'fruit', 'candle'];

function withZupuCors(res) {
  const h = new Headers(res.headers);
  Object.entries(ZUPU_CORS).forEach(([k, v]) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
}
const zJson = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const zErr = (m, st = 400) => zJson({ ok: false, error: m }, st);
const zStr = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const zFam = url => (url.searchParams.get('f') || 'longshan').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'longshan';
const zPid = v => zStr(v, 40).replace(/[^\w-]/g, '');
function zRid(n = 10) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, x => a[x % a.length]).join('');
}
async function zSha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
}
const zToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
async function zLoad(kv, f) {
  const s = await kv.get('s:' + f, 'json');
  return Object.assign({ total: 0, days: {}, byPid: {}, od: {}, recent: [], voices: {} }, s || {});
}
async function zSave(kv, f, s) {
  const keys = Object.keys(s.days).sort();
  while (keys.length > ZUPU_DAYS_KEEP) delete s.days[keys.shift()];
  const ok = Object.keys(s.od || {}).sort();
  while (ok.length > ZUPU_OD_KEEP) delete s.od[ok.shift()];
  await kv.put('s:' + f, JSON.stringify(s));
}

async function handleZupu(request, env, path, url) {
  const kv = env.ZUPU_KV;
  if (!kv) return zErr('ZUPU_KV 未綁定', 500);
  url = url || new URL(request.url);
  const f = zFam(url), m = request.method;

  if (path === '/state' && m === 'GET') return zJson({ ok: true, state: await zLoad(kv, f) });

  if ((path === '/offer' || path === '/incense') && m === 'POST') {
    let b; try { b = await request.json(); } catch (e) { return zErr('格式錯誤'); }
    const pid = b.pid === 'all' ? 'all' : zPid(b.pid);
    if (!pid) return zErr('缺少 pid');
    const type = path === '/incense' ? 'incense' : b.type;
    if (!ZUPU_TYPES.includes(type)) return zErr('不支援的供品');
    const s = await zLoad(kv, f), day = zToday();
    if (type === 'incense') { s.total += 1; s.days[day] = (s.days[day] || 0) + 1; s.byPid[pid] = (s.byPid[pid] || 0) + 1; }
    s.od[day] = s.od[day] || {}; s.od[day][type] = (s.od[day][type] || 0) + 1;
    s.recent = [{ pid, name: zStr(b.name, 20), who: zStr(b.who, 20) || '族人', type, at: Date.now() }, ...s.recent].slice(0, ZUPU_RECENT);
    await zSave(kv, f, s);
    return zJson({ ok: true, state: s });
  }

  if (path === '/voice' && m === 'POST') {
    const pid = zPid(url.searchParams.get('pid'));
    if (!pid) return zErr('缺少 pid');
    const mime = zStr((request.headers.get('Content-Type') || 'audio/mp4').split(';')[0], 40);
    if (!/^audio\//.test(mime)) return zErr('只接受音訊');
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return zErr('沒有內容');
    if (buf.byteLength > ZUPU_MAX_VOICE) return zErr('檔案太大', 413);
    const s = await zLoad(kv, f), list = s.voices[pid] || [];
    if (list.length >= ZUPU_MAX_VOICES_PER_PID) return zErr('這位祖先的錄音已達上限', 409);
    const id = zRid(), key = zRid(16);
    await kv.put(`v:${f}:${id}`, buf, { metadata: { m: mime } });
    await kv.put(`k:${f}:${id}`, await zSha(key));
    const voice = { id, title: zStr(url.searchParams.get('title'), 24) || '口述', who: zStr(url.searchParams.get('who'), 20) || '族人',
      dur: Math.max(0, Math.min(600, parseInt(url.searchParams.get('dur'), 10) || 0)), at: Date.now() };
    s.voices[pid] = [...list, voice];
    await zSave(kv, f, s);
    return zJson({ ok: true, voice, key, state: s });
  }

  const vm = /^\/voice\/([a-z0-9]{6,20})$/.exec(path);
  if (vm && m === 'GET') {
    const r = await kv.getWithMetadata(`v:${f}:${vm[1]}`, 'arrayBuffer');
    if (!r.value) return zErr('找不到錄音', 404);
    return new Response(r.value, { headers: { 'Content-Type': (r.metadata && r.metadata.m) || 'audio/mp4', 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'none' } });
  }
  if (vm && m === 'DELETE') {
    const h = await kv.get(`k:${f}:${vm[1]}`);
    if (!h || h !== await zSha(url.searchParams.get('key') || '')) return zErr('沒有刪除權限', 403);
    await kv.delete(`v:${f}:${vm[1]}`); await kv.delete(`k:${f}:${vm[1]}`);
    const s = await zLoad(kv, f);
    for (const p in s.voices) { s.voices[p] = s.voices[p].filter(v => v.id !== vm[1]); if (!s.voices[p].length) delete s.voices[p]; }
    await zSave(kv, f, s);
    return zJson({ ok: true, state: s });
  }
  return zErr('not found', 404);
}

// 獨立部署時可直接使用（同樣綁定 ZUPU_KV）
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/zupu')) return new Response('ok');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ZUPU_CORS });
    return withZupuCors(await handleZupu(request, env, url.pathname.slice(5), url));
  },
};
