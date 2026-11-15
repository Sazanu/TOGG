const XLSX = require('xlsx');
const fs = require('fs');
const [newPath, oldPath, outPath] = process.argv.slice(2);
const rowsNew = JSON.parse(fs.readFileSync(newPath, 'utf8')).filter((r) => /^\d+$/.test(String(r[0]).trim()));
const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));

const TITLE = /^(rev|revd|mrs|mr|miss|ms|dr|ps|pastor|lady|elder|deacon|deaconess|bro|sis|brother|sister|evang|apostle|prophet|prophetess)\.?\s+/i;
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-'(.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\bJnr\b/i, 'Jnr').replace(/\bSnr\b/i, 'Snr');
function splitName(raw) {
  let s = String(raw).replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').replace(/\.(\S)/g, '. $1').trim();
  let title = '';
  for (let i = 0; i < 2; i++) { const m = s.match(TITLE); if (!m) break; title = (title + ' ' + m[1]).trim(); s = s.slice(m[0].length); }
  const t = title.toLowerCase();
  const T = { rev: 'Rev.', revd: 'Rev.', mrs: 'Mrs.', mr: 'Mr.', miss: 'Miss', ms: 'Ms.', dr: 'Dr.', ps: 'Ps.', pastor: 'Pastor', lady: 'Lady', elder: 'Elder', deacon: 'Deacon', deaconess: 'Deaconess', bro: 'Bro.', brother: 'Bro.', sis: 'Sis.', sister: 'Sis.' }[t.split(' ')[0]] ?? (title ? titleCase(title) : '');
  const parts = titleCase(s).split(' ').filter(Boolean);
  return { title: T, firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '), full: parts.join(' ') };
}
const normPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('233') && d.length === 12) d = '0' + d.slice(3); return d; };
const intl = (p) => { const s = String(p || '').trim(); return s.startsWith('+') ? '+' + s.replace(/\D/g, '') : normPhone(s); };
const tokens = (s) => new Set(String(s).toLowerCase().replace(TITLE, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['jnr', 'snr', 'nana', 'maame'].includes(w)));
const nameMatch = (a, b) => { const A = tokens(a), B = tokens(b); const common = [...A].filter((x) => B.has(x)).length; return common >= 2 || (common >= 1 && Math.min(A.size, B.size) === 1 && common === Math.min(A.size, B.size) && Math.min(A.size, B.size) > 0 && false); };

// Old records grouped per PERSON: same phone AND a shared name (two unrelated names on one phone = two people)
const oldGroups = [];
const oldByPhone = new Map();
const sharesName = (x, y) => [...tokens(x)].some((w) => tokens(y).has(w));
for (const r of old) {
  const k = normPhone(r.phone);
  const nm = r.name.replace(/(\w)- (\w)/g, '$1-$2');
  let g = oldGroups.find((x) => x.phone === k && [...x.names].some((n) => sharesName(n, nm)));
  if (!g) { g = { id: oldGroups.length, phone: k, names: new Set(), emails: new Set(), locations: new Set(), member: new Set(), visits: new Set(), files: new Set() }; oldGroups.push(g); }
  if (!oldByPhone.has(k)) oldByPhone.set(k, []);
  if (!oldByPhone.get(k).includes(g)) oldByPhone.get(k).push(g);
  g.names.add(r.name.replace(/(\w)- (\w)/g, '$1-$2')); if (r.email) g.emails.add(r.email); g.locations.add(r.location); g.member.add(r.member);
  g.visits.add(`${r.date} (${r.service.replace(/(Special Program)( Special Program)+/, '$1')})`); g.files.add(r.file);
}
const oldPeople = oldGroups;
const used = new Set();
const review = [];
const out = [];

