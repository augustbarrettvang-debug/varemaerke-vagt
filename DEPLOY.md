# Kom i gang på 5 minutter — jeres egen Varemærke-Vagt

Dette værktøj søger nettet efter **kopivarer af jeres varemærke** og laver en rapport med
**hvor mange kopier der er** og **muligt tabt omsætning**.

I kører **jeres egen kopi** med **jeres egen gratis søge-nøgle** — ingen delt grænse, alt gratis.
Nøglen ligger skjult hos jer; ingen andre kan bruge af jeres forbrug.

---

## 1) Hent en gratis søge-nøgle (2 min)

Gå til **[brave.com/search/api](https://brave.com/search/api/)** → opret en gratis konto →
kopiér jeres **Subscription Token**.
Gratis niveau: **2.000 søgninger/md** (rigeligt til at overvåge ét varemærke).

> Alternativt kan I bruge Google Programmable Search (100 søgninger/dag gratis) — se `README.md`.

## 2) Deploy med ét klik

Klik på **Deploy**-knappen herunder (eller i det link I har fået):

1. Log ind / opret en gratis **Vercel**-konto.
2. Når den spørger efter **`BRAVE_API_KEY`** → indsæt jeres token fra trin 1.
3. Klik **Deploy**. Efter ~1 minut har I jeres eget link: `jeres-projekt.vercel.app`.

## 3) Brug det

Åbn jeres link → skriv jeres **varemærke** (evt. med model) →
tryk **Scan nettet**. I får en rapport med antal fund, tabt omsætning, en liste over
kopi-shops og et afsnit om, hvorfor det kræver juridisk handling.

---

**Pris:** 0 kr. Både Vercel og Brave har gratis niveauer der dækker normal brug.
**Sikkerhed:** jeres søge-nøgle ligger som en skjult miljøvariabel på jeres egen Vercel-konto —
den vises aldrig i browseren og deles ikke med nogen.

Spørgsmål? Kontakt den der sendte jer værktøjet.
