# Privacy notice — CleanAir Companion

Short version: **no accounts, no tracking, no stored locations, no analytics.**
The only third party that ever sees anything about your household is the AI
provider, and it sees categories and numbers — never who or where you are.

## What is processed

| Data                | Where it lives                                                              | Lifetime                                                         |
| ------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| City search text    | Request body to `/api/geocode`, then Open-Meteo                             | In memory for the request only                                   |
| Coordinates         | Rounded to 2 decimals (~1.1 km), sent to Open-Meteo and used by `/api/plan` | In memory; a 10-minute server cache keyed by rounded coordinates |
| Quick profile       | React state in your browser tab                                             | Until you refresh or close the tab                               |
| Air data            | Server cache (10 min) and your tab                                          | Not personal data                                                |
| Rate-limit identity | SHA-256 hash of your IP, truncated, in Upstash with a short TTL             | Seconds to minutes; the raw IP is never stored                   |
| AI prompt           | Built server-side from band values and enum choices                         | Sent to the AI provider, not stored by us                        |

## What we never do

- No accounts, no sign-in, no cookies for tracking, no analytics or pixels.
- No database. There is nothing to breach because nothing is stored.
- No location in logs. Log lines contain only route, status, duration and an
  outcome tag.
- No personal data or free text in the AI prompt. The city name is **not** sent
  to the model — it is display-only in your browser.
- No third-party scripts, fonts or CDNs. Fonts are self-hosted at build time.
- No `dangerouslySetInnerHTML` anywhere in the codebase.

## Local regional context

Location tailoring does not add a data flow. The app maps the **already rounded**
coordinates (2 decimals, ~1.1 km) to a coarse region in `src/lib/regional.ts`
using a static bounding-box table, and the calendar month to a season. That table
returns reviewed guidance (winter inversion months, the late-October–November
crop-residue burning window, typical heating fuel, monsoon and pre-monsoon
dust).

- The lookup runs **entirely in your browser** (or in a unit test). It is not an
  API call and it is not logged.
- No region, season, city name or coordinate is sent to the AI provider. The
  prompt builder does not import the regional layer, and
  `tests/unit/regional.test.ts` fails if it ever does.
- The regional notes are always labelled as general regional guidance, with the
  assumption stated next to them, never as a measurement for your street.

## The AI provider caveat, stated plainly

Plans are generated on our server by a third-party large-language-model provider
using a free tier. **Free tiers commonly reserve the right to use submitted
inputs to improve their products.** That is exactly why the prompt contains only:

- the severity band and the numbers from the public air-quality data,
- your enumerations (e.g. "apartment", "bus", "low budget", "2 adults, 1 child"),
- and never your city, coordinates, name, device, or anything you typed.

If you would rather not send anything to a model at all, set `LLM_DISABLED=true`
on the deployment (or ask the operator to). The deterministic plan is complete
on its own and is clearly labelled when it is used.

## Your controls

- Refresh or close the tab to destroy your profile.
- Decline the geolocation prompt; city search works identically.
- Use low-bandwidth mode to skip charts.
- Nothing is shared unless you press "Copy text", "WhatsApp" or "Print", and
  those buttons only include the plan, never your location.

## Children

The app is intended for adults planning for a household. It does not create
profiles for individuals, does not ask for names or ages of specific people, and
collects no data about children beyond a household count that stays in your tab.

## Contact

This is a demonstration project. If you deploy it, publish a contact address
here and in `README.md`.
