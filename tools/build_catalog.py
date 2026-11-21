#!/usr/bin/env python3
"""
SpellMaze catalog builder - a Python port of the Java/Spring builder in the spellmaze_catalog repo
(com.lmi.smcatalog.*). Stdlib only.

It reads the Spring bean descriptors (catalog/desc/smcatalog.xml and the files it imports) and writes the
same static "more" site the iOS app downloaded from (http://sms.drorkessler.com/rc1/more):

    <out>/ontologies/directory.plist            (built from the descriptors)
    <out>/ontologies/<Category>/directory.plist
    <out>/ontologies/<Category>/<Item>.zip       (<leading-uuid>/props.plist, words.txt, images/..., icon)
    <out>/games/...                              (copied from catalog/other/rc1/more/games)
    <out>/brands/...                             (copied from catalog/other/rc1/more/brands)

usage: tools/build_catalog.py <spellmaze_catalog repo dir> [<output dir, default data/more>]
"""

import os
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

# ------------------------------------------------------------------ plist writing (PropsStream)


# the copyright year shown in the catalog descriptions (the descriptors say 2020)
COPYRIGHT_YEAR = '2026'


def with_copyright_year(text):
    return text.replace('Copyright © 2020', 'Copyright © ' + COPYRIGHT_YEAR) if isinstance(text, str) else text


class PropsStream:
    def __init__(self):
        self.lines = []
        self.indent = 0

    def println(self, text):
        self.lines.append('  ' * self.indent + text)

    def open(self):
        self.indent = 0
        self.println('<?xml version="1.0" encoding="UTF-8"?>')
        self.println('<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">')
        self.println('<plist version="1.0">')
        self.indent += 1
        self.println('<dict>')
        self.indent += 1

    def close(self):
        self.indent -= 1
        self.println('</dict>')
        self.indent -= 1
        self.println('</plist>')
        return '\n'.join(self.lines) + '\n'

    def append(self, key, value):
        self.println('<key>%s</key>' % escape(key))
        self.append_object(value)

    def append_object(self, value):
        if isinstance(value, bool):
            self.println('<true/>' if value else '<false/>')
        elif isinstance(value, int):
            self.println('<integer>%d</integer>' % value)
        elif isinstance(value, float):
            self.println('<real>%r</real>' % value)
        elif isinstance(value, RawFile):
            with open(value.path, encoding='utf-8') as f:
                for line in f.read().splitlines():
                    self.println(line)
        elif isinstance(value, str):
            self.println('<string>%s</string>' % escape(with_copyright_year(value).replace('\\n', '\n')))
        elif isinstance(value, list):
            self.println('<array>')
            self.indent += 1
            for v in value:
                self.append_object(v)
            self.indent -= 1
            self.println('</array>')
        elif isinstance(value, dict):
            self.println('<dict>')
            self.indent += 1
            for k, v in value.items():
                if v is not None:
                    self.append(k, v)
            self.indent -= 1
            self.println('</dict>')


class RawFile:
    """a property value of "@path": the file's content is inlined into the plist as is"""
    def __init__(self, path):
        self.path = path

# ------------------------------------------------------------------ builders


def ext(path):
    i = path.rfind('.')
    return path[i + 1:] if i >= 0 else ''


class Bean:
    def __init__(self, base):
        self.base = base        # repo dir (paths in descriptors are relative to it)

    def p(self, path):
        return os.path.join(self.base, path)


class CatalogBuilder(Bean):
    clean = False
    root = None

    def build(self, path, stack):
        if str(self.clean).lower() == 'true' and os.path.isdir(path):
            shutil.rmtree(path)
        os.makedirs(path, exist_ok=True)
        self.root.build(path, stack)


class CatalogEntryBuilder(Bean):
    title = None
    subtitle = None
    filename = None
    uuid = None
    icon = None
    poster = None
    version = '0.0'

    def get_filename(self):
        return self.filename if self.filename is not None else self.title

    def icon_target(self):
        return '%s_%s_icon.%s' % (self.get_filename(), self.get_type(), ext(self.icon))

    def poster_target(self):
        return '%s_%s_poster.%s' % (self.get_filename(), self.get_type(), ext(self.poster))

    def build(self, path, stack):
        if self.icon:
            shutil.copyfile(self.p(self.icon), os.path.join(path, self.folder_component() + self.icon_target()))
        if self.poster:
            shutil.copyfile(self.p(self.poster), os.path.join(path, self.folder_component() + self.poster_target()))

    def build_props_item(self):
        d = {'type': self.get_type(), 'uuid': self.uuid, 'version': self.version, 'name': self.title, 'comment': self.subtitle}
        if self.icon:
            d['item-icon'] = self.folder_component() + self.icon_target()
        if self.poster:
            d['icon'] = self.folder_component() + self.poster_target()
        return d


