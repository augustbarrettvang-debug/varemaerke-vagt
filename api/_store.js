// Delt nøgle/værdi-lager til cache og rate limiting.
//
// Serverless-instanser deler ikke hukommelse, og de dør konstant. En Map i processen
// er derfor hverken en rigtig cache eller en rigtig rate limit — den nulstilles ved
// hver cold start, og hver samtidig instans har sin egen kopi.
//
// Er Upstash/Vercel KV konfigureret, bruges det (delt på tværs af instanser).
// Ellers falder vi tilbage til en LRU-begrænset Map, så værktøjet stadig kører —
// men rate limiten er da kun vejledende. Det siges højt i /api/scan-ip-svaret.

const URL_ENV   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || "";
const TOKEN_ENV = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const SHARED = !!(URL_ENV && TOKEN_ENV);

const MEM = new Map();          // key -> { v, exp }
const MEM_MAX = 300;            // LRU-loft, så en langtlevende instans ikke lækker hukommelse

function memGet(key){
  const hit = MEM.get(key);
  if(!hit) return null;
  if(hit.exp && Date.now() > hit.exp){ MEM.delete(key); return null; }
  MEM.delete(key); MEM.set(key, hit);        // touch → yngste sidst
  return hit.v;
}
function memSet(key, v, ttlMs){
  MEM.delete(key);
  MEM.set(key, { v, exp: ttlMs ? Date.now()+ttlMs : 0 });
  while(MEM.size > MEM_MAX) MEM.delete(MEM.keys().next().value);
}

async function redis(cmd){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 2500);
  try{
    const r = await fetch(URL_ENV, {
      method: "POST",
      headers: { Authorization: "Bearer "+TOKEN_ENV, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      signal: ctrl.signal,
    });
    if(!r.ok) return null;
    const j = await r.json();
    return j && "result" in j ? j.result : null;
  } catch { return null; }
  finally { clearTimeout(t); }
}

async function get(key){
  if(SHARED){
    const raw = await redis(["GET", key]);
    if(raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  return memGet(key);
}

async function set(key, value, ttlMs){
  if(SHARED){
    const cmd = ["SET", key, JSON.stringify(value)];
    if(ttlMs) cmd.push("PX", String(ttlMs));
    const ok = await redis(cmd);
    if(ok != null) return;
    // falder igennem til hukommelsen hvis Upstash er nede
  }
  memSet(key, value, ttlMs);
}

// Tæller key op og sætter udløb ved første tælling. Returnerer den nye værdi.
async function incr(key, ttlSec){
  if(SHARED){
    const n = await redis(["INCR", key]);
    if(n != null){
      if(Number(n) === 1) await redis(["EXPIRE", key, String(ttlSec)]);
      return Number(n);
    }
  }
  const cur = (memGet(key) || 0) + 1;
  memSet(key, cur, ttlSec*1000);
  return cur;
}

module.exports = { get, set, incr, SHARED };
