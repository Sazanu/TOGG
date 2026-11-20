/**
 * TOGG — FREE SMS SERVER (Google Apps Script)
 * ------------------------------------------------------------
 * Sends the SMS that TOGG queues in Firestore, without the Firebase Blaze plan.
 *  - Instant:   TOGG pings this script's web-app URL right after a message is saved.
 *  - Every 5 min: scheduled messages, programme reminders (e.g. Peak Hour Prayer),
 *                 missed-service texts, birthdays and welfare reminders.
 * Runs as YOUR Google account (the Firebase project owner), so it reads/writes Firestore
 * directly. Setup steps: see sms-server/README.md.
 */

var PROJECT_ID = 'attendanceform-cdb69';
var LOG_SENT = []; // test mode ('log' provider) records here
// Words in a Gonlinesites reply that mean the SMS was NOT sent.
var GONLINE_ERROR = /error|invalid|insufficient|fail|denied|wrong|incorrect|not ?allowed|unauthori[sz]ed|low balance/i;

/* ---------------- Firestore REST ---------------- */
function props_() { return PropertiesService.getScriptProperties(); }
function base_() {
  var b = props_().getProperty('FIRESTORE_BASE');
  return b || ('https://firestore.googleapis.com/v1/projects/' + (props_().getProperty('PROJECT_ID') || PROJECT_ID) + '/databases/(default)/documents');
}
function token_() { return props_().getProperty('TEST_TOKEN') || ScriptApp.getOAuthToken(); }
function http_(method, url, body) {
  var opt = { method: method, contentType: 'application/json', headers: { Authorization: 'Bearer ' + token_() }, muteHttpExceptions: true };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(url, opt);
  var text = res.getContentText(), json = null;
  try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { code: res.getResponseCode(), json: json, text: text };
}
function fromValue_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue_);
  if ('mapValue' in v) return fromFields_(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
function fromFields_(f) { var o = {}; for (var k in f) o[k] = fromValue_(f[k]); return o; }
function toValue_(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toValue_) } };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'object') return { mapValue: { fields: toFields_(x) } };
  return { stringValue: String(x) };
}
function toFields_(o) { var f = {}; for (var k in o) if (o[k] !== undefined) f[k] = toValue_(o[k]); return f; }
function doc_(d) { return { id: d.name.split('/').pop(), name: d.name, data: fromFields_(d.fields || {}), updateTime: d.updateTime }; }

