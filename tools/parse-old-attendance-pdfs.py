import json, re, subprocess, sys
PHONE = re.compile(r'(?<![\d])(\+?\d[\d ]{8,14}\d)(?![\d])')
out = []
for path in sys.argv[1:]:
    text = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
    cur = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if re.search(r'Attendance Records|Show \d+|Name\s+▲|^\s*▼|Showing \d', line):
            continue
        m = re.search(r'(?<!\d)(0\d{9}|233\d{9}|\+\d{10,13})(?!\d)', line)
        if m and m.start() < 40:
            if cur: out.append(cur)
            rest = [p for p in re.split(r'\s{2,}', line[m.end():].strip()) if p]
            date = next((p for p in rest if re.fullmatch(r'\d{4}-\d{2}-\d{2}', p)), '')
            memb = next((p for p in rest if p.lower() in ('yes', 'no')), '')
            email = next((p for p in rest if '@' in p or p == 'N/A'), '')
            loc = [p for p in rest if p not in (date, memb, email) and not re.search(r'Program|Service|Prayer|Meeting', p)]
            serv = next((p for p in rest if re.search(r'Program|Service|Prayer|Meeting', p)), '')
            cur = {'name': line[:m.start()].strip(), 'phone': m.group(1), 'email': '' if email == 'N/A' else email,
                   'location': ' '.join(loc), 'member': memb.lower(), 'date': date, 'service': serv, 'file': path.split('/')[-1]}
        elif cur:
            parts = [(mm.start(), mm.group()) for mm in re.finditer(r'\S+(?: \S+)*', line)]
            for pos, txt in parts:
                if pos < 15: cur['name'] += ' ' + txt
                elif re.search(r'Program|Service', txt): cur['service'] = (cur['service'] + ' ' + txt).strip()
                else: cur['location'] = (cur['location'] + ' ' + txt).strip()
    if cur: out.append(cur)
for r in out:
    r['name'] = re.sub(r'\s+', ' ', r['name']).strip()
    r['location'] = re.sub(r'\s+', ' ', r['location']).strip()
json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
