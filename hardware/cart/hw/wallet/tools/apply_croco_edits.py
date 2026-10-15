#!/usr/bin/env python3
"""Apply the 'croco_edits' of docs/design/netlist_radio.json to Croco's schematic sheets.

An edit either moves one pin of a Croco part from net 'from' to net 'to', or ({'action': 'dnp'}) marks a part
do-not-populate and off the board. The tool finds the pin's position,
follows the wire from it to the global label or power symbol that names its net, checks that this label is 'from' and that
nothing else hangs on that wire, and renames the label to 'to'. Anything else (no wire, a junction, a label
with another name) is a hard error, so an edit can never silently land on the wrong wire. Idempotent: an
edit whose label already reads 'to' is reported and skipped.

Usage: apply_croco_edits.py PROJECT_DIR NETLIST.json
Verify afterwards with verify/netlist_check.py (exports the Croco netlist and checks every edit).
"""
import glob, json, math, os, re, sys, uuid

EPS = 0.01


def pin_offsets(lib_block):
    """{number: (x, y)} in symbol coordinates (y up) from a lib_symbols entry."""
    res = {}
    for m in re.finditer(r'\(pin \w+ \w+\s*\(at ([-\d.]+) ([-\d.]+)(?: [-\d.]+)?\).*?\(number "([^"]+)"', lib_block, re.S):
        res[m.group(3)] = (float(m.group(1)), float(m.group(2)))
    return res


def blocks(text, head):
    """Yield (start, end, block) for every top-level-ish s-expression starting with '(head'."""
    for m in re.finditer(r'\(' + re.escape(head) + r'[\s"]', text):
        i, depth = m.start(), 0
        for j in range(i, len(text)):
            if text[j] == '(':
                depth += 1
            elif text[j] == ')':
                depth -= 1
                if depth == 0:
                    yield i, j + 1, text[i:j + 1]
                    break


def pin_position(text, ref, pin):
    lib_ids = {}
    for _, _, b in blocks(text, 'symbol'):
        mref = re.search(r'\(property "Reference" "' + re.escape(ref) + '"', b)
        mlib = re.match(r'\(symbol\s*\(lib_id "([^"]+)"\)', b)
        if mref and mlib:
            at = re.search(r'\(at ([-\d.]+) ([-\d.]+) ([-\d.]+)\)', b)
            mirror = re.search(r'\(mirror (\w)\)', b)
            lib_ids[ref] = (mlib.group(1), tuple(map(float, at.groups())), mirror.group(1) if mirror else None)
    if ref not in lib_ids:
        return None
    lib_id, (sx, sy, rot), mirror = lib_ids[ref]
    lib_block = next(b for _, _, b in blocks(text, 'symbol') if b.startswith(f'(symbol "{lib_id}"'))
    px, py = pin_offsets(lib_block)[pin]
    if mirror == 'x':
        py = -py
    elif mirror == 'y':
        px = -px
    a = math.radians(rot)
    rx, ry = px * math.cos(a) - py * math.sin(a), px * math.sin(a) + py * math.cos(a)
    return round(sx + rx, 2), round(sy - ry, 2)          # schematic y points down


def same(p, q):
    return abs(p[0] - q[0]) < EPS and abs(p[1] - q[1]) < EPS


def dnp(pdir, ref):
    """Mark a Croco part do-not-populate and off the board (kept in the schematic so it can be restored)."""
    for path in glob.glob(os.path.join(pdir, '*.kicad_sch')):
        text = open(path).read()
        for s, e, b in blocks(text, 'symbol'):
            if re.match(r'\(symbol\s*\(lib_id', b) and re.search(r'\(property "Reference" "' + re.escape(ref) + '"', b):
                nb = b.replace('(in_bom yes)', '(in_bom no)', 1).replace('(on_board yes)', '(on_board no)', 1).replace('(dnp no)', '(dnp yes)', 1)
                if nb == b:
                    print(f'{ref}: already DNP / off board, skipped')
                    return
                open(path, 'w').write(text[:s] + nb + text[e:])
                print(f'{ref} in {os.path.basename(path)}: DNP, not on board, not in BOM')
                return
    sys.exit(f'{ref} not found')


