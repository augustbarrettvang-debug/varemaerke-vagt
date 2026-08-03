// IP-Vagt — kombineret scanner for VAREMÆRKE- og OPHAVSRETSKRÆNKELSER (Vercel serverless function)
// Søger det åbne web via en GRATIS søge-API (nøglen bor på serveren; klienter rører den aldrig).
// Understøtter Brave Search (BRAVE_API_KEY) eller Google Programmable Search (GOOGLE_CSE_KEY + GOOGLE_CSE_CX).
//
// Forskellen på de to krænkelser:
//  • VAREMÆRKE (varemærkeloven): ulovlig brug af et registreret mærke/logo/navn — "falske" mærkevarer,
//    replica-tasker, kopi-sneakers osv. Kendetegn: mærket bruges på varen/domænet, "replica/1:1/fake".
//  • OPHAVSRET (ophavsretsloven): ulovlig kopiering af et beskyttet VÆRK — designmøbler & brugskunst
//    (Flowerpot, PH-lamper, Arne Jacobsen-stole), kunst, mønstre, tryk, figurer, digitalt indhold.
//    Kendetegn: "reproduction/reproduktion/inspired by/i stil af/replica/homage", ukendt fabrikant der
//    sælger et velkendt designværk uden licens, tryk/print af beskyttet kunst, ulovlige downloads.
//
// Uden nøgle forsøges en nøglefri søgning (virker sjældent fra cloud-IP; giver da en hjælpe-besked).
// Returnerer antal fund fordelt på krænkelsestype + muligt tabt omsætning. Ingen SerpAPI, ingen Anthropic.

// --- Røde flag: VAREMÆRKE (falske mærkevarer) ---
const TM_REDFLAGS = ["replica","replika","aaa","aaaa","1:1","mirror","copy","copies","kopi","kopie",
  "dupe","dupes","unbranded","umærket","faux","oem","knockoff","knock-off","fake","imitation","imiteret",
  "lookalike","superfake","super fake","mirror quality","factory","batch"];

// --- Røde flag: OPHAVSRET (ulovlig kopi af et beskyttet værk/design) ---
const CR_REDFLAGS = ["reproduction","reproduktion","repro","reproduktions","inspired","inspireret",
  "inspired by","in style of","in the style of","style of","i stil af","stil af","efter","homage","hommage",
  "tribute","remake","replica","genfremstilling","efterligning","eftergjort","design classic","designklassiker",
  "print of","tryk af","poster of","plakat af","canvas of","bootleg","unauthorized","uautoriseret","uden licens",
  "no license","fan art","fanart","3d print","3d-print","stl file","stl-fil","free download","gratis download",
  "torrent","pdf download","ebook free","full album","rip","cracked"];

const EXCLUDE = ["aliexpress","alibaba","dhgate","temu","wish.com","joom","shein","banggood",
  "lightinthebox","ioffer","made-in-china","chinabrands","amazon.","ebay.","etsy.","allegro",
  "fruugo","bonanza","catch.com","pinduoduo","1688.com","pinterest.","youtube.","facebook.",
  "reddit.","tiktok.","instagram.","wikipedia.","duckduckgo.","bing.","microsoft.","msn.","yahoo.","google."];
const EXCLUDE_SITES = ["aliexpress.com","alibaba.com","dhgate.com","temu.com","wish.com",
  "amazon.com","ebay.com","etsy.com","pinterest.com"];

const SUS_TLD = /\.(ru|cn|hk|top|xyz|buzz|click|shop|online|store|vip|su|tk|cc|icu|monster|website|space)$/i;
const UNITS_LOW = 6, UNITS_HIGH = 30;
function lostRange(infringing, ref){
  if(!ref || !infringing) return { low:null, high:null };
  return { low: Math.round(infringing*UNITS_LOW*12*ref), high: Math.round(infringing*UNITS_HIGH*12*ref) };
}
function domainOf(url){ try { return new URL(url).hostname.replace(/^www\./,"").toLowerCase(); } catch { return ""; } }
function isExcluded(dom){ return EXCLUDE.some(x=>dom.includes(x)); }
function regionOf(dom){
  if(/\.(cn|hk)$/.test(dom)) return "🇨🇳 Kina/HK";
  if(/\.(ru|by|ua|su)$/.test(dom)) return "🇷🇺 Østeuropa";
  if(/\.de$/.test(dom)) return "🇩🇪 Tyskland";
  if(/\.dk$/.test(dom)) return "🇩🇰 Danmark";
  if(/\.(co\.uk|uk)$/.test(dom)) return "🇬🇧 UK";
  if(/\.nl$/.test(dom)) return "🇳🇱 Holland";
  if(/\.(top|xyz|buzz|click|vip|icu|monster|space)$/.test(dom)) return "🌐 Anonymt domæne";
  return "🌐 Ukendt";
}
function brandTokens(brand){ return brand.toLowerCase().split(/\s+/).filter(w=>w.length>=3).map(w=>w.replace(/[^a-z0-9]/g,"")); }
function stripTags(s){ return (s||"").replace(/<[^>]+>/g,""); }
function decodeEntities(s){
  return (s||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&nbsp;/g," ").trim();
}
function num(x){ if(x==null) return null; const p=parseFloat((""+x).replace(/[^\d.,]/g,"").replace(/\.(?=\d{3}\b)/g,"").replace(",",".")); return isFinite(p)&&p>0?p:null; }

