# SpellMaze cheat codes

SpellMaze has hidden options for testing, practicing and showing the game off. As in the original iOS game,
you turn them on by adding **codes to your nickname**, each one after a `/`:

```
Dror/eal/shaw
```

Here the nickname is "Dror", and the codes `eal` (enable all levels) and `shaw` (show hints at will) are on.

* Set the nickname under CONF › **Nickname**. CONF opens from the (i) button on the main menu.
* Codes take effect at the next level you start. Remove a code from the nickname to turn it off again.
* The codes are never shown: the score board only ever displays the part before the first `/`.
* CONF › **Cheat Codes** lists all the codes in the game and shows which ones are on.
* Each cheat can also be switched on without touching the nickname, under CONF › Advanced Settings › **Cheats**.

## Gameplay codes

| Code | Name | What it does |
|---|---|---|
| `eal` | Enable All Levels | every level of every game is unlocked |
| `rwil` | Repeat Words In Level | a word can be used again in the same level |
| `ppaw` | Play/Pause At Will | every level gets a pause button |
| `shaw` | Show Hints At Will | every level gets a hint button |
| `lem` | Level End Menu | every passed level offers "Play Remaining Words" |
| `dad` | Disable All Decorations | no bombs, coins or apples on the letters |
| `sls` | Speak Letter Spelling | spoken hints spell the word out: "fox, F. O. X. fox" |
| `wc` | Wide Cells | levels that don't set their own board get half as many columns, with twice as wide tiles. All built-in levels set their own board, so it only shows in custom levels |
| `oih` | Old Image Hints | picture hints use the original polaroid look, with a wide white bottom margin |
| `thm1` | Text Hint Mode 1 | for word lists with texts: hints and found words show the word's text (up to 30 characters) in the score panel instead of a pop-up panel |
| `thm2` | Text Hint Mode 2 | with `thm1`: the hint shows only the text, not the word, so you have to guess it |

## Autorun (demo) codes

| Code | Name | What it does |
|---|---|---|
| `ar` | Autorun | the game plays itself: it finds a word, spells it tile by tile and goes on to the next level. Help and result panels close by themselves |
| `arll` | Autorun Level Loop | with `ar`: replays the same level instead of moving on |
| `argl` | Autorun Game Loop | with `ar`: after the last level, starts again from the first |
| `aras` | Autorun Accumulate Score | with `ar`: the self-played words count toward the score and the wallet (otherwise autorun scores nothing) |

`Demo/ar/argl` makes an endless self-playing demo, for a kiosk or a screen in the background.

## Codes of the original that the web version doesn't have

These controlled developer and store screens of the iOS app. They are accepted, but do nothing:

| Code | Was |
|---|---|
| `hdc` | developer menu ("has developer credentials") |
| `fsb`, `prb` | file system and purchase record browsers |
| `agts` | the Game Type setting. The web version always shows it |
| `acs` | a promotional catalog setting |
| `rtfs` | "Reset to Factory Settings". The web version always offers it under CONF › Advanced |
| `idv` | download regardless of version |
| `rc0d` | the release candidate 0 download site |
| `aha`, `ams` | "talk to HAL" and magazine experiments |
| `uasa`, `ufsa` | which App Store to use |

## Cheats and the shared score board

While any of `eal`, `rwil`, `ppaw`, `shaw` or `lem` is on, or `ar` together with `aras`, **your scores are not sent to
the shared score board.** You can still open SCORES and see it; its panel says "not sent: cheats on" and lists the
codes. Points you make in the meantime still count in your own game, but **never reach the board**: the
board only counts words spelled, and levels passed, with those cheats off. The other codes don't make scoring easier and
don't hold scores back.
