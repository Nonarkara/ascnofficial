# ASCN Performance Review

A static, agency-facing progress site for the **ASEAN Smart Cities Network (ASCN)**. It synthesizes public ASCN monitoring reports and related documents into a readable review of the network: member cities, the project portfolio, the ASEAN Smart Cities Framework, and the partnership landscape.

The site describes itself as Version 1 — a prototype. It is built from ASEAN source documents and public information only. **It is not an official ASEAN publication.**

## What it is

ASCN was established at the 32nd ASEAN Summit on 28 April 2018. This site is an open performance-review layer over that public record: 38 cities across 11 countries, 134 projects in the latest monitoring cycle, and structured evidence drawn from the annual M&E reports (2022–2025) plus the ASEAN Smart Cities Framework and related materials.

The in-page notice states it is built by **Non Arkaraprasertkul** — Senior Expert, Smart City Promotion, Digital Economy Promotion Agency (DEPA), and ASCN staff contact since 2019. The footer describes the platform as developed by DEPA and the Smart City Thailand Office, under Thailand’s Ministry of Digital Economy and Society, as a contribution to ASCN.

This repository is the agency-facing path. Public analytics for the same evidence base live separately in the Nonarkara.org ecosystem.

## Live site

[https://ascn.depa.or.th](https://ascn.depa.or.th)

ASEAN’s own network page is [asean.org/body/asean-smart-cities-network](https://asean.org/body/asean-smart-cities-network/).

## What’s on the site

Hash-routed views in `index.html` / `app.js`:

| View | Contents |
| --- | --- |
| **Overview** | Network KPIs, the performance-gap argument, and a perspective essay |
| **History** | Timeline from 26 pilot cities to the current roster, chairs, annual meetings |
| **Cities** | Searchable map and profiles for 38 member cities (Leaflet + CARTO tiles) |
| **Projects** | Focus-area mix, implementation status, evidence table, CSV export |
| **Framework** | ASEAN Smart Cities Framework outcomes, systems, enablers, governance |
| **Partners** | Dialogue partners, multilateral funders, and programme networks |

The Cities view also links to related Nonarkara indexes: [SLIC](https://slic.nonarkara.org/) and [SCITI](https://sciti.nonarkara.org/).

## Data

The UI loads JSON over `fetch` (a local HTTP server is required; opening `index.html` as a file will fail):

| File | Role |
| --- | --- |
| `data/ascn-v2-data.json` | Project engine and M&E appendix rows across report cycles |
| `data/ascn-knowledge.json` | Narrative and structured reference (framework, partnerships, stance) |
| `data/ascn-cities.json` | 38 city profiles and coordinates |
| `data/ascn-library.json` | Source library with takeaways |
| `data/ascn-library-full.json` | Extended source catalog (optional; load is allowed to fail) |
| `data/city-stats-merged.json` | Supplementary city stats (optional) |

Dataset metadata notes that rows extracted from PDF appendices may need cleanup where source tables wrap, that some 2022–2023 implementation counts are estimates from published percentages, and that personal contact-list details are not exposed in the public JSON.

## Run locally

No build step and no package manager. Any static file server works.

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

Alternatively:

```bash
npx --yes serve .
```

Runtime assets loaded from CDNs: [Leaflet 1.9.4](https://unpkg.com/leaflet@1.9.4/dist/leaflet.js) (map) and [Inter](https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap) (type). Map tiles come from CARTO / OpenStreetMap.

## Privacy

The site states that it handles public information only, collects no personal data, and does not use tracking cookies or analytics. Names and titles of public officials are treated as public information, consistent with the footer’s PDPA / GDPR note. Data-handling questions can be sent to the address given in that footer.

## License

[MIT](LICENSE)
