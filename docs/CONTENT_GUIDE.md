# Making your own SpellMaze content

This guide shows how to make your own **word lists, games (sets of levels) and skins** for SpellMaze, pack each
one as a `.zip` file by hand, and load it into the game in your browser. You don't need to install anything,
fork the repository or write code: a text editor and a zip tool are enough.

Looking for inspiration? See [IDEAS.md](IDEAS.md), and the complete items in [`content/`](../content/) (Kids, Spelling Bee, Shapes, Prime Time, High Contrast …). Working examples of everything described here are in [`examples/`](../examples/): the source folders and
ready-made zips you can import right away. Download the zips from
https://github.com/dror27/spellmaze27/tree/master/examples/zips (open a file, then use the download button).
The game itself is at https://dror27.github.io/spellmaze27/.

---

## 1. The three kinds of content

| What it is | Where you pick it in the game | Folder kind in the zip |
|---|---|---|
| A **word list**: the words you spell, optionally with pictures, sounds and short texts | CONF › **Game** | `Ontologies` |
| A **game**: a set of levels and their rules | CONF › **Game Type** | `Games` |
| A **skin**: colors, tile shapes and background images | CONF › **Skin** | `Brands` |
| *(advanced)* a **single level** that replaces one level of a game | — | `Levels` |

To open CONF, tap the round **(i)** button at the bottom right of the main menu, or the SpellMaze tile in the bottom row.

A word list and a game go together. A word list can name the game it should be played with. If it doesn't, the
player's CONF › Game Type choice is used, and if that is left at "[Default]", SpellMaze picks one: the
*Learning* game for word lists with pictures, the *Classic* game otherwise.

## 2. What goes in a zip

Every item is **one folder named after a UUID** (see the next section). The folder holds a file called
`props.plist`, which describes the item, plus any other files the item needs. The zip contains that folder:

```
Fruits.zip
└── E77E50F5-13A2-46E6-AC2D-6CCDBF3CEDA0/      ← the folder name is the item's UUID
    ├── props.plist                            ← required: describes the item
    ├── words.txt                              ← word lists only
    ├── icon.png
    └── images/
        ├── APPLE.jpg
        └── BANANA.jpg
```

SpellMaze works out the kind of item from the contents: a `words.txt` makes it a word list, a `levels` entry a game,
a `global` entry a skin, and a `prefs-data` entry a single level. One zip may hold several items, each in its
own UUID folder.

## 3. UUIDs: the identity of every item

A **UUID** (Universally Unique IDentifier) is a 36-character code like this:

```
E77E50F5-13A2-46E6-AC2D-6CCDBF3CEDA0
```

It is 32 hexadecimal digits (`0`–`9`, `A`–`F`) in groups of **8-4-4-4-12**, separated by dashes. SpellMaze
uses UUIDs to tell items apart, to remember which levels a player has unlocked and passed, and to keep high scores.

### How to make one

Never type a UUID by hand or make one up (`11111111-…`, `A1B2C3D4-…`). Always let a tool generate it, so it is
random and can't clash with anyone else's:

| On | How |
|---|---|
| **macOS** | Open Terminal and type `uuidgen`. Each run prints a new UUID. |
| **Linux** | `uuidgen`, or `cat /proc/sys/kernel/random/uuid` |
| **Windows** | Open PowerShell and type `[guid]::NewGuid().ToString().ToUpper()` |
| **Any browser** | Open the developer console (F12) and type `crypto.randomUUID().toUpperCase()` |
| **Online** | A generator site such as https://www.uuidgenerator.net/ (choose "Version 4") |

### The rules

1. **Every item gets its own new UUID.** That includes the word list, the game, the skin, and **each level inside a game**.
   A game with 10 levels needs 11 UUIDs.
2. **Write it in upper case**, exactly as the generator prints it (with `uuidgen`) or upper-cased (`A`–`F`).
3. **The folder name and the references must match exactly.** A level's UUID appears both in the game's `levels`
   list and as the key of that level's settings. A word list that names its game uses the game's UUID.
