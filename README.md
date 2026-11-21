# SpellMaze for the web

A browser port of SpellMaze, the iOS word game (reference: the `spellmaze2020` sources).
It is plain HTML/CSS/JavaScript (ES modules) with no dependencies and no build step.

## Running

The game has to be served over HTTP, because browsers don't let pages opened via `file://` read data files.
Any static web server works:

```sh
cd spellmaze27
python3 -m http.server 8000
# then open http://localhost:8000/
```

The original 320-point-wide phone layout is scaled to fit the browser window, so it works on both desktop and
phones. On tall phone screens the stage grows taller, the skin background fills it, and the original 416 px
layouts are centered vertically. On a phone, "Add to Home Screen" runs it full screen (there is a web app manifest).

## Publishing

The game is published at **https://dror27.github.io/spellmaze27/**, including the SpellMaze More catalog.
`.github/workflows/pages.yml` deploys it with GitHub Actions on every push to `master`, and can also be run
by hand from the Actions tab. It refreshes the `files.txt` listings of the folder roots named in
`data/manifest.txt`, then publishes the site files (`index.html`, `css`, `js`, `assets`, `data`).

To publish catalog changes, rebuild `data/more` with `tools/build_catalog.py`, commit and push.

## Making your own content

[docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) explains how to build word lists, games (sets of levels) and skins
as zip files by hand, and how to import them in the game. Working examples are in [examples/](examples/).

## Players' own words, item settings and updates

* **Your own words:** CONF › Game › Your Own Words lets players type or paste a word list, or name a web address
  to load one from. It's a port of the original's "Custom" language. The list is kept in the browser and plays
  like any other word list.
* **Item settings:** word lists, games, skins and levels can carry a `prefs` list. Their settings show under
  CONF › Game / Game Type / Skin › Settings. See the content guide.
* **Check for updates:** CONF › Advanced Settings › Check For Updates compares installed catalog items against the
  catalog's versions and offers the newer ones.

## Cheat codes

As in the original, codes added to the nickname (`Dror/eal/shaw`) turn on hidden options, including a
self-playing demo mode. They're listed in the game under CONF › Cheat Codes and in
[docs/CHEAT_CODES.md](docs/CHEAT_CODES.md). Scores made with score-affecting cheats aren't sent to the shared board.

## Data: property files and zips

The game content keeps its original format and layout: UUID folders holding `props.plist`
(XML or binary plists), `words.txt`, `images/…`, `symbols/…`, `sounds/…`.

`data/manifest.txt` lists what gets loaded:

```
# a folder root holding <Domain>/<UUID>/... (Domain = Ontologies, Games, Levels, Brands, Catalogs)
Builtin/1329C440-7782-4F3D-A39C-0C9F5E482C38
# zip files, in the catalog layout <UUID>/props.plist ... (domain detected), or <Domain>/<UUID>/...
zips/StraightUpEnglish.zip
# or with an explicit domain
Ontologies:zips/FingerSpellingEnglish.zip
```

* **Folder roots** need a `files.txt` listing, because web servers can't list directories.
  Regenerate it after adding or removing files: `tools/make_filelist.sh data/Builtin/1329C440-7782-4F3D-A39C-0C9F5E482C38`
* **Zips** are read in the browser. The domain is detected from the content: `words.txt` means Ontologies,
  a `levels` array means Games, a `global` dict means Brands, `items` means Catalogs, `prefs-data` means Levels.
* A zip may also hold a single item's files at its root (`props.plist`, `words.txt`, …) when the props have a
  `uuid` key or the zip file is named `<UUID>.zip`.
* Entries later in the manifest take precedence over earlier ones that hold the same UUID.
* Zips can also be **imported from inside the game**: CONF › Import Zip Files. Imported zips are stored in the
  browser (IndexedDB), take precedence over everything else, and can be removed under CONF › Manage Imported Files.

