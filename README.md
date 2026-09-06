# Varemærke-Vagt

Et værktøj til brand protection. Man skriver sit **varemærke** eller **designværk** ind
(fx *Flowerpot VP7*, *PH 5*), vælger om der skal søges efter **varemærke-**, **ophavsrets-**
eller **begge** slags krænkelser, og værktøjet søger det åbne web, vurderer hvert fund og
samler dem i en rapport der kan printes og lægges i en sag.

**To slags krænkelser, ét værktøj:**

- **Varemærke** (varemærkeloven): ulovlig brug af mærke, logo eller navn — falske mærkevarer,
  replica-tasker, kopi-sneakers.
- **Ophavsret** (ophavsretsloven): ulovlig kopiering af et beskyttet værk — designmøbler og
  brugskunst (Flowerpot, PH-lamper, Arne Jacobsen-stole), kunst, mønstre, tryk, digitalt indhold.

---

## Sådan vurderes et fund

Motoren er bevidst konservativ, fordi et falskt positivt fund er dyrere end et overset:
en rapport der udpeger rettighedshaverens egen forhandler er værdiløs foran en advokat.

Tre regler bærer vurderingen:

1. **Et fund skal have mindst to uafhængige signaler** for at blive *usikkert*. At mærkenavnet
   står i titlen beskriver enhver lovlig forhandler og er derfor ikke i sig selv en mistanke.
2. **Et eksplicit kopi-ord står alene.** Står "replica" i domænenavnet (`replica-lights.com`)
   eller i teksten, er det sælgerens egen erklæring.
3. **Uden et eksplicit kopi-ord bliver et fund aldrig kaldt en krænkelse** — højst *usikkert*.
   Et anonymt topdomæne og en lav pris er grund til at kigge, ikke til at konkludere.

Signalerne der tælles: kopi-ord i domænenavnet, kopi-ord i titel/uddrag, anonymt eller
højrisiko-topdomæne, varemærket brugt i domænenavnet, og pris langt under markedsprisen.
Hvert fund viser hvilke signaler der udløste vurderingen.

**Allowliste.** Kendte rettighedshavere og etablerede forhandlere frikendes uden scoring.
Den indbyggede liste er et startgrundlag — udvid den med kundens egne autoriserede
forhandlere via `ALLOWLIST_DOMAINS`. Uden det bliver rettighedshaveren selv scoret som
mulig krænker.

**Priser.** Tal i et søgeuddrag er sjældent produktets pris. Beløb med "spar", "fra",
"fragt" eller "pr. md." omkring sig kasseres, og en pris under 5 % af markedsprisen
behandles som et fejllæst tal, ikke som et prisunderbud.

**Estimatet over tabt omsætning er et skøn**, ikke en måling: antal mistænkelige fund ×
6–30 solgte kopier pr. shop pr. måned × 12 måneder × markedsprisen. Antagelsen om 6–30
stk. er ikke målt. Rapporten viser derfor altid regnestykket ved siden af beløbet, og de
tællelige fakta (antal domæner med kopi-ord osv.) står før estimatet.

---

## Kør din egen kopi

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/augustbarrettvang-debug/varemaerke-vagt)

Hvert firma kører sin egen kopi med sin egen gratis søge-nøgle, så ingen deler kvote.
Uden nøgle starter værktøjet i **demo-tilstand** med tydeligt mærkede eksempeldata.
Se den korte firma-vejledning i **[DEPLOY.md](DEPLOY.md)**.

### Søge-nøgle (vælg én)

Nøglen bor på serveren — klienterne rører den aldrig.

| Variabel | Udbyder | Gratis niveau |
|---|---|---|
| `SERPER_API_KEY` | [serper.dev](https://serper.dev/) — **anbefalet** | 2.500 søgninger, intet kort |
| `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` | [Google Programmable Search](https://programmablesearchengine.google.com/) | 100 søgninger/dag |
| `BRAVE_API_KEY` | [Brave Search API](https://brave.com/search/api/) | 2.000 søgninger/md |

Kun Serper slår markedsprisen op via Google Shopping. Med de øvrige udledes markedsprisen
af priserne i søgeresultaterne.

### Øvrige indstillinger

| Variabel | Standard | Hvad den gør |
|---|---|---|
| `ALLOWLIST_DOMAINS` | – | Kommasepareret liste af domæner der altid er lovlige. **Sæt denne.** |
| `SCAN_QUERIES` | `8` | Søgninger pr. scanning (1–12). Færre = længere kvote, færre fund. |
| `RATE_LIMIT_PER_HOUR` | `5` | Scanninger pr. IP pr. time. |
| `DAILY_SCAN_BUDGET` | `60` | Samlet loft pr. dag, så kvoten ikke kan tømmes. |
| `ALLOWED_ORIGIN` | – | Tillad kald fra denne oprindelse. Uden den: kun samme oprindelse. |
| `DEBUG_TOKEN` | – | Kald `?debug=<token>` for diagnose. Uden token er debug slået fra. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | – | Upstash/Vercel KV til cache og rate limiting på tværs af instanser. |

**Om rate limiting uden KV:** serverless-instanser deler ikke hukommelse og genstarter
konstant, så uden KV er både cachen og grænserne kun vejledende. Endepunktet er offentligt
og bruger en kvoteret nøgle — med Serpers 2.500 gratis søgninger og 8 søgninger pr. scanning
rækker kvoten til ca. 310 scanninger i alt. Sæt KV op hvis linket deles bredt.

---

## Filer

```
varemaerke-vagt/
├─ public/index.html    ← rapportvisningen
├─ api/scan-ip.js       ← handler: søgning, budget, svar
├─ api/_scoring.js      ← vurderingsmotoren (al scoring og aggregering)
├─ api/_store.js        ← cache + rate limiting (Upstash/KV, ellers hukommelse)
└─ test/scoring.test.js ← tests for scoringen
```

Frontenden kalder `/api/scan-ip?type=begge|varemaerke|ophavsret&brand=…`.
Markedsprisen findes automatisk og kan ikke sættes udefra.

---

## Udvikling

```bash
npm test        # node --test
vercel dev      # frontend + API på http://localhost:3000
```

---

## Hvorfor en server og ikke bare en HTML-fil

En browser må ikke selv hente søgeresultater (CORS), og en søgning kræver en API-nøgle.
Nøglen skal ligge på en server — aldrig i en fil man sender ud, ellers kan modtageren
bruge løs af kvoten.

---

## Ansvar

Rapporten er en **automatisk screening** — beslutningsstøtte, ikke juridisk bevis.
Bekræft altid ægthed og krænkelse konkret, før der tages retslige skridt.