def relabel_bus_pin(pdir, edit):
    """Take one pin off a schematic bus: the pin's wire runs straight to a bus entry and carries one local label
    'from'. Remove that wire, its bus entry and the label, and put a global label 'to' on the pin itself.
    Anything else on the wire (a junction, a second label, a wire continuing elsewhere) is a hard error."""
    ref, pin, src, dst = edit['ref'], edit['pin'], edit['from'], edit['to']
    for path in glob.glob(os.path.join(pdir, '*.kicad_sch')):
        text = open(path).read()
        pos = pin_position(text, ref, pin)
        if pos is None:
            continue
        for s, e, b in blocks(text, 'global_label'):
            at = re.search(r'\(at ([-\d.]+) ([-\d.]+)', b)
            if same(pos, tuple(map(float, at.groups()))):
                name = re.match(r'\(global_label "([^"]+)"', b).group(1)
                if name == dst:
                    print(f'{ref}.{pin}: already on {dst}, skipped')
                    return
                sys.exit(f'{ref}.{pin}: global label {name!r} already on the pin')
        wires = [(s, e, [tuple(map(float, m)) for m in re.findall(r'\(xy ([-\d.]+) ([-\d.]+)\)', b)])
                 for s, e, b in blocks(text, 'wire')]
        mine = [w for w in wires if same(w[2][0], pos) or same(w[2][1], pos)]
        if len(mine) != 1:
            sys.exit(f'{ref}.{pin}: expected one wire on the pin, found {len(mine)}')
        ws, we, pts = mine[0]
        far = pts[1] if same(pts[0], pos) else pts[0]
        if any(w is not mine[0] and (same(w[2][0], far) or same(w[2][1], far)) for w in wires):
            sys.exit(f'{ref}.{pin}: the wire continues past {far}, not a plain bus stub')
        entries = [(s, e) for s, e, b in blocks(text, 'bus_entry')
                   if same(far, tuple(map(float, re.search(r'\(at ([-\d.]+) ([-\d.]+)', b).groups())))]
        lo, hi = sorted((pos[0], far[0])), sorted((pos[1], far[1]))
        labels = []
        for s, e, b in blocks(text, 'label'):
            x, y = map(float, re.search(r'\(at ([-\d.]+) ([-\d.]+)', b).groups())
            if lo[0] - EPS <= x <= lo[1] + EPS and hi[0] - EPS <= y <= hi[1] + EPS:
                labels.append((s, e, re.match(r'\(label "([^"]+)"', b).group(1)))
        if len(entries) != 1 or [l[2] for l in labels] != [src]:
            sys.exit(f'{ref}.{pin}: expected one bus entry and one label {src!r}, found {len(entries)} entries, '
                     f'labels {[l[2] for l in labels]}')
        if any(re.search(r'\(junction\s*\(at ' + f'{x:g} {y:g}', text) for x, y in (pos, far)):
            sys.exit(f'{ref}.{pin}: junction on the bus stub')
        new = (f'(global_label "{dst}"\n\t\t(shape bidirectional)\n\t\t(at {pos[0]:g} {pos[1]:g} 0)\n'
               f'\t\t(fields_autoplaced yes)\n\t\t(effects\n\t\t\t(font\n\t\t\t\t(size 1.27 1.27)\n\t\t\t)\n'
               f'\t\t\t(justify left)\n\t\t)\n\t\t(uuid "{uuid.uuid4()}")\n\t)')
        cuts = sorted([(ws, we), entries[0], labels[0][:2]], reverse=True)
        for s, e in cuts:
            text = text[:s] + text[e:]
        i = text.rstrip().rfind(')')                 # before the sheet's closing paren
        text = text[:i] + '\n\t' + new + text[i:]
        open(path, 'w').write(text)
        print(f'{ref}.{pin} in {os.path.basename(path)}: off the bus ({src}), global label {dst} on the pin')
        return
    sys.exit(f'{ref} not found in any sheet of {pdir}')