// Scorer ét fund for BEGGE krænkelsestyper og vælger den mest sandsynlige.
function scoreListing(l, ref, tokens){
  const t = ((l.title||"") + " " + (l.snippet||"")).toLowerCase();
  const dom = (l.platform||"").toLowerCase();

  // --- Varemærke-score ---
  let ts = 0; const treasons = [];
  const tmHits = [...new Set(TM_REDFLAGS.filter(w=>t.includes(w)))];
  if(tmHits.length){ ts += Math.min(46, tmHits.length*18); treasons.push("Falsk-mærkevare-ord: " + tmHits.slice(0,4).join(", ")); }
  if(tokens.some(tok=>tok && dom.includes(tok))){ ts += 16; treasons.push("Varemærket bruges i domænenavnet"); }

  // --- Ophavsret-score ---
  let cs = 0; const creasons = [];
  const crHits = [...new Set(CR_REDFLAGS.filter(w=>t.includes(w)))];
  if(crHits.length){ cs += Math.min(46, crHits.length*17); creasons.push("Kopi-af-værk-ord: " + crHits.slice(0,4).join(", ")); }
  // Ukendt sælger + kendt designnavn i titel = klassisk ulovlig repro af brugskunst.
  const nameInTitle = tokens.some(tok=>tok && t.includes(tok));
  if(nameInTitle && !tokens.some(tok=>tok && dom.includes(tok))){ cs += 12; creasons.push("Designnavn sælges af ukendt shop (mulig ulovlig reproduktion)"); }

  // --- Fælles signaler (tæller for begge) ---
  let shared = 0; const sreasons = [];
  if(SUS_TLD.test(dom)){ shared += 20; sreasons.push("Anonymt/højrisiko-domæne"); }
  // Selverklæret kopi-shop: kopi-ord i selve domænenavnet er et meget stærkt signal
  // (fx replica-lights.com, designrepro.store, kopi-moebler.dk).
  const DOM_COPY = ["replica","replika","kopi","kopior","copy","repro","dupe","fake","imitation","knockoff","lookalike","efterligning"];
  const domHits = [...new Set(DOM_COPY.filter(w=>dom.includes(w)))];
  if(domHits.length){ shared += 34; sreasons.push('Kopi-ord i selve domænenavnet: "'+domHits.slice(0,2).join('", "')+'"'); }
  if(ref && l.extracted_price){
    const r = l.extracted_price / ref;
    if(r < 0.30){ shared += 30; sreasons.push("Ekstremt lav pris (" + Math.round(r*100) + "%)"); }
    else if(r < 0.50){ shared += 18; sreasons.push("Meget lav pris (" + Math.round(r*100) + "%)"); }
    else if(r < 0.70){ shared += 8;  sreasons.push("Lav pris (" + Math.round(r*100) + "%)"); }
  }
  ts += shared; cs += shared;

  // Vælg den type der scorer højest — det afgør sagens juridiske spor.
  let ipType, s, reasons;
  if(cs > ts){ ipType = "OPHAVSRET"; s = cs; reasons = creasons.concat(sreasons); }
  else if(ts > cs){ ipType = "VAREMÆRKE"; s = ts; reasons = treasons.concat(sreasons); }
  else { ipType = (crHits.length || tmHits.length) ? "BEGGE" : "VAREMÆRKE"; s = ts; reasons = [...new Set(treasons.concat(creasons, sreasons))]; }

  if(reasons.length===0) reasons.push("Ukendt sælger uden for de store markedspladser");
  const prob = Math.round(100/(1+Math.exp(-(s-22)/14)));
  const verdict = prob >= 65 ? "KRÆNKELSE" : prob >= 35 ? "USIKKER" : "LOVLIG";
  return { prob, verdict, reasons, ipType };
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";
async function fetchJSON(url, headers){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),9000);
  try{ const r=await fetch(url,{headers:Object.assign({"User-Agent":UA},headers||{}),signal:ctrl.signal}); if(!r.ok) return null; return await r.json(); }
  catch{ return null; } finally{ clearTimeout(t); }
}
async function fetchText(url, headers){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),9000);
  try{ const r=await fetch(url,{headers:Object.assign({"User-Agent":UA,"Accept-Language":"da,en;q=0.8"},headers||{}),signal:ctrl.signal}); if(!r.ok) return null; return await r.text(); }
  catch{ return null; } finally{ clearTimeout(t); }
}