class CategoryBuilder(CatalogEntryBuilder):
    def __init__(self, base):
        super().__init__(base)
        self.items = []

    def get_type(self):
        return 'directory'

    def folder_component(self):
        return self.get_filename() + '/'

    def build(self, path, stack):
        folder = os.path.join(path, self.get_filename())
        os.makedirs(folder, exist_ok=True)
        super().build(path, stack)
        ps = PropsStream()
        ps.open()
        ps.append('name', self.title)
        ps.append('comment', self.subtitle)
        items = []
        stack.append(self)
        for item in self.items:
            items.append(item.build_props_item())
            item.build(folder, stack)
        stack.pop()
        ps.append('items', items)
        with open(os.path.join(folder, 'directory.plist'), 'w', encoding='utf-8') as f:
            f.write(ps.close())
        print('  directory', os.path.relpath(folder), '(%d items)' % len(items))

    def build_props_item(self):
        d = super().build_props_item()
        d['url'] = self.get_filename() + '/directory.plist'
        return d


class ItemBuilder(CatalogEntryBuilder):
    domain = None
    billingCode = None
    autoBillingCode = False
    content = None
    leadingUuid = None

    def get_type(self):
        return 'item'

    def folder_component(self):
        return ''

    def build(self, path, stack):
        super().build(path, stack)
        if self.content is not None:
            stack.append(self)
            self.content.build(os.path.join(path, self.get_filename() + '.zip'), stack)
            stack.pop()

    def get_billing_code(self):
        if self.billingCode:
            return self.billingCode
        if str(self.autoBillingCode).lower() == 'true':
            return 'com.spellmaze.generic.' + self.uuid
        return None

    def build_props_item(self):
        d = super().build_props_item()
        d['domain'] = self.domain
        d['url'] = self.get_filename() + '.zip'
        if self.leadingUuid:
            d['leading-uuid'] = self.leadingUuid
        bc = self.get_billing_code()
        if bc:
            d['billing-code'] = bc
        return d


class ItemZipPremade(Bean):
    zip = None

    def build(self, path, stack):
        shutil.copyfile(self.p(self.zip), path)
        print('    premade', os.path.basename(path))


class FileColumnWordsProvider(Bean):
    path = None
    column = 0
    toupper = True
    headerLineCount = 0
    minWordSize = 2
    imageColumn = -1

    def fetch(self):
        if hasattr(self, '_words'):
            return
        self._words, self._images = [], {}
        column, imageColumn = int(self.column), int(self.imageColumn)
        toupper = str(self.toupper).lower() != 'false'
        skip = int(self.headerLineCount)
        with open(self.p(self.path), encoding='utf-8') as f:
            for line in f.read().splitlines():
                if skip > 0:
                    skip -= 1
                    continue
                line = line.strip()
                if not line or line[0] == '#':
                    continue
                toks = line.split(',')
                while toks and toks[-1] == '':        # like Java's String.split
                    toks.pop()
                if len(toks) <= column:
                    continue
                word = toks[column].strip()
                if len(word) < int(self.minWordSize):
                    continue
                image = toks[imageColumn].strip() if 0 <= imageColumn < len(toks) else None
                if toupper:
                    word = word.upper()
                    image = image.upper() if image is not None else None
                word = word.replace(' ', '-')
                if image is not None:
                    image = image.replace(' ', '-')
                self._words.append(word)
                if image is not None:
                    self._images[word] = image

    def words_text(self):
        self.fetch()
        return ''.join(w + '\n' for w in self._words)

    def all_words(self):
        self.fetch()
        return self._words

    def image_word(self, word):
        self.fetch()
        return self._images.get(word, word)


class FileWordsProvider(Bean):
    path = None

    def words_text(self):
        with open(self.p(self.path), encoding='utf-8') as f:
            return f.read()


class ItemZipBuilder(Bean):
    words = None
    imagesPath = None
    voiceLanguage = None
    showWordStats = False

    def __init__(self, base):
        super().__init__(base)
        self.copyFolders = {}
        self.additionalProps = {}

    def build(self, path, stack):
        item = stack[-1]
        props_item = item.build_props_item()
        uuid = props_item['leading-uuid']
        ps = PropsStream()
        ps.open()
        ps.append('name', props_item['name'])
        ps.append('description', props_item['comment'].replace('\\n', '\n').split('\n')[0])
        if 'item-icon' in props_item:
            ps.append('item-icon', props_item['item-icon'])
        if self.voiceLanguage:
            ps.append('voice-language', self.voiceLanguage)
        written = set()
        images = 0
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr(uuid + '/words.txt', self.words.words_text())
            meta = {}
            if self.imagesPath and hasattr(self.words, 'all_words'):
                for word in self.words.all_words():
                    image_word = self.words.image_word(word) or word
                    image_path = self.p(os.path.join(self.imagesPath, image_word + '.jpg'))
                    if not os.path.exists(image_path):
                        print('    image missing for:', word)
                        image_path = None
                    if image_word != word:
                        meta[word] = {'image': 'images/' + image_word + '.jpg'}
                    if image_path:
                        name = uuid + '/images/' + image_word + '.jpg'
                        if name not in written:
                            written.add(name)
                            z.write(image_path, name)
                            images += 1
            if meta:
                ps.append('words', meta)
            for k, v in self.additionalProps.items():
                if isinstance(v, str) and v.startswith('@'):
                    ps.append(k, RawFile(self.p(v[1:])))
                else:
                    ps.append(k, v)
            z.writestr(uuid + '/props.plist', ps.close())
            if 'item-icon' in props_item:
                z.write(os.path.join(os.path.dirname(path), props_item['item-icon']), uuid + '/' + props_item['item-icon'])
            for key, folder in self.copyFolders.items():
                for fn in sorted(os.listdir(self.p(folder))):
                    fp = os.path.join(self.p(folder), fn)
                    if os.path.isfile(fp):
                        z.write(fp, uuid + '/' + key + '/' + fn)
        print('    zip', os.path.basename(path), '(%d words%s)' % (
            len(self.words.words_text().splitlines()), ', %d images' % images if images else ''))