4. **Don't copy UUIDs from the examples** into your own items. Make new ones; otherwise your item replaces the example.
5. **Keep the UUID when you release an update.** Importing a zip whose item has the same UUID replaces the old
   version, and the players keep their progress. A new UUID makes it a different item, and progress starts over.

## 4. Writing `props.plist`

`props.plist` is an Apple "property list": a small XML file of named values. Any plain-text editor works
(TextEdit in plain-text mode, Notepad, VS Code, …). Save it as UTF-8. Every file has this frame:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>name</key>
	<string>Fruits</string>
	<!-- more keys and values here -->
</dict>
</plist>
```

Inside a `<dict>`, each `<key>` is followed by its value:

| Value | Written as |
|---|---|
| text | `<string>Spell the names of fruits</string>` |
| whole number | `<integer>3</integer>` |
| decimal number | `<real>0.5</real>` |
| yes / no | `<true/>` or `<false/>` |
| list | `<array> <string>…</string> <string>…</string> </array>` |
| group of named values | `<dict> <key>…</key> … </dict>` |

Common mistakes:
* `&`, `<` and `>` inside text must be written `&amp;`, `&lt;` and `&gt;`.
* Every `<dict>`, `<array>` and `<string>` must be closed again.
* Key names are case sensitive (`name`, not `Name`).

To check a file on a Mac, run `plutil -lint props.plist` in Terminal. Xcode can also open and edit plists.
You can also copy an example's `props.plist` and change it.

## 5. Word lists

### Files

| File | Required | What it is |
|---|---|---|
| `props.plist` | yes | name, description and options (below) |
| `words.txt` | yes | the words, one per line |
| an icon, e.g. `icon.png` | no | shown in CONF › Game and on the main menu; a square image of about 64–200 pixels |
| `images/<WORD>.jpg` | no | a picture for a word, e.g. `images/APPLE.jpg` |
| `sounds/<WORD>.mp3` | no | a recording of the word, played instead of the computer voice |
| `background.jpg` | no | a background picture, shown when a level sets `show_language_background` |

### `words.txt`

```
# lines starting with # are comments
APPLE
BANANA|Banana|A long yellow fruit.
CHERRY
```

* **One word per line.** Words are converted to upper case unless `all-caps` is set to `false`.
* A word can't contain spaces unless the list sets `split-words`, in which case each line is split into separate words.
  Use a `-` in multi-word names (`SEA-LION`).
* Any alphabet works: Hebrew, Russian, Arabic, accented letters, and so on. The letter tiles are taken from the words themselves.
* **Picture and sound file names** are the word exactly as it appears after upper-casing: `images/SEA-LION.jpg`.
* **Texts:** when the list sets a `text-delimiter` (here `|`), a line can be `WORD|title|text` or `WORD|text`.
  When the player spells the word, a panel shows the title and text.

### Keys for a word list's `props.plist`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | text | the UUID | the name shown in the game |
| `description` | text | | one line shown under the name |
| `item-icon` | text | | file name of the icon, e.g. `icon.png` |
| `voice-language` | text | `en` | the language for the computer voice, e.g. `en`, `es`, `fr`, `de`, `he`, `ar`, `en-GB` |
| `game` | text | | the UUID of the game to play this list with (see section 1) |
| `game-props` | dict | | a whole game written right here instead of in a separate zip (the same keys as a game's `props.plist`) |
| `all-caps` | yes/no | yes | convert the words to upper case |
| `split-words` | yes/no | no | split lines on spaces into several words |
| `text-delimiter` | text | | a single character separating word, title and text in `words.txt` |
| `allow-add-word` | yes/no | yes | let players add a missing word (they are offered this after trying it twice) |
| `tutorial-words` | list of text | | words used by levels that set `lang_tutorial` |
| `image-aspect` | text | `3x3` | how many board cells a picture hint covers, as `<columns>x<rows>` |
| `words` | dict | | per-word extras: `<key>WORD</key><dict><key>image</key><string>images/other.jpg</string></dict>` (also `sound`) |
| `skin` | dict | | letter pictures: a `skin` dict holding an `images` dict with `symbols_A` = `symbols/A.png` and so on, and a `props` dict with `show-symbol-text` (yes/no) to show the letter on the picture. See the Finger Spelling example below |

## 6. Games (sets of levels)

A game's `props.plist` lists its levels in order, and holds each level's settings under the level's UUID:

```xml
<dict>
	<key>name</key>          <string>My First Game</string>
	<key>description</key>   <string>Two easy levels</string>
	<key>levels</key>
	<array>
		<string>EBCD65AA-EDEE-49CD-8BDD-2C09716EABA1</string>
		<string>F8BD4120-EC2A-4DCE-8171-22FC67118B68</string>
	</array>

	<key>EBCD65AA-EDEE-49CD-8BDD-2C09716EABA1</key>
	<dict>
		<key>name</key>          <string>Warm Up</string>
		<key>description</key>   <string>Slow, 3 letters or more</string>
		<key>prefs-data</key>
		<dict>
			<key>valid_min_word_size</key>   <integer>3</integer>
			<key>dispenser_tick_period</key> <real>2</real>
		</dict>
	</dict>
	<!-- … the second level … -->
