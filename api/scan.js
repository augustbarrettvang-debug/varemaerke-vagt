// Varemærke-Vagt — backend-scanner (Vercel serverless function)
// Søger det åbne web via en GRATIS søge-API (nøglen bor på serveren; klienter rører den aldrig).
// Understøtter Brave Search (BRAVE_API_KEY) eller Google Programmable Search (GOOGLE_CSE_KEY + GOOGLE_CSE_CX).
// Uden nøgle forsøges en nøglefri søgning (virker sjældent fra cloud-IP; giver da en hjælpe-besked).
// Finder skjulte uafhængige kopi-shops (store markedspladser filtreres fra), scorer hvert fund,
// og returnerer antal fund + muligt tabt omsætning. Ingen SerpAPI, ingen Anthropic.

const REDFLAGS = ["replica","replika","aaa","aaaa","1:1","mirror","copy","copies","kopi","kopie",
  "dupe","dupes","inspired","inspireret","style of","in style of","unbranded","umærket","faux",
  "oem","reproduction","reproduktion","repro","knockoff","knock-off","fake","imitation","imiteret","lookalike"];

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

function scoreListing(l, ref, tokens){
  let s = 0; const reasons = [];
  const t = (l.title||"").toLowerCase();
  const dom = (l.platform||"").toLowerCase();
  const hits = [...new Set(REDFLAGS.filter(w=>t.includes(w)))];
  if(hits.length){ s += Math.min(46, hits.length*18); reasons.push("Kopi-ord: " + hits.slice(0,4).join(", ")); }
  if(SUS_TLD.test(dom)){ s += 20; reasons.push("Anonymt/højrisiko-domæne"); }
  if(tokens.some(tok=>tok && dom.includes(tok))){ s += 16; reasons.push("Varemærket bruges i domænenavnet"); }
  if(ref && l.extracted_price){
    const r = l.extracted_price / ref;
    if(r < 0.30){ s += 30; reasons.push("Ekstremt lav pris (" + Math.round(r*100) + "%)"); }
    else if(r < 0.50){ s += 18; reasons.push("Meget lav pris (" + Math.round(r*100) + "%)"); }
    else if(r < 0.70){ s += 8; reasons.push("Lav pris (" + Math.round(r*100) + "%)"); }
  }
  if(reasons.length===0) reasons.push("Ukendt sælger uden for de store markedspladser");
  const prob = Math.round(100/(1+Math.exp(-(s-22)/14)));
  const verdict = prob >= 65 ? "FALSK" : prob >= 35 ? "USIKKER" : "ÆGTE";
  return { prob, verdict, reasons };
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

// --- Brave Search API (gratis: 2000/md). Én nøgle. ---
async function braveSearch(q, key){
  const j = await fetchJSON("https://api.search.brave.com/res/v1/web/search?country=dk&count=15&q="+encodeURIComponent(q),
    { "Accept":"application/json", "X-Subscription-Token":key });
  const res = (j && j.web && j.web.results) || [];
  return res.map(it=>({ title:decodeEntities(stripTags(it.title||"")), link:it.url, platform:domainOf(it.url||""),
    extracted_price:null, price:null, thumbnail:(it.thumbnail&&it.thumbnail.src)||null }))
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
    return { title:decodeEntities(stripTags(it.title||"")), link:it.link, platform:domainOf(it.link||""),
      extracted_price:price, price:priceStr, thumbnail:thumb };
  }).filter(x=>x.title && /^https?:\/\//.test(x.link||""));
}
// --- Nøglefri fallback (DuckDuckGo html) — virker sjældent fra cloud-IP, men prøves. ---
async function ddgHtml(q){
  const html = await fetchText("https://html.duckduckgo.com/html/?q="+encodeURIComponent(q)+"&kl=dk-da");
  if(!html) return [];
  const out=[]; let m; const re=/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  while((m=re.exec(html))){ let href=m[1]; const um=href.match(/uddg=([^&]+)/); if(um){try{href=decodeURIComponent(um[1]);}catch{}}
    const title=decodeEntities(stripTags(m[2])); if(title&&/^https?:\/\//.test(href)) out.push({title,link:href,platform:domainOf(href),extracted_price:null,price:null,thumbnail:null}); }
  return out;
}

function providers(){
  const p=[];
  if(process.env.BRAVE_API_KEY) p.push("Brave");
  if(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) p.push("Google");
  return p;
}
async function runOne(provider, q){
  if(provider==="Brave") return braveSearch(q, process.env.BRAVE_API_KEY);
  if(provider==="Google") return googleSearch(q, process.env.GOOGLE_CSE_KEY, process.env.GOOGLE_CSE_CX);
  return ddgHtml(q); // nøglefri fallback
}
// Kør én søgning med primær udbyder; hvis tom, prøv den sekundære (lægger gratis niveauer sammen).
async function runQuery(provs, q){
  const list = provs.length ? provs : [null];
  for(const p of list){ try { const r=await runOne(p,q); if(r && r.length) return r; } catch {} }
  return [];
}

// Enkel cache i hukommelsen (6 t) — samme mærke igen koster 0 søgninger så længe instansen lever.
const CACHE = new Map(); const CACHE_TTL = 6*60*60*1000;
function cacheGet(k){ const v=CACHE.get(k); if(v && Date.now()-v.t < CACHE_TTL) return v.data; if(v) CACHE.delete(k); return null; }
function cacheSet(k,data){ CACHE.set(k,{t:Date.now(),data}); }

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const brand = ((req.query.brand)||"").toString().trim();
  const msrp = parseFloat(req.query.msrp) || null;
  if(!brand){ res.status(400).json({error:"Angiv et varemærke (brand)."}); return; }

  const provs = providers();
  const provider = provs[0] || null;

  // Cache: samme mærke+pris inden for 6 t genbruges (sparer søgninger).
  const cacheKey = brand.toLowerCase()+"|"+(msrp||"");
  const cached = cacheGet(cacheKey);
  if(cached){ res.status(200).json(Object.assign({}, cached, { cached:true })); return; }

  const excl = EXCLUDE_SITES.map(s=>"-site:"+s).join(" ");
  // Antal søgninger pr. scan (færre = flere scanninger på gratis niveau). Justér med SCAN_QUERIES (1-6).
  const N = Math.min(6, Math.max(1, parseInt(process.env.SCAN_QUERIES,10)||3));
  const allQueries = [
    `${brand} replica ${excl}`,
    `${brand} kopi ${excl}`,
    `${brand} (dupe OR reproduktion OR imitation) ${excl}`,
    `${brand} billig outlet ${excl}`,
  ];
  const queries = allQueries.slice(0, N);

  try {
    const settled = await Promise.allSettled(queries.map(q=>runQuery(provs, q)));
    let listings = [];
    settled.forEach(s=>{ if(s.status==="fulfilled") listings = listings.concat(s.value); });

    listings = listings.filter(l => l.platform && !isExcluded(l.platform));
    const seen = new Set();
    listings = listings.filter(l=>{ const k=(l.platform+"|"+(l.title||"").slice(0,50)).toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });

    if(listings.length === 0){
      const msg = provider
        ? "Ingen uafhængige kopi-shops fundet lige nu. Prøv igen eller med modelnavn (fx 'Flowerpot VP7')."
        : "Ingen søge-nøgle er sat op endnu. Tilføj en gratis nøgle i Vercel (BRAVE_API_KEY, eller GOOGLE_CSE_KEY + GOOGLE_CSE_CX), så søger værktøjet rigtigt. Dine klienter rører aldrig nøglen.";
      res.status(200).json({ brand, empty:true, provider, message:msg });
      return;
    }

    const tokens = brandTokens(brand);
    // Referencepris: normalpris hvis oplyst, ellers median af fundne priser.
    const priced = listings.map(l=>l.extracted_price).filter(Boolean).sort((a,b)=>a-b);
    const ref = msrp || (priced.length ? priced[Math.floor(priced.length/2)] : null);

    listings.forEach(l=>{ const v=scoreListing(l, ref, tokens); l.prob=v.prob; l.verdict=v.verdict; l.reasons=v.reasons; l.region=regionOf(l.platform); });
    listings.sort((a,b)=>b.prob-a.prob);
    listings = listings.slice(0, 60);

    const fake = listings.filter(l=>l.verdict==="FALSK").length;
    const unc  = listings.filter(l=>l.verdict==="USIKKER").length;
    const real = listings.filter(l=>l.verdict==="ÆGTE").length;
    const platMap = {}; listings.forEach(l=>{ const p=l.platform||"ukendt"; platMap[p]=(platMap[p]||0)+1; });
    const platforms = Object.entries(platMap).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
    const undercuts = listings.filter(l=>ref&&l.extracted_price).map(l=>1-l.extracted_price/ref).filter(x=>x>0);
    const avgUndercut = undercuts.length ? Math.round(undercuts.reduce((a,b)=>a+b,0)/undercuts.length*100) : null;
    const infringing = fake + unc;
    const lr = lostRange(infringing, ref);

    const payload = {
      brand, provider: provider||"nøglefri", demo:false, empty:false, scannedAt:new Date().toISOString(),
      refPrice:ref, avgUndercut, infringing,
      lostRevenueLow:lr.low, lostRevenueHigh:lr.high, unitsLow:UNITS_LOW, unitsHigh:UNITS_HIGH,
      counts:{ total:listings.length, fake, uncertain:unc, real },
      platforms,
      listings: listings.map(l=>({ title:l.title, price:l.price, extracted_price:l.extracted_price,
        source:l.platform, link:l.link, thumbnail:l.thumbnail, platform:l.platform,
        region:l.region, verdict:l.verdict, prob:l.prob, reasons:l.reasons }))
    };
    cacheSet(cacheKey, payload);
    res.status(200).json(payload);
  } catch(e){
    res.status(200).json({ brand, error:"Søgningen fejlede lige nu ("+(e.message||e)+"). Prøv igen om lidt." });
  }
};