var fs = {
  get: function (path) {
    var r = http_('get', base_() + '/' + path);
    if (r.code === 404) return null;
    if (r.code >= 300) throw new Error('Firestore get ' + path + ': ' + r.text.slice(0, 300));
    return doc_(r.json);
  },
  list: function (path) {
    var out = [], token = '';
    do {
      var r = http_('get', base_() + '/' + path + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
      if (r.code >= 300) throw new Error('Firestore list ' + path + ': ' + r.text.slice(0, 300));
      (r.json.documents || []).forEach(function (d) { out.push(doc_(d)); });
      token = r.json.nextPageToken || '';
    } while (token);
    return out;
  },
  /** filters: [[field, '==' | 'array-contains-any', value], ...] */
  query: function (collection, filters) {
    var OPS = { '==': 'EQUAL', 'array-contains-any': 'ARRAY_CONTAINS_ANY', 'array-contains': 'ARRAY_CONTAINS' };
    var f = (filters || []).map(function (x) { return { fieldFilter: { field: { fieldPath: x[0] }, op: OPS[x[1]], value: toValue_(x[2]) } }; });
    var sq = { from: [{ collectionId: collection }] };
    if (f.length === 1) sq.where = f[0];
    if (f.length > 1) sq.where = { compositeFilter: { op: 'AND', filters: f } };
    var r = http_('post', base_() + ':runQuery', { structuredQuery: sq });
    if (r.code >= 300) throw new Error('Firestore query ' + collection + ': ' + r.text.slice(0, 300));
    return (r.json || []).filter(function (x) { return x.document; }).map(function (x) { return doc_(x.document); });
  },
  /** Update only the given fields (+ delete `remove` fields). Optional precondition: the doc's updateTime. Returns false if someone else changed it first. */
  update: function (path, data, opts) {
    opts = opts || {};
    var name = base_().replace(/^https?:\/\/[^/]+\/v1\//, '') + '/' + path;
    var write = { update: { name: name, fields: toFields_(data) }, updateMask: { fieldPaths: Object.keys(data).concat(opts.remove || []) } };
    if (opts.updateTime) write.currentDocument = { updateTime: opts.updateTime };
    var r = http_('post', base_() + ':commit', { writes: [write] });
    if (r.code === 400 || r.code === 409 || r.code === 412) {
      if (opts.updateTime) return false; // precondition failed: someone else took it
      throw new Error('Firestore update ' + path + ': ' + r.text.slice(0, 300));
    }
    if (r.code >= 300) throw new Error('Firestore update ' + path + ': ' + r.text.slice(0, 300));
    return true;
  },
  add: function (collection, data) {
    var r = http_('post', base_() + '/' + collection, { fields: toFields_(data) });
    if (r.code >= 300) throw new Error('Firestore add ' + collection + ': ' + r.text.slice(0, 300));
    return r.json.name.split('/').pop();
  },
};

/* ---------------- helpers (same rules as the app) ---------------- */
function normalizePhone(raw) {
  var s = String(raw || '').trim(), d = s.replace(/\D/g, '');
  if (!d) return null;
  if (d.indexOf('233') === 0 && d.length === 12) return d;
  if (d.charAt(0) === '0' && d.length === 10) return '233' + d.slice(1);
  if (d.length === 9) return '233' + d;
  if (s.charAt(0) === '+' && d.length >= 10 && d.length <= 15) return d;
  return null;
}
function fillTemplate(t, vars) { return String(t || '').replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : m; }); }
function ghanaNow(now) {
  var iso = now.toISOString();
  return { date: iso.slice(0, 10), minutes: now.getUTCHours() * 60 + now.getUTCMinutes(), day: now.getUTCDay(), hour: now.getUTCHours(), md: iso.slice(5, 10) };
}
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthsBetween(start, end) {
  var out = [], a = start.split('-').map(Number), e = end.split('-').map(Number), y = a[0], m = a[1];
  while ((y < e[0] || (y === e[0] && m <= e[1])) && out.length < 120) { out.push(y + '-' + (m < 10 ? '0' : '') + m); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
var DEFAULT_SETTINGS = {
  provider: 'log', senderId: 'TOGG', churchName: "Throne of God's Grace Ministries",
  absenteeEnabled: false, absenteeTemplate: 'Hello {firstName}, we missed you at church today. We love you and are praying for you. God bless you! - {church}',
  absenteeServiceTypes: ['Sunday Service'], absenteeHour: 15,
  birthdayEnabled: false, birthdayTemplate: 'Happy birthday {firstName}! May God grant you long life, joy and favour this new year. - {church}',
};
var DEFAULT_WELFARE = { amount: 20, startMonth: '2026-01', remindEnabled: false, remindDay: 5,
  template: 'Dear {firstName}, your TOGG welfare dues for {months} (GH₵{amount}) are outstanding. Kindly pay via {link}. God bless you.' };
function merge_(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var j in (b || {})) o[j] = b[j]; return o; }
function settings_() { var s = fs.get('settings/sms'); return merge_(DEFAULT_SETTINGS, s ? s.data : {}); }

/* ---------------- SMS providers ---------------- */
function provider_(settings) {
  var sec = fs.get('secrets/sms');
  var key = sec ? String(sec.data.apiKey || '') : '';
  var sender = String(settings.senderId || 'TOGG').slice(0, 11);
  var p = settings.provider;
  function post(url, body, headers) {
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: headers || {}, payload: JSON.stringify(body), muteHttpExceptions: true });
    var text = res.getContentText(), json = null; try { json = JSON.parse(text); } catch (e) { /* */ }
    return { code: res.getResponseCode(), json: json, text: text };
  }
  if (p === 'arkesel') return { name: 'arkesel', send: function (to, text) {
    var r = post('https://sms.arkesel.com/api/v2/sms/send', { sender: sender, message: text, recipients: to }, { 'api-key': key });
    if (r.code < 300 && r.json && r.json.status === 'success') return { sent: to.length, failed: 0 };
    return { sent: 0, failed: to.length, error: 'Arkesel ' + r.code + ': ' + ((r.json && r.json.message) || r.text.slice(0, 200)) };
  } };
  if (p === 'mnotify') return { name: 'mnotify', send: function (to, text) {
    var r = post('https://api.mnotify.com/api/sms/quick?key=' + encodeURIComponent(key), { recipient: to, sender: sender, message: text, is_schedule: false, schedule_date: '' });
    if (r.code < 300 && r.json && (r.json.status === 'success' || String(r.json.code) === '2000')) return { sent: to.length, failed: 0 };
    return { sent: 0, failed: to.length, error: 'mNotify ' + r.code + ': ' + ((r.json && r.json.message) || r.text.slice(0, 200)) };
  } };
  if (p === 'gonlinesites') return { name: 'gonlinesites', send: function (to, text) {
    // https://sms.gonlinesites.com/app/sms/api?action=send-sms&api_key=…&to=…&from=…&sms=…
    var q = 'action=send-sms&api_key=' + encodeURIComponent(key) + '&to=' + encodeURIComponent(to.join(',')) + '&from=' + encodeURIComponent(sender) + '&sms=' + encodeURIComponent(text);
    var res;
    try { res = UrlFetchApp.fetch('https://sms.gonlinesites.com/app/sms/api?' + q, { muteHttpExceptions: true }); }
    catch (e) { res = UrlFetchApp.fetch('http://sms.gonlinesites.com/app/sms/api?' + q, { muteHttpExceptions: true }); }
    var body = res.getContentText();
    if (res.getResponseCode() < 300 && !GONLINE_ERROR.test(body)) return { sent: to.length, failed: 0, response: body.slice(0, 300) };
    return { sent: 0, failed: to.length, error: 'Gonlinesites ' + res.getResponseCode() + ': ' + body.slice(0, 200) };
  } };
  if (p === 'hubtel') {
    var parts = key.split(':');
    return { name: 'hubtel', send: function (to, text) {
      var sent = 0, failed = 0, error = '';
      to.forEach(function (n) {
        var res = UrlFetchApp.fetch('https://smsc.hubtel.com/v1/messages/send?clientid=' + encodeURIComponent(parts[0]) + '&clientsecret=' + encodeURIComponent(parts[1] || '') + '&from=' + encodeURIComponent(sender) + '&to=' + n + '&content=' + encodeURIComponent(text), { muteHttpExceptions: true });
        if (res.getResponseCode() < 300) sent++; else { failed++; error = 'Hubtel ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200); }
      });
      return { sent: sent, failed: failed, error: error };
    } };
  }
  return { name: 'log', send: function (to, text) { LOG_SENT.push({ to: to.slice(), text: text }); return { sent: to.length, failed: 0 }; } };
}