// 1) everyone on the new (current) list
for (const r of rowsNew) {
  const [no, rawName, contact, residence, gender, marital, employment, dob] = r.map((x) => String(x).trim());
  const n = splitName(rawName);
  const phone = contact && contact !== '_' ? intl(contact) : '';
  const overlap = (x, y) => { const A = tokens(x), B = tokens(y); return [...A].filter((w) => B.has(w)).length; };
  const onPhone = phone ? oldByPhone.get(normPhone(phone)) ?? [] : [];
  let match = onPhone.find((g) => [...g.names].some((nm) => overlap(rawName, nm) >= 1)); let how = match ? 'phone' : '';
  if (!match && onPhone.length) {
    // Same number, completely different name: treat as different people (number re-used or shared).
    review.push({ Issue: 'Same phone as an OLD record with a completely different name — kept as two people; check', 'New list': rawName, 'Old list': onPhone.map((g) => [...g.names].join(' / ')).join(' ; '), Phone: phone });
  }
  if (!match) {
    const cands = oldPeople.filter((o) => !used.has(o.id) && [...o.names].some((nm) => nameMatch(rawName, nm)));
    if (cands.length === 1) { match = cands[0]; how = 'name';
      review.push({ Issue: 'Matched by NAME only (phone numbers differ) — confirm', 'New list': `${rawName} ${phone}`, 'Old list': `${[...match.names].join(' / ')} ${match.phone}`, Phone: phone }); }
  }
  if (match) used.add(match.id);
  if (!phone) review.push({ Issue: 'No phone number on the new list (cannot receive SMS)', 'New list': rawName, 'Old list': match ? `${[...match.names][0]} ${match.phone}` : '', Phone: '' });
  if (phone.startsWith('+')) review.push({ Issue: 'Foreign phone number — consider the Online (abroad) branch', 'New list': rawName, 'Old list': '', Phone: phone });
  const notes = [`On the official membership list (no. ${no}).`];
  if (match) notes.push(`Also on the 2024/25 attendance form as "${[...match.names].join(' / ')}"${match.phone !== normPhone(phone) ? ` with phone ${match.phone}` : ''}; attended ${[...match.visits].sort().join(', ')}.`);
  out.push({
    Title: n.title, 'First name': n.firstName, 'Last name': n.lastName,
    Phone: phone || (match ? match.phone : ''), Email: match ? [...match.emails][0] ?? '' : '',
    Gender: gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : '', 'Date of birth': dob,
    'Marital status': marital === 'MARRIED' ? 'Married' : marital === 'UNMARRIED' ? 'Single' : '',
    Occupation: employment ? titleCase(employment) : '', Address: titleCase(residence || ''), Status: 'active',
    'Date joined': match ? [...match.visits].sort()[0].slice(0, 10) : '',
    Notes: notes.join(' '), _group: match ? `Current — also on old list (matched by ${how})` : 'Current — only on new list',
  });
}
// shared phones on the new list
const seen = new Map(); out.forEach((o) => { if (!o.Phone) return; seen.set(o.Phone, [...(seen.get(o.Phone) ?? []), `${o.Title} ${o['First name']} ${o['Last name']}`.trim()]); });
for (const [p, names] of seen) if (names.length > 1) review.push({ Issue: 'Two people on the new list share one phone number', 'New list': names.join(' / '), 'Old list': '', Phone: p });

// 2) people only on the old lists → kept, but NOT active
for (const o of oldPeople) {
  if (used.has(o.id)) continue;
  if ((oldByPhone.get(o.phone) ?? []).length > 1 && (oldByPhone.get(o.phone)[0] === o))
    review.push({ Issue: 'Old list: different people used the same phone number (kept as separate people)', 'New list': '', 'Old list': oldByPhone.get(o.phone).map((g) => [...g.names][0]).join(' / '), Phone: o.phone });
  const name = [...o.names].sort((a, b) => b.length - a.length)[0];
  const n = splitName(name);
  const wasMember = o.member.has('yes');
  out.push({
    Title: n.title, 'First name': n.firstName, 'Last name': n.lastName, Phone: o.phone, Email: [...o.emails][0] ?? '',
    Gender: '', 'Date of birth': '', 'Marital status': '', Occupation: '', Address: [...o.locations][0], Status: 'inactive',
    'Date joined': [...o.visits].sort()[0].slice(0, 10),
    Notes: `Not on the current membership list. From the old 2024/25 attendance form (${wasMember ? 'registered as a member' : 'came as a visitor / non-member'}); attended ${[...o.visits].sort().join(', ')}.`,
    _group: wasMember ? 'Not active — old member, not on new list' : 'Not active — old visitor, not on new list',
  });
}

const counts = {}; out.forEach((o) => { counts[o._group] = (counts[o._group] ?? 0) + 1; });
const wb = XLSX.utils.book_new();
const imp = out.map(({ _group, ...r }) => r);
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(imp), 'Import into TOGG');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
  { What: 'HOW TO USE', Detail: 'In TOGG: Members → Import old file → choose this file. Columns are matched automatically. Choose the branch (e.g. Grace Palace).' },
  { What: 'Active members', Detail: `${out.filter((o) => o.Status === 'active').length} — everyone on the official membership list` },
  { What: 'Not active (kept)', Detail: `${out.filter((o) => o.Status === 'inactive').length} — only on the old 2024/25 attendance PDFs. Kept so nothing is lost, but shown separately from the main membership.` },
  ...Object.entries(counts).map(([k, v]) => ({ What: k, Detail: String(v) })),
  { What: 'Please check', Detail: `${review.length} items on the "Check these" sheet` },
]), 'Summary');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out.map((o) => ({ Group: o._group, Name: `${o.Title} ${o['First name']} ${o['Last name']}`.trim(), Phone: o.Phone, Status: o.Status, Notes: o.Notes })).sort((a, b) => a.Group.localeCompare(b.Group) || a.Name.localeCompare(b.Name))), 'Reconciliation');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(review.length ? review : [{ Issue: 'Nothing to check' }]), 'Check these');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(old.map((r) => ({ Name: r.name.replace(/(\w)- (\w)/g, '$1-$2'), Phone: r.phone, Email: r.email, Location: r.location, 'Member?': r.member, Date: r.date, Service: r.service.replace(/(Special Program)( Special Program)+/, '$1'), 'From file': r.file }))), 'Old PDF records (all)');
XLSX.writeFile(wb, outPath);
console.log(JSON.stringify({ counts, active: out.filter((o) => o.Status === 'active').length, inactive: out.filter((o) => o.Status === 'inactive').length, review: review.length }, null, 1));
review.forEach((r) => console.log(' -', r.Issue, '|', r['New list'], '|', r['Old list'], '|', r.Phone));
