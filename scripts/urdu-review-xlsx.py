"""Builds the Urdu review spreadsheet from docs/urdu-review/strings.json (see scripts/urdu-export.ts).

Run:  python3 scripts/urdu-review-xlsx.py docs/urdu-review/strings.json docs/urdu-review/EPC-Urdu-review.xlsx
Needs openpyxl (pip install openpyxl). The finished sheet goes to a native Urdu speaker; their changes come back with
scripts/urdu-apply.py.
"""
import json
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

src, out = sys.argv[1], sys.argv[2]
rows = json.load(open(src, encoding='utf-8'))['rows']
by_key = {r['key']: r for r in rows}

INDIGO = '4338CA'
HEAD = PatternFill('solid', fgColor=INDIGO)
YELLOW = PatternFill('solid', fgColor='FFF9DB')
GREY = PatternFill('solid', fgColor='F3F4F6')
thin = Side(style='thin', color='D1D5DB')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
LTR = Alignment(wrap_text=True, vertical='top', horizontal='left')
RTL = Alignment(wrap_text=True, vertical='top', horizontal='right', readingOrder=2)
URDU_FONT = Font(name='Noto Naskh Arabic', size=13)


def header(ws, labels, widths):
    ws.append(labels)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = HEAD
        c.alignment = Alignment(wrap_text=True, vertical='center')
        c.border = BORDER
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = 'A2'


wb = Workbook()

# ------------------------------------------------------------------ Read me
ws = wb.active
ws.title = 'Read me'
ws.column_dimensions['A'].width = 110
lines = [
    ('EPC Construction: Urdu review', Font(bold=True, size=18, color=INDIGO)),
    ('', None),
    ('What this is', Font(bold=True, size=13)),
    ('EPC Construction is an app for tracking the payments on a house build. It can be used in English or Urdu. '
     'The Urdu text was drafted by a computer and has not yet been checked by a native speaker. Please check it.', None),
    ('', None),
    ('What to do', Font(bold=True, size=13)),
    ('1. Open the "Strings" sheet. Each row is one piece of text from the app. Column B says which screen it belongs to, '
     'column C is the English, column D is the current Urdu.', None),
    ('2. If the Urdu is fine, leave column E empty. If it should change, write the better Urdu in column E (the yellow column).', None),
    ('3. If you are unsure, or something is confusing or missing, write a note in column F. You may write notes in Urdu or English.', None),
    ('4. Look at the "Glossary" sheet: the key words (Investor, Builder, Vendor, Advance and so on). Please make sure one '
     'word is used for each thing everywhere, and fix it in the Strings sheet too.', None),
    ('5. Answer the questions in the "Questions" sheet. They are style choices only a native speaker can make.', None),
    ('6. Save the file and send it back (Excel or Google Sheets both work).', None),
    ('', None),
    ('Rules', Font(bold=True, size=13)),
    ('• Do not change columns A to D. Only fill column E and F.', None),
    ('• Words inside curly braces, like {name}, {count}, {amount}, {pct}, are filled in by the app with a name or a number. '
     'Keep them exactly as they are, including the braces, and place them where they read naturally. Column G lists them.', None),
    ('• Short texts (buttons, menu names, labels) must stay short: they have to fit on a phone screen.', None),
    ('• Write the way people on a building site and in a family would say it, simply and politely (آپ).', None),
    ('• Amounts are shown like "Rs 130,000" with ordinary digits. Do not translate those; there are questions about them in the Questions sheet.', None),
    ('', None),
    ('How the sheet is organised', Font(bold=True, size=13)),
    (f'{len(rows)} texts in {len({r["area"] for r in rows})} groups (by screen). Use the filter arrow on the "Screen" column to look at one screen at a time.', None),
]
for text, font in lines:
    ws.append([text])
    c = ws.cell(row=ws.max_row, column=1)
    c.alignment = Alignment(wrap_text=True, vertical='top')
    if font:
        c.font = font