/* ---------------- who receives a message ---------------- */
function memberRecipient_(m) {
  var phone = normalizePhone(m.phone);
  if (!phone) return null;
  return { phone: phone, firstName: m.firstName || '', name: ((m.firstName || '') + ' ' + (m.lastName || '')).trim() };
}
function dedupe_(list) { var seen = {}, out = []; list.forEach(function (r) { if (r && !seen[r.phone]) { seen[r.phone] = 1; out.push(r); } }); return out; }
function paymentLink_(purpose) {
  var p = fs.get('settings/payments'); p = p ? p.data : {};
  if (p.paymentLink) return String(p.paymentLink);
  return String(p.publicSiteUrl || ('https://' + (props_().getProperty('PROJECT_ID') || PROJECT_ID) + '.web.app')).replace(/\/+$/, '') + '/pay?for=' + purpose;
}
function welfareDefaulters_(branch, now) {
  var w = fs.get('settings/welfare'); w = merge_(DEFAULT_WELFARE, w ? w.data : {});
  var current = now.toISOString().slice(0, 7);
  var members = branch ? fs.query('members', [['branchId', '==', branch]]) : fs.list('members');
  var paid = {};
  fs.query('giving', [['type', '==', 'welfare']]).forEach(function (d) {
    var g = d.data; if (!g.memberId) return;
    var months = (g.forMonths && g.forMonths.length) ? g.forMonths : [String(g.date).slice(0, 7)];
    paid[g.memberId] = paid[g.memberId] || {};
    months.forEach(function (k) { paid[g.memberId][k] = 1; });
  });
  var link = paymentLink_('welfare'), out = [];
  members.forEach(function (d) {
    var m = d.data;
    if (m.status !== 'active' || m.category !== 'adult' || m.welfareExempt) return;
    var phone = normalizePhone(m.phone); if (!phone) return;
    var joined = typeof m.joinedAt === 'string' ? m.joinedAt.slice(0, 7) : '';
    var from = joined && joined > w.startMonth ? joined : w.startMonth;
    var owed = monthsBetween(from, current).filter(function (k) { return !(paid[d.id] || {})[k]; });
    if (!owed.length) return;
    var label = owed.map(function (k) { return MONTHS[Number(k.slice(5)) - 1] + ' ' + k.slice(0, 4); });
    var months = label.length > 4 ? label.slice(0, 3).join(', ') + ' and ' + (label.length - 3) + ' more' : label.join(', ');
    out.push({ phone: phone, firstName: m.firstName || '', name: ((m.firstName || '') + ' ' + (m.lastName || '')).trim(),
      vars: { months: months, amount: (owed.length * Number(w.amount || 0)).toFixed(2), link: link } });
  });
  return out;
}
function deptAndChildren_(id) {
  var all = fs.list('departments').map(function (d) { return { id: d.id, parentId: d.data.parentId || null }; });
  var out = [];
  (function go(x) { if (out.indexOf(x) >= 0) return; out.push(x); all.filter(function (d) { return d.parentId === x; }).forEach(function (d) { go(d.id); }); })(id);
  return out;
}
function resolveRecipients(a, branchLock, now) {
  a = a || { type: 'custom' };
  var branch = branchLock || a.branchId || null;
  var okStatus = function (m) { return m.status === 'active' || (a.includeVisitors && m.status === 'visitor'); };
  var inBranch = function (m) { return !branch || m.branchId === branch; };
  var docs;
  switch (a.type) {
    case 'welfare_defaulters': return dedupe_(welfareDefaulters_(branch, now));
    case 'custom': return dedupe_((a.phones || []).map(normalizePhone).filter(Boolean).map(function (p) { return { phone: p, firstName: '', name: '' }; }));
    case 'members':
      return dedupe_((a.memberIds || []).slice(0, 500).map(function (id) { return fs.get('members/' + id); }).filter(function (d) { return d && inBranch(d.data); }).map(function (d) { return memberRecipient_(d.data); }));
    case 'absentees': {
      if (!a.serviceId) return [];
      var svc = fs.get('services/' + a.serviceId);
      if (!svc || (branchLock && svc.data.branchId !== branchLock)) return [];
      var present = {}; fs.list('services/' + a.serviceId + '/checkins').forEach(function (c) { present[c.id] = 1; });
      return dedupe_(fs.query('members', [['branchId', '==', svc.data.branchId]]).filter(function (d) { return !present[d.id] && d.data.status === 'active' && d.data.category !== 'child'; }).map(function (d) { return memberRecipient_(d.data); }));
    }
    case 'department': if (!a.departmentId) return []; docs = fs.query('members', [['departmentIds', 'array-contains-any', deptAndChildren_(a.departmentId).slice(0, 30)]]); break;
    case 'cell': if (!a.cellId) return []; docs = fs.query('members', [['cellId', '==', a.cellId]]); break;
    case 'category': docs = fs.query('members', [['category', '==', a.category || 'adult']]); break;
    default: docs = branch ? fs.query('members', [['branchId', '==', branch]]) : fs.list('members');
  }
  return dedupe_(docs.map(function (d) { return d.data; }).filter(okStatus).filter(inBranch).map(memberRecipient_));
}
function deliver_(provider, recipients, template, church) {
  var groups = {};
  recipients.forEach(function (r) {
    var vars = { firstName: r.firstName || 'friend', name: r.name || 'friend', church: church };
    for (var k in (r.vars || {})) vars[k] = r.vars[k];
    var text = fillTemplate(template, vars);
    (groups[text] = groups[text] || []).push(r.phone);
  });
  var sent = 0, failed = 0, error = '', lastResponse = '';
  Object.keys(groups).forEach(function (text) {
    var phones = groups[text];
    for (var i = 0; i < phones.length; i += 100) {
      var chunk = phones.slice(i, i + 100);
      try { var res = provider.send(chunk, text); sent += res.sent; failed += res.failed; if (res.error) error = res.error; if (res.response) lastResponse = res.response; }
      catch (e) { failed += chunk.length; error = String(e && e.message || e); }
    }
  });
  return { sent: sent, failed: failed, error: error, response: lastResponse };
}

