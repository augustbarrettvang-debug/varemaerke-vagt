// Varemærke-Vagt — scanner for VAREMÆRKE- og OPHAVSRETSKRÆNKELSER (Vercel serverless function)
//
// Søger det åbne web via en gratis søge-API. Nøglen bor på serveren; klienter rører den aldrig.
// Understøtter Serper (SERPER_API_KEY), Brave (BRAVE_API_KEY) eller Google Programmable
// Search (GOOGLE_CSE_KEY + GOOGLE_CSE_CX). Uden nøgle køres en tydeligt mærket demo-tilstand.
//
// Forskellen på de to krænkelser:
//  • VAREMÆRKE (varemærkeloven): ulovlig brug af et registreret mærke/logo/navn.
//  • OPHAVSRET (ophavsretsloven): ulovlig kopiering af et beskyttet værk — designmøbler
//    og brugskunst, kunst, mønstre, tryk, digitalt indhold.
//
// Selve vurderingen ligger i _scoring.js; her står kun søgning, budget og svar.

const S = require("./_scoring.js");
const store = require("./_store.js");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

// Sidste diagnose fra søge-API'et (kun synlig med gyldigt DEBUG_TOKEN).
let LAST_DIAG = null;

async function fetchJSON(url, headers){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 9000);
  try{
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA }, headers||{}), signal: ctrl.signal });
    if(!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}
async function fetchText(url, headers){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 9000);
  try{
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA, "Accept-Language":"da,en;q=0.8" }, headers||{}), signal: ctrl.signal });
    if(!r.ok) return null;
    return await r.text();
  } catch { return null; } finally { clearTimeout(t); }
}

// --- Serper.dev (Google-resultater som JSON — 2.500 gratis, intet kort). ---
// Markedsprisen findes via Google Shopping, så brugeren ikke skal indtaste den.
// Kopivarer ligger i den lave ende, så vi tager medianen af den øvre del.
async function serperShoppingPrice(brand, key){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 10000);
  try{
    const r = await fetch("https://google.serper.dev/shopping", { method:"POST",
      headers:{ "X-API-KEY":key, "Content-Type":"application/json" },
      body: JSON.stringify({ q:brand, gl:"dk", hl:"da", num:40 }), signal: ctrl.signal });
    if(!r.ok){ LAST_DIAG = (LAST_DIAG||"") + " | Shopping HTTP " + r.status; return null; }
    const j = await r.json();
    const prices = ((j && j.shopping) || [])
      .map(it => S.extractPrice(String(it.price||"")))
      .filter(v => v && v >= 50)
      .sort((a,b)=>a-b);
    if(!prices.length) return null;
    const upper = prices.slice(Math.floor(prices.length*0.4));
    return upper[Math.floor(upper.length/2)] || prices[Math.floor(prices.length/2)];
  } catch(e){ LAST_DIAG = (LAST_DIAG||"") + " | Shopping fejl: " + (e.message||e); return null; }
  finally { clearTimeout(t); }
}

async function serperSearch(q, key, gl){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 12000);
  try{
    // num:100 koster det samme som num:20 hos Serper.
    const loc = gl === "global" ? { gl:"us", hl:"en" } : { gl:"dk", hl:"da" };
    const r = await fetch("https://google.serper.dev/search", { method:"POST",
      headers:{ "X-API-KEY":key, "Content-Type":"application/json" },
      body: JSON.stringify(Object.assign({ q, num:100 }, loc)), signal: ctrl.signal });
    if(!r.ok){
      let body = ""; try { body = (await r.text()).slice(0,160); } catch {}
      LAST_DIAG = "Serper HTTP " + r.status + " [" + q.slice(0,40) + "] " + body;
      return [];
    }
    const j = await r.json();
    return ((j && j.organic) || []).map(it => {
      const title = S.decodeEntities(S.stripTags(it.title||""));
      const snippet = S.decodeEntities(S.stripTags(it.snippet||""));
      const p = S.extractPrice(title + " " + snippet);
      return { title, snippet, link: it.link, platform: S.domainOf(it.link||""),
        extracted_price: p, price: p ? (p.toLocaleString("da-DK") + " kr") : null,
        thumbnail: it.imageUrl || null };
    }).filter(x => x.title && /^https?:\/\//.test(x.link||""));
  } catch(e){ LAST_DIAG = "Serper fejl: " + (e.message||e); return []; }
  finally { clearTimeout(t); }
}