# ------------------------------------------------------------------ Strings
ws = wb.create_sheet('Strings')
header(ws, ['Key (do not change)', 'Screen', 'English', 'Current Urdu', 'Corrected Urdu\n(leave empty if fine)', 'Your note or question', 'Keep exactly'], [24, 30, 48, 48, 48, 34, 14])
ordered = sorted(rows, key=lambda r: (int(r['area'].split(' ')[0]), 0))  # stable: keeps the order inside a group
for r in ordered:
    ws.append([r['key'], r['area'][r['area'].index(' ') + 1:], r['en'], r['ur'], None, None, ' '.join(r['placeholders'])])
    n = ws.max_row
    for col in 'ABCDEFG':
        ws[f'{col}{n}'].border = BORDER
    for col in 'ABC':
        ws[f'{col}{n}'].alignment = LTR
    ws[f'A{n}'].font = Font(color='6B7280', size=9)
    ws[f'A{n}'].fill = GREY
    ws[f'B{n}'].fill = GREY
    ws[f'D{n}'].alignment = RTL
    ws[f'D{n}'].font = URDU_FONT
    ws[f'E{n}'].alignment = RTL
    ws[f'E{n}'].font = URDU_FONT
    ws[f'E{n}'].fill = YELLOW
    ws[f'F{n}'].alignment = LTR
    ws[f'G{n}'].alignment = LTR
    ws[f'G{n}'].font = Font(name='Consolas', size=10, color='B45309')
ws.auto_filter.ref = f'A1:G{ws.max_row}'

# ----------------------------------------------------------------- Glossary
GLOSSARY = [
    ('Investor (the owner who pays)', 'set.roleInvestor'), ('Builder (the person who runs the build)', 'set.roleBuilder'),
    ('Vendor (a shop or contractor you pay)', 'nav.vendors'), ('Labour foreman', 'role.foreman'),
    ('Phase (a stage of the build)', 'nav.phases'), ('Ledger (list of all payments)', 'nav.ledger'),
    ('Weekly payments', 'nav.plans'), ('Settlement (who owes whom at the end)', 'nav.settlement'),
    ('Material prices', 'mat.prices'), ('Contracts', 'nav.contracts'), ('Variation (change to a contract)', 'contract.variations'),
    ('Statement (list of payments to print)', 'nav.statements'), ('Reports', 'nav.reports'), ('Files', 'nav.files'),
    ('Paid', 'status.paid'), ('Planned', 'status.planned'), ('Advance (money given before the work)', 'status.advance'),
    ('Overdue', 'status.overdue'), ('Skipped', 'status.skipped'),
    ('Awaiting approval', 'approval.pending'), ('Approve', 'approval.approve'), ('Reject', 'approval.reject'),
    ('Reimbursement (repaying the builder)', 'xfer.reimbursement'), ('Top-up (more money to the builder)', 'xfer.topup'),
    ('Budget', 'home.budget'), ('Spent', 'home.spent'), ('Cash', 'mode.cash'), ('Bank transfer', 'mode.bank'),
    ('Alerts', 'notif.title'), ('Backup', 'set.backup'), ('Bin (deleted items kept for a while)', 'set.bin'),
    ('Reminders (lock-screen notifications)', 'push.row.title'), ('Preset: Recommended', 'push.preset.recommended'),
    ('Preset: Minimal', 'push.preset.minimal'), ('Preset: Approvals only', 'push.preset.approvals'),
    ('Theme: Same as device', 'set.theme.system'), ('Theme: Light', 'set.theme.light'), ('Theme: Dark', 'set.theme.dark'),
    ('Week starts on', 'set.region.week'), ('Time zone', 'set.region.zone'),
]
ws = wb.create_sheet('Glossary')
header(ws, ['Word', 'Where it appears (key)', 'Current Urdu', 'Corrected Urdu\n(leave empty if fine)', 'Your note'], [40, 24, 34, 34, 40])
for term, key in GLOSSARY:
    cur = by_key.get(key, {}).get('ur', '')
    if not cur:
        print('glossary key missing:', key)
        continue
    ws.append([term, key, cur, None, None])
    n = ws.max_row
    for col in 'ABCDE':
        ws[f'{col}{n}'].border = BORDER
    ws[f'A{n}'].alignment = LTR
    ws[f'B{n}'].alignment = LTR
    ws[f'B{n}'].font = Font(color='6B7280', size=9)
    ws[f'C{n}'].alignment = RTL
    ws[f'C{n}'].font = URDU_FONT
    ws[f'D{n}'].alignment = RTL
    ws[f'D{n}'].font = URDU_FONT
    ws[f'D{n}'].fill = YELLOW
    ws[f'E{n}'].alignment = LTR