/* ---------------- send one message (only once, even if two runs overlap) ---------------- */
function processMessage(id, now) {
  now = now || new Date();
  var d = fs.get('smsMessages/' + id);
  if (!d) return { skipped: true };
  var m = d.data;
  if (m.status !== 'queued' && m.status !== 'scheduled') return { skipped: true };
  if (m.status === 'scheduled' && m.sendAt && new Date(m.sendAt).getTime() > now.getTime()) return { skipped: true };
  if (!fs.update('smsMessages/' + id, { status: 'sending', startedAt: new Date(), via: 'apps-script' }, { updateTime: d.updateTime })) return { skipped: true };
  try {
    var settings = settings_();
    var provider = provider_(settings);
    var recipients = resolveRecipients(m.audience, m.branchId || null, now);
    if (!recipients.length) {
      fs.update('smsMessages/' + id, { status: 'failed', recipientsCount: 0, sentCount: 0, failedCount: 0, error: 'No recipients with a valid phone number.', finishedAt: new Date() });
      return { sent: 0, failed: 0 };
    }
    var res = deliver_(provider, recipients, m.message || '', settings.churchName);
    var upd = { status: res.sent > 0 ? 'sent' : 'failed', provider: provider.name, recipientsCount: recipients.length, sentCount: res.sent, failedCount: res.failed, finishedAt: new Date() };
    if (res.error) upd.error = res.error;
    if (res.response) upd.providerResponse = res.response;
    fs.update('smsMessages/' + id, upd, res.error ? {} : { remove: ['error'] });
    return res;
  } catch (e) {
    fs.update('smsMessages/' + id, { status: 'failed', error: String(e && e.message || e), finishedAt: new Date() });
    throw e;
  }
}

