# Varemærke-Vagt · kopivare-scanner

Et lille webværktøj til brand protection. Man skriver sit **varemærke** ind (fx *Flowerpot VP7*),
værktøjet **søger nettet** for mulige kopivarer, scorer hvert fund (ægte / usikker / falsk) og viser en
**rapport** med antal kopier + muligt tabt omsætning — inkl. et afsnit om hvorfor sagen kræver juridisk handling.

## 🚀 Deploy din egen kopi (til et firma)

Hvert firma kører sin egen kopi med sin egen gratis søge-nøgle → ingen delt grænse. Send dem `DEPLOY.md`
og denne knap (udskift `DIT-GITHUB-BRUGERNAVN` når repo'et er lagt på GitHub):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/DIT-GITHUB-BRUGERNAVN/varemaerke-vagt&env=BRAVE_API_KEY&envDescription=Gratis%20Brave%20Search%20token&envLink=https://brave.com/search/api/)

Firmaet klikker → logger ind på Vercel → indsætter sin egen gratis `BRAVE_API_KEY` → har sit eget link på ~1 min.
Se den korte firma-vejledning i **[DEPLOY.md](DEPLOY.md)**.

---

```
varemaerke-vagt/
├─ public/index.html   ← frontend (dashboardet klienten ser)
├─ api/scan.js         ← backend: kalder søge-API, scorer fund, bygger rapporten
├─ package.json
└─ vercel.json
```

---

## Hvorfor en server (og ikke bare en fil)?

En browser må ikke selv hente resultater fra Google/AliExpress (blokeres af CORS), og en søgning
kræver en **søge-API med en hemmelig nøgle**. Nøglen skal ligge på en server — **aldrig** i en fil du
mailer ud, ellers kan modtageren bruge løs af din regning. Derfor: deploy én gang, del linket.

---

## Sådan deployer du (ca. 10 min, gratis niveau)

### 1) Skaf en GRATIS søge-nøgle (vælg én)
Nøglen bor på serveren — **dine klienter/modtagere rører den aldrig**; de skriver bare mærket ind.

- **Brave Search (nemmest — anbefalet):** [brave.com/search/api](https://brave.com/search/api/) → opret gratis konto → kopiér din **Subscription Token**. Gratis niveau: **2.000 søgninger/md**. Kun én nøgle.
- **eller Google Programmable Search:** opret en [API-nøgle](https://developers.google.com/custom-search/v1/introduction) + en [søgemaskine (cx)](https://programmablesearchengine.google.com/) sat til "søg hele nettet". Gratis niveau: **100 søgninger/dag**.

Hver scanning bruger som standard **3 søgninger** (justér med `SCAN_QUERIES`, 1–6).

**Kapacitet & hvordan man strækker gratis niveauet:**
- Sæt `SCAN_QUERIES=1` → 1 søgning/scan → **op til ~2.000 (Brave) / ~3.000 (Google) scanninger/md gratis** (færre resultater pr. scan).
- **Cache:** samme mærke scannet igen inden for 6 timer koster 0 søgninger.
- Sæt **begge** nøgler (Brave + Google) → de gratis niveauer lægges sammen (~5.000/md).
- Skal det bruges i stor skala: betalt niveau er billigt (~5–20 kr pr. 1.000 søgninger). Eller lad **hver virksomhed hoste sin egen kopi med sin egen gratis nøgle** → hver får sit eget frie forbrug.

### 2) Læg projektet på Vercel
```bash
npm i -g vercel          # hvis du ikke har den
cd varemaerke-vagt
vercel                   # følg guiden → giver et *.vercel.app link
```

### 3) Sæt søge-nøglen som miljøvariabel
**Brave:**
```bash
vercel env add BRAVE_API_KEY      # indsæt din Subscription Token (vælg Production)
vercel --prod
```
**eller Google:**
```bash
vercel env add GOOGLE_CSE_KEY     # din API-nøgle
vercel env add GOOGLE_CSE_CX      # din søgemaskine-id (cx)
vercel --prod
```
Alternativt i browseren: **Vercel → projekt → Settings → Environment Variables**, og redeploy.

### 4) Del linket
Send `https://dit-projekt.vercel.app` til klienten. De skriver deres mærke ind og får rapporten med antal
kopier + muligt tabt omsætning. Skriv evt. en **normalpris** i feltet for et præcist omsætnings-estimat.

> **Uden nøgle** viser siden en besked om at sætte en gratis nøgle op (server-side scraping virker ikke fra
> Vercel — søgemaskinerne blokerer cloud-IP'er, derfor den gratis søge-nøgle). Alt koster stadig 0 kr på gratis niveau.

---

## Test lokalt (valgfrit)
```bash
vercel dev               # kører frontend + /api/scan lokalt på http://localhost:3000
```
(Bruger `SERPAPI_KEY` fra `vercel env pull` eller en lokal `.env`.)

---

## Vil du bruge en gratis søge-API i stedet for SerpAPI?
`api/scan.js` er skrevet til SerpAPI. Google *Programmable Search* (100 gratis/dag) eller Brave Search API
kan bruges i stedet — det kræver en lille ændring i `serp()`-funktionen. Sig til, så tilpasser jeg det.

---

## Vigtigt / ansvar
Rapporten er en **automatisk screening** — et beslutningsstøtte-værktøj, ikke et juridisk bevis.
Bekræft altid ægthed og krænkelse konkret før der tages retslige skridt.