</dict>
```

### Keys for the game

| Key | Type | Meaning |
|---|---|---|
| `name`, `description` | text | shown in CONF › Game Type and on the level selector |
| `levels` | list of UUIDs | the levels, in order |
| *(a level's UUID)* | dict | that level's settings (below) |
| `all-levels-open` | yes/no | unlock every level from the start (normally only the first one is unlocked) |
| `levels-open` | list of numbers | extra levels unlocked from the start, counted from 0 (e.g. `0, 6, 12`) |
| `help-splash` | dict | the help panel of the level selector (see "Help panels") |
| `show-levels-onces-on-play` | yes/no | show the level selector the first time PLAY is tapped |
| `hide-disabled-levels` | yes/no | hide locked levels on the level selector instead of dimming them |
| `board-formula` | text | a custom layout for the level selector (see "Board formulas") |
| `cell-labels` | list of text | the labels of the level tiles on the level selector (default `1`, `2`, `3`, …) |
| `cell-headings` | list of dicts | extra heading tiles on the level selector: `label`, `name`, `description` |

### Keys for each level

| Key | Type | Meaning |
|---|---|---|
| `name`, `description` | text | shown when the level starts and on the level selector |
| `prefs-data` | dict | the level's rules (the reference below) |
| `help-splash` | dict | a help panel for the level |
| `open-levels` | list of UUIDs | levels that are unlocked when this one is passed (the next level is always unlocked) |

### Help panels

```xml
<key>help-splash</key>
<dict>
	<key>title</key>      <string>Welcome!</string>
	<key>text</key>       <string>Tap the letters of a word in order.
-
Tap the last letter again to finish the word.</string>
	<key>auto-show</key>  <true/>