/* ---------------- every 5 minutes ---------------- */
function runTick(now) {
  now = now || new Date();
  var g = ghanaNow(now), settings = settings_(), created = [];
  function queue(data) {
    var doc = merge_({ kind: 'automated', status: 'queued', createdAt: new Date(), createdByName: 'Automatic' }, data);
    created.push(fs.add('smsMessages', doc));
  }
  // 1. programme reminders
  fs.query('programmes', [['active', '==', true]]).forEach(function (p) {
    var d = p.data;
    if (!Array.isArray(d.days) || d.days.indexOf(g.day) < 0 || d.lastSentOn === g.date) return;
    var t = String(d.time || '00:00').split(':').map(Number), eventMin = t[0] * 60 + t[1];
    var remindAt = eventMin - (Number(d.remindMinutesBefore) || 0);
    if (g.minutes < remindAt || g.minutes > eventMin + 30) return;
    fs.update('programmes/' + p.id, { lastSentOn: g.date });
    queue({ branchId: d.branchId || null, message: fillTemplate(d.message || '{title} starts at {time}. {link}', { title: d.title || '', link: d.link || '', time: d.time || '' }), audience: d.audience || { type: 'all' }, label: 'Reminder: ' + d.title, programmeId: p.id });
  });
  // 2. missed a service
  if (settings.absenteeEnabled && g.hour >= Number(settings.absenteeHour)) {
    fs.query('services', [['date', '==', g.date]]).forEach(function (s) {
      var d = s.data;
      if (d.absenteeSmsQueued || !(d.count > 0) || (settings.absenteeServiceTypes || []).indexOf(d.type) < 0) return;
      fs.update('services/' + s.id, { absenteeSmsQueued: true });
      queue({ branchId: d.branchId, message: settings.absenteeTemplate, audience: { type: 'absentees', serviceId: s.id, branchId: d.branchId }, label: 'Missed ' + (d.title || d.type) + ' (' + d.date + ')' });
    });
  }
  // 3. birthdays from 7am
  var marker = fs.get('meta/automation'); var mk = marker ? marker.data : {};
  if (settings.birthdayEnabled && g.hour >= 7 && mk.birthdaysOn !== g.date) {
    fs.update('meta/automation', { birthdaysOn: g.date });
    var people = fs.query('members', [['status', '==', 'active']]).filter(function (m) { return typeof m.data.dob === 'string' && m.data.dob.slice(5, 10) === g.md && m.data.phone; });
    if (people.length) queue({ branchId: null, message: settings.birthdayTemplate, audience: { type: 'members', memberIds: people.map(function (p) { return p.id; }) }, label: 'Birthdays ' + g.date });
  }
  // 4. monthly welfare reminders from 9am on the set day
  var w = fs.get('settings/welfare'); w = merge_(DEFAULT_WELFARE, w ? w.data : {});
  if (w.remindEnabled && now.getUTCDate() === Number(w.remindDay) && g.hour >= 9 && mk.welfareOn !== g.date) {
    fs.update('meta/automation', { welfareOn: g.date });
    queue({ branchId: null, message: w.template, audience: { type: 'welfare_defaulters' }, label: 'Welfare reminder ' + g.date.slice(0, 7) });
  }
  var processed = processQueue(now, created);
  heartbeat_(settings, null);
  return { processed: processed, created: created.length };
}

