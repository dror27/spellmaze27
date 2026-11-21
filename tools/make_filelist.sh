#!/bin/sh
# SpellMaze - (re)generate the files.txt listing of a data folder root.
#
# A folder root (e.g. data/Builtin/<PROGRAM_UUID>) holds the original layout <Domain>/<UUID>/...
# Web servers can not list directories, so the app reads this listing instead.
#
# usage: tools/make_filelist.sh data/Builtin/1329C440-7782-4F3D-A39C-0C9F5E482C38 [more roots ...]
set -e
for root in "$@"; do
	( cd "$root" && find . -type f ! -name files.txt ! -name .DS_Store ! -name '._*' | sed 's|^\./||' | LC_ALL=C sort > files.txt )
	echo "wrote $root/files.txt ($(wc -l < "$root/files.txt" | tr -d ' ') files)"
done
