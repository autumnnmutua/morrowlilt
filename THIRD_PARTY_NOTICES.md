# Third-party notices

## Free Dictionary API

- Project: Free Dictionary API
- Service endpoint: `https://api.dictionaryapi.dev/api/v2/entries/en/{term}`
- Source repository: <https://github.com/meetDeveloper/freeDictionaryAPI>
- Repository software license: GNU General Public License v3.0

The project uses the public API as the default replaceable dictionary Provider. It does not vendor or mirror the Provider dataset. Dictionary entries are cached in D1 only after an end-user lookup and only for service reliability.

The API response can include a separate license and source URL for each dictionary entry and pronunciation. Current responses commonly identify lexical data sourced from Wiktionary under CC BY-SA and audio under separate Creative Commons licenses. These response fields, rather than the Provider repository software license, govern the displayed lexical or audio material and must be preserved in the UI.

Before a public or commercial release, re-check the Provider's current operating terms, repository license, per-entry data license, audio license, attribution format and caching permission. If these requirements change, replace or disable the Provider rather than removing attribution.

## Open English WordNet 2025

- Project: Open English WordNet
- Official download: <https://en-word.net/downloads>
- Source repository: <https://github.com/globalwordnet/english-wordnet>
- Data license: Creative Commons Attribution 4.0 International (CC BY 4.0)

The production D1 lexicon is built from the official 2025 WNDB release. It provides a licensed local fallback with nouns, verbs, adjectives, adverbs, senses, examples, synonyms and exception forms. Generated import SQL and downloaded archives remain in the ignored `private/` directory; the repository includes only the schema and reproducible importer. User-visible results preserve the resource name, source URL and license.

## Datamuse API

- Service: Datamuse word-finding and suggestion API
- Documentation: <https://www.datamuse.com/api/>

The Worker uses the `/sug` endpoint only for bounded autocomplete requests and caches suggestions for 24 hours. Local WordNet and search-history suggestions continue when Datamuse is unavailable. Datamuse states that API keys will be required from January 1, 2027; before that date, configure the then-current key mechanism or disable this optional source. Public documentation must retain acknowledgment of Datamuse.

## Cloudflare

The application targets Cloudflare Workers and D1. Product names and documentation belong to Cloudflare, Inc. No Cloudflare software or service credentials are included in this repository.

## Resend

The application can send a daily learning email through the Resend Email API. Resend names, documentation and service belong to Resend, Inc. No API key, recipient address, sender address or account data is included in the repository. Production use is subject to Resend's current terms, sending-domain requirements and acceptable-use rules.

## JavaScript dependencies

Runtime and development dependencies are installed from the lockfile and remain subject to their own licenses. The automated `pnpm license:check` command rejects license expressions that have not been explicitly reviewed. Transitive prebuilt image packages can report LGPL-3.0-or-later alone or combined with Apache-2.0 depending on the host platform; downstream redistributors should review the exact package metadata and obligations for their distribution method.