/** Sends everything that is due: new, queued (also stuck ones) and scheduled-for-now. */
function processQueue(now, extra) {
  now = now || new Date();
  var ids = {};
  (extra || []).forEach(function (id) { ids[id] = 1; });
  fs.query('smsMessages', [['status', '==', 'queued']]).forEach(function (d) { ids[d.id] = 1; });
  fs.query('smsMessages', [['status', '==', 'scheduled']]).forEach(function (d) { if (d.data.sendAt && new Date(d.data.sendAt).getTime() <= now.getTime()) ids[d.id] = 1; });
  var n = 0;
  Object.keys(ids).forEach(function (id) { var r = processMessage(id, now); if (!r.skipped) n++; });
  return n;
}

function heartbeat_(settings, error) {
  var hb = { at: new Date(), via: 'apps-script', provider: (settings || settings_()).provider, ok: !error };
  if (error) hb.error = String(error);
  fs.update('meta/heartbeat', hb, error ? {} : { remove: ['error'] });
}

/* ---------------- entry points ---------------- */
/** Time trigger (every 5 minutes). */
function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try { runTick(new Date()); }
  catch (e) { try { heartbeat_(null, e && e.message || e); } catch (x) { /* */ } throw e; }
  finally { lock.releaseLock(); }
}

/** Web app: TOGG calls this right after saving a message so it goes out at once. */
function doGet(e) { return handle_(e); }
function doPost(e) { return handle_(e); }
function handle_(e) {
  var out = { ok: true };
  var lock = LockService.getScriptLock();
  if (lock.tryLock(20000)) {
    try { out.sent = processQueue(new Date()); heartbeat_(null, null); }
    catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
    finally { lock.releaseLock(); }
  }
  if (e && e.parameter && e.parameter.check) out.server = 'TOGG SMS server';
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** RUN THIS ONCE after pasting the code: starts the 5-minute timer and sends anything waiting. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  var res = runTick(new Date());
  Logger.log('TOGG SMS server is running. Sent now: ' + res.processed + '. Next run in 5 minutes.');
  return res;
}
