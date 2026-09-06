// Kør med:  node --test
const { test } = require("node:test");
const assert = require("node:assert");
const S = require("../api/_scoring.js");

const allow = S.allowlist();
const tokens = S.brandTokens("Flowerpot VP7");
const score = (l, ref = 2895) => S.scoreListing(Object.assign({ platform:"", title:"", snippet:"" }, l), ref, tokens, allow);

test("ordgrænser: kopi-ord matcher ikke inde i andre ord", () => {
  // "rip" i "description", "copy" i "copyright", "efter" i "leveres efter aftale"
  assert.strictEqual(score({ platform:"eksempel.com", title:"Full description of the product" }).verdict, "LOVLIG");
  assert.strictEqual(score({ platform:"eksempel.com", title:"Copyright 2026 Lampemesteren" }).verdict, "LOVLIG");
  assert.strictEqual(score({ platform:"eksempel.com", title:"Flowerpot VP7 leveres efter aftale" }).verdict, "LOVLIG");
  assert.strictEqual(score({ platform:"eksempel.com", title:"Tripod gulvlampe med greb" }).verdict, "LOVLIG");
});

test("rettighedshaver og kendte forhandlere frikendes af allowlisten", () => {
  for(const dom of ["andtradition.com","illumsbolighus.dk","royaldesign.dk","lampemesteren.dk"]){
    const v = score({ platform:dom, title:"Køb Flowerpot VP7 pendel" });
    assert.strictEqual(v.verdict, "LOVLIG", dom + " blev ikke frikendt");
    assert.ok(v.signals.includes("allowlist"));
  }
});

test("ét svagt signal alene er ikke en mistanke", () => {
  // Mærkenavnet i titlen hos en ukendt shop beskriver enhver forhandler.
  const v = score({ platform:"en-lampebutik.dk", title:"Flowerpot VP7 pendel i mange farver" });
  assert.strictEqual(v.verdict, "LOVLIG");
  assert.ok(v.prob <= 30);
});

test("kopi-ord i domænet står alene", () => {
  const v = score({ platform:"replica-lights.com", title:"Verner Panton Flowerpot pendant lamp" });
  assert.strictEqual(v.verdict, "KRÆNKELSE");
  assert.ok(v.signals.includes("dom_word"));
});

test("to uafhængige signaler giver mistanke", () => {
  const v = score({ platform:"lux-copy.top", title:"Flowerpot VP7 replica 1:1 AAA" });
  assert.strictEqual(v.verdict, "KRÆNKELSE");
  assert.ok(v.signals.length >= 2);
});

test("fejllæste priser bruges ikke som prisunderbud", () => {
  // 27 kr mod en markedspris på 2.895 kr er et fejllæst tal, ikke et underbud.
  assert.strictEqual(S.priceUsable(27, 2895), false);
  assert.strictEqual(S.priceUsable(890, 2895), true);
  const v = score({ platform:"en-butik.dk", title:"Flowerpot pendel sammenlign priser", extracted_price:27 });
  assert.ok(!v.signals.includes("price"));
});

test("rabat- og fragttal læses ikke som produktpris", () => {
  assert.strictEqual(S.extractPrice("Spar 900 kr på Flowerpot VP7"), null);
  assert.strictEqual(S.extractPrice("Fri fragt over 499 kr"), null);
  assert.strictEqual(S.extractPrice("Kun 249 kr pr. måned"), null);
  assert.strictEqual(S.extractPrice("Flowerpot VP7 pendel 2.895 kr"), 2895);
});

test("estimatet oplyser sit eget regnestykke", () => {
  const e = S.estimate(10, 2895);
  assert.strictEqual(e.low,  10 * 6  * 12 * 2895);
  assert.strictEqual(e.high, 10 * 30 * 12 * 2895);
  assert.strictEqual(e.unitsLow, 6);
  assert.strictEqual(S.estimate(10, null), null);
});

test("prissammenligning og markedspladser tælles ikke som fund", () => {
  for(const dom of ["pricerunner.dk","aliexpress.com","amazon.de","trustpilot.com"])
    assert.ok(S.isExcluded(dom), dom + " burde være filtreret fra");
});

test("indicier uden kopi-ord bliver højst usikre, aldrig en krænkelse", () => {
  // Anonymt topdomæne + meget lav pris er grund til at kigge, ikke til at konkludere.
  const v = score({ platform:"lampe-shop.top", title:"Flowerpot VP7 pendel", extracted_price:700 });
  assert.strictEqual(v.verdict, "USIKKER");
  assert.ok(v.prob < 65);
});

test("kopi-ord i titlen alene giver usikker — ikke frikendelse", () => {
  const v = score({ platform:"kikilighting.com", title:"Flowerpot VP7 replica pendant" });
  assert.strictEqual(v.verdict, "USIKKER");
});