</dict>
```

`auto-show` shows the panel before the level starts. Without it, the panel shows when the player taps **Help**.
A line holding only `-` starts a new paragraph. The text `[%remaining]` is replaced by the number of words
the player hasn't used yet.

### Level rules (`prefs-data`) reference

Leave a key out to use its default. Times are in seconds.

**Words and scoring**

| Key | Type | Default | Meaning |
|---|---|---|---|
| `valid_min_word_size` | number | 0 | the shortest word that counts (0: any) |
| `score_factor` | decimal | 1 | multiplies the score (a word scores 2 to the power of its letters) |
| `allow_dup_words` | yes/no | no | the same word may be used again in the level |
| `allow_add_words` | yes/no | yes | offer to add a word that isn't in the list |
| `auto_valid_word_wipe` | yes/no | no | clear the whole board after every word (for "one word" blitz levels) |

**The letters (dispenser)**

| Key | Type | Default | Meaning |
|---|---|---|---|
| `dispenser_symbol_count` | number | 100 | how many letters the level deals; the level is passed when they are all used up |
| `dispenser_tick_period` | decimal | 1.5 | seconds between letters. It speeds up while the board is empty or the player does well. 0.01 fills the board at once |
| `dispenser_joker_prob` | decimal | 0 | the share of letters dealt as `?` jokers, which stand for any letter (e.g. 0.025) |
| `dispenser_fullness_factor` | decimal | 0.75 | how much faster letters come while the board is empty (0: no change) |
| `dispenser_progress_factor` | decimal | 0.25 | how much faster letters come as the player finds words (0: no change) |
| `rush_words` | number | 1 | the number of words whose letters are dealt first, fast, to get the player going |
| `rush_min_word_size`, `rush_max_word_size` | number | 3, 4 | the length of those words |

**Dealing whole words** (instead of random letters)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `dispenser_word_by_word` | yes/no | no | deal the word list's words one after the other, letter by letter (good for learning a short list) |
| `dispenser_reorder` | yes/no | no | with word by word: shuffle the words first |
| `dispenser_scramble` | yes/no | no | with word by word: deal each word's letters in a scrambled order |
| `logic_line` | yes/no | no | with word by word: place each word's letters in a row (the third row), and pause until it is spelled |
| `logic_word_end_pause` | yes/no | no | with word by word and `logic_random`: pause after each word |

`dispenser_tick_period` sets the time between letters (0.5 by default here), and a short pause comes before each new word.

**The board**

| Key | Type | Default | Meaning |
|---|---|---|---|
| `board_override` | yes/no | no | use the board below instead of the standard 6 by 6 |
| `board_formula` | text | | the board: `0 0 60 60 5 5` for 5 by 5, or several lines for any shape (see "Board formulas") |
| `hint_board_formula` | text | | an extra board that holds picture jokers (see "The hint board") |
| `game_over_grace` | number | 15 | once the board is full, seconds left to find a word before the level is lost (0: never lost) |
| `game_won_grace` | number | 15 | after the last letter, seconds to use the letters still on the board |

**Board effects** (switch them on with `<true/>`)

| Key | Extra keys | Effect |
|---|---|---|
| `logic_random` | | letters land on random free cells. This is already the normal behavior; the built-in games set it anyway, and it does no harm |
| `logic_nudge` | `logic_board_order`: `Spiral`, `Chaos` or (default) snake | each new letter pushes the others along a path |
| `logic_fader` | `logic_fader_pace` (8), `logic_fader_valid_resets` (yes) | letters fade away over `pace` seconds; a found word renews them |
| `logic_disabler` | `logic_disabler_pattern`: 0 cross, 1 diagonal, 2 row, 3 column, 4 adjacent; `logic_disabler_progressive` (no) | after the first letter, only letters on its cross (etc.) can be used; with progressive, each letter must be next to the previous one |
| `logic_decorator` | `logic_decorator_bomb_prob`, `_coin_prob`, `_apple_prob` | letters carry bombs (clear the neighbours), coins (pause the game) or apples. **When switched on, give all three probabilities**; a missing one defaults to 0.05–0.1 |
| `logic_viewtrans` | `logic_viewtrans_slices`: 4 turns a quarter, 2 a half, 0 mirrors | the board rotates (or flips) after each word |

**Hints and pictures**

| Key | Type | Default | Meaning |
|---|---|---|---|
| `allow_show_hint` | yes/no | no | show a hint button on the score panel |
| `allow_play_pause` | yes/no | no | show a pause button on the score panel |
| `show_hint_delay` | number | 6 | seconds without a move before a hint is given automatically |
| `between_hint_delay` | number | 7 | seconds between automatic hints |
| `show_hint_word` | yes/no | yes | show the hinted word |
| `speak_hint_word` | yes/no | yes | say the hinted word aloud |
| `show_hint_pieces` | yes/no | no | make the hinted word's letters jump, one by one |
| `show_hint_image` | yes/no | yes | show the hinted word's picture |
| `hint_max_word_size` | number | 6 | prefer hints no longer than this (0: any length) |
| `joker_image_hints` | yes/no | no | put a hint picture on the board as a joker tile that only counts for that word |
| `joker_image_rewards` | yes/no | no | show a found word's picture on the board for a moment |
| `show_reward_image` | yes/no | yes | show the picture of a word the player found |
| `show_reward_text` | yes/no | yes | show the text of a word the player found (see `text-delimiter`) |
| `speak_reward_word` | yes/no | yes | say a found word aloud |
| `level_end_menu` | yes/no | no | when passed, offer "Play Remaining Words" to continue with the words not used yet |
| `show_language_background` | yes/no | no | show the word list's `background.jpg` behind the board |

**Using other words**

| Key | Meaning |
|---|---|
| `lang_game` | the UUID of another word list to use in this level, or `[List]` together with `lang_word_list` (the words themselves, one per line) |
| `lang_tutorial` | `<true/>`: use only the word list's `tutorial-words` (good for a first level). Listing a picture list's words with pictures there gives levels where every hint and every found word shows a picture, as in the *Kids* game |

The two built-in games use all of these. Their `props.plist` files are a good source of ideas: *Classic* is
`data/Builtin/1329C440-7782-4F3D-A39C-0C9F5E482C38/Games/6F161DAF-6349-2774-9B9B-A9C5DA906534/props.plist`
in the repository, and *Learning* is the `1A767972-…` folder next to it.

### Board formulas: building boards of any shape

A board formula describes a board as **one or more rectangles**. Each line is one rectangle (a "part"):

```
x  y  cell-width  cell-height  columns  rows  [grid-color]
```

* **`columns` and `rows`** give the part's size in cells.
* **`x` and `y`** place the part's top-left corner. **`cell-width` and `cell-height`** give its cell size.
  All four use the same unit, where **60 is one standard cell**. The usual playing area is 6 × 6 standard cells,
  so it spans 0 to 360 in each direction. Negative values and values past 360 place a part outside it.
* **`grid-color`** (optional) colors the part's grid lines: `red,green,blue,opacity` with values from 0 to 1,
  e.g. `1.0,0.8,0.3,1.0`, or `0,0,0,0` for no lines.
* Empty lines and lines starting with `#` are ignored. Spaces at the start of a line don't matter, so a formula
  can be written over several indented lines inside one `<string>`.

