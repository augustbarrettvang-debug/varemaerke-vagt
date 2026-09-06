# Kom i gang — jeres egen Varemærke-Vagt

Værktøjet søger nettet efter kopier af jeres varemærke eller designværk og samler
fundene i en rapport, I kan printe eller hente som CSV.

I kører **jeres egen kopi** med **jeres egen gratis søge-nøgle**. Nøglen ligger skjult
hos jer, og ingen andre bruger af jeres kvote.

---

## 1) Hent en gratis søge-nøgle (2 min)

Gå til **[serper.dev](https://serper.dev/)** → opret en gratis konto → kopiér jeres
**API-nøgle**. Gratis niveau: **2.500 søgninger, intet betalingskort**.

> Alternativer: Google Programmable Search (100/dag) eller Brave Search API (2.000/md).
> Se `README.md`. Kun Serper slår markedsprisen op via Google Shopping.

## 2) Deploy med ét klik

1. Klik **Deploy**-knappen I har fået (eller den i `README.md`).
2. Log ind på eller opret en gratis **Vercel**-konto.
3. Klik **Deploy**. Efter ca. et minut har I jeres eget link: `jeres-projekt.vercel.app`.

Uden nøgle starter værktøjet i **demo-tilstand** med tydeligt mærkede eksempeldata,
så I kan se hvordan rapporten ser ud med det samme.

## 3) Sæt jeres nøgle og jeres forhandlere

Under **Settings → Environment Variables** i Vercel:

| Variabel | Værdi |
|---|---|
| `SERPER_API_KEY` | nøglen fra trin 1 |
| `ALLOWLIST_DOMAINS` | jeres egne og jeres autoriserede forhandleres domæner, adskilt med komma |

`ALLOWLIST_DOMAINS` er vigtig. Uden den bliver jeres eget websted og jeres egne
forhandlere vurderet på lige fod med alle andre, og rapporten bliver mindre præcis.
Eksempel: `mitfirma.dk,mitfirma.com,vores-forhandler.dk`

Redeploy bagefter, så indstillingerne træder i kraft.

## 4) Brug det

Åbn jeres link → skriv jeres varemærke eller værk (gerne med model, fx “Flowerpot VP7”)
→ tryk **Scan**. I får en rapport med hvad der konkret blev fundet, hvilke sider der
kræver et menneskeligt kig og hvorfor, og et skøn over tabt omsætning med regnestykket
skrevet ud.

---

**Pris:** 0 kr. Både Vercel og Serper har gratis niveauer der dækker normal brug.
Hver scanning bruger som standard 8 søgninger, så de 2.500 gratis rækker til ca. 310
scanninger. Sænk `SCAN_QUERIES` hvis I vil have flere scanninger ud af kvoten.

**Sikkerhed:** søge-nøglen ligger som en skjult miljøvariabel på jeres egen Vercel-konto.
Den vises aldrig i browseren. Endepunktet har et loft pr. IP og pr. døgn, så kvoten ikke
kan tømmes af udefrakommende.

**Vigtigt:** rapporten er en automatisk screening — beslutningsstøtte, ikke juridisk bevis.
Bekræft altid ægthed og krænkelse konkret, før der tages retslige skridt.
