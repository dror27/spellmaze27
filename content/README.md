# SpellMaze content made for the web version

The sources of the items in the "SpellMaze 2026" category of the SpellMaze More catalog. Players get them in
the game under CONF › Game / Game Type / Skin › Get More › SpellMaze More › SpellMaze 2026.

| Folder | Kind | What it is |
|---|---|---|
| `ontologies/phonics` | word list | 88 three-letter words for early readers, 16 with pictures (its `tutorial-words`); carries the *Kids* game, whose first three levels play the picture words only, so every hint and found word shows its picture |
| `ontologies/spelling-bee-grade-1`, `-3`, `-5` | word lists | 30 spelling words per grade, each with its meaning; carry the *Spelling Bee* game |
| `ontologies/equations` | word list | 404 true equations with numbers up to 12 (`+`, `-`, `×`); plays with any game |
| `ontologies/primes` | word list | every prime from 11 to 99,991; carries the *Prime Time* game |
| `ontologies/hiragana` | word list | 98 everyday Japanese words in hiragana, each with its reading (romaji) and meaning, spoken in Japanese; carries the *Kana* game |
| `ontologies/katakana` | word list | 55 loanwords in katakana (coffee, taxi, pizza …), with readings and meanings; carries the *Kana* game |
| `games/kids` | game | 6 gentle levels: big tiles, slow letters, hints, nobody loses |
| `games/spelling-bee` | game | 4 levels: hear each word, then spell it (in order, scrambled, shuffled, fast) |
| `games/shapes` | game | 8 levels on boards of different shapes (plus, ring, staircase, diamond, hourglass, islands, towers, checkers) |
| `games/spin-cycle` | game | 6 levels where the board turns: with every new letter, upside down, with every tap, after a mistake, like a clock, and flipping like a mirror |
| `games/kana` | game | 5 gentle levels for the kana lists; shipped inside them only (not listed separately) |
| `games/prime-time` | game | 5 levels of prime numbers; shipped inside the Primes word list only (not listed separately) |
| `brands/high-contrast` | skin | color-blind safe Okabe-Ito tile colors on black, with a strong grid |

Each item folder holds:
* `<UUID>/`, the item exactly as it goes into the zip (see [the content guide](../docs/CONTENT_GUIDE.md))
* `item.plist`, the catalog entry: `name`, `comment`, `version`, `filename`, `uuid`; optionally `embed-game`
  (the folder name of a game in `games/` to carry inside the word list as its `game-props`, so one download
  is enough), and `publish` (`false` keeps it out of the catalog)
* `icon.png` (64×64) and `poster.png`, shown in the catalog

`category.plist` in each domain folder names the catalog category.

## Building

```sh
tools/build_extras.py          # writes data/more/<domain>/New/ and lists the category in the catalog
```

`tools/build_catalog.py`, which rebuilds the whole catalog from the spellmaze_catalog repository, runs it at the end.
Commit and push: the site redeploys with the new zips.

To update an item, edit it here, raise `version` in its `item.plist`, and rebuild. Players then see the update
under CONF › Advanced Settings › Check For Updates.

The pictures, icons and posters were drawn for this project (simple generated drawings), and may be reused freely.
