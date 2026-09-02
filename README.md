<p align="center">
  <img src="docs/hero-banner.png" alt="Manga illustration: young civic observers in a hall look out through open doors onto a sunlit Southeast Asian plaza. Above them, a decorative map, shields, and connecting lines." />
</p>

<p align="center"><em>Hero banner for this repository. The map, shields, and connecting lines in the upper band are illustration only — a drawn “HUD,” not a live dashboard and not data from this repo.</em></p>

# ASCN Performance Review

A static, agency-facing prototype that lays the **ASEAN Smart Cities Network (ASCN)** public record open: 38 cities, 11 countries, 134 projects in the latest monitoring cycle, and the framework the network already published.

The site asks a question the annual reports do not: **how is the network performing against its own goals?** It is Version 1 — a prototype built from public ASEAN source documents. It is **not an official ASEAN publication.**

Live prototype: [ascn.depa.or.th](https://ascn.depa.or.th)  
ASCN’s own page (ASEAN Secretariat): [asean.org/our-communities/asean-smart-cities-network](https://asean.org/our-communities/asean-smart-cities-network/)  
Independent public analytics (sibling workbench): [ascn.nonarkara.org](https://ascn.nonarkara.org)

---

## What this is

ASCN was established at the 32nd ASEAN Summit on 28 April 2018. This repository is a **browser-only observatory** over that public record: member cities, the project portfolio extracted from monitoring-and-evaluation (M&E) appendices, the ASEAN Smart Cities Framework, and the partnership landscape.

Six hash-routed views in `index.html` / `app.js`:

| View | What you see |
| --- | --- |
| **Overview** | Network KPIs, the performance-gap argument, a published 2021 perspective essay |
| **History** | 26 pilot cities → current roster, chairs and shepherds, annual meetings |
| **Cities** | Searchable map and profiles for 38 members (Leaflet + CARTO tiles) |
| **Projects** | Focus-area mix, implementation status, evidence table, CSV export |
| **Framework** | Strategic outcomes, urban systems, enablers, six focus areas, governance |
| **Partners** | Dialogue partners, multilateral funders, programme networks — as described in public documents |

The Cities view also points to related independent indexes in the same author’s public ecosystem: [SLIC](https://slic.nonarkara.org/) (Southeast Asian liveability / competitiveness) and [SCITI](https://sciti.nonarkara.org/) (Smart City Thailand Index). Those are separate sites, not ASEAN products.

This GitHub repository is the **agency-facing path**. The GitHub description names it an agency-facing progress prototype and points public analytics to `ascn.nonarkara.org`. GitHub Pages is not enabled here.

---

## Philosophy

The knowledge layer in this repo states the stance in one line: **read the market, respect the behaviour, choose for yourselves.**

ASCN’s founding frame — from the Concept Note and the 2018 Framework — is people-first, with technology as an enabler, through an inclusive approach that respects human rights and fundamental freedoms. The Framework is a **non-binding guide**. The network coordinates; it does not command. Cities write their own action plans. That is why a public, reviewable record matters more than a borrowed template.

This prototype exists so that judgement can be evidence-based: a discerning region, not a captive market. The footer’s own mission is a living record of what is being built, what is working, and what is not — so member cities, researchers, and the public can read the same numbers.

It is a first iteration. The data model, city profiles, project table, and essay are meant to grow. They are not a finished official portal.

---

## Ethical use

### Official versus independent — what this repo actually says

Read the site’s own words; do not upgrade them.

| Claim in this repository | What it means | What it does **not** mean |
| --- | --- | --- |
| Footer: *“Not an official ASEAN publication.”* | This app is **not** issued by the ASEAN Secretariat or by ASCN as a body. | It is not ASEAN’s communications channel, not the network’s mandate, and not an ASEAN-endorsed product. |
| Site notice: *“Official site: ascn.depa.or.th”* | That is the URL this prototype gives for **itself**. | It is not ASEAN’s official network page (that remains on [asean.org](https://asean.org/our-communities/asean-smart-cities-network/)). |
| Repo name `ascnofficial` | Distinguishes this **agency-facing** prototype from the independent public workbench. | The name is not a certificate from ASEAN, DEPA, or MDES that this GitHub copy is “the official ASCN.” |
| Built by **Non Arkaraprasertkul** — Senior Expert, Smart City Promotion, DEPA; ASCN staff contact since 2019 | Named authorship and a professional role stated on the page. | Personal GitHub (`Nonarkara`) is not a DEPA or ASEAN Secretariat organisation account. |
| Footer: developed by **DEPA** and the **Smart City Thailand Office**, under **MDES**, as a contribution to ASCN | How the prototype attributes its Thai-agency framing. | Not a claim that the ASEAN Secretariat, MDES, or DEPA have published *this git repository*, signed the JSON, or endorsed every fork. |
| Logos of ASEAN, DEPA, MDES, Smart City Thailand | Institutional marks used on the prototype page. | Display is not an endorsement of this repo, of forks, or of downstream analytics. |
| Footer: *“In collaboration with”* Axiom and ReTL | A credit line on the prototype. | Not a product endorsement, partnership contract, or permission to speak in those names. |

The ASEAN Smart Cities Network is real. This website is a **prototype contribution** that synthesises **already-public** documents. Keep those two facts in the same sentence.

### Rules for using and forking

- **Do not impersonate ASEAN.** Forks, mirrors, and deployments must not present themselves as the ASEAN Secretariat, as “official ASCN,” or as an ASEAN publication. Keep the footer’s disclaimer or an equally clear equivalent.
- **Do not invent secrets or credentials.** This app has no backend, no API keys, and no `.env` requirements. `.gitignore` excludes `.env` as a precaution. Do not add, request, or publish credentials this project does not use.
- **Public information only.** The site states that it collects no personal data, stores none, and does not use tracking cookies or analytics. Dataset metadata says personal contact-list details are **not** exposed in the public JSON. Do not add private addresses, phones, or correspondence. Confidential mail belongs on official ASEAN Secretariat channels, as the footer already says.
- **Names of public officials** appear only as role designations in public documents (and, in unused/legacy script, as bibliographic titles). Treat them as public-capacity information consistent with the footer’s PDPA / GDPR note — not as a license to scrape or republish withheld contact lists.
- **Do not treat the hero HUD as data.** The banner’s map and shields are manga. Live geography is the Leaflet map, fed by `data/ascn-cities.json`.
- **Cite the sources.** Project rows and KPIs are a synthesis of public M&E PDFs and related ASEAN pages. The PDFs themselves are **not** committed here (`raw_pdfs_committed: false`). Link back to asean.org originals when you republish figures.
- **Mind the caveats** in `data/ascn-v2-data.json` metadata: PDF appendix rows can wrap and need cleanup; some 2022–2023 implementation counts are rounded estimates from published percentages.
- **Do not use this work to fabricate affiliation** with ASCN, DEPA, MDES, ASEAN, Axiom, ReTL, or member cities. The unused integrity notes in `app.js` exist because false ASCN-adjacent claims are a real problem; do not add to that problem.

Questions about data handling, as given in the footer: [nonsmartcity@gmail.com](mailto:nonsmartcity@gmail.com).

---

## How it works

No framework, no bundler, no package manager. The browser loads three files and then `fetch`es JSON.

```
index.html          shell, six views, site notice, footer
styles.css          layout and type (Inter from Google Fonts)
app.js              hash router, map, tables, CSV export
data/
  ascn-v2-data.json       project engine + M&E appendix rows
  ascn-knowledge.json     narrative, framework, stance, partnerships
  ascn-cities.json        38 profiles and coordinates
  ascn-library.json       source library with takeaways
  ascn-library-full.json  extended catalog (optional; load may fail)
  city-stats-merged.json  supplementary stats (optional; load may fail)
logos/              ASEAN, DEPA, MDES, Smart City Thailand, Axiom, ReTL marks
docs/hero-banner.png      README illustration only
```

`app.js` boots by loading the JSON files above, then renders the tab in `location.hash` (`#overview`, `#history`, `#cities`, `#projects`, `#framework`, `#partners`). Opening `index.html` as a `file://` URL will fail because `fetch` needs HTTP.

Runtime from CDNs: [Leaflet 1.9.4](https://unpkg.com/leaflet@1.9.4/dist/leaflet.js) (SRI hashes in `index.html`) and [Inter](https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap). Map tiles: CARTO / OpenStreetMap.

Ceremony photographs referenced under `Photos/` are **not** in this git tree. Local and forked copies will show broken images for those figures until the files are supplied separately. That is a gap in the committed tree, not a hidden asset.

---

## How to run / fork

### Run locally

Any static file server. From the repo root:

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

Alternatively:

```bash
npx --yes serve .
```

No install, no build, no environment variables.

### Fork without misrepresenting it

1. Fork or clone this repository.
2. Serve it as static files (GitHub Pages, any object store, any static host).
3. Keep the **not an official ASEAN publication** notice visible.
4. Do not copy ASEAN, DEPA, MDES, or partner logos onto a site that claims those institutions published your fork unless they actually did.
5. If you change the JSON, keep `metadata.notes` (or equivalent) so readers can still see extraction limits.
6. Point your own live URL honestly. The “official site” line in `index.html` refers to **this** prototype’s deployment, not to ASEAN.

There is nothing to configure and nothing to leak. If a tutorial asks you for an ASCN API key, a DEPA secret, or an ASEAN token for this repo, it is wrong.

---

## License

The software and documentation in this repository are [MIT](LICENSE), Copyright (c) 2026 Non Arkaraprasertkul.

That license covers **this code and the authored JSON/docs**. It does not transfer ASEAN, DEPA, MDES, or third-party trademark rights, and it does not make a fork official. Source PDFs remain with their publishers. Logos in `logos/` are institutional marks displayed by the prototype; reuse them only if you have the right to.
