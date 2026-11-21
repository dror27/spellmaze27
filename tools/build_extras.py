#!/usr/bin/env python3
"""
SpellMaze - build the hand-made content in content/ into the "SpellMaze More" catalog site (data/more).

content/<domain>/                    domain: ontologies, games or brands
    category.plist                   the catalog category: name, comment, uuid, folder (e.g. "New")
    <item>/item.plist                the catalog entry: name, comment, version, filename, uuid
                                     optional: embed-game (a folder in content/games: the word list then
                                     carries that game as its "game-props"), publish (false: not listed)
    <item>/icon.png, poster.png      the catalog icon (64x64) and poster
    <item>/<UUID>/...                the item itself, exactly as it goes into the zip

For every domain this writes <site>/<domain>/<folder>/ (zips, icons, posters, directory.plist) and adds the
category to <site>/<domain>/directory.plist. Run it again after tools/build_catalog.py, which rewrites
ontologies/.

usage: tools/build_extras.py [content dir] [site dir]       (defaults: content data/more)
"""

import io, os, plistlib, sys, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CONTENT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'content'))
SITE = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'data', 'more'))
DOMAINS = {'ontologies': 'Ontologies', 'games': 'Games', 'brands': 'Brands'}


def load(path):
    with open(path, 'rb') as f:
        return plistlib.load(f)


def dump(obj):
    return plistlib.dumps(obj, fmt=plistlib.FMT_XML, sort_keys=False)


def item_uuid_folder(item_dir):
    for name in os.listdir(item_dir):
        if os.path.isdir(os.path.join(item_dir, name)) and len(name) == 36 and name.count('-') == 4:
            return name
    raise SystemExit(f'no <UUID> folder in {item_dir}')


def game_props(name):
    d = os.path.join(CONTENT, 'games', name)
    uuid = item_uuid_folder(d)
    g = load(os.path.join(d, uuid, 'props.plist'))
    g.setdefault('uuid', uuid)
    return g


def build_zip(item_dir, uuid, props):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        base = os.path.join(item_dir, uuid)
        for root, _, files in os.walk(base):
            for fn in sorted(files):
                if fn in ('.DS_Store',) or fn.startswith('._'):
                    continue
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, item_dir).replace(os.sep, '/')
                if rel == f'{uuid}/props.plist':
                    z.writestr(rel, dump(props))
                else:
                    z.write(full, rel)
    return buf.getvalue()


def main():
    for dom_dir, domain in DOMAINS.items():
        src = os.path.join(CONTENT, dom_dir)
        if not os.path.isdir(src):
            continue
        cat = load(os.path.join(src, 'category.plist'))
        folder = cat.get('folder', 'New')
        out = os.path.join(SITE, dom_dir, folder)
        os.makedirs(out, exist_ok=True)
        entries = []
        for name in sorted(os.listdir(src)):
            item_dir = os.path.join(src, name)
            if not os.path.isfile(os.path.join(item_dir, 'item.plist')):
                continue
            info = load(os.path.join(item_dir, 'item.plist'))
            if info.get('publish', True) is False:
                continue
            uuid = item_uuid_folder(item_dir)
            props = load(os.path.join(item_dir, uuid, 'props.plist'))
            if info.get('embed-game'):
                props['game-props'] = game_props(info['embed-game'])
            fn = info.get('filename', name)
            with open(os.path.join(out, fn + '.zip'), 'wb') as f:
                f.write(build_zip(item_dir, uuid, props))
            entry = {'type': 'item', 'uuid': info.get('uuid', uuid), 'version': info.get('version', 1.0),
                     'name': info.get('name', props.get('name', name)), 'comment': info.get('comment', '')}
            for kind, suffix, key in (('icon.png', '_item_icon.png', 'item-icon'), ('poster.png', '_item_poster.png', 'icon')):
                p = os.path.join(item_dir, kind)
                if os.path.exists(p):
                    with open(p, 'rb') as a, open(os.path.join(out, fn + suffix), 'wb') as b:
                        b.write(a.read())
                    entry[key] = fn + suffix
            entry.update({'domain': domain, 'url': fn + '.zip', 'leading-uuid': uuid})
            entries.append(entry)
            print(f'  {dom_dir}/{folder}/{fn}.zip')
        with open(os.path.join(out, 'directory.plist'), 'wb') as f:
            f.write(dump({'name': cat['name'], 'comment': cat.get('comment', ''), 'items': entries}))
        # list the category first in the domain's top directory
        top_path = os.path.join(SITE, dom_dir, 'directory.plist')
        top = load(top_path) if os.path.exists(top_path) else {'name': domain, 'items': []}
        items = [i for i in top.get('items', []) if i.get('url') != f'{folder}/directory.plist']
        cat_entry = {'type': 'directory', 'uuid': cat['uuid'], 'version': cat.get('version', 1.0), 'name': cat['name'],
                     'comment': cat.get('comment', ''), 'url': f'{folder}/directory.plist'}
        if entries and 'item-icon' in entries[0]:
            cat_entry['item-icon'] = f'{folder}/{entries[0]["item-icon"]}'
        top['items'] = [cat_entry] + items
        with open(top_path, 'wb') as f:
            f.write(dump(top))
        print(f'{dom_dir}: {len(entries)} items in "{cat["name"]}"')


if __name__ == '__main__':
    main()