**A single line** is a plain rectangular board. It always fills the whole playing area: `0 0 60 60 4 4` is a
4 × 4 board with big tiles, and `0 0 60 60 6 6` is 6 × 6. Only `columns` and `rows` matter then.

**Several lines** make one board out of several parts, each drawn where its line says. That builds any shape
made of rectangles. Letters fall into the free cells of all the parts. This is the plus-shaped board of the
*Plus* level in the examples:

```xml
<key>board_override</key>
<true/>
<key>board_formula</key>
<string>
	120   0 60 60 2 2 0.4,0.7,1.0,1.0
	  0 120 60 60 6 2 1.0,0.8,0.3,1.0
	120 240 60 60 2 2 0.4,0.7,1.0,1.0
</string>
```

```
        ┌──┬──┐                 top arm:     2 × 2 at (120, 0)
        ├──┼──┤
  ┌──┬──┼──┼──┼──┬──┐           middle bar:  6 × 2 at (0, 120)
  ├──┼──┼──┼──┼──┼──┤
  └──┴──┼──┼──┼──┴──┘
        ├──┼──┤                 bottom arm:  2 × 2 at (120, 240)
        └──┴──┘
```

More shapes, all in the same 0–360 area:

```
# an L
0   0 60 60 2 6
120 240 60 60 4 2

# a staircase
0     0 60 60 2 2
120 120 60 60 2 2
240 240 60 60 2 2

# two islands with bigger cells (cell size 90 = 1.5 standard cells)
0     0 90 90 2 2
180 180 90 90 2 2
```