// --- Brave Search API (gratis: 2.000/md). ---
async function braveSearch(q, key){
  const j = await fetchJSON("https://api.search.brave.com/res/v1/web/search?country=dk&count=15&q=" + encodeURIComponent(q),
    { "Accept":"application/json", "X-Subscription-Token": key });
  return (((j||{}).web||{}).results || []).map(it => ({
    title: S.decodeEntities(S.stripTags(it.title||"")),
    snippet: S.decodeEntities(S.stripTags(it.description||"")),
    link: it.url, platform: S.domainOf(it.url||""),
    extracted_price: null, price: null,
    thumbnail: (it.thumbnail && it.thumbnail.src) || null,
  })).filter(x => x.title && /^https?:\/\//.test(x.link||""));
}

// --- Google Programmable Search (gratis: 100/dag). ---
async function googleSearch(q, key, cx){
  const j = await fetchJSON("https://www.googleapis.com/customsearch/v1?num=10&gl=dk&hl=da&key="
    + encodeURIComponent(key) + "&cx=" + encodeURIComponent(cx) + "&q=" + encodeURIComponent(q));
  return ((j && j.items) || []).map(it => {
    const pm = it.pagemap || {};
    let price = null, priceStr = null, thumb = null;
    if(pm.offer && pm.offer[0] && pm.offer[0].price){
      price = S.extractPrice(String(pm.offer[0].price)); priceStr = String(pm.offer[0].price).trim();
    }
    if(!price && pm.metatags && pm.metatags[0]){
      const a = pm.metatags[0]["product:price:amount"] || pm.metatags[0]["og:price:amount"];
      if(a){ price = S.extractPrice(String(a)); priceStr = String(a).trim(); }
    }
    if(pm.cse_thumbnail && pm.cse_thumbnail[0]) thumb = pm.cse_thumbnail[0].src;
    return { title: S.decodeEntities(S.stripTags(it.title||"")),
      snippet: S.decodeEntities(S.stripTags(it.snippet||"")),
      link: it.link, platform: S.domainOf(it.link||""),
      extracted_price: price, price: priceStr, thumbnail: thumb };
  }).filter(x => x.title && /^https?:\/\//.test(x.link||""));
}

// --- Nøglefri fallback (DuckDuckGo html) — virker sjældent fra cloud-IP. ---
async function ddgHtml(q){
  const html = await fetchText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) + "&kl=dk-da");
  if(!html) return [];
  const out = []; let m;
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  while((m = re.exec(html))){
    let href = m[1];
    const um = href.match(/uddg=([^&]+)/);
    if(um){ try { href = decodeURIComponent(um[1]); } catch {} }
    const title = S.decodeEntities(S.stripTags(m[2]));
    if(title && /^https?:\/\//.test(href))
      out.push({ title, snippet:"", link:href, platform:S.domainOf(href), extracted_price:null, price:null, thumbnail:null });
  }
  return out;
}

function providers(){
  const p = [];
  if(process.env.SERPER_API_KEY) p.push("Serper");
  if(process.env.BRAVE_API_KEY) p.push("Brave");
  if(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) p.push("Google");
  return p;
}
async function runOne(provider, item){
  const q  = typeof item === "string" ? item : item.q;
  const gl = typeof item === "string" ? "dk" : (item.gl || "dk");
  if(provider === "Serper") return serperSearch(q, process.env.SERPER_API_KEY, gl);
  if(provider === "Brave")  return braveSearch(q, process.env.BRAVE_API_KEY);
  if(provider === "Google") return googleSearch(q, process.env.GOOGLE_CSE_KEY, process.env.GOOGLE_CSE_CX);
  return ddgHtml(q);
}
async function runQuery(provs, item){
  for(const p of (provs.length ? provs : [null])){
    try { const r = await runOne(p, item); if(r && r.length) return r; } catch {}
  }
  return [];
}

// Serpers gratis-plan afviser avancerede mønstre (OR, citationstegn, site:) med
// HTTP 400. Alle forespørgsler holdes derfor simple — markedspladser filtreres
// fra i koden bagefter i stedet for i selve forespørgslen.
function buildQueries(brand, type){
  const b = brand;
  const tm = [
    { q:`${b} replica`,     gl:"global" },
    { q:`${b} kopi`,        gl:"dk" },
    { q:`${b} fake`,        gl:"global" },
    { q:`${b} dupe`,        gl:"global" },
    { q:`${b} imitation`,   gl:"global" },
    { q:`${b} billig kopi`, gl:"dk" },
  ];
  const cr = [
    { q:`${b} reproduktion`,       gl:"dk" },
    { q:`${b} reproduction`,       gl:"global" },
    { q:`${b} replica buy online`, gl:"global" },
    { q:`${b} efterligning`,       gl:"dk" },
    { q:`${b} inspired by design`, gl:"global" },
    { q:`${b} style copy cheap`,   gl:"global" },
  ];
  if(type === "varemaerke") return tm;
  if(type === "ophavsret")  return cr;
  return [tm[0], cr[0], tm[2], cr[1], tm[3], cr[2], tm[1], cr[3], tm[4], cr[4], tm[5], cr[5]];
}

// --- Demo-tilstand (ingen søge-nøgle) ---
// Neutral pladsholder-flise — bevidst IKKE et falsk produktfoto.
function demoThumb(i){
  const h = (i*47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">`
    + `<rect width="64" height="64" fill="hsl(${h},14%,90%)"/>`
    + `<circle cx="32" cy="26" r="13" fill="hsl(${h},16%,78%)"/>`
    + `<rect x="30" y="34" width="4" height="16" fill="hsl(${h},16%,78%)"/>`
    + `<rect x="20" y="50" width="24" height="4" rx="2" fill="hsl(${h},16%,78%)"/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function demoListings(brand, type){
  const b = brand;
  const tm = [
    { title:`${b} replica 1:1 – AAA topkvalitet`, platform:"lux-copy.top", extracted_price:349, price:"349 kr" },
    { title:`Billig ${b} kopi · outlet fri fragt`, platform:"brandbargain.shop", extracted_price:279, price:"279 kr" },
    { title:`${b} fake – imitation direkte fra lager`, platform:"aaa-store.ru", extracted_price:199, price:"199 kr" },
  ];
  const cr = [
    { title:`${b} reproduktion (inspired by original)`, platform:"designrepro.store", extracted_price:590, price:"590 kr" },
    { title:`${b} homage lampe – håndlavet efterligning`, platform:"nordic-repro.online", extracted_price:690, price:"690 kr" },
    { title:`${b} bootleg print af originalen`, platform:"posterkopi.xyz", extracted_price:149, price:"149 kr" },
    { title:`${b} i stil af – reproduktion`, platform:"stilkopi.de", extracted_price:820, price:"820 kr" },
  ];
  const legit = [
    { title:`${b} – original hos autoriseret forhandler`, platform:"illumsbolighus.dk", extracted_price:1799, price:"1.799 kr" },
    { title:`${b} pendel i flere farver`, platform:"lampemesteren.dk", extracted_price:1849, price:"1.849 kr" },
  ];
  const picks = type === "varemaerke" ? tm.concat(legit)
              : type === "ophavsret"  ? cr.concat(legit)
              : tm.concat(cr, legit);
  return picks.map((x,i) => Object.assign({ snippet:"", link:"https://"+x.platform+"/produkt", thumbnail:demoThumb(i) }, x));
}

// --- Budget ---
// Endepunktet er offentligt og bruger en betalt/kvoteret søgenøgle. Uden loft kan
// én besøgende tømme hele kvoten på et minut, og så holder værktøjet op med at
// virke for alle andre. To lofter: pr. IP og et samlet dagligt loft.
const PER_IP_PER_HOUR   = parseInt(process.env.RATE_LIMIT_PER_HOUR, 10) || 5;
const DAILY_SCAN_BUDGET = parseInt(process.env.DAILY_SCAN_BUDGET, 10)  || 60;

function clientIp(req){
  const xf = (req.headers["x-forwarded-for"] || "").toString();
  return (xf.split(",")[0] || req.headers["x-real-ip"] || "ukendt").trim();
}
function today(){ return new Date().toISOString().slice(0,10); }

module.exports = async (req, res) => {
  // Ingen wildcard-CORS: endepunktet bruger en kvoteret nøgle og skal ikke kunne
  // indlejres på fremmede sider. Samme oprindelse virker helt uden CORS-header.
  const allowed = (process.env.ALLOWED_ORIGIN || "").trim();
  if(allowed && req.headers.origin === allowed){
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
  }

  const brand = ((req.query.brand)||"").toString().trim().slice(0, 80);
  let type = ((req.query.type)||"begge").toString().toLowerCase().trim();
  if(!["varemaerke","ophavsret","begge"].includes(type)) type = "begge";
  if(!brand){ res.status(400).json({ error:"Angiv et varemærke eller værk." }); return; }

  // Markedsprisen findes automatisk. Den kan ikke sættes udefra — ellers kunne
  // hvem som helst bestemme hvad rapportens beløb skulle vise.
  const provs = providers();
  const provider = provs[0] || null;

  const cacheKey = "scan:" + type + "|" + brand.toLowerCase();
  const cached = await store.get(cacheKey);
  if(cached){ res.status(200).json(Object.assign({}, cached, { cached:true })); return; }

  // Demo-tilstand koster ingen søgninger og rammes derfor ikke af budgettet.
  if(!provider){
    const report = S.buildReport(demoListings(brand, type),
      { brand, type, ref:1799, refSource:"eksempeldata", provider:null, demo:true, shared:store.SHARED });
    report.message = "Demo — eksempeldata. Der er ikke sat en søge-nøgle op, så der er ikke søgt på nettet. "
      + "Tilføj SERPER_API_KEY (2.500 gratis søgninger, intet kort) i Vercel for at søge rigtigt.";
    await store.set(cacheKey, report, 6*60*60*1000);
    res.status(200).json(report);
    return;
  }

  const ip = clientIp(req);
  const perIp = await store.incr("rl:ip:" + ip + ":" + new Date().toISOString().slice(0,13), 3600);
  if(perIp > PER_IP_PER_HOUR){
    res.status(429).json({ error: "For mange scanninger fra samme netværk (" + PER_IP_PER_HOUR
      + " i timen). Prøv igen om lidt — grænsen findes for at beskytte søgekvoten." });
    return;
  }
  const daily = await store.incr("rl:day:" + today(), 86400);
  if(daily > DAILY_SCAN_BUDGET){
    res.status(429).json({ error: "Dagens søgebudget (" + DAILY_SCAN_BUDGET
      + " scanninger) er brugt. Det nulstilles i morgen." });
    return;
  }

  const N = Math.min(12, Math.max(1, parseInt(process.env.SCAN_QUERIES, 10) || 8));
  const queries = buildQueries(brand, type).slice(0, N);
  const debugToken = (process.env.DEBUG_TOKEN || "").trim();
  const wantDebug = !!debugToken && req.query.debug === debugToken;
  LAST_DIAG = null;

  try {
    const settled = await Promise.allSettled(queries.map(q => runQuery(provs, q)));
    let raw = [];
    settled.forEach(s => { if(s.status === "fulfilled") raw = raw.concat(s.value); });
    const rawCount = raw.length;

    let listings = raw.filter(l => l.platform && !S.isExcluded(l.platform));
    const afterExclude = listings.length;
    const seen = new Set();
    listings = listings.filter(l => {
      const k = (l.platform + "|" + (l.title||"").slice(0,50)).toLowerCase();
      if(seen.has(k)) return false;
      seen.add(k); return true;
    });

    const dbg = wantDebug ? { provider, queries, rawCount, afterExclude, afterDedup: listings.length,
      diag: LAST_DIAG, samplePlatforms: [...new Set(raw.map(l => l.platform))].slice(0,15) } : undefined;

    if(listings.length === 0){
      res.status(200).json({ brand, type, empty:true, provider, _debug: dbg,
        message: rawCount === 0
          ? "Søge-API'en returnerede ingen resultater. Tjek at søgenøglen er gyldig og har kvote tilbage."
          : "Ingen uafhængige shops fundet lige nu. Prøv med et mere præcist model- eller værknavn (fx “Flowerpot VP7”)." });
      return;
    }

    // Markedspris: 1) Google Shopping  2) priser hos de fund der ikke har
    // krænkelsessignaler  3) medianen af alle priser i resultaterne.
    let ref = null, refSource = null;
    if(provider === "Serper"){
      const shopPrice = await serperShoppingPrice(brand, process.env.SERPER_API_KEY);
      if(shopPrice){ ref = shopPrice; refSource = "Google Shopping"; }
    }
    if(!ref){
      const tks = S.brandTokens(brand);
      const allowSet = S.allowlist();
      const clean = listings
        .filter(l => l.extracted_price)
        .filter(l => S.scoreListing(l, null, tks, allowSet).verdict === "LOVLIG")
        .map(l => l.extracted_price).sort((a,b)=>a-b);
      if(clean.length >= 2){
        ref = clean[Math.floor(clean.length/2)];
        refSource = "priser hos forhandlere uden krænkelsessignaler";
      } else {
        const priced = listings.map(l => l.extracted_price).filter(Boolean).sort((a,b)=>a-b);
        if(priced.length){ ref = priced[Math.floor(priced.length/2)]; refSource = "median af priser i søgeresultaterne"; }
      }
    }

    const payload = S.buildReport(listings,
      { brand, type, ref, refSource, provider, demo:false, shared:store.SHARED });
    if(dbg) payload._debug = dbg;
    await store.set(cacheKey, payload, 6*60*60*1000);
    res.status(200).json(payload);
  } catch(e){
    res.status(200).json({ brand, type, error:"Søgningen fejlede lige nu (" + (e.message||e) + "). Prøv igen om lidt." });
  }
};