# ---------------------------------------------------------------- Questions
QUESTIONS = [
    ('Money word', 'The app now lets each person choose how amounts are written: Automatic (Rs in amounts, and "روپے" in Urdu field labels), Rs, PKR, or "130,000 روپے" with the word after the number '
                   '(see the group "Region and format"). Is "روپے" the right spelling and word? In Urdu, which should be the automatic choice: Rs, or the number followed by روپے? '
                   'Should the digits be ordinary (0 1 2 3) or Urdu-style (۰ ۱ ۲ ۳)?'),
    ('Money grouping', 'Amounts can now be grouped the usual way, 1,300,000, or lakh style, 13,00,000 (13 لاکھ). Which do people here expect? Which should be the first choice for Urdu readers?'),
    ('Dates and time', 'Dates show like "15 نومبر، 2026" or "15/11/2026". Is that natural? Times of day in the reminder-time list are said as "9:00 صبح", "1:00 دوپہر", "5:00 شام", "9:00 رات". '
                       'Are those the right words, and the right hours for each (صبح before 12, دوپہر 12 to 4, شام 4 to 8, رات after 8 and until 4)?'),
    ('Week start', 'The choices for the first day of the week are ہفتہ (Saturday), اتوار (Sunday) and پیر (Monday). "ہفتہ" also means "week", so the first choice may confuse. '
                   'Should it say "ہفتہ (Saturday)" or something else? Which day do builders and families here count as the first day?'),
    ('Reminders', 'New texts in "Reminders and alerts": the three quick setups (تجویز کردہ, کم سے کم, صرف منظوریاں), the reminder time, and the five kinds of reminder. '
                  'Do the names and short explanations read naturally on a phone lock screen and in Settings?'),
    ('Light and dark', 'The appearance choices are ڈیوائس کے مطابق (same as the device), روشن (light) and ڈارک (dark). Would you use سیاہ or اندھیرا for dark, and is "ڈیوائس کے مطابق" clear?'),
    ('Deleting a project', 'The delete dialog asks "Keep a copy first?" and offers a backup. Please read the group "Settings and sync" texts that start with set.del and check the warning is clear and serious without being frightening.'),
    ('Investor and Builder', 'For Investor the app mostly says سرمایہ کار, but some newer texts say انویسٹر, so it is not consistent yet. For Builder it says بلڈر. '
                             'Which words do people here actually use? Options: سرمایہ کار / انویسٹر / مالک for the investor, and بلڈر / ٹھیکیدار / مستری for the builder. '
                             'Please choose one for each and tell us; we will use it everywhere.'),
    ('Vendor', 'The app says وینڈر for a shop, supplier or contractor you pay. Is there a better everyday word?'),
    ('Respect and tone', 'The text addresses the reader as آپ. Is the tone right: simple and polite, not too formal and not too casual?'),
    ('English words kept', 'Some words stay in English (for example PDF, CSV, Rs, PKR). Is there any other English word you would translate, or any Urdu word you would leave in English?'),
    ('Units', 'Materials use these units: bag (بوری), kg (کلو), ton (ٹن), piece (عدد), cft, sqft, rft, trip (ٹرپ), box (ڈبہ), litre (لیٹر). '
              'Are these what the shops here use? How should cft and rft be written?'),
    ('Phases of the build', 'The 12 default phases (Planning, Site preparation, Excavation and foundation, Grey structure, and so on) are in the Strings sheet under "Phases". '
                            'Please check they use the names builders here use, in the order they happen.'),
    ('Buttons too long?', 'Please mark any button or label in the Strings sheet that is too long or hard to read when short.'),
    ('Anything missing or wrong in meaning', 'Is there any text where the Urdu says something different from the English? Please note the key.'),
]
ws = wb.create_sheet('Questions')
header(ws, ['Topic', 'Question', 'Your answer'], [28, 90, 60])
for topic, q in QUESTIONS:
    ws.append([topic, q, None])
    n = ws.max_row
    for col in 'ABC':
        ws[f'{col}{n}'].border = BORDER
        ws[f'{col}{n}'].alignment = LTR
    ws[f'A{n}'].font = Font(bold=True)
    ws[f'C{n}'].fill = YELLOW

wb.save(out)
print(f'saved {out}: {len(rows)} strings, {len(GLOSSARY)} glossary terms, {len(QUESTIONS)} questions')