Things to know about boards made of several parts:
* **Parts shouldn't overlap**: overlapping cells are drawn on top of each other.
* **Each part counts its own rows and columns.** The cross and adjacency rules of `logic_disabler` compare positions
  part by part, so on a multi-part board they can behave unexpectedly. A bomb only clears neighbours in its own part.
  The original game behaved the same way.
* `logic_nudge` (spiral, chaos, snake) needs a single rectangle. On a multi-part board it is ignored.
* Picture hints shown in the corner (when `joker_image_hints` is off) use a fixed area at the bottom left.

#### The hint board (`hint_board_formula`)

A level may have a second, separate board for **picture jokers**. With `joker_image_hints` and
`joker_image_rewards`, the hint and reward pictures land there instead of on the playing board, so they don't
take up its cells. Its formula has the same form, and its position is relative to the top-left corner of the
playing area. For example, `0 -65 60 60 1 1 1,1,1,1` is one cell with a white grid, just above the board at the
left. Like any joker, a picture tile there can be used in a word.

#### Formulas kept in a file or on the web

Instead of the formula itself, `board_formula` and `hint_board_formula` may hold:
* `!<file>`: the formula is read from that file in the **current skin's** folder, e.g. `!boards/plus.txt`
* `http://…` or `https://…`: the formula is downloaded from that address (the server must allow it, through CORS)

The original game could also compute a formula with a Tcl script (`=…`). The web version doesn't support that.

#### The level selector's formula

A game's `board-formula` (with a dash) uses the same form to lay out the **level selector**: one tile per level
in order, then the `cell-headings` tiles. The *Learning* game uses three rows of six levels and four headings:

```
0  60  60 60 6 1                     # Learn levels 1-6
0  180 60 60 6 1                     # Train levels
0  300 60 60 6 1                     # Test levels
90  15 180 45 1 1 0,0,0,0            # heading tiles: wide cells, no grid lines
90 135 180 45 1 1 0,0,0,0
90 255 180 45 1 1 0,0,0,0
30 -60 300 45 1 1 0,0,0,0            # the title above the board
```

### Settings for players (`prefs`)

A word list, game, skin or single level can offer **its own settings**: switches, choices and sliders that players
change under CONF. In CONF › Game, Game Type or Skin they appear in a **Settings** section. Add a `prefs` list to
the item's `props.plist`. It holds sections, and each section holds `items`:

```xml
<key>prefs</key>
<array>
	<dict>
		<key>title</key>     <string>Display</string>
		<key>comment</key>   <string>How the letters look</string>
		<key>items</key>
		<array>
			<dict>
				<key>label</key>  <string>Show Letters</string>
				<key>type</key>   <string>Boolean</string>
				<key>key</key>    <string>skin/props/show-symbol-text</string>
				<key>value</key>  <true/>
			</dict>
		</array>
	</dict>
</array>
```

A setting is stored for the item under its `key`, and the item reads it in place of its own value. For a level,
the key is one of the level rules (`prefs-data`) above, so a setting can let the player choose, for example, the
level's speed:
`<key>key</key><string>dispenser_tick_period</string>` with type `Float`. For a word list, any key under its
props works, such as `skin/props/show-symbol-text`.

