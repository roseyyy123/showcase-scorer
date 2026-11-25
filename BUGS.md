# Bug log

New reports from testers now arrive through the app's Report a problem button. A daily Claude task triages them into a Notion bug tracker with the priorities below. This file covers bugs found before that.

Priorities:
- **P0**: wrong score with no warning, lost data, or a crash.
- **P1**: a field misread so it looks right but isn't, or something that blocks saving.
- **P2**: a field left blank but clearly flagged, or a degraded fallback.
- **P3**: cosmetic or wording.

Release rule: no open P0 or P1. Every number that feeds the score is either correct or left blank and flagged.

Test run: 273 app checks and 15 server checks, all passing (see `tests/results.md`). Screenshot fixtures: 22 Pokémon screens and 5 buddy searches.
On the 155 graded screenshot fields: 145 correct, 10 left blank or flagged for you, 0 silently wrong, 3 false alarms (a correct value flagged anyway).

## Fixed during testing

| ID | Pri | Found by | What happened | Expected | Fix |
|---|---|---|---|---|---|
| BUG-001 | P2 | Flow test, online reader | Tapping "Online AI" jumped back to "On this phone" until consent was given | The choice stays selected while the consent box is shown | The radio buttons now show the chosen setting, not the setting in effect |
| BUG-002 | P1 | Accuracy tests | A reader setting change (automatic page layout) dropped CP, height and weight on 4 of 4 screenshots | Same accuracy as the earlier experiment | Back to single-block mode for full screens |
| BUG-003 | P1 | Accuracy tests, Pumpkaboo appraisal | The battery level "82" was taken as the CP, so the field looked filled in but was wrong | CP 245 | The CP search skips the phone's status bar |
| BUG-004 | P2 | Accuracy tests, Brambleghast and Kingambit | CP (white text on a light background), weight and catch date not found | Read, or left blank and flagged | A targeted second read for each missing field: CP from the top band with white text isolated, height and weight from the stats row, the date from the message box |
| BUG-005 | P1 | Code review before the test run | The new catch-date code put the month in the year slot | 2026-10-17 | Fixed the field order (the game shows M/D/YYYY) |
| BUG-006 | P2 | Accuracy tests, buddy2-5 search | Grafaiai skipped: its CP sat below the crop window | Grafaiai 1259 | Each tile is tried in the usual spot, then a little lower |
| BUG-007 | P1 | Accuracy tests | First attempt at BUG-006 (one taller window) misread 2 CPs (1023 read as 1028, 1482 as 182) and broke the buddy flow | No regressions | Replaced by the two-try approach above; full suite re-run |
| BUG-008 | P3 | Visual check | The heading font never loaded (stylesheet link missing) | Barlow Condensed headings | Added the font link. Offline, the system font is used instead |
| BUG-009 | P3 | Visual check | "Check the height size tag" showed even when there was no tag and none was missed | Only warn when it matters | Warns only when a badge was seen but unreadable, or for Pumpkaboo and Gourgeist |
| BUG-010 | P1 | Visual check, risk review | On-device reading of a Pumpkaboo or Gourgeist with a missed size tag silently picks the wrong size form and score | A warning | The status line always tells you to check the tag for these species (covered by a test) |
| BUG-026 | P2 | First live triage run (the setup test report) | IV bars weren't read from any JPEG: full-size high quality, or the 1000 px copies attached to problem reports. iPhone screenshots are PNG so it never showed on the test phone, but re-encoded screenshots (some Android phones, messaging apps) got no IVs, and the triage task couldn't reproduce IVs | IVs read from PNG and JPEG alike | Colour tolerances allow for JPEG shifts, and the "bar sits on the white card" check looks a few pixels further out. All 26 screenshots now read correctly as PNG, full-size JPEG and 1000 px JPEG (78/78). 44 JPEG checks added to the suite. Version 1.3.1 |
| BUG-024 | P1 | Device test (iPhone 17 Pro Max, iOS 26.6.2, Cloudflare Pages) | Adding screenshots of several Pokémon at once combined them into one record: Mewtwo got Reshiram's IVs and XL tag, and Conkeldurr's name as its nickname | One result per Pokémon | Each screenshot is read separately. A page and an appraisal are paired only if they're the same species with the same CP, or the same height and weight; otherwise they get separate cards. A "Screenshots read" list shows one scored card per Pokémon (Ready or N to check), with **Save ready** for the rest. Covered by 7 new tests |
| BUG-025 | P3 | Multi-search test | The same Kubfu appeared twice in the buddy list (CP 747 in buddy3-5, 700 in buddy5) | One entry, Best Buddy | A range-search entry and an exact-level entry for the same species within 8% CP are merged, keeping the exact level and both CPs |
| BUG-013 | P1 | Round 2 screenshots (6 of 18) | Size badges were missed when gold (screens labeled TALLEST, SHORTEST and so on). XXL lost its 178 points with no warning | Read XXL, XL, XS, XXS in any badge color | The badge finder accepts teal or gold |
| BUG-014 | P1 | Round 2 (Togekiss, Reshiram, Victreebel) | Heights partly hidden or split were read as wrong numbers: 7, 117, 19 | Correct, or blank and flagged | The reader collects alternative readings; the app keeps only a height the species can have (0.47× average up to its XXL limit), otherwise blanks and flags it |
| BUG-015 | P1 | Round 2 (Mr. Mime, Samurott) | Galarian Mr. Mime and Hisuian Samurott scored as their regular forms (different average sizes) | Galarian / Hisuian | The reader reads the type labels (with the leader's hair cut out) and the app picks the form whose types match |
| BUG-016 | P1 | Round 2 (Dialga XXS) | Origin Forme Dialga scored as regular Dialga | Origin Forme | When types can't separate forms, the app keeps the form whose height fits the size tag. When neither tag nor types decide (the shadow Dialga), it asks you to check the form |
| BUG-017 | P1 | Risk review | A missed size tag gave no warning at all | Warn when the height doesn't match the tag | The app checks height ÷ average against the tag's size class and flags any mismatch, including "no tag, but this height should have one" |
| BUG-018 | P1 | Round 2 (Togekiss) | With the height hidden, the size tag (also hidden) wasn't flagged | Flag it | When the height is blank and no tag was read, the tag is flagged too |
| BUG-019 | P2 | Round 2 (5 screens) | CP misread when partly covered (Toucannon 372, Victreebel 28, Snorlax 47, Mewtwo 10) | Correct, or flagged | Takes the longest reading; flags a CP under 100, a missing CP, or readings that disagree on digit count. CP doesn't change the score |
| BUG-020 | P2 | buddy5 search | Conkeldurr's shiny sparkle read as a digit (22490), and the "(4)" count was missed | 2490; count 4 | Drops a 5th digit (CP never reaches 10,000); looser count pattern |
| BUG-021 | P2 | Round 2 searches | Kubfu shows CP 747 in one search and 700 in another (the current Best Buddy's CP boost), so the buddy list didn't match | Match | Allows a match within 8% when it's the only one of that species |
| BUG-022 | P3 | Round 2 (Togekiss, Slaking) | Nickname showed junk ("LUCKY POKEMON 3"); "Beef96" was missed | Beef96; no junk | Ignores LUCKY/SHADOW lines; accepts low-confidence name lines; takes the species from "This Slaking was caught on…" |
| BUG-023 | P2 | Round 2 metrics | 21 false alarms (correct values flagged), mostly CP | Few enough that warnings stay meaningful | CP and size-tag warnings only fire on real risk: down to 3 |
| BUG-012 | P3 | Design review | A buddy2-5 screenshot was accepted with no comment, though Good Buddies never matter for showcases. Its test fixture also looked canonical | buddy3-5 is the canonical search | The app accepts buddy2 searches but says to search buddy3-5. Tests label buddy2-5 as an extra reading sample only, not part of any flow |
| BUG-011 | P3 | Visual check | "Buddy level Great Buddy came from your buddy list" | Plain wording | "Great Buddy comes from your buddy list." |

## Open (known issues)

| ID | Pri | Issue | Impact | Plan |
|---|---|---|---|---|
| K-1 | P1 risk | All 27 fixtures come from one iPhone screen size, in English, with US dates. 20 of them weren't used for tuning, and the reader had no silent errors on those after the fixes | Other screen sizes (iPhone SE, Pro Max, iPad), Android or other languages may misread. The plausibility checks catch most score-affecting misreads | Add a few screenshots from another device. Treat any silent misread as P1 |
| K-2 | P2 | The on-device reader doesn't detect the Best Buddy medal | The buddy level stays "Not a buddy" unless the buddy list or you set it | Use the buddy list (search buddy5), or the online reader |
| K-3 | P2 | Nicknamed Pokémon: the on-device reader can't tell the species from the picture | The species is left blank and flagged ("looks like a nickname") | Pick the species, or use the online reader |
| K-4 | P2 | Catch dates are read as US M/D/YYYY | A phone set to D/M/YYYY would get day and month swapped (affects sorting only, not the score) | Add a date-format setting, or check against today's date |
| K-5 | P2 | Buddy search entries aren't shown for review before saving | A misread CP means that buddy simply won't match. It fails safe: no level is set, rather than a wrong one | Show the parsed list with an edit option |
| K-6 | P2 | Tested on an iPhone 17 Pro Max via Cloudflare Pages; only BUG-024 found. The new batch screen and buddy multi-upload haven't been tried on the phone yet | Low | Re-run the multi-screenshot test after redeploying |
| K-7 | P2 | The online reader was tested only against a stand-in server. Live Gemini and Workers AI calls are unverified, including the default model name and the Workers AI image format | It may fail on first deploy. The app falls back to on-device reading and says so | Run the deploy checklist in README with a real key |
| K-9 | P2 | Victreebel's 2.19 m isn't read (the XL badge sits right over it) | Height left blank and flagged; you type it in | Try a badge-masked read of the height |
| K-10 | P2 | Forms with the same types and no size tag (e.g. shadow Dialga: regular or Origin) can't be told apart from text | The form is flagged for you to pick | The online reader can tell from the picture |
| K-8 | P3 | Scoring formula and species sizes are community data | Scores are estimates, already labeled as such | Update `species.js` as new species arrive |