`data/zips/` holds the two premade catalog zips (Straight Up English, Finger Spelling English) as examples.
They are not in the manifest by default.

## More games, game types and skins (the "SpellMaze More" catalog)

The iOS app browsed a static site (`http://sms.drorkessler.com/rc1/more`) from its settings: under
CONF › Game, Game Type and Skin there was a "Get More …" section. The site holds one
`directory.plist` tree per domain (`ontologies/`, `games/`, `brands/`). Directories list sub-directories and
items, and each item is a zip with an icon, a poster, a version and a description.

The port restores this. The site is generated into `data/more/` from the `spellmaze_catalog` repo:

```sh
git clone https://github.com/dror27/spellmaze_catalog /tmp/spellmaze_catalog
tools/build_catalog.py /tmp/spellmaze_catalog data/more
```

`tools/build_catalog.py` is a stdlib-only Python port of the repo's Java/Spring builder (`com.lmi.smcatalog`).
It reads the same Spring bean descriptors (`catalog/desc/*.xml`) and writes the same layout:

* `ontologies/<Language>/…`: 9 languages, plus Flags, Mammals, Finger Spelling and Straight Up variants (35 zips, about 26 MB).
* `games/` and `brands/`: copied from the repo's prebuilt `catalog/other/rc1/more`.

The `More: more` line in `data/manifest.txt` points the game at it. Add more `More: <url>` lines for other
sites, including absolute URLs. A site must allow cross-origin requests (CORS) if it is on another host.
Downloaded items are stored in the browser like imported zips, and are selected right away.

## Shared score board

The original's online score board (`ScoresComm`, the SCORES screen) is back. `scores-server/` holds a small
Cloudflare Worker with a D1 database, which runs on the free tier; see `scores-server/README.md` to deploy it.
The `Scores: <url>` line in `data/manifest.txt` points the game at the server. When a server is configured:
* the main menu shows **SCORES**: six rows of position and nickname. Tap a row for its score; tap the panel to
  cycle through High Scores / Your Scores for the current game, then for all of SpellMaze.
* scores are reported when a level ends (passed or failed), when leaving the game and when opening SCORES.
  Words spelled with score-affecting cheats on don't count on the board.
* CONF has a **Nickname** setting. Players are identified by a random ID kept in the browser.

## What is ported

Everything the built-in content uses, ported line by line from the Objective-C:

* **Built-in content**: English (58k words) and Mammals (with pictures) ontologies, the Generic brand, and
  the *SpellMaze Classic* (12 levels) and *SpellMaze Learning* (18 levels in Learn/Train/Test rows) games.
  As in the original, a game with pictures defaults to *Learning*, and the others to *Classic*.