| `type` | Shows | Extra keys |
|---|---|---|
| `Boolean` | a switch | `value`: the default |
| `String` | a text field | `value`: the default |
| `MultiValue` | a list to choose from | `titles` and `values` (two lists of the same length), `value`: the default |
| `Integer` | a slider of whole numbers | `min-value` (0), `max-value` (10), `value`, `show-value` |
| `Float` | a slider | `min-value` (0), `max-value` (1), `value`, `log-scale`, `show-value` |
| `Domain` | a list of installed items of a kind | `domain` (e.g. `Ontologies`), `prefix-titles`/`prefix-values`, `suffix-titles`/`suffix-values` for extra entries |
| `Page` | a row opening a sub-page | `value`: a list of sections, like `prefs` itself |

The Finger Spelling word list (`data/zips/FingerSpellingEnglish.zip`) has a "Show Letters" setting.

### Versions and updates

Items downloaded from a catalog site keep the catalog's `version`. CONF › Advanced Settings › **Check For Updates**
compares them against the catalog and offers the newer ones. To publish an update on a catalog site, keep the
item's UUID and raise its `version` in the site's `directory.plist`. Zips imported by hand have no version; import
the new zip again to update them.

## 7. Single levels (advanced)

A level may also be its own item: a UUID folder whose `props.plist` holds the level's `name`, `description`,
`prefs-data` and `help-splash`. If a game lists that UUID in `levels`, the separate level is used instead of the
definition inside the game. That lets you fix or replace one level without re-releasing the whole game.

## 8. Skins

A skin's `props.plist` has a `name`, a `description` and a `global` › `skin` group, with three parts:
`colors`, `images` and `props`.

```xml
<key>global</key>
<dict>
	<key>skin</key>
	<dict>
		<key>colors</key>  <dict> … </dict>
		<key>images</key>  <dict> … </dict>
		<key>props</key>   <dict> … </dict>
	</dict>
</dict>
```

**Colors** are written either as six (or eight, with transparency) hexadecimal digits, `1E90FF`, or as four decimals
from 0 to 1 for red, green, blue and opacity, `0.0,0.15,0.3,1.0`.

| `colors` key | What it colors |
|---|---|
| `background` | screen backgrounds and the score panel |
| `grid` | board lines and panel borders |
| `text` | text on the score panel and in panels |
| `joker-custom-color`, `joker-custom-text-color` | the `?` joker tiles |
| `piece-custom-color-0`, `-1`, … and `piece-custom-text-color-0`, … | the letter tiles (see below) |
| `splash-background` | the background of help and message panels |
| `score-progress1`, `score-progress2`, `score-progress3` | the progress bars: letters dealt, board full, level ending |
| `hint-polaroid-frame` | the frame around picture hints |
| `checked-decorator` | the check mark on passed levels |

**Letter tile colors:** set `piece-custom-colors` (in `props`) to the number of colors you define, `N`. Each tile
then uses color number (the sum of the character codes of its label + `piece-colors-offset`) modulo `N`.
For example, with 26 colors and `piece-colors-offset` 39, `A` (code 65) gets color 0, `B` color 1, and so on. Without custom colors, SpellMaze uses its
built-in set of 26.

| `images` key | Image |
|---|---|
| `background` | the background of every screen (stretched to the screen; 320×512 works well) |
| `background-menu`, `background-levels`, `background-game`, `background-scores` | a background for one screen only |
| `piece-overlay` | an image laid over every tile, e.g. a gloss (stretched to the tile; transparent PNG) |
| `piece-mask` | a black and white image cutting the tiles' shape: black parts show, white parts are cut away |
| `pause-curtain` | the picture covering the board while paused (320×460) |
| `decorator-bomb`, `decorator-coin`, `decorator-apple` | the 24×24 decoration icons |
| `button-hint`, `button-play`, `button-pause` | the 24×24 score panel buttons |
| `symbols_A`, `symbols_B`, … | a picture for a letter, in every word list |
| `directory-item-icon` | the skin's icon in CONF › Skin |

Image values are file names inside the skin folder, e.g. `images/background.png`.