def apply(pdir, edit):
    if edit.get('action') == 'dnp':
        return dnp(pdir, edit['ref'])
    if edit.get('action') == 'relabel_bus_pin':
        return relabel_bus_pin(pdir, edit)
    ref, pin, src, dst = edit['ref'], edit['pin'], edit['from'], edit['to']
    for path in glob.glob(os.path.join(pdir, '*.kicad_sch')):
        text = open(path).read()
        pos = pin_position(text, ref, pin)
        if pos is None:
            continue
        wires = []
        for s, e, b in blocks(text, 'wire'):
            pts = [tuple(map(float, m)) for m in re.findall(r'\(xy ([-\d.]+) ([-\d.]+)\)', b)]
            wires.append(pts)
        # walk the wire chain from the pin until a global label is found
        frontier, seen, hits = [pos], set(), []
        while frontier:
            p = frontier.pop()
            key = (round(p[0], 2), round(p[1], 2))
            if key in seen:
                continue
            seen.add(key)
            for s, e, b in blocks(text, 'global_label'):
                at = re.search(r'\(at ([-\d.]+) ([-\d.]+)', b)
                if same(p, tuple(map(float, at.groups()))):
                    hits.append((s, e, b))
            for s, e, b in blocks(text, 'symbol'):      # power symbols (power:+BATT, power:GND ...) name nets too
                m = re.match(r'\(symbol\s*\(lib_id "power:([^"]+)"\)\s*\(at ([-\d.]+) ([-\d.]+)', b)
                if m and same(p, (float(m.group(2)), float(m.group(3)))):
                    hits.append((s, e, b))
            for pts in wires:
                if same(pts[0], p):
                    frontier.append(pts[1])
                elif same(pts[1], p):
                    frontier.append(pts[0])
        if any(re.search(r'\(junction\s*\(at ' + f'{x:g} {y:g}', text) for x, y in seen):
            sys.exit(f'{ref}.{pin}: wire from the pin has a junction, refusing to rename a shared label')
        def net_name(b):
            m = re.match(r'\(global_label "([^"]+)"', b) or re.match(r'\(symbol\s*\(lib_id "power:([^"]+)"', b)
            return m.group(1)
        names = {net_name(b) for _, _, b in hits}
        if names == {dst}:
            print(f'{ref}.{pin}: already on {dst}, skipped')
            return
        if names != {src} or len(hits) != 1:
            sys.exit(f'{ref}.{pin} in {os.path.basename(path)}: expected exactly one label {src!r} on the pin wire, found {sorted(names)} x{len(hits)}')
        s, e, b = hits[0]
        if b.startswith('(global_label'):
            nb = b.replace(f'(global_label "{src}"', f'(global_label "{dst}"', 1)
        else:
            if f'(symbol "power:{dst}"' not in text:
                sys.exit(f'power:{dst} is not in the lib_symbols of {os.path.basename(path)}')
            nb = (b.replace(f'(lib_id "power:{src}")', f'(lib_id "power:{dst}")', 1)
                  .replace(f'(property "Value" "{src}"', f'(property "Value" "{dst}"', 1)
                  .replace(f'with name \\"{src}\\"', f'with name \\"{dst}\\"'))
        text = text[:s] + nb + text[e:]
        open(path, 'w').write(text)
        print(f'{ref}.{pin} in {os.path.basename(path)}: label {src} -> {dst} (wire from pin at {pos})')
        return
    sys.exit(f'{ref} not found in any sheet of {pdir}')


if __name__ == '__main__':
    pdir, netlist = sys.argv[1:3]
    for edit in json.load(open(netlist))['croco_edits']:
        apply(pdir, edit)