* **GameLevel / ParametricGameLevel**: the state machine (playing, board full with grace countdown, dispenser done,
  won, lost, paused, suspended), scoring (2^letters × decorations × `score_factor`), "word already used" and
  "too short" checks, jokers (up to 2 per word), hints (word, count, spoken, pulsing pieces, image), image jokers
  (`joker_image_hints`, `joker_image_rewards`), rush words, the Learning game's session-wide learnt words and
  "Play Remaining Words" level end menu, and adding unknown words to a language (asked on the second try, committed
  at the level's end, stored per language).
* **All `prefs-data` keys** handled by ParametricGameLevel, including the lookup order: language
  `game-props-layers` (`[All]` or the level UUID) › user prefs `<level>/<key>` › level `prefs-data` › level props.
  Games defined inside an ontology (`game`, `game-props`), `[Global]` layers, `lang_game`, `lang_tutorial`, and
  levels in a `Levels` domain (or nested inside a game folder) work too.
* **Board logics**: random placement, nudge with snake/spiral/chaos/list orders, fader, cross/diagonal/horizontal/
  vertical/adjacent disablers (progressive or not), apples/coins/bombs (with the wallet: a coin saves a lost
  level, a bomb on its own counts as a word, three apples turn into jokers), rotate and flip.
* **Dispensers**: the auction based symbol dispenser that feeds the letters bringing the most words closest to
  completion, its timing curves (board fullness, progress, game speed), and the joker probability series.
* **Dictionary engine**: the CSet "words that can be formed from these letters" index, re-implemented with bitsets.
* **UI**: main menu (piece words, wave animation, language icons), level selector (board formulas, cell labels and
  headings, passed/exhausted check marks), game view (dispenser cell, board, score panel with progress bars, wallet,
  play/pause and hint buttons, pause curtain, hint polaroid), splash panels, action sheets, navigation bar, and
  settings. The brand skin is applied: colors, piece overlay, corner radius, background, decorator images.
* **Sound and speech**: the original sound effects (converted from AIFF to WAV) and the Web Speech API in place of
  eSpeak (voice chosen from the ontology's `voice-language`). Word sounds from `sounds/<WORD>.mp3` are played when present.
* **Persistence**: preferences, unlocked/passed levels and scores live in `localStorage`; the wallet and learnt
  words live in `sessionStorage` (the original kept them in memory only).

## Left out, as agreed

Tcl scripting (`script` levels and `=` formulas), the store (purchases, billing codes,
promotions, "check for updates"), Facebook, multiple player identities, and the other domain games beyond what the data drives.

## Differences from the iOS build

* The 2020 build passed float preferences through `performSelector:withObject:`, which loses them on arm64
  (`dispenser_tick_period`, `score_factor`, `dispenser_joker_prob`, …). The port applies them as intended, like the
  2009/2010 builds did.
* A few obvious bugs were fixed rather than ported: the reversed button mapping of the level end menu, the
  decoration candidate filtering loop, and the weighted random decoration pick.
* The original's letter grouping for 3-letter boards/words (`StringsLanguage groupChars`) dropped the middle
  letter when the first and last were equal, so words like DAD, MOM, EYE were never hinted or counted as being
  on the board (they could still be spelled). The port counts them.
* `lang_tutorial` with a page number uses that page (the original's branch was inverted). No built-in level uses it.
* Splash panels use the original custom black panel (2020 had switched to system alerts). Their button text
  ("Next Level", "Try Again") is shown at the bottom. Tap anywhere on the panel to continue.
* Additions for desktop play: **keyboard control**. Type letters to select pieces, Enter ends the word, Backspace
  removes the last letter, Esc clears the word, Space asks for a hint, P pauses (when the level allows it).
  The game also suspends itself while the browser tab is hidden.
* Settings are reduced to what is meaningful in a browser: sound, speech, game (ontology), speed, game type, skin,
  data import, reset, and the original cheats.

## Code map

| File | Port of |
|---|---|
| `js/folders.js` | Folders (domain/UUID folders, zips, IndexedDB imports) |
| `js/plist.js`, `js/zip.js` | plist (XML + binary) and zip readers |
| `js/prefs.js` | UserPrefs, UUIDPrefs, preference layers |
| `js/language.js` | StringsLanguage, SymbolAlphabet, LanguageManager |
| `js/bitset.js` | CSet / CSetWrapper |
| `js/board.js` | GridBoard, CompoundBoard (board formulas), Cell, views |
| `js/piece.js` | SymbolPiece, SymbolPieceView, piece decorators |
| `js/logic.js` | GameBoardLogic classes, board orders, CrossPieceDisabler |
| `js/dispenser.js` | piece/symbol dispensers, auction classes |
| `js/gamelevel.js` | GameLevel, ParametricGameLevel |
| `js/sequence.js` | GameLevelSequence, GameManager, PassedLevelEndMenu |
| `js/scores.js`, `js/wallet.js` | ScoresDatabase, Wallet |
| `js/brand.js`, `js/sound.js` | Brand/BrandManager, SoundTheme/TextSpeaker |
| `js/ui/*` | view controllers and widgets |

## License

GPL v3. See `LICENSE`.