| `props` key | Type | Default | Meaning |
|---|---|---|---|
| `piece-corner-radius` | decimal | 0 | how round the tiles are: 0 square, 0.1 slightly rounded, 0.5 circles |
| `piece-custom-colors` | number | 0 | how many `piece-custom-color-…` colors there are |
| `piece-colors-offset` | number | 0 | added before picking a color (see above) |
| `piece-custom-masks`, `piece-custom-overlays` | yes/no | no | use `piece-custom-mask-<n>` / `piece-custom-overlay-<n>` images per tile color |
| `show-symbols-left-counter` | yes/no | no | show the number of letters left next to the next-letter tile |
| `cell-margin` | number | 4 | the space around each tile, in pixels |
| `grid-line-width` | decimal | 1 | the width of the board lines |
| `show-symbol-color` | yes/no | yes | keep the tile color behind letter pictures |
| `show-symbol-text` | yes/no | yes | show the letter on letter pictures |

The built-in skin is a complete example:
`data/Builtin/1329C440-7782-4F3D-A39C-0C9F5E482C38/Brands/86D1C949-9B24-C931-E5B5-BBAF94B06901/props.plist`.
In that file, keys starting with `OUT-` are switched off; rename a key to switch it on.

## 9. Making the zip

Zip **the UUID folder itself**, not the files inside it:

* **macOS:** in Finder, right-click the UUID folder and choose **Compress**. Rename the zip if you like
  (`Fruits.zip`). From Terminal: `cd` into the folder that contains the UUID folder, then run `zip -r Fruits.zip E77E50F5-…`.
* **Windows:** right-click the UUID folder › **Send to › Compressed (zipped) folder**.
* **Linux:** `zip -r Fruits.zip E77E50F5-…`

Opening the zip should show the UUID folder at its top. macOS's hidden `__MACOSX` and `.DS_Store` files are ignored.

## 10. Loading it into the game

1. Open the game, then **CONF** (the (i) button) › **Import Zip Files …**, and choose your zip. You can choose several at once.
2. A panel lists what was found in each zip, for example `Fruits (Ontologies)`. If it says "no SpellMaze content
   found", check the folder layout (section 2) and `props.plist` (section 4).
3. Select it: CONF › **Game** for a word list, CONF › **Game Type** for a game, CONF › **Skin** for a skin.
   Tap **Done** and play.

Things to know:
* **Imported zips live in that browser only.** They stay there across visits, but another browser or device needs
  its own import. Send the zip to other people and they import it the same way.
* **Updating:** import the new version of the same zip file, keeping the UUIDs. It replaces the old one.
* **Removing:** CONF › **Manage Imported Files**. Tap a file to delete it. Problems found while loading are listed there too.
* **Testing many levels:** CONF › Advanced Settings › Cheats › **Enable All Levels** opens every level.
  Switch it off again before playing for real.
* If something doesn't appear, the most common causes are:
  * a UUID typo, where the game's `levels` list and the level's key differ
  * an XML mistake in `props.plist`
  * a picture whose file name doesn't match its word in upper case

## 11. The examples

[`examples/`](../examples/) holds the three items described in this guide, as folders and as ready zips
(`examples/zips/`):

| Example | Kind | Shows |
|---|---|---|
| `fruits/` | word list | words, pictures, a word text (BANANA), an icon, the voice language, and naming its game |
| `my-first-game/` | game | three levels: a slow level with a help panel, a spiral level with bombs and jokers, and a plus-shaped board |
| `ocean-skin/` | skin | colors, three custom tile colors, round tiles, a gloss overlay |

`data/zips/FingerSpellingEnglish.zip` in the repository is a real word list with letter pictures (`skin` › `images` › `symbols_…`).

Import all three, select **Fruits** under CONF › Game, and it plays with *My First Game*. Select **Ocean** under
CONF › Skin to see the skin. To start your own item, copy an example folder and **give it a new UUID**
(section 3): rename the folder, and update every place the old UUID appears.