# ------------------------------------------------------------------ a tiny Spring bean factory


CLASSES = {
    'com.lmi.smcatalog.build.CatalogBuilder': CatalogBuilder,
    'com.lmi.smcatalog.build.CategoryBuilder': CategoryBuilder,
    'com.lmi.smcatalog.build.ItemBuilder': ItemBuilder,
    'com.lmi.smcatalog.build.ItemZipBuilder': ItemZipBuilder,
    'com.lmi.smcatalog.build.ItemZipPremade': ItemZipPremade,
    'com.lmi.smcatalog.words.FileColumnWordsProvider': FileColumnWordsProvider,
    'com.lmi.smcatalog.words.FileWordsProvider': FileWordsProvider,
}


class BeanFactory:
    def __init__(self, base):
        self.base = base
        self.defs = {}          # id -> element
        self.instances = {}

    def load(self, xml_path):
        root = ET.parse(xml_path).getroot()
        for child in root:
            if child.tag == 'import':
                self.load(os.path.join(os.path.dirname(xml_path), child.get('resource')))
            elif child.tag == 'bean' and child.get('id'):
                self.defs[child.get('id')] = child

    def get(self, bean_id):
        if bean_id not in self.instances:
            self.instances[bean_id] = self.create(self.defs[bean_id])
        return self.instances[bean_id]

    def create(self, el):
        cls = CLASSES.get(el.get('class'))
        if not cls:
            raise SystemExit('unsupported bean class: %s' % el.get('class'))
        obj = cls(self.base)
        for prop in el.findall('property'):
            setattr(obj, prop.get('name'), self.value(prop))
        return obj

    def value(self, el):
        if el.get('value') is not None:
            return el.get('value')
        if el.get('ref') is not None:
            return self.get(el.get('ref'))
        for child in el:
            return self.element_value(child)
        return None

    def element_value(self, el):
        if el.tag == 'bean':
            return self.create(el)
        if el.tag == 'ref':
            return self.get(el.get('bean') or el.get('local'))
        if el.tag == 'value':
            return el.text or ''
        if el.tag == 'list':
            return [self.element_value(c) for c in el]
        if el.tag == 'map':
            d = {}
            for entry in el.findall('entry'):
                if entry.get('value') is not None:
                    d[entry.get('key')] = entry.get('value')
                elif entry.get('value-ref') is not None:
                    d[entry.get('key')] = self.get(entry.get('value-ref'))
                else:
                    d[entry.get('key')] = self.value(entry)
            return d
        if el.tag == 'null':
            return None
        raise SystemExit('unsupported bean element: %s' % el.tag)


def read_properties(path):
    props = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                props[k.strip()] = v.strip()
    return props


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    repo = os.path.abspath(sys.argv[1])
    out = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'data', 'more'))
    props = read_properties(os.path.join(repo, 'smcatalog.properties'))
    factory = BeanFactory(repo)
    factory.load(os.path.join(repo, props['builder.beans']))
    builder = factory.get(props['builder.name'])
    print('building catalog into', out)
    os.makedirs(out, exist_ok=True)
    # the descriptors build the "ontologies" directory tree; clean only that part
    if isinstance(builder, CatalogBuilder):
        builder.clean = False
        target = os.path.join(out, builder.root.get_filename())
        if os.path.isdir(target):
            shutil.rmtree(target)
    builder.build(out, [])
    # the prebuilt games and brands directories
    other = os.path.join(repo, 'catalog', 'other', 'rc1', 'more')
    if os.path.isdir(other):
        for name in sorted(os.listdir(other)):
            src = os.path.join(other, name)
            if os.path.isdir(src):
                dst = os.path.join(out, name)
                if os.path.isdir(dst):
                    shutil.rmtree(dst)
                shutil.copytree(src, dst, ignore=shutil.ignore_patterns('.DS_Store'))
                print('  copied', name)


if __name__ == '__main__':
    main()