// Sidste diagnose fra søge-API'et (til ?debug=1) — fx "Serper HTTP 401" hvis nøglen er ugyldig.
let LAST_DIAG = null;

// --- Serper.dev (Google-resultater som JSON — NEMMEST: 2.500 gratis, intet kort, én nøgle). ---
async function serperSearch(q, key, gl){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),12000);
  try{
    // num:100 er samme pris som num:20 hos Serper — flere resultater pr. søgning = flere fund.
    const loc = gl==="global" ? { gl:"us", hl:"en" } : { gl:"dk", hl:"da" };
    const r=await fetch("https://google.serper.dev/search",{ method:"POST",
      headers:{ "X-API-KEY":key, "Content-Type":"application/json" },
      body:JSON.stringify(Object.assign({ q, num:100 }, loc)), signal:ctrl.signal });
    if(!r.ok){ let body=""; try{ body=(await r.text()).slice(0,160); }catch{}
      LAST_DIAG = "Serper HTTP "+r.status+" ["+q.slice(0,40)+"] "+body; return []; }
    const j=await r.json();
    const res=(j && j.organic) || [];
    return res.map(it=>({ title:decodeEntities(stripTags(it.title||"")), snippet:decodeEntities(stripTags(it.snippet||"")),
      link:it.link, platform:domainOf(it.link||""), extracted_price:null, price:null, thumbnail:it.imageUrl||null }))
      .filter(x=>x.title && /^https?:\/\//.test(x.link||""));
  } catch(e){ LAST_DIAG = "Serper fejl: "+(e.message||e); return []; } finally { clearTimeout(t); }
}
// --- Brave Search API (gratis: 2000/md). Én nøgle. ---
async function braveSearch(q, key){
  const j = await fetchJSON("https://api.search.brave.com/res/v1/web/search?country=dk&count=15&q="+encodeURIComponent(q),
    { "Accept":"application/json", "X-Subscription-Token":key });
  const res = (j && j.web && j.web.results) || [];
  return res.map(it=>({ title:decodeEntities(stripTags(it.title||"")), snippet:decodeEntities(stripTags(it.description||"")),
    link:it.url, platform:domainOf(it.url||""), extracted_price:null, price:null,
    thumbnail:(it.thumbnail&&it.thumbnail.src)||null }))
    .filter(x=>x.title && /^https?:\/\//.test(x.link||""));
}
// --- Google Programmable Search (gratis: 100/dag). Nøgle + cx. ---
async function googleSearch(q, key, cx){
  const j = await fetchJSON("https://www.googleapis.com/customsearch/v1?num=10&gl=dk&hl=da&key="+encodeURIComponent(key)+"&cx="+encodeURIComponent(cx)+"&q="+encodeURIComponent(q));
  const items = (j && j.items) || [];
  return items.map(it=>{
    const pm = it.pagemap || {};
    let price=null, priceStr=null, thumb=null;
    if(pm.offer && pm.offer[0] && pm.offer[0].price){ price=num(pm.offer[0].price); priceStr=(""+pm.offer[0].price).trim(); }
    if(!price && pm.metatags && pm.metatags[0]){ const a=pm.metatags[0]["product:price:amount"]||pm.metatags[0]["og:price:amount"]; if(a){ price=num(a); priceStr=(""+a).trim(); } }
    if(pm.cse_thumbnail && pm.cse_thumbnail[0]) thumb=pm.cse_thumbnail[0].src;
    return { title:decodeEntities(stripTags(it.title||"")), snippet:decodeEntities(stripTags(it.snippet||"")),
      link:it.link, platform:domainOf(it.link||""), extracted_price:price, price:priceStr, thumbnail:thumb };
  }).filter(x=>x.title && /^https?:\/\//.test(x.link||""));
}
// --- Nøglefri fallback (DuckDuckGo html) — virker sjældent fra cloud-IP, men prøves. ---
async function ddgHtml(q){
  const html = await fetchText("https://html.duckduckgo.com/html/?q="+encodeURIComponent(q)+"&kl=dk-da");
  if(!html) return [];
  const out=[]; let m; const re=/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  while((m=re.exec(html))){ let href=m[1]; const um=href.match(/uddg=([^&]+)/); if(um){try{href=decodeURIComponent(um[1]);}catch{}}
    const title=decodeEntities(stripTags(m[2])); if(title&&/^https?:\/\//.test(href)) out.push({title,snippet:"",link:href,platform:domainOf(href),extracted_price:null,price:null,thumbnail:null}); }
  return out;
}

function providers(){
  const p=[];
  if(process.env.SERPER_API_KEY) p.push("Serper");
  if(process.env.BRAVE_API_KEY) p.push("Brave");
  if(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) p.push("Google");
  return p;
}
// item kan være en streng eller {q, gl:"dk"|"global"}
async function runOne(provider, item){
  const q = typeof item==="string" ? item : item.q;
  const gl = typeof item==="string" ? "dk" : (item.gl||"dk");
  if(provider==="Serper") return serperSearch(q, process.env.SERPER_API_KEY, gl);
  if(provider==="Brave") return braveSearch(q, process.env.BRAVE_API_KEY);
  if(provider==="Google") return googleSearch(q, process.env.GOOGLE_CSE_KEY, process.env.GOOGLE_CSE_CX);
  return ddgHtml(q); // nøglefri fallback
}
async function runQuery(provs, item){
  const list = provs.length ? provs : [null];
  for(const p of list){ try { const r=await runOne(p,item); if(r && r.length) return r; } catch {} }
  return [];
}

// Byg søgninger afhængigt af hvilken krænkelsestype der scannes for.
// Ingen -site:-udelukkelser i selve forespørgslen — vi filtrerer markedspladser fra i koden
// bagefter (isExcluded). Det giver langt flere fund at score på.
// VIGTIGT: Serpers gratis-plan afviser avancerede mønstre (OR, citationstegn, site:) med
// HTTP 400 "Query pattern not allowed for free accounts". Alle forespørgsler holdes derfor
// simple — kun almindelige ord. Flere simple søgninger giver flere fund end få avancerede.
function buildQueries(brand, type){
  const b = brand;
  // Varemærke-spor: falske mærkevarer.
  const tm = [
    { q:`${b} replica`,        gl:"global" },
    { q:`${b} kopi`,           gl:"dk" },
    { q:`${b} fake`,           gl:"global" },
    { q:`${b} dupe`,           gl:"global" },
    { q:`${b} imitation`,      gl:"global" },
    { q:`${b} billig kopi`,    gl:"dk" },
  ];
  // Ophavsret-spor: ulovlig reproduktion af designværk/brugskunst.
  const cr = [
    { q:`${b} reproduktion`,        gl:"dk" },
    { q:`${b} reproduction`,        gl:"global" },
    { q:`${b} replica buy online`,  gl:"global" },
    { q:`${b} efterligning`,        gl:"dk" },
    { q:`${b} inspired by design`,  gl:"global" },
    { q:`${b} style copy cheap`,    gl:"global" },
  ];
  if(type==="varemaerke") return tm;
  if(type==="ophavsret")  return cr;
  // "begge" (standard): flet sporene, stærkeste først.
  return [tm[0], cr[0], tm[2], cr[1], tm[3], cr[2], tm[1], cr[3], tm[4], cr[4], tm[5], cr[5]];
}

// Enkel cache i hukommelsen (6 t) — samme mærke igen koster 0 søgninger så længe instansen lever.
const CACHE = new Map(); const CACHE_TTL = 6*60*60*1000;
function cacheGet(k){ const v=CACHE.get(k); if(v && Date.now()-v.t < CACHE_TTL) return v.data; if(v) CACHE.delete(k); return null; }
function cacheSet(k,data){ CACHE.set(k,{t:Date.now(),data}); }

// Scorer + aggregerer en liste af fund til den færdige rapport. Bruges af BÅDE live- og demo-sporet.
function buildReport(rawListings, { brand, type, ref, provider, demo }){
  const tokens = brandTokens(brand);
  let listings = rawListings.slice();
  listings.forEach(l=>{ const v=scoreListing(l, ref, tokens); l.prob=v.prob; l.verdict=v.verdict; l.reasons=v.reasons; l.ipType=v.ipType; l.region=regionOf(l.platform); });
  listings.sort((a,b)=>b.prob-a.prob);
  listings = listings.slice(0, 150);

  const infr = listings.filter(l=>l.verdict==="KRÆNKELSE").length;
  const unc  = listings.filter(l=>l.verdict==="USIKKER").length;
  const legal= listings.filter(l=>l.verdict==="LOVLIG").length;
  const infringing = infr + unc;

  const suspect = listings.filter(l=>l.verdict!=="LOVLIG");
  const byType = {
    varemaerke: suspect.filter(l=>l.ipType==="VAREMÆRKE"||l.ipType==="BEGGE").length,
    ophavsret:  suspect.filter(l=>l.ipType==="OPHAVSRET"||l.ipType==="BEGGE").length,
  };

  const platMap = {}; listings.forEach(l=>{ const p=l.platform||"ukendt"; platMap[p]=(platMap[p]||0)+1; });
  const platforms = Object.entries(platMap).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  const undercuts = listings.filter(l=>ref&&l.extracted_price).map(l=>1-l.extracted_price/ref).filter(x=>x>0);
  const avgUndercut = undercuts.length ? Math.round(undercuts.reduce((a,b)=>a+b,0)/undercuts.length*100) : null;
  const lr = lostRange(infringing, ref);

  return {
    brand, type, provider: provider||"demo", demo:!!demo, empty:false, scannedAt:new Date().toISOString(),
    refPrice:ref, avgUndercut, infringing, byType,
    lostRevenueLow:lr.low, lostRevenueHigh:lr.high, unitsLow:UNITS_LOW, unitsHigh:UNITS_HIGH,
    counts:{ total:listings.length, infringing:infr, uncertain:unc, legal },
    platforms,
    listings: listings.map(l=>({ title:l.title, price:l.price, extracted_price:l.extracted_price,
      source:l.platform, link:l.link, thumbnail:l.thumbnail, platform:l.platform,
      region:l.region, verdict:l.verdict, ipType:l.ipType, prob:l.prob, reasons:l.reasons }))
  };
}

// Neutral pladsholder-flise til demo-rækker (bevidst IKKE et falsk produktfoto).
function demoThumb(i){
  const h=(i*47)%360;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">`+
    `<rect width="64" height="64" fill="hsl(${h},22%,88%)"/>`+
    `<circle cx="32" cy="26" r="13" fill="hsl(${h},26%,74%)"/>`+
    `<rect x="30" y="34" width="4" height="16" fill="hsl(${h},26%,74%)"/>`+
    `<rect x="20" y="50" width="24" height="4" rx="2" fill="hsl(${h},26%,74%)"/></svg>`;
  return "data:image/svg+xml;utf8,"+encodeURIComponent(svg);
}

// Realistiske EKSEMPEL-fund til demo-tilstand (ingen søge-nøgle). Bruger det indtastede navn,
// så rapporten ser skræddersyet ud. Tydeligt mærket "DEMO" i frontenden — ikke rigtige resultater.
function demoListings(brand, type){
  const b = brand;
  const tm = [ // varemærke-signaler
    { title:`${b} replica 1:1 – AAA topkvalitet`, platform:"lux-copy.top", extracted_price:349, price:"349 kr" },
    { title:`Billig ${b} kopi · outlet fri fragt`, platform:"brandbargain.shop", extracted_price:279, price:"279 kr" },
    { title:`${b} fake batch – factory direkte`, platform:"aaa-store.ru", extracted_price:199, price:"199 kr" },
  ];
  const cr = [ // ophavsret-signaler
    { title:`${b} reproduktion (inspired by design classic)`, platform:"designrepro.store", extracted_price:590, price:"590 kr" },
    { title:`${b} homage lampe – håndlavet efterligning`, platform:"nordic-repro.online", extracted_price:690, price:"690 kr" },
    { title:`${b} print / plakat af originalen`, platform:"posterkopi.xyz", extracted_price:149, price:"149 kr" },
    { title:`${b} i stil af – reproduktion`, platform:"stilkopi.de", extracted_price:820, price:"820 kr" },
  ];
  const legit = [ // skal score LOVLIG (autoriseret forhandler)
    { title:`${b} – original hos autoriseret forhandler`, platform:"designforhandler.dk", extracted_price:1799, price:"1.799 kr" },
  ];
  let picks = type==="varemaerke" ? tm.concat(legit)
            : type==="ophavsret"  ? cr.concat(legit)
            : tm.concat(cr, legit);
  return picks.map((x,i)=>Object.assign({ snippet:"", link:"https://"+x.platform+"/produkt", thumbnail:demoThumb(i) }, x));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const brand = ((req.query.brand)||"").toString().trim();
  const msrp = parseFloat(req.query.msrp) || null;
  // type: "varemaerke" | "ophavsret" | "begge" (standard)
  let type = ((req.query.type)||"begge").toString().toLowerCase().trim();
  if(!["varemaerke","ophavsret","begge"].includes(type)) type = "begge";
  if(!brand){ res.status(400).json({error:"Angiv et varemærke eller værk (brand)."}); return; }

  const provs = providers();
  const provider = provs[0] || null;

  const cacheKey = type+"|"+brand.toLowerCase()+"|"+(msrp||"");
  const cached = cacheGet(cacheKey);
  if(cached){ res.status(200).json(Object.assign({}, cached, { cached:true })); return; }

  // Ingen søge-nøgle → gratis DEMO-tilstand med realistiske eksempel-fund, så værktøjet
  // virker og viser værdi med det samme. Tydeligt mærket "DEMO" i frontenden.
  if(!provider){
    const ref = msrp || 1799;
    const report = buildReport(demoListings(brand, type), { brand, type, ref, provider:null, demo:true });
    report.message = "DEMO — eksempeldata (ingen søge-nøgle sat op). Tilføj en GRATIS nøgle i Vercel for at søge det rigtige web — nemmest er SERPER_API_KEY (2.500 gratis søgninger, intet kort). Alternativt BRAVE_API_KEY eller GOOGLE_CSE_KEY + GOOGLE_CSE_CX. Dine klienter rører aldrig nøglen.";
    cacheSet(cacheKey, report);
    res.status(200).json(report);
    return;
  }

  const N = Math.min(12, Math.max(1, parseInt(process.env.SCAN_QUERIES,10)||8));
  const queries = buildQueries(brand, type).slice(0, N);
  const wantDebug = req.query.debug != null;
  LAST_DIAG = null;

  try {
    const settled = await Promise.allSettled(queries.map(q=>runQuery(provs, q)));
    let raw = [];
    settled.forEach(s=>{ if(s.status==="fulfilled") raw = raw.concat(s.value); });
    const rawCount = raw.length;

    let listings = raw.filter(l => l.platform && !isExcluded(l.platform));
    const afterExclude = listings.length;
    const seen = new Set();
    listings = listings.filter(l=>{ const k=(l.platform+"|"+(l.title||"").slice(0,50)).toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });

    const dbg = wantDebug ? { provider, queries, rawCount, afterExclude, afterDedup:listings.length,
      serperDiag:LAST_DIAG, samplePlatforms:[...new Set(raw.map(l=>l.platform))].slice(0,15) } : undefined;

    if(listings.length === 0){
      res.status(200).json({ brand, type, empty:true, provider, _debug:dbg,
        message: rawCount===0
          ? ("Søge-API'en returnerede ingen resultater"+(LAST_DIAG?" ("+LAST_DIAG+")":"")+". Tjek at SERPER_API_KEY er gyldig og har kredit tilbage.")
          : "Ingen uafhængige kopi-shops fundet lige nu. Prøv igen eller med model-/værknavn (fx 'Flowerpot VP7')." });
      return;
    }

    const priced = listings.map(l=>l.extracted_price).filter(Boolean).sort((a,b)=>a-b);
    const ref = msrp || (priced.length ? priced[Math.floor(priced.length/2)] : null);

    const payload = buildReport(listings, { brand, type, ref, provider, demo:false });
    if(dbg) payload._debug = dbg;
    cacheSet(cacheKey, payload);
    res.status(200).json(payload);
  } catch(e){
    res.status(200).json({ brand, type, error:"Søgningen fejlede lige nu ("+(e.message||e)+"). Prøv igen om lidt." });
  }
};
