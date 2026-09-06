// Vurderingsmotoren: fra rå søgeresultater til en scoret rapport.
//
// Princippet er bevidst konservativt. Et fund skal have MINDST TO uafhængige
// signaler for at kunne blive "usikker" — ét enkelt svagt signal (fx at
// mærkenavnet står i titlen) beskriver enhver lovlig forhandler og er derfor
// ikke en mistanke. Undtagelsen er et domænenavn der selv indeholder et
// kopi-ord (replica-lights.com); det er selverklæret og står alene.

// --- Ordgrænser ---
// includes() på rå tekst matcher inde i ord: "rip" i "description", "copy" i
// "copyright". Vi bruger derfor lookarounds med en bogstavklasse der også
// dækker danske og nordiske tegn.
const LETTER = "a-z0-9æøåäöüéèêáàçñ";
function termRe(term){
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![${LETTER}])${esc}(?![${LETTER}])`, "i");
}
function compile(words){ return words.map(w => ({ word: w, re: termRe(w) })); }
function hits(compiled, text){
  const out = [];
  for(const c of compiled) if(c.re.test(text)) out.push(c.word);
  return [...new Set(out)];
}

// --- Røde flag: VAREMÆRKE (falske mærkevarer) ---
// Bevidst udeladt: "factory", "batch", "copy" alene, "oem" — for almindelige i
// lovlig produktomtale til at bære en mistanke.
const TM_REDFLAGS = compile(["replica","replika","aaa","aaaa","1:1","mirror quality",
  "kopi","kopie","kopivare","dupe","dupes","unbranded","umærket","faux","knockoff",
  "knock-off","fake","imitation","imiteret","lookalike","superfake","super fake"]);

// --- Røde flag: OPHAVSRET (ulovlig kopi af et beskyttet værk) ---
// Bevidst udeladt: "efter" (et af de mest almindelige danske ord), "rip"
// (matcher i praksis kun støj), "design classic"/"designklassiker" (bruges
// konstant af autoriserede forhandlere om ægte varer).
const CR_REDFLAGS = compile(["reproduction","reproduktion","repro","inspired by",
  "in style of","in the style of","i stil af","stil af","homage","hommage",
  "genfremstilling","efterligning","eftergjort","bootleg","unauthorized",
  "uautoriseret","uden licens","no license","stl file","stl-fil","3d print",
  "3d-print","gratis download","free download","torrent","cracked"]);

// Kopi-ord i selve domænenavnet — selverklæret kopi-shop. Matches som delstreng,
// for domæner har ingen mellemrum (replica-lights, kopimoebler, designrepro).
const DOMAIN_COPYWORDS = ["replica","replika","kopi","kopior","repro","dupe",
  "fake","imitation","knockoff","lookalike","efterligning","outlet-design"];

// Markedspladser, prissammenligning og redaktionelle sider. Ikke webshops —
// de skal hverken scores eller tælles med som fund.
const EXCLUDE = ["aliexpress","alibaba","dhgate","temu","wish.com","joom","shein",
  "banggood","lightinthebox","ioffer","made-in-china","chinabrands","amazon.",
  "ebay.","etsy.","allegro","fruugo","bonanza","catch.com","pinduoduo","1688.com",
  "pricerunner","prisjagt","prisguide","kelkoo","idealo","trustpilot","pinterest.",
  "youtube.","facebook.","reddit.","tiktok.","instagram.","wikipedia.","medium.com",
  "duckduckgo.","bing.","microsoft.","msn.","yahoo.","google."];

// Kendte rettighedshavere og etablerede forhandlere. Dette er et STARTGRUNDLAG —
// hver kunde bør udvide med sine egne autoriserede forhandlere via miljøvariablen
// ALLOWLIST_DOMAINS (kommasepareret). Uden listen bliver rettighedshaveren selv
// scoret som en mulig krænker.
const ALLOWLIST_DEFAULT = [
  // rettighedshavere / producenter
  "andtradition.com","louispoulsen.com","fritzhansen.com","carlhansen.com",
  "muuto.com","hay.dk","normann-copenhagen.com","gubi.com","montanafurniture.com",
  // etablerede forhandlere
  "illumsbolighus.dk","royaldesign.dk","royaldesign.com","rum21.dk","lampemesteren.dk",
  "lysmesteren.dk","andlight.com","andlight.dk","lampeagenten.dk","nordic-home.dk",
  "ingvardchristensen.dk","vester-moebler.dk","olssonmobler.dk","bolia.com",
  "finnishdesignshop.com","danishdesignstore.com","hivemodern.com","lumens.com",
  "dwr.com","connox.com","nordicnest.dk","nordicnest.com","designdelicatessen.dk",
];
function allowlist(){
  const extra = (process.env.ALLOWLIST_DOMAINS || "")
    .split(",").map(s => s.trim().toLowerCase().replace(/^www\./,"")).filter(Boolean);
  return new Set(ALLOWLIST_DEFAULT.concat(extra));
}
function isAllowlisted(dom, set){
  if(!dom) return false;
  for(const a of set) if(dom === a || dom.endsWith("."+a)) return true;
  return false;
}

const SUS_TLD = /\.(ru|cn|hk|top|xyz|buzz|click|vip|su|tk|cc|icu|monster|space)$/i;

function domainOf(url){
  try { return new URL(url).hostname.replace(/^www\./,"").toLowerCase(); } catch { return ""; }
}
function isExcluded(dom){ return EXCLUDE.some(x => dom.includes(x)); }
function regionOf(dom){
  if(/\.(cn|hk)$/.test(dom)) return "Kina/Hongkong";
  if(/\.(ru|by|ua|su)$/.test(dom)) return "Østeuropa";
  if(/\.de$/.test(dom)) return "Tyskland";
  if(/\.dk$/.test(dom)) return "Danmark";
  if(/\.(co\.uk|uk)$/.test(dom)) return "Storbritannien";
  if(/\.nl$/.test(dom)) return "Holland";
  if(/\.(au|com\.au)$/.test(dom)) return "Australien";
  if(SUS_TLD.test(dom)) return "Anonymt topdomæne";
  return "Ukendt";
}
function brandTokens(brand){
  return brand.toLowerCase().split(/\s+/).filter(w => w.length >= 3).map(w => w.replace(/[^a-z0-9]/g,""));
}
function stripTags(s){ return (s||"").replace(/<[^>]+>/g,""); }
function decodeEntities(s){
  return (s||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&nbsp;/g," ").trim();
}

// --- Pris ---
// Vekselkurser til DKK (grove, kun til sammenligning af størrelsesorden).
const FX = { DKK:1, SEK:0.70, NOK:0.66, EUR:7.46, USD:6.90, GBP:8.75 };
// Tal i et søgeuddrag er sjældent produktets pris. Står der "spar", "fra",
// "fragt", "/md." e.l. lige før beløbet, er det en rabat, en startpris, et
// fragtgebyr eller en afdragsydelse — ikke prisen.
const NOISE_BEFORE = /(spar|rabat|nedsat|før|foer|fra|fragt|levering|shipping|save|off|gebyr|værdi|vaerdi|op til|over|under|min\.|maks)\s*[^\d]{0,12}$/i;
// ... og en afdragsydelse eller besparelse kan også stå EFTER beløbet: "249 kr pr. md.".
const NOISE_AFTER = /^\s*(?:kr\.?|DKK|EUR|USD)?\s*(?:\/|pr\.?)\s*(?:md|mdr|m(?:å|aa)ned|month|stk)|^\s*i\s+(?:rabat|besparelse)/i;

function extractPrice(text){
  if(!text) return null;
  const t = " " + text.replace(/ /g," ") + " ";
  const pats = [
    { re:/(?:kr\.?|DKK)\s*([\d][\d .]{1,9}(?:,\d{2})?)/ig, cur:"DKK" },
    { re:/([\d][\d .]{1,9}(?:,\d{2})?)\s*(?:kr\.?|DKK)\b/ig, cur:"DKK" },
    { re:/€\s*([\d][\d .]{1,9}(?:[.,]\d{2})?)/ig,           cur:"EUR" },
    { re:/([\d][\d .]{1,9}(?:[.,]\d{2})?)\s*(?:EUR|euro)\b/ig, cur:"EUR" },
    { re:/\$\s*([\d][\d ,]{1,9}(?:\.\d{2})?)/ig,            cur:"USD" },
    { re:/([\d][\d .]{1,9}(?:,\d{2})?)\s*(?:SEK|NOK)\b/ig,  cur:"SEK" },
    { re:/([\d][\d .]{1,9}(?:,\d{2})?)\s*GBP\b/ig,          cur:"GBP" },
    { re:/£\s*([\d][\d ,]{1,9}(?:\.\d{2})?)/ig,             cur:"GBP" },
  ];
  const found = [];
  for(const p of pats){
    let m; p.re.lastIndex = 0;
    while((m = p.re.exec(t))){
      if(NOISE_BEFORE.test(t.slice(Math.max(0, m.index-24), m.index))) continue;
      if(NOISE_AFTER.test(t.slice(m.index + m[0].length, m.index + m[0].length + 24))) continue;
      let raw = m[1].replace(/\s/g,"");
      if(/,\d{2}$/.test(raw)) raw = raw.replace(/\./g,"").replace(",","."); // 1.799,00
      else raw = raw.replace(/[.,](?=\d{3}\b)/g,"");
      const v = parseFloat(raw);
      if(isFinite(v) && v >= 20 && v <= 500000) found.push(Math.round(v * (FX[p.cur]||1)));
    }
  }
  if(!found.length) return null;
  found.sort((a,b)=>a-b);
  return found[Math.floor(found.length/2)];
}

// En pris må kun bruges som signal hvis den er plausibel i forhold til
// markedsprisen. 27 kr mod en markedspris på 2.895 kr er ikke et prisunderbud
// på 99 % — det er et fejllæst tal.
function priceUsable(price, ref){
  if(!price || !ref) return false;
  return price >= ref * 0.05 && price <= ref * 5;
}

// --- Scoring ---
function scoreListing(l, ref, tokens, allowSet){
  const dom  = (l.platform || "").toLowerCase();
  const text = ((l.title||"") + " " + (l.snippet||"")).toLowerCase();

  if(allowSet && isAllowlisted(dom, allowSet)){
    return { prob:0, verdict:"LOVLIG", ipType:"—", signals:["allowlist"],
      reasons:["Kendt rettighedshaver eller etableret forhandler (allowliste)"] };
  }

  // spor: "tm" tæller kun for varemærke, "cr" kun for ophavsret, "both" for begge
  const sig = [];
  const tmHits = hits(TM_REDFLAGS, text);
  if(tmHits.length) sig.push({ key:"tm_word", w:Math.min(42, 26 + (tmHits.length-1)*8), track:"tm",
    why:'Falsk-mærkevare-ord i teksten: "' + tmHits.slice(0,3).join('", "') + '"' });

  const crHits = hits(CR_REDFLAGS, text);
  if(crHits.length) sig.push({ key:"cr_word", w:Math.min(42, 26 + (crHits.length-1)*8), track:"cr",
    why:'Kopi-af-værk-ord i teksten: "' + crHits.slice(0,3).join('", "') + '"' });

  const domHits = [...new Set(DOMAIN_COPYWORDS.filter(w => dom.includes(w)))];
  if(domHits.length) sig.push({ key:"dom_word", w:45, track:"both",
    why:'Kopi-ord i selve domænenavnet: "' + domHits.slice(0,2).join('", "') + '"' });

  if(SUS_TLD.test(dom)) sig.push({ key:"sus_tld", w:15, track:"both",
    why:"Anonymt eller højrisiko-topdomæne" });

  const brandInDom = tokens.some(t => t && dom.includes(t));
  if(brandInDom && !domHits.length) sig.push({ key:"brand_in_dom", w:18, track:"tm",
    why:"Varemærket indgår i domænenavnet" });

  const usable = priceUsable(l.extracted_price, ref);
  if(usable){
    const r = l.extracted_price / ref;
    if(r < 0.30)      sig.push({ key:"price", w:28, track:"both", why:"Prisen er "+Math.round(r*100)+" % af markedsprisen" });
    else if(r < 0.50) sig.push({ key:"price", w:16, track:"both", why:"Prisen er "+Math.round(r*100)+" % af markedsprisen" });
    else if(r < 0.70) sig.push({ key:"price", w:6,  track:"both", why:"Prisen er "+Math.round(r*100)+" % af markedsprisen" });
  }

  const sum = t => sig.filter(s => s.track === t || s.track === "both").reduce((a,s)=>a+s.w, 0);
  const tmScore = sum("tm"), crScore = sum("cr");
  const score = Math.max(tmScore, crScore);

  let prob = Math.round(100 / (1 + Math.exp(-(score - 30) / 13)));

  // Et eksplicit kopi-ord — i domænet eller i teksten — er sælgerens egen
  // erklæring og bærer en mistanke alene. De øvrige signaler (topdomæne, pris,
  // mærkenavn i domænet) er indicier: de skal være to om det.
  const explicit = sig.some(s => s.key === "dom_word" || s.key === "tm_word" || s.key === "cr_word");
  if(sig.length < 2 && !explicit) prob = Math.min(prob, 30);

  // Uden et eksplicit kopi-ord kalder vi det aldrig en krænkelse — kun usikkert.
  // Indicier kan begrunde et kig, ikke en konklusion.
  if(!explicit) prob = Math.min(prob, 60);

  const verdict = prob >= 65 ? "KRÆNKELSE" : prob >= 35 ? "USIKKER" : "LOVLIG";

  let ipType;
  if(crScore > tmScore)      ipType = "OPHAVSRET";
  else if(tmScore > crScore) ipType = "VAREMÆRKE";
  else if(tmHits.length && crHits.length) ipType = "BEGGE";
  else if(tmHits.length)     ipType = "VAREMÆRKE";
  else if(crHits.length)     ipType = "OPHAVSRET";
  else                       ipType = "UAFKLARET";

  const reasons = sig.length ? sig.map(s => s.why)
    : ["Ingen krænkelsessignaler fundet — ser ud som en almindelig forhandler"];

  return { prob, verdict, ipType, signals: sig.map(s => s.key), reasons };
}

// --- Estimat ---
// Antagelsen om 6–30 solgte kopier pr. shop pr. måned er et skøn, ikke et måltal.
// Den vises altid sammen med regnestykket, så modtageren kan vurdere den selv.
const UNITS_LOW = 6, UNITS_HIGH = 30;
function estimate(count, ref){
  if(!ref || !count) return null;
  return {
    low: Math.round(count * UNITS_LOW * 12 * ref),
    high: Math.round(count * UNITS_HIGH * 12 * ref),
    unitsLow: UNITS_LOW, unitsHigh: UNITS_HIGH, count, refPrice: ref,
  };
}

function buildReport(rawListings, { brand, type, ref, refSource, provider, demo, shared }){
  const tokens = brandTokens(brand);
  const allowSet = allowlist();

  let listings = rawListings.slice();
  listings.forEach(l => {
    const v = scoreListing(l, ref, tokens, allowSet);
    Object.assign(l, v);
    l.region = regionOf(l.platform);
    l.priceUsable = priceUsable(l.extracted_price, ref);
  });
  listings.sort((a,b) => b.prob - a.prob);
  listings = listings.slice(0, 150);

  const infr  = listings.filter(l => l.verdict === "KRÆNKELSE").length;
  const unc   = listings.filter(l => l.verdict === "USIKKER").length;
  const legal = listings.filter(l => l.verdict === "LOVLIG").length;
  const suspect = listings.filter(l => l.verdict !== "LOVLIG");

  // Tællelige fakta — det er dem rapporten står på. Estimatet er sekundært.
  const evidence = {
    domainCopyWord: listings.filter(l => l.signals.includes("dom_word")).length,
    titleCopyWord:  listings.filter(l => l.signals.includes("tm_word") || l.signals.includes("cr_word")).length,
    susTld:         listings.filter(l => l.signals.includes("sus_tld")).length,
    underpriced:    listings.filter(l => l.signals.includes("price")).length,
    allowlisted:    listings.filter(l => l.signals.includes("allowlist")).length,
  };

  const byType = {
    varemaerke: suspect.filter(l => l.ipType === "VAREMÆRKE" || l.ipType === "BEGGE").length,
    ophavsret:  suspect.filter(l => l.ipType === "OPHAVSRET" || l.ipType === "BEGGE").length,
  };

  const platMap = {};
  suspect.forEach(l => { const p = l.platform || "ukendt"; platMap[p] = (platMap[p]||0)+1; });
  const platforms = Object.entries(platMap).map(([name,count]) => ({name,count})).sort((a,b)=>b.count-a.count);

  // Prisunderbud regnes kun på priser vi tør stole på.
  const cuts = listings.filter(l => l.priceUsable).map(l => 1 - l.extracted_price/ref).filter(x => x > 0);
  const avgUndercut = cuts.length >= 3
    ? Math.round(cuts.reduce((a,b)=>a+b,0)/cuts.length*100) : null;

  return {
    brand, type, provider: provider || "demo", demo: !!demo, empty: false,
    scannedAt: new Date().toISOString(), sharedStore: !!shared,
    refPrice: ref || null, refSource: refSource || null, avgUndercut,
    evidence, byType,
    estimate: estimate(infr + unc, ref),

    // Bagudkompatible felter så den nuværende frontend fortsat virker mens
    // rapportvisningen skrives om. Fjernes sammen med den gamle visning.
    infringing: infr + unc,
    lostRevenueLow:  (estimate(infr + unc, ref) || {}).low  ?? null,
    lostRevenueHigh: (estimate(infr + unc, ref) || {}).high ?? null,
    unitsLow: UNITS_LOW, unitsHigh: UNITS_HIGH,

    counts: { total: listings.length, infringing: infr, uncertain: unc, legal },
    platforms,
    listings: listings.map(l => ({
      title:l.title, price:l.price, extracted_price:l.extracted_price, priceUsable:l.priceUsable,
      link:l.link, thumbnail:l.thumbnail, platform:l.platform, region:l.region,
      verdict:l.verdict, ipType:l.ipType, prob:l.prob, reasons:l.reasons, signals:l.signals,
    })),
  };
}

module.exports = {
  TM_REDFLAGS, CR_REDFLAGS, DOMAIN_COPYWORDS, SUS_TLD, EXCLUDE, ALLOWLIST_DEFAULT,
  termRe, hits, allowlist, isAllowlisted, domainOf, isExcluded, regionOf, brandTokens,
  stripTags, decodeEntities, extractPrice, priceUsable, scoreListing, estimate, buildReport,
  UNITS_LOW, UNITS_HIGH,
};
