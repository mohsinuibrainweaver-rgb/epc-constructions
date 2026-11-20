"""Applies a native speaker's corrections from the returned review spreadsheet to src/i18n/ur.ts.

Run:  python3 scripts/urdu-apply.py REVIEWED.xlsx [--dry-run] [--ur src/i18n/ur.ts]

- "Strings" sheet: column E (Corrected Urdu). Empty means the current Urdu is fine.
- "Glossary" sheet: column D. Used when the same key has no correction in the Strings sheet.
- A correction is refused (and reported) when its {placeholders} differ from the English text's, or when it is empty.
- Notes (column F, glossary notes, answers to the questions) are printed so nothing the reviewer wrote is lost.
Needs openpyxl.
"""
import json
import re
import subprocess
import sys

from openpyxl import load_workbook

args = [a for a in sys.argv[1:] if not a.startswith('--')]
dry = '--dry-run' in sys.argv
ur_path = sys.argv[sys.argv.index('--ur') + 1] if '--ur' in sys.argv else 'src/i18n/ur.ts'
if not args:
    sys.exit(__doc__)
if ur_path in args:
    args.remove(ur_path)
reviewed = args[0]

PH = re.compile(r'\{[a-zA-Z]+\}')
wb = load_workbook(reviewed, data_only=True)

strings = wb['Strings']
corrections, notes, refused = {}, [], []
rows = {}
for r in strings.iter_rows(min_row=2, values_only=True):
    key, _area, en, cur, new, note = (list(r) + [None] * 6)[:6]
    if not key:
        continue
    rows[key] = (en, cur)
    if note and str(note).strip():
        notes.append((key, str(note).strip()))
    if new is not None and str(new).strip():
        corrections[key] = ' '.join(str(new).split())

if 'Glossary' in wb.sheetnames:
    for r in wb['Glossary'].iter_rows(min_row=2, values_only=True):
        term, key, cur, new, note = (list(r) + [None] * 5)[:5]
        if note and str(note).strip():
            notes.append((f'glossary: {term}', str(note).strip()))
        if key and new is not None and str(new).strip():
            value = ' '.join(str(new).split())
            if key in corrections and corrections[key] != value:
                print(f'note: {key} is corrected in both sheets; the Strings sheet wins')
            else:
                corrections.setdefault(key, value)

answers = []
if 'Questions' in wb.sheetnames:
    for r in wb['Questions'].iter_rows(min_row=2, values_only=True):
        if r[2] and str(r[2]).strip():
            answers.append((r[0], str(r[2]).strip()))

# Safety: the English text decides which {placeholders} must be present.
good = {}
for key, value in corrections.items():
    if key not in rows:
        refused.append((key, 'unknown key'))
        continue
    en, cur = rows[key]
    if sorted(PH.findall(en)) != sorted(PH.findall(value)):
        refused.append((key, f'placeholders must be {sorted(set(PH.findall(en))) or "none"}, found {sorted(set(PH.findall(value))) or "none"}'))
        continue
    if value == cur:
        continue
    good[key] = value


def literal(value: str) -> str:
    """A TypeScript string literal, in the quote style the file already uses."""
    if "'" in value:
        return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
    return "'" + value.replace('\\', '\\\\') + "'"


def patch(text: str, key: str, value: str) -> tuple[str, bool]:
    m = re.search(r"^  '" + re.escape(key) + r"':\s*", text, re.M)
    if not m:
        return text, False
    i = m.end()
    q = text[i]
    if q not in '\'"':
        return text, False
    j = i + 1
    while text[j] != q:
        j += 2 if text[j] == '\\' else 1
    return text[:i] + literal(value) + text[j + 1:], True


text = open(ur_path, encoding='utf-8').read()
applied = []
for key, value in good.items():
    text, ok = patch(text, key, value)
    (applied if ok else refused).append((key, value) if ok else (key, 'not found in ur.ts'))

print(f'{len(corrections)} corrections read, {len(applied)} to apply, {len(refused)} refused')
for key, why in refused:
    print(f'  REFUSED {key}: {why}')
for key, value in applied:
    print(f'  {key}: {rows[key][1]}  ->  {value}')
if notes:
    print(f'\n{len(notes)} notes from the reviewer:')
    for k, n in notes:
        print(f'  [{k}] {n}')
if answers:
    print('\nAnswers to the questions:')
    for t, a in answers:
        print(f'  {t}: {a}')
if dry:
    print('\n(dry run: nothing written)')
else:
    open(ur_path, 'w', encoding='utf-8').write(text)
    print(f'\nwritten to {ur_path}. Next: npx tsc --noEmit, then rebuild and redeploy.')
