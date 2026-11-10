require('dotenv').config();
const express = require('express'), session = require('express-session'), PgStore = require('connect-pg-simple')(session);
const { Pool } = require('pg'), bcrypt = require('bcryptjs'), multer = require('multer');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (s, p) => pool.query(s, p || []).then(r => r.rows);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1.5 * 1024 * 1024 } });
const app = express(); app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(session({ store: new PgStore({ pool, createTableIfMissing: true }), secret: process.env.SESSION_SECRET || 'change-me',
  resave: false, saveUninitialized: false, cookie: { maxAge: 7 * 864e5, sameSite: 'lax', secure: 'auto' } }));
// CSRF guard: a POST must come from this same site
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const o = req.headers.origin || req.headers.referer;
  try { if (o && new URL(o).host !== req.headers.host) return res.status(403).send('Forbidden'); } catch (e) { return res.status(403).send('Forbidden'); }
  next();
});

const CAMPUS = { robe: { n: 'Robe', c: 'ROB' }, goba: { n: 'Goba', c: 'GOB' }, shashamane: { n: 'Shashamane', c: 'SHA' } };
const TYPES = ['announcement', 'news', 'event', 'education', 'document', 'project', 'gallery'];
const SLUG = { announcement: 'announcements', news: 'news', event: 'events', education: 'education', document: 'documents', project: 'projects', gallery: 'gallery' };
const CENTRAL = ['central_admin', 'president', 'vice_president', 'secretary', 'finance', 'pr'];
const ROLES = ['president', 'vice_president', 'secretary', 'finance', 'pr', 'campus_rep', 'campus_secretary', 'campus_finance'];
const PERMS = { central_admin: '*', president: '*', vice_president: ['members', 'content', 'finance', 'support', 'leaders', 'approve'], secretary: ['members', 'content', 'support', 'leaders'], finance: ['finance'], pr: ['content', 'leaders'],
  campus_rep: ['members', 'content', 'support', 'finance'], campus_secretary: ['members', 'content', 'support'], campus_finance: ['finance'] };
const can = (req, x) => { const a = PERMS[req.session.sr]; return a === '*' || (Array.isArray(a) && a.includes(x)); };
const guard = x => (req, res, next) => (req.session.sr && can(req, x)) ? next() : res.redirect('/admin-login');
const T = {
  om: { site: 'Gamtaa Barattoota Siikkoo-Mandoo', uni: 'Yuunivarsiitii Madda Walaabuu', tag: 'Mana dijitaalaa barattoota Siikkoo-Mandoo kaampasii sadanii',
    home: 'Fuula Jalqabaa', reg: "Galmaa'i", login: 'Seeni', logout: "Ba'i", dash: 'Daashboordii', admin: 'Bulchiinsa', announcement: 'Beeksisa', news: 'Oduu', event: 'Taateewwan', campus: 'Kaampasii',
    members: 'Miseensota', official: 'Miseensa idilee', registered: "Galmaa'e", pending: 'Eeggataa', rejected: 'Kuufame', latest: 'Haaraa', none: 'Ammaaf homtu hin jiru',
    name: 'Maqaa guutuu', gender: 'Saala', male: 'Dhiira', female: 'Dubartii', phone: 'Bilbila', email: 'Imeelii', dept: 'Muummee', year: 'Waggaa barnootaa', sid: 'Lakkoofsa ID barattootaa',
    pass: 'Jecha darbii', photo: 'Suuraa', want: "Miseensa idilee ta'uu barbaadaa?", send: 'Ergi', card: 'Kaardii Miseensummaa', no: 'Lakkoofsa miseensaa', verify: 'Mirkaneessi',
    valid: "Kaardiin kun dhugaa dha ✔", invalid: 'Kaardiin kun hin argamne ✘', upgrade: "Gaaffii miseensa idilee ta'uu ergi", print: 'Maxxansi', title: 'Mata-duree', body: 'Ibsa', date: 'Guyyaa', add: 'Dabaluu', del: 'Haqi',
    approve: 'Mirkaneessi', reject: 'Didi', total: 'Waliigala', bad: 'Odeeffannoon sirrii miti', exists: 'Lakkoofsi kun duraan galmaa’eera', more: 'Dabalataa' },
  en: { site: 'Siikkoo-Mandoo Students Association', uni: 'Madda Walabu University', tag: 'The digital home of Siikkoo-Mandoo students across all three campuses',
    home: 'Home', reg: 'Register', login: 'Login', logout: 'Logout', dash: 'Dashboard', admin: 'Administration', announcement: 'Announcements', news: 'News', event: 'Events', campus: 'Campus',
    members: 'Members', official: 'Official member', registered: 'Registered', pending: 'Pending', rejected: 'Rejected', latest: 'Latest', none: 'Nothing yet',
    name: 'Full name', gender: 'Gender', male: 'Male', female: 'Female', phone: 'Phone', email: 'Email', dept: 'Department', year: 'Academic year', sid: 'University student ID',
    pass: 'Password', photo: 'Photo', want: 'Become an official member?', send: 'Submit', card: 'Membership Card', no: 'Membership no.', verify: 'Verify',
    valid: 'This card is valid ✔', invalid: 'Card not found ✘', upgrade: 'Request official membership', print: 'Print', title: 'Title', body: 'Details', date: 'Date', add: 'Add', del: 'Delete',
    approve: 'Approve', reject: 'Reject', total: 'Total', bad: 'Please check your information', exists: 'This ID is already registered', more: 'More' }
};
Object.assign(T.om, { about: 'Waa’ee Keenya', leadership: 'Geggeessitoota', education: 'Barnoota', document: 'Sanadoota', project: 'Pirojektoota', gallery: 'Suuraa', finance: 'Maallaqa', contact: 'Nu Qunnamaa', support: 'Deeggarsa', search: 'Barbaadi',
  aboutText: 'Gamtaan Barattoota Siikkoo-Mandoo Yuunivarsiitii Madda Walaabuu kaampasii Roobee, Gooobaa fi Shaashamanee keessatti barattoota walitti fida, barnootaa fi tokkummaa isaanii cimsa.', menu: 'Menu', message: 'Ergaa', dl: 'Buusi' });
Object.assign(T.en, { about: 'About', leadership: 'Leadership', education: 'Education', document: 'Documents', project: 'Projects', gallery: 'Gallery', finance: 'Finance', contact: 'Contact', support: 'Support', search: 'Search',
  aboutText: 'The Siikkoo-Mandoo Students Association of Madda Walabu University unites students on the Robe, Goba and Shashamane campuses and strengthens their education and solidarity.', menu: 'Menu', message: 'Message', dl: 'Download' });
const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = req => (req.session.lang === 'en' ? 'en' : 'om');
const tr = (req, k) => T[L(req)][k] || k;
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:Poppins,'Segoe UI',system-ui,sans-serif;background:#f6f3ea;color:#161616}a{color:#0b7a43}
.str{height:10px;background:repeating-linear-gradient(135deg,#0b7a43 0 14px,#d62828 14px 28px,#111 28px 42px)}
header{background:#111;color:#fff}.in{max-width:1000px;margin:auto;padding:12px 14px}.top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.logo{font-weight:800;color:#fff;text-decoration:none;display:flex;gap:10px;align-items:center;line-height:1.2}.logo i{width:38px;height:38px;border-radius:50%;background:#0b7a43;display:grid;place-items:center;font-style:normal;border:3px solid #d62828}
nav{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}nav a{color:#fff;text-decoration:none;padding:7px 12px;border-radius:99px;font-size:14px;font-weight:600}nav a:hover{background:#0b7a43}
.hero{background:linear-gradient(135deg,#0b7a43,#075a31 60%,#111);color:#fff;padding:40px 14px;text-align:center}.hero h1{margin:0 0 8px;font-size:clamp(1.5rem,5vw,2.4rem)}.hero p{margin:0 auto 18px;max-width:560px;opacity:.92}
.btn,button{display:inline-block;background:#d62828;color:#fff;border:0;border-radius:99px;padding:11px 20px;font-weight:700;font-size:15px;text-decoration:none;cursor:pointer}.btn.g{background:#0b7a43}.btn.k{background:#111}
.card{background:#fff;border-radius:18px;padding:18px;margin:14px 0;box-shadow:0 2px 10px rgba(0,0,0,.08);border-top:5px solid #0b7a43}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.tile{background:#fff;border-radius:16px;padding:16px;text-align:center;border-bottom:5px solid #d62828}.tile b{display:block;font-size:2rem;color:#0b7a43}
label{display:block;font-weight:600;font-size:13px;margin:10px 0 4px}input,select,textarea{width:100%;padding:11px;border:2px solid #d9d4c4;border-radius:12px;font:inherit;background:#fff}
table{width:100%;border-collapse:collapse;font-size:13px}th{background:#0b7a43;color:#fff;text-align:left}th,td{padding:8px;border-bottom:1px solid #eee}.tw{overflow-x:auto}
.badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;background:#eee}.badge.official{background:#0b7a43;color:#fff}.badge.pending{background:#f5c542}.badge.rejected{background:#d62828;color:#fff}
.id{max-width:380px;margin:auto;border-radius:18px;overflow:hidden;background:#fff;border:2px solid #111;box-shadow:0 6px 18px rgba(0,0,0,.2)}.id .hd{background:#111;color:#fff;padding:10px 14px;font-weight:700;font-size:13px}
.id .bd{display:flex;gap:12px;padding:14px}.id img{width:92px;height:116px;object-fit:cover;border-radius:10px;border:3px solid #0b7a43;background:#eee}.id small{color:#666}
details.menu summary{cursor:pointer;font-weight:700;padding:6px 0;list-style:none}details.menu summary::-webkit-details-marker{display:none}details.menu input{background:#222;color:#fff;border-color:#444}@media(min-width:821px){details.menu summary{display:none}}
.im{width:100%;max-height:240px;object-fit:cover;border-radius:12px;margin:8px 0}.pb{height:12px;border-radius:99px;background:#e6e1d0;overflow:hidden}.pb i{display:block;height:100%;background:linear-gradient(90deg,#0b7a43,#d62828)}.lc{text-align:center}.lc img{width:110px;height:110px;border-radius:50%;object-fit:cover;border:4px solid #0b7a43;background:#eee}
footer{background:#111;color:#bbb;text-align:center;padding:18px;margin-top:30px;font-size:13px}.err{background:#ffe3e3;border:2px solid #d62828;padding:10px;border-radius:12px;margin:10px 0}
@media print{header,footer,.str,.np{display:none!important}body{background:#fff}}`;
function page(req, title, body) {
  const l = L(req), a = n => `<a href="${n[0]}">${n[1]}</a>`;
  const nav = [['/', tr(req, 'home')], ['/about', tr(req, 'about')], ['/leadership', tr(req, 'leadership')]].concat(['announcement', 'news', 'event', 'education', 'document', 'gallery', 'project'].map(k => ['/' + SLUG[k], tr(req, k)]))
    .concat([['/finance', tr(req, 'finance')], ['/contact', tr(req, 'contact')]]).concat(Object.keys(CAMPUS).map(k => ['/campus/' + k, CAMPUS[k].n]))
    .concat(req.session.mid || req.session.sr ? [[req.session.sr ? '/admin' : '/student-dashboard', tr(req, 'dash')], ['/logout', tr(req, 'logout')]] : [['/sikkoo-mandoo-register', tr(req, 'reg')], ['/login', tr(req, 'login')]]);
  return `<!DOCTYPE html><html lang="${l}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b7a43">
<title>${h(title)} · ${h(T[l].site)}</title><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
<div class="str"></div><header><div class="in"><div class="top"><a class="logo" href="/"><i>🌳</i><span>${h(T[l].site)}<br><small style="font-weight:400;opacity:.8">${h(T[l].uni)}</small></span></a>
<span style="display:flex;gap:8px;align-items:center"><a class="btn k" style="padding:6px 12px;font-size:13px;background:#333" href="/lang/${l === 'om' ? 'en' : 'om'}">${l === 'om' ? 'English' : 'Afaan Oromoo'}</a></span></div>
<details class="menu" id="mn"><summary>☰ ${h(tr(req, 'menu'))}</summary><form action="/search" style="margin:8px 0"><input name="q" placeholder="${h(tr(req, 'search'))}…" style="padding:8px 12px"></form><nav>${nav.map(a).join('')}</nav></details></div></header>
${body}<footer>© ${new Date().getFullYear()} ${h(T[l].site)} · ${h(T[l].uni)} · <a href="/admin-login" style="color:#888">Admin</a></footer>
<script>if(innerWidth>820)document.getElementById('mn').open=true</script></body></html>`;
}
const wrap = c => `<div class="in">${c}</div>`;
const pick = (r, k) => (L(r) === 'om' ? r['_' + k + '_om'] : null);
function postT(req, p, f) { const o = p[f + '_om'], e = p[f + '_en']; return L(req) === 'om' ? (o || e || '') : (e || o || ''); }
function postCard(req, p) {
  return `<div class="card"><small>${h(p.campus === 'all' ? '' : (CAMPUS[p.campus] || {}).n)} ${h(p.event_date || '')}</small><h3 style="margin:4px 0">${h(postT(req, p, 'title'))}</h3>
${p.image_id ? `<img class="im" src="/photo/${p.image_id}" alt="" loading="lazy">` : ''}<div>${h(postT(req, p, 'body')).replace(/\n/g, '<br>')}</div>
${p.type === 'project' ? `<div class="pb" style="margin-top:8px"><i style="width:${Math.min(100, p.progress || 0)}%"></i></div><small>${p.progress || 0}%</small>` : ''}
${p.file_id ? `<p><a class="btn g" style="padding:6px 14px;font-size:13px" href="/photo/${p.file_id}?dl=1">⬇ ${h(tr(req, 'dl'))}</a></p>` : ''}</div>`;
}
const scopeOf = req => (CENTRAL.includes(req.session.sr) ? null : (req.session.campus || '-'));

// ---------- database ----------
(async () => {
  await q(`CREATE TABLE IF NOT EXISTS files (id SERIAL PRIMARY KEY, mime TEXT, data BYTEA)`);
  await q(`CREATE TABLE IF NOT EXISTS members (id SERIAL PRIMARY KEY, member_no TEXT UNIQUE, name TEXT, gender TEXT, phone TEXT, email TEXT, campus TEXT, department TEXT, year TEXT,
    student_id TEXT UNIQUE, photo_id INTEGER, password TEXT, status TEXT DEFAULT 'registered', role TEXT DEFAULT 'student', created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, type TEXT, campus TEXT DEFAULT 'all', title_om TEXT, title_en TEXT, body_om TEXT, body_en TEXT, event_date TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  for (const sql of [`ALTER TABLE files ADD COLUMN IF NOT EXISTS name TEXT`, `ALTER TABLE posts ADD COLUMN IF NOT EXISTS file_id INTEGER`, `ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_id INTEGER`, `ALTER TABLE posts ADD COLUMN IF NOT EXISTS progress INTEGER`,
    `CREATE TABLE IF NOT EXISTS staff (id SERIAL PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, campus TEXT, password TEXT, active INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS leaders (id SERIAL PRIMARY KEY, name TEXT, position_om TEXT, position_en TEXT, level TEXT DEFAULT 'central', campus TEXT DEFAULT 'all', photo_id INTEGER, ord INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS support_requests (id SERIAL PRIMARY KEY, member_no TEXT, name TEXT, campus TEXT, subject TEXT, message TEXT, status TEXT DEFAULT 'open', reply TEXT, created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS transactions (id SERIAL PRIMARY KEY, kind TEXT, amount NUMERIC, tdate TEXT, note TEXT, campus TEXT DEFAULT 'all', created_by TEXT, created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS finance_reports (id SERIAL PRIMARY KEY, period TEXT, campus TEXT, income NUMERIC, expense NUMERIC, detail TEXT, approved INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`]) await q(sql);

  // admin አካውንቱን ዳታቤዝ ላይ ማዘጋጀት/ማዘመን
  const defaultAdminPass = bcrypt.hashSync('sikomando123', 10);
  await q(`
    INSERT INTO staff (username, name, role, campus, password, active)
    VALUES ('admin', 'Central Admin', 'central_admin', NULL, $1, 1)
    ON CONFLICT (username) DO UPDATE 
    SET password = $1, role = 'central_admin', active = 1
  `, [defaultAdminPass]);
})().catch(e => console.error('DB init', e.message));

// ---------- public pages ----------
app.get('/lang/:l', (req, res) => { req.session.lang = req.params.l === 'en' ? 'en' : 'om'; res.redirect(req.get('referer') || '/'); });
app.get('/', async (req, res) => {
  try {
    const st = await q(`SELECT campus, COUNT(*)::int AS n, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int AS o FROM members GROUP BY campus`);
    const total = st.reduce((a, r) => a + r.n, 0), off = st.reduce((a, r) => a + r.o, 0);
    const posts = await q(`SELECT * FROM posts ORDER BY id DESC LIMIT 6`);
    res.send(page(req, tr(req, 'home'), `<div class="hero"><h1>${h(tr(req, 'site'))}</h1><p>${h(tr(req, 'tag'))}</p>
<a class="btn" href="/sikkoo-mandoo-register">${h(tr(req, 'reg'))}</a> <a class="btn g" href="/login">${h(tr(req, 'login'))}</a></div>` + wrap(`
<div class="grid" style="margin-top:16px"><div class="tile"><b>${total}</b>${h(tr(req, 'registered'))}</div><div class="tile"><b>${off}</b>${h(tr(req, 'official'))}</div>
${Object.keys(CAMPUS).map(k => `<a class="tile" style="text-decoration:none;color:inherit" href="/campus/${k}"><b>${(st.find(r => r.campus === k) || { n: 0 }).n}</b>${CAMPUS[k].n}</a>`).join('')}</div>
<h2>${h(tr(req, 'latest'))}</h2>${posts.map(p => postCard(req, p)).join('') || `<div class="card">${h(tr(req, 'none'))}</div>`}`)));
  } catch (e) { res.status(500).send('Error'); }
});
TYPES.forEach(tp => app.get('/' + SLUG[tp], async (req, res) => {
  const rows = await q(`SELECT * FROM posts WHERE type=$1 ORDER BY id DESC LIMIT 60`, [tp]);
  res.send(page(req, tr(req, tp), wrap(`<h2>${h(tr(req, tp))}</h2>${tp === 'gallery' ? `<div class="grid">${rows.map(p => `<div class="card" style="padding:8px"><img class="im" style="max-height:200px;margin:0" src="/photo/${p.image_id}" loading="lazy"><small>${h(postT(req, p, 'title'))}</small></div>`).join('')}</div>` : rows.map(p => postCard(req, p)).join('')}${rows.length ? '' : `<div class="card">${h(tr(req, 'none'))}</div>`}`)));
}));
app.get('/about', (req, res) => res.send(page(req, tr(req, 'about'), wrap(`<div class="card"><h2>${h(tr(req, 'about'))}</h2><p>${h(tr(req, 'aboutText'))}</p></div>`))));
app.get('/leadership', async (req, res) => {
  const ls = await q(`SELECT * FROM leaders ORDER BY (level='central') DESC, ord, id`);
  const grp = (t, list) => list.length ? `<h3>${h(t)}</h3><div class="grid">${list.map(x => `<div class="card lc"><img src="${x.photo_id ? '/photo/' + x.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}" alt=""><h4 style="margin:8px 0 2px">${h(x.name)}</h4><small>${h(L(req) === 'om' ? (x.position_om || x.position_en) : (x.position_en || x.position_om))}</small></div>`).join('')}</div>` : '';
  res.send(page(req, tr(req, 'leadership'), wrap(`<h2>${h(tr(req, 'leadership'))}</h2>${grp('Central', ls.filter(x => x.level === 'central'))}${Object.keys(CAMPUS).map(k => grp(CAMPUS[k].n, ls.filter(x => x.level !== 'central' && x.campus === k))).join('')}${ls.length ? '' : `<div class="card">${h(tr(req, 'none'))}</div>`}`)));
});
app.get('/finance', async (req, res) => {
  const rs = await q(`SELECT * FROM finance_reports WHERE approved=1 ORDER BY period DESC, id DESC LIMIT 36`);
  res.send(page(req, tr(req, 'finance'), wrap(`<h2>${h(tr(req, 'finance'))}</h2>${rs.map(r => { const d = JSON.parse(r.detail || '{}'); return `<div class="card"><h3>${h(r.period)} · ${h(r.campus === 'all' ? 'All' : (CAMPUS[r.campus] || {}).n)}</h3>
<div class="grid"><div class="tile"><b>${Number(r.income).toLocaleString()}</b>Income</div><div class="tile"><b>${Number(r.expense).toLocaleString()}</b>Expense</div><div class="tile"><b>${(r.income - r.expense).toLocaleString()}</b>Balance</div></div>
<p>${Object.keys(d).map(k => `${h(k)}: ${Number(d[k]).toLocaleString()}`).join(' · ')}</p></div>`; }).join('') || `<div class="card">${h(tr(req, 'none'))}</div>`}`)));
});
app.get('/contact', (req, res) => res.send(page(req, tr(req, 'contact'), wrap(`<div class="card"><h2>${h(tr(req, 'contact'))}</h2><p>✉ ${h(process.env.CONTACT_EMAIL || '—')} · ☎ ${h(process.env.CONTACT_PHONE || '—')}</p>${req.query.ok ? '<div class="msgok">✔</div>' : ''}
<form method="POST" action="/contact"><label>${h(tr(req, 'name'))}</label><input name="name" required><label>${h(tr(req, 'message'))}</label><textarea name="message" rows="4" required></textarea><p><button>${h(tr(req, 'send'))}</button></p></form></div>`))));
app.post('/contact', async (req, res) => {
  const n = String(req.body.name || '').slice(0, 80), m = String(req.body.message || '').slice(0, 2000);
  if (n && m) await q(`INSERT INTO support_requests (member_no,name,campus,subject,message) VALUES ('PUBLIC',$1,'all','Contact form',$2)`, [n, m]); res.redirect('/contact?ok=1');
});
app.get('/search', async (req, res) => {
  const t = '%' + String(req.query.q || '').trim().slice(0, 60) + '%';
  const ps = String(req.query.q || '').trim() ? await q(`SELECT * FROM posts WHERE title_om ILIKE $1 OR title_en ILIKE $1 OR body_om ILIKE $1 OR body_en ILIKE $1 ORDER BY id DESC LIMIT 30`, [t]) : [];
  res.send(page(req, tr(req, 'search'), wrap(`<h2>${h(tr(req, 'search'))}: ${h(req.query.q || '')}</h2>${ps.map(p => postCard(req, p)).join('') || `<div class="card">${h(tr(req, 'none'))}</div>`}`)));
});
app.get('/campus/:c', async (req, res) => {
  const c = CAMPUS[req.params.c]; if (!c) return res.redirect('/');
  const [n] = await q(`SELECT COUNT(*)::int AS n, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int AS o FROM members WHERE campus=$1`, [req.params.c]);
  const rows = await q(`SELECT * FROM posts WHERE campus IN ('all',$1) ORDER BY id DESC LIMIT 30`, [req.params.c]);
  res.send(page(req, c.n, wrap(`<h2>${h(tr(req, 'campus'))}: ${c.n}</h2><div class="grid"><div class="tile"><b>${n.n}</b>${h(tr(req, 'registered'))}</div><div class="tile"><b>${n.o || 0}</b>${h(tr(req, 'official'))}</div></div>
${rows.map(p => postCard(req, p)).join('')}`)));
});
app.get('/photo/:id', async (req, res) => {
  const [f] = await q(`SELECT mime, data, name FROM files WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (!f) return res.status(404).end(); res.set('Content-Type', f.mime).set('Cache-Control', 'public,max-age=604800'); if (req.query.dl) res.set('Content-Disposition', `attachment; filename="${String(f.name || 'file').replace(/[^\w.\-]/g, '_')}"`); res.send(f.data);
});

// ---------- registration ----------
function regForm(req, err, v) {
  v = v || {}; const s = (k, o) => o.map(x => `<option value="${x[0]}"${v[k] === x[0] ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  return page(req, tr(req, 'reg'), wrap(`<div class="card"><h2>${h(tr(req, 'reg'))}</h2>${err ? `<div class="err">${h(err)}</div>` : ''}
<form method="POST" action="/sikkoo-mandoo-register" enctype="multipart/form-data">
<label>${h(tr(req, 'name'))}</label><input name="name" required value="${h(v.name)}">
<label>${h(tr(req, 'gender'))}</label><select name="gender">${s('gender', [['M', tr(req, 'male')], ['F', tr(req, 'female')]])}</select>
<label>${h(tr(req, 'campus'))}</label><select name="campus" required>${s('campus', Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n]))}</select>
<label>${h(tr(req, 'dept'))}</label><input name="department" required value="${h(v.department)}">
<label>${h(tr(req, 'year'))}</label><select name="year">${s('year', [1, 2, 3, 4, 5, 6].map(x => [String(x), String(x)]))}</select>
<label>${h(tr(req, 'sid'))}</label><input name="student_id" required value="${h(v.student_id)}" placeholder="UGRR/12345/15">
<label>${h(tr(req, 'phone'))}</label><input name="phone" required type="tel" value="${h(v.phone)}">
<label>${h(tr(req, 'email'))}</label><input name="email" type="email" value="${h(v.email)}">
<label>${h(tr(req, 'photo'))}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" id="ph">
<label>${h(tr(req, 'pass'))} (6+)</label><input name="password" type="password" minlength="6" required>
<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="want" value="1" style="width:auto"> ${h(tr(req, 'want'))}</label>
<p><button>${h(tr(req, 'send'))}</button></p></form></div>
<script>document.getElementById('ph').addEventListener('change',function(e){var f=e.target.files[0];if(!f)return;var i=new Image();i.onload=function(){var s=Math.min(1,600/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*s;c.height=i.height*s;c.getContext('2d').drawImage(i,0,0,c.width,c.height);
c.toBlob(function(b){try{var d=new DataTransfer();d.items.add(new File([b],'photo.jpg',{type:'image/jpeg'}));e.target.files=d.files}catch(x){}},'image/jpeg',.82)};i.src=URL.createObjectURL(f)});</script>`));
}
app.get('/sikkoo-mandoo-register', (req, res) => res.send(regForm(req)));
app.post('/sikkoo-mandoo-register', upload.single('photo'), async (req, res) => {
  const b = req.body, c = CAMPUS[b.campus];
  if (!c || !b.name || !b.student_id || !b.phone || !b.department || String(b.password || '').length < 6) return res.send(regForm(req, tr(req, 'bad'), b));
  try {
    if ((await q(`SELECT 1 FROM members WHERE UPPER(student_id)=UPPER($1)`, [b.student_id.trim()])).length) return res.send(regForm(req, tr(req, 'exists'), b));
    let pid = null;
    if (req.file && /^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) pid = (await q(`INSERT INTO files (mime,data) VALUES ($1,$2) RETURNING id`, [req.file.mimetype, req.file.buffer]))[0].id;
    const hash = bcrypt.hashSync(String(b.password), 10), yr = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM members WHERE campus=$1`, [b.campus]);
      const no = `SM-${c.c}-${yr}-${String(n + 1 + i).padStart(4, '0')}`;
      try {
        await q(`INSERT INTO members (member_no,name,gender,phone,email,campus,department,year,student_id,photo_id,password,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [no, b.name.trim().slice(0, 80), b.gender === 'F' ? 'F' : 'M', b.phone.trim().slice(0, 30), (b.email || '').slice(0, 80), b.campus, b.department.trim().slice(0, 80), String(b.year || '1'), b.student_id.trim().slice(0, 40), pid, hash, b.want ? 'pending' : 'registered']);
        req.session.mid = no; req.session.campus = b.campus; req.session.role = 'student'; return res.redirect('/student-dashboard');
      } catch (e) { if (!/duplicate|unique/i.test(e.message)) throw e; }
    }
    res.send(regForm(req, tr(req, 'bad'), b));
  } catch (e) { console.error(e.message); res.status(500).send('Error'); }
});

// ---------- login / dashboard / verify ----------
const fails = new Map();
function limited(req, res) { const f = fails.get(req.ip) || { n: 0, t: Date.now() }; if (Date.now() - f.t > 9e5) { f.n = 0; f.t = Date.now(); } if (f.n >= 10) { res.status(429).send('Too many attempts. Try again later.'); return null; } return f; }
app.get('/login', (req, res) => res.send(page(req, tr(req, 'login'), wrap(`<div class="card"><h2>${h(tr(req, 'login'))}</h2>${req.query.e ? `<div class="err">${h(tr(req, 'bad'))}</div>` : ''}
<form method="POST" action="/login"><label>${h(tr(req, 'no'))}</label><input name="u" required placeholder="SM-ROB-2026-0001"><label>${h(tr(req, 'pass'))}</label><input name="p" type="password" required><p><button>${h(tr(req, 'login'))}</button> <a href="/sikkoo-mandoo-register">${h(tr(req, 'reg'))}</a></p></form></div>`))));
app.post('/login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const [m] = await q(`SELECT * FROM members WHERE UPPER(member_no)=UPPER($1)`, [String(req.body.u || '').trim()]);
  if (m && bcrypt.compareSync(String(req.body.p || ''), m.password)) { req.session.sr = null; req.session.mid = m.member_no; req.session.campus = m.campus; return res.redirect('/student-dashboard'); }
  f.n++; fails.set(req.ip, f); res.redirect('/login?e=1');
});
app.get('/admin-login', (req, res) => res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;font-family:system-ui,sans-serif;color:#fff}
.b{width:min(380px,92vw);background:#1b1b1b;border-radius:18px;padding:26px;border-top:6px solid #d62828}input{width:100%;box-sizing:border-box;padding:12px;margin:6px 0 12px;border-radius:10px;border:1px solid #444;background:#222;color:#fff}button{width:100%;padding:12px;border:0;border-radius:10px;background:#0b7a43;color:#fff;font-weight:700}a{color:#9bd}</style></head>
<body><div class="b"><h2>🔐 Admin · Bulchiinsa</h2><p style="color:#aaa;font-size:13px">Association administration only</p>${req.query.e ? '<p style="color:#f77">Invalid username or password</p>' : ''}
<form method="POST" action="/admin-login"><label>Username</label><input name="u" required autocomplete="username"><label>Password</label><input name="p" type="password" required autocomplete="current-password"><button>Sign in</button></form><p><a href="/">← Website</a> · <a href="/login">Member login</a></p></div></body></html>`));

app.post('/admin-login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const u = String(req.body.u || '').trim(), pw = String(req.body.p || '');

  // 1. የጠየቅከው admin / sikomando123 ወይም በ .env የተገለጸውን ማረጋገጥ
  const isHardcodedAdmin = (u.toLowerCase() === 'admin' && pw === 'sikomando123');
  const isEnvAdmin = (process.env.ADMIN_USER && u === process.env.ADMIN_USER && pw === process.env.ADMIN_PASS);

  if (isHardcodedAdmin || isEnvAdmin) {
    req.session.mid = null;
    req.session.sr = 'central_admin';
    req.session.sname = 'Central Admin';
    req.session.campus = null;
    return res.redirect('/admin');
  }

  // 2. በ staff ቴብል ውስጥ ያለ አካውንት ማረጋገጥ
  const [st] = await q(`SELECT * FROM staff WHERE LOWER(username)=LOWER($1) AND active=1`, [u]);
  if (st && bcrypt.compareSync(pw, st.password)) {
    req.session.mid = null;
    req.session.sr = st.role;
    req.session.sname = st.name;
    req.session.campus = CENTRAL.includes(st.role) ? null : st.campus;
    return res.redirect('/admin');
  }

  f.n++;
  fails.set(req.ip, f);
  res.redirect('/admin-login?e=1');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));
const needMember = (req, res, next) => req.session.mid ? next() : res.redirect('/login');
app.get('/student-dashboard', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]); if (!m) return res.redirect('/logout');
  const sr = await q(`SELECT * FROM support_requests WHERE member_no=$1 ORDER BY id DESC LIMIT 10`, [m.member_no]);
  const base = 'https://' + req.headers.host + '/verify/' + encodeURIComponent(m.member_no);
  res.send(page(req, tr(req, 'card'), wrap(`<h2>${h(tr(req, 'card'))}</h2>
<div class="id"><div class="hd">${h(tr(req, 'site'))} · ${h(tr(req, 'uni'))}</div><div class="bd"><img src="${m.photo_id ? '/photo/' + m.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}" alt="">
<div><b style="font-size:17px">${h(m.name)}</b><br><small>${h(tr(req, 'no'))}</small><br><b style="color:#d62828">${h(m.member_no)}</b><br><small>${h(CAMPUS[m.campus].n)} · ${h(m.department)} · Y${h(m.year)}</small><br>
<span class="badge ${m.status}">${h(tr(req, m.status))}</span></div></div><div style="padding:0 14px 14px;display:flex;justify-content:space-between;align-items:end"><small>${h(m.student_id)}</small><div id="qr"></div></div></div>
<p class="np" style="text-align:center"><button onclick="print()">🖨️ ${h(tr(req, 'print'))}</button> ${m.status === 'registered' ? `<form method="POST" action="/student/upgrade" style="display:inline"><button class="btn g">${h(tr(req, 'upgrade'))}</button></form>` : ''}</p>
<div class="card np"><h3>${h(tr(req, 'support'))}</h3><form method="POST" action="/student/support"><label>${h(tr(req, 'title'))}</label><input name="subject" required><label>${h(tr(req, 'message'))}</label><textarea name="message" rows="3" required></textarea><p><button>${h(tr(req, 'send'))}</button></p></form>
${sr.map(r => `<div style="border-top:1px solid #eee;padding:8px 0"><b>${h(r.subject)}</b> <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span><br>${h(r.message)}${r.reply ? `<br><b style="color:#0b7a43">↪ ${h(r.reply)}</b>` : ''}</div>`).join('')}</div>
<div class="card np"><h3>🔑 ${h(tr(req, 'pass'))}</h3><form method="POST" action="/student/password"><input name="old" type="password" placeholder="Current" required><input name="nw" type="password" placeholder="New (6+)" minlength="6" required style="margin-top:8px"><p><button class="btn k">OK</button></p></form></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><script>new QRCode(document.getElementById('qr'),{text:${JSON.stringify(base)},width:84,height:84});</script>`)));
});
app.post('/student/upgrade', needMember, async (req, res) => { await q(`UPDATE members SET status='pending' WHERE member_no=$1 AND status='registered'`, [req.session.mid]); res.redirect('/student-dashboard'); });
app.post('/student/support', needMember, async (req, res) => {
  const [m] = await q(`SELECT name,campus FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.subject && req.body.message) await q(`INSERT INTO support_requests (member_no,name,campus,subject,message) VALUES ($1,$2,$3,$4,$5)`, [req.session.mid, m.name, m.campus, String(req.body.subject).slice(0, 150), String(req.body.message).slice(0, 2000)]);
  res.redirect('/student-dashboard');
});
app.post('/student/password', needMember, async (req, res) => {
  const [m] = await q(`SELECT password FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && bcrypt.compareSync(String(req.body.old || ''), m.password) && String(req.body.nw || '').length >= 6) await q(`UPDATE members SET password=$1 WHERE member_no=$2`, [bcrypt.hashSync(String(req.body.nw), 10), req.session.mid]);
  res.redirect('/student-dashboard');
});
app.get('/verify/:no', async (req, res) => {
  const [m] = await q(`SELECT name,member_no,campus,department,year,status,photo_id FROM members WHERE UPPER(member_no)=UPPER($1)`, [req.params.no]);
  res.send(page(req, tr(req, 'verify'), wrap(m ? `<div class="card"><h2 style="color:#0b7a43">${h(tr(req, 'valid'))}</h2><div class="id" style="box-shadow:none"><div class="bd"><img src="${m.photo_id ? '/photo/' + m.photo_id : ''}" alt=""><div><b>${h(m.name)}</b><br>${h(m.member_no)}<br><small>${h(CAMPUS[m.campus].n)} · ${h(m.department)} · Y${h(m.year)}</small><br><span class="badge ${m.status}">${h(tr(req, m.status))}</span></div></div></div></div>`
    : `<div class="card"><h2 style="color:#d62828">${h(tr(req, 'invalid'))}</h2></div>`)));
});

// ---------- administration ----------
const needStaff = (req, res, next) => (req.session.sr ? next() : res.redirect('/admin-login'));
const A = (req, title, body) => {
  const links = [['/admin', 'Overview', null], ['/admin/members', 'Members', 'members'], ['/admin/content/announcement', 'Announcements', 'content'], ['/admin/content/news', 'News', 'content'], ['/admin/content/event', 'Events', 'content'],
    ['/admin/content/education', 'Education', 'content'], ['/admin/content/document', 'Documents', 'content'], ['/admin/content/project', 'Projects', 'content'], ['/admin/content/gallery', 'Gallery', 'content'],
    ['/admin/leaders', 'Leadership', 'leaders'], ['/admin/support', 'Support', 'support'], ['/admin/finance', 'Finance', 'finance'], ['/admin/staff', 'Staff', 'staff'], ['/admin/backup', 'Backup', 'staff']].filter(x => !x[2] || can(req, x[2]));
  return page(req, title, wrap(`<div class="card" style="border-top-color:#d62828"><b>${h(req.session.sname || '')}</b> · <span class="badge official">${h(req.session.sr)}</span> ${req.session.campus ? '· ' + h(CAMPUS[req.session.campus].n) : '· All campuses'}
<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${links.map(x => `<a class="btn k" style="padding:5px 12px;font-size:12px" href="${x[0]}">${x[1]}</a>`).join('')}</div></div>${body}`));
};
const OKMIME = /^(image\/(jpeg|png|webp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-[\w.]+))$/;
const up6 = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const files6 = fields => (req, res, next) => up6.fields(fields)(req, res, err => (err ? res.status(400).send('File too large (max 6 MB)') : next()));
async function saveFile(f) { if (!f || !OKMIME.test(f.mimetype)) return null; return (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [f.mimetype, f.buffer, String(f.originalname || 'file').slice(0, 100)]))[0].id; }
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const sel = (name, opts, cur) => `<select name="${name}">${opts.map(o => `<option value="${o[0]}"${cur === o[0] ? ' selected' : ''}>${h(o[1])}</option>`).join('')}</select>`;
const campusOpts = (sc, all) => (sc ? [[sc, CAMPUS[sc].n]] : (all ? [['all', 'All campuses']] : []).concat(Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n])));

app.get('/admin', needStaff, async (req, res) => {
  const sc = scopeOf(req), w = sc ? ' WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const [m] = await q(`SELECT COUNT(*)::int n, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int p, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int o FROM members${w}`, pr);
  const [s] = await q(`SELECT COUNT(*)::int n FROM support_requests WHERE status='open'${sc ? " AND campus IN ($1,'all')" : ''}`, pr);
  const byC = await q(`SELECT campus, COUNT(*)::int n FROM members${w} GROUP BY campus`, pr);
  res.send(A(req, 'Dashboard', `<div class="grid"><div class="tile"><b>${m.n}</b>Members</div><div class="tile"><b>${m.o || 0}</b>Official</div><div class="tile"><b>${m.p || 0}</b>Pending approval</div><div class="tile"><b>${s.n}</b>Open support</div>
${byC.map(r => `<div class="tile"><b>${r.n}</b>${h((CAMPUS[r.campus] || {}).n)}</div>`).join('')}</div>`));
});
// members
async function guardMember(req, res, id) {
  if (!(req.session.sr && can(req, 'members'))) { res.redirect('/admin-login'); return null; }
  const [m] = await q(`SELECT * FROM members WHERE id=$1`, [parseInt(id, 10) || 0]), sc = scopeOf(req);
  if (!m || (sc && m.campus !== sc)) { res.redirect('/admin/members'); return null; } return m;
}
app.get('/admin/members', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : ''), qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); } if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length} OR student_id ILIKE $${pr.length} OR phone ILIKE $${pr.length})`); }
  const ms = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 400`, pr);
  const act = (id, a, t, cls) => `<form method="POST" action="/admin/members/${id}/${a}" style="display:inline"><button class="btn ${cls || ''}" style="padding:4px 10px;font-size:12px">${t}</button></form>`;
  res.send(A(req, 'Members', `<div class="card"><h3>Members (${ms.length})</h3><form style="display:flex;gap:6px;flex-wrap:wrap"><input name="q" value="${h(qs)}" placeholder="Search name / no / ID / phone" style="flex:1;min-width:180px">${sc ? '' : sel('campus', [['', 'All campuses']].concat(campusOpts(null)), cf)}<button>Search</button> <a class="btn g" href="/admin/members.csv?campus=${cf}">⬇ CSV</a></form>
<div class="tw"><table><tr><th>No</th><th>Name</th><th>Campus</th><th>Dept</th><th>Phone</th><th>Status</th><th></th></tr>${ms.map(m => `<tr><td>${h(m.member_no)}</td><td>${h(m.name)}</td><td>${h(CAMPUS[m.campus].n)}</td><td>${h(m.department)} Y${h(m.year)}</td><td>${h(m.phone)}</td><td><span class="badge ${m.status}">${h(m.status)}</span></td>
<td>${m.status !== 'official' ? act(m.id, 'approve', 'Approve', 'g') : ''} ${m.status === 'pending' ? act(m.id, 'reject', 'Reject') : ''} ${m.status === 'official' ? act(m.id, 'revoke', 'Revoke', 'k') : ''}</td></tr>`).join('')}</table></div></div>`));
});
app.get('/admin/members.csv', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : ''), ms = await q(`SELECT member_no,name,gender,phone,email,campus,department,year,student_id,status,created_at FROM members ${cf ? 'WHERE campus=$1' : ''} ORDER BY id`, cf ? [cf] : []);
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="members.csv"').send('\ufeff' + 'No,Name,Gender,Phone,Email,Campus,Department,Year,StudentID,Status,Registered\n' + ms.map(m => [m.member_no, m.name, m.gender, m.phone, m.email, m.campus, m.department, m.year, m.student_id, m.status, m.created_at].map(esc).join(',')).join('\n'));
});
[['approve', 'official'], ['reject', 'rejected'], ['revoke', 'registered']].forEach(([a, st]) => app.post('/admin/members/:id/' + a, async (req, res) => { const m = await guardMember(req, res, req.params.id); if (m) { await q(`UPDATE members SET status=$1 WHERE id=$2`, [st, m.id]); res.redirect('/admin/members'); } }));
// content (announcements, news, events, education, documents, projects, gallery)
app.get('/admin/content/:type', guard('content'), async (req, res) => {
  const tp = req.params.type; if (!TYPES.includes(tp)) return res.redirect('/admin');
  const sc = scopeOf(req), ps = await q(`SELECT * FROM posts WHERE type=$1 ${sc ? 'AND campus=$2' : ''} ORDER BY id DESC LIMIT 60`, sc ? [tp, sc] : [tp]);
  res.send(A(req, tp, `<div class="card"><h3>Add · ${h(tp)}</h3><form method="POST" action="/admin/content/${tp}" enctype="multipart/form-data">
<label>Campus</label>${sel('campus', campusOpts(sc, true))}<label>Title (Afaan Oromoo)</label><input name="title_om"><label>Title (English)</label><input name="title_en">
${tp === 'gallery' ? '' : `<label>Details (Afaan Oromoo)</label><textarea name="body_om" rows="3"></textarea><label>Details (English)</label><textarea name="body_en" rows="3"></textarea>`}
${tp === 'event' ? '<label>Date</label><input name="event_date" type="date">' : ''}${tp === 'project' ? '<label>Progress %</label><input name="progress" type="number" min="0" max="100" value="0">' : ''}
<label>Image ${tp === 'gallery' ? '(required)' : '(optional)'}</label><input name="image" type="file" accept="image/*">${['document', 'education', 'news', 'announcement'].includes(tp) ? '<label>File (PDF / Word, max 6 MB)</label><input name="file" type="file">' : ''}<p><button>Publish</button></p></form></div>
<div class="card">${ps.map(p => `<div style="display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #eee;padding:6px 0"><span>${h(p.campus)} · ${h(postT(req, p, 'title'))}</span><form method="POST" action="/admin/content/${tp}/${p.id}/delete"><button class="btn" style="padding:3px 10px;font-size:12px">Delete</button></form></div>`).join('') || h(tr(req, 'none'))}</div>`));
});
app.post('/admin/content/:type', guard('content'), files6([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const tp = req.params.type, b = req.body, sc = scopeOf(req), s = (k, n) => String(b[k] || '').trim().slice(0, n); if (!TYPES.includes(tp)) return res.redirect('/admin');
  const img = await saveFile(((req.files || {}).image || [])[0]), fl = await saveFile(((req.files || {}).file || [])[0]);
  if ((s('title_om', 200) || s('title_en', 200)) && (tp !== 'gallery' || img)) await q(`INSERT INTO posts (type,campus,title_om,title_en,body_om,body_en,event_date,image_id,file_id,progress) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [tp, sc || (CAMPUS[b.campus] ? b.campus : 'all'), s('title_om', 200), s('title_en', 200), s('body_om', 4000), s('body_en', 4000), s('event_date', 40), img, fl, Math.max(0, Math.min(100, parseInt(b.progress, 10) || 0))]);
  res.redirect('/admin/content/' + tp);
});
app.post('/admin/content/:type/:id/delete', guard('content'), async (req, res) => {
  const sc = scopeOf(req), id = parseInt(req.params.id, 10) || 0; await q(`DELETE FROM posts WHERE id=$1 ${sc ? 'AND campus=$2' : ''}`, sc ? [id, sc] : [id]); res.redirect('/admin/content/' + req.params.type);
});
// leadership
app.get('/admin/leaders', guard('leaders'), async (req, res) => {
  const sc = scopeOf(req), ls = await q(`SELECT * FROM leaders ${sc ? 'WHERE campus=$1' : ''} ORDER BY (level='central') DESC, ord, id`, sc ? [sc] : []);
  res.send(A(req, 'Leadership', `<div class="card"><h3>Add leader</h3><form method="POST" action="/admin/leaders" enctype="multipart/form-data"><label>Name</label><input name="name" required><label>Position (Afaan Oromoo)</label><input name="position_om"><label>Position (English)</label><input name="position_en">
<label>Level</label>${sel('level', sc ? [['campus', 'Campus']] : [['central', 'Central'], ['campus', 'Campus']])}<label>Campus (if campus level)</label>${sel('campus', campusOpts(sc, false))}<label>Order</label><input name="ord" type="number" value="1"><label>Photo</label><input name="photo" type="file" accept="image/*"><p><button>Add</button></p></form></div>
<div class="card">${ls.map(x => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:6px 0"><span>${h(x.name)} · ${h(x.position_en || x.position_om)} · ${h(x.level)} ${h(x.campus)}</span><form method="POST" action="/admin/leaders/${x.id}/delete"><button class="btn" style="padding:3px 10px;font-size:12px">Delete</button></form></div>`).join('') || h(tr(req, 'none'))}</div>`));
});
app.post('/admin/leaders', guard('leaders'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const b = req.body, sc = scopeOf(req), pid = await saveFile(((req.files || {}).photo || [])[0]), lvl = sc ? 'campus' : (b.level === 'campus' ? 'campus' : 'central');
  if (b.name) await q(`INSERT INTO leaders (name,position_om,position_en,level,campus,photo_id,ord) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [String(b.name).slice(0, 80), String(b.position_om || '').slice(0, 100), String(b.position_en || '').slice(0, 100), lvl, lvl === 'central' ? 'all' : (sc || (CAMPUS[b.campus] ? b.campus : 'robe')), pid, parseInt(b.ord, 10) || 0]);
  res.redirect('/admin/leaders');
});
app.post('/admin/leaders/:id/delete', guard('leaders'), async (req, res) => { const sc = scopeOf(req), id = parseInt(req.params.id, 10) || 0; await q(`DELETE FROM leaders WHERE id=$1 ${sc ? 'AND campus=$2' : ''}`, sc ? [id, sc] : [id]); res.redirect('/admin/leaders'); });
// support requests
app.get('/admin/support', guard('support'), async (req, res) => {
  const sc = scopeOf(req), rs = await q(`SELECT * FROM support_requests ${sc ? "WHERE campus IN ($1,'all')" : ''} ORDER BY (status='open') DESC, id DESC LIMIT 100`, sc ? [sc] : []);
  res.send(A(req, 'Student support', rs.map(r => `<div class="card"><small>${h(r.member_no)} · ${h(r.name)} · ${h(r.campus)} · ${h(String(r.created_at).slice(0, 16))}</small><h3 style="margin:4px 0">${h(r.subject)} <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span></h3><p>${h(r.message)}</p>
<form method="POST" action="/admin/support/${r.id}/reply"><textarea name="reply" rows="2" placeholder="Reply">${h(r.reply || '')}</textarea><p><button class="btn g">Reply & close</button></p></form></div>`).join('') || `<div class="card">${h(tr(req, 'none'))}</div>`));
});
app.post('/admin/support/:id/reply', guard('support'), async (req, res) => {
  const sc = scopeOf(req), id = parseInt(req.params.id, 10) || 0; await q(`UPDATE support_requests SET reply=$1, status='closed' WHERE id=$2 ${sc ? "AND campus IN ($3,'all')" : ''}`, sc ? [String(req.body.reply || '').slice(0, 2000), id, sc] : [String(req.body.reply || '').slice(0, 2000), id]); res.redirect('/admin/support');
});
// finance
const KINDS = [['contribution', 'Membership contribution'], ['donation', 'Donation'], ['fundraising', 'Fundraising'], ['income', 'Other income'], ['expense', 'Expense']];
app.get('/admin/finance', guard('finance'), async (req, res) => {
  const sc = scopeOf(req), w = sc ? 'WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const tx = await q(`SELECT * FROM transactions ${w} ORDER BY id DESC LIMIT 80`, pr), [tot] = await q(`SELECT COALESCE(SUM(CASE WHEN kind='expense' THEN 0 ELSE amount END),0) i, COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) e FROM transactions ${w}`, pr);
  const rp = await q(`SELECT * FROM finance_reports ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 24`, pr);
  res.send(A(req, 'Finance', `<div class="grid"><div class="tile"><b>${Number(tot.i).toLocaleString()}</b>Income</div><div class="tile"><b>${Number(tot.e).toLocaleString()}</b>Expense</div><div class="tile"><b>${(tot.i - tot.e).toLocaleString()}</b>Balance</div></div>
<div class="card"><h3>Record transaction</h3><form method="POST" action="/admin/finance/tx"><label>Type</label>${sel('kind', KINDS)}<label>Amount (ETB)</label><input name="amount" type="number" step="0.01" min="0" required><label>Date</label><input name="tdate" type="date" required>
<label>Campus</label>${sel('campus', campusOpts(sc, true))}<label>Note</label><input name="note"><p><button>Save</button></p></form></div>
<div class="card"><h3>Create monthly / annual report</h3><form method="POST" action="/admin/finance/report" style="display:flex;gap:6px;flex-wrap:wrap"><input name="period" placeholder="2026-12 or 2026" required style="max-width:160px">${sel('campus', campusOpts(sc, true))}<button>Create</button></form>
<div class="tw"><table><tr><th>Period</th><th>Campus</th><th>Income</th><th>Expense</th><th>Public</th><th></th></tr>${rp.map(r => `<tr><td>${h(r.period)}</td><td>${h(r.campus)}</td><td>${Number(r.income).toLocaleString()}</td><td>${Number(r.expense).toLocaleString()}</td><td>${r.approved ? '✔ published' : '—'}</td>
<td>${can(req, 'approve') ? `<form method="POST" action="/admin/finance/report/${r.id}/${r.approved ? 'hide' : 'approve'}" style="display:inline"><button class="btn ${r.approved ? 'k' : 'g'}" style="padding:3px 10px;font-size:12px">${r.approved ? 'Hide' : 'Approve & publish'}</button></form>` : ''}</td></tr>`).join('')}</table></div></div>
<div class="card"><h3>Transactions</h3><div class="tw"><table><tr><th>Date</th><th>Type</th><th>Amount</th><th>Campus</th><th>Note</th></tr>${tx.map(t => `<tr><td>${h(t.tdate)}</td><td>${h(t.kind)}</td><td>${Number(t.amount).toLocaleString()}</td><td>${h(t.campus)}</td><td>${h(t.note)}</td></tr>`).join('')}</table></div></div>`));
});
app.post('/admin/finance/tx', guard('finance'), async (req, res) => {
  const b = req.body, sc = scopeOf(req), amt = num(b.amount);
  if (KINDS.some(k => k[0] === b.kind) && amt > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.tdate || '')) await q(`INSERT INTO transactions (kind,amount,tdate,note,campus,created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [b.kind, amt, b.tdate, String(b.note || '').slice(0, 200), sc || (CAMPUS[b.campus] ? b.campus : 'all'), req.session.sname || '']);
  res.redirect('/admin/finance');
});
app.post('/admin/finance/report', guard('finance'), async (req, res) => {
  const per = String(req.body.period || '').trim(), sc = scopeOf(req), cmp = sc || (CAMPUS[req.body.campus] ? req.body.campus : 'all');
  if (/^\d{4}(-\d{2})?$/.test(per)) {
    const rows = await q(`SELECT kind, SUM(amount) a FROM transactions WHERE tdate LIKE $1 ${cmp === 'all' ? '' : 'AND campus=$2'} GROUP BY kind`, cmp === 'all' ? [per + '%'] : [per + '%', cmp]);
    let inc = 0, exp = 0; const d = {}; rows.forEach(r => { d[r.kind] = Number(r.a); if (r.kind === 'expense') exp += Number(r.a); else inc += Number(r.a); });
    await q(`INSERT INTO finance_reports (period,campus,income,expense,detail) VALUES ($1,$2,$3,$4,$5)`, [per, cmp, inc, exp, JSON.stringify(d)]);
  }
  res.redirect('/admin/finance');
});
app.post('/admin/finance/report/:id/:a', guard('approve'), async (req, res) => { await q(`UPDATE finance_reports SET approved=$1 WHERE id=$2`, [req.params.a === 'approve' ? 1 : 0, parseInt(req.params.id, 10) || 0]); res.redirect('/admin/finance'); });
// staff accounts (president / central admin only) + backup
app.get('/admin/staff', guard('staff'), async (req, res) => {
  const st = await q(`SELECT id,username,name,role,campus,active FROM staff ORDER BY id`);
  res.send(A(req, 'Staff accounts', `<div class="card"><h3>Create staff account</h3><form method="POST" action="/admin/staff"><label>Name</label><input name="name" required><label>Username</label><input name="username" required><label>Role</label>${sel('role', ROLES.map(r => [r, r]))}
<label>Campus (campus roles)</label>${sel('campus', campusOpts(null))}<label>Password (8+)</label><input name="password" type="password" minlength="8" required><p><button>Create</button></p></form></div>
<div class="card"><div class="tw"><table><tr><th>Name</th><th>Username</th><th>Role</th><th>Campus</th><th></th></tr>${st.map(x => `<tr><td>${h(x.name)}</td><td>${h(x.username)}</td><td>${h(x.role)}</td><td>${h(x.campus || '')}</td><td><form method="POST" action="/admin/staff/${x.id}/toggle"><button class="btn ${x.active ? 'k' : 'g'}" style="padding:3px 10px;font-size:12px">${x.active ? 'Disable' : 'Enable'}</button></form></td></tr>`).join('')}</table></div></div>`));
});
app.post('/admin/staff', guard('staff'), async (req, res) => {
  const b = req.body; if (ROLES.includes(b.role) && b.name && b.username && String(b.password || '').length >= 8) {
    try { await q(`INSERT INTO staff (username,name,role,campus,password) VALUES ($1,$2,$3,$4,$5)`, [String(b.username).trim().slice(0, 40), String(b.name).slice(0, 80), b.role, CAMPUS[b.campus] ? b.campus : null, bcrypt.hashSync(String(b.password), 10)]); } catch (e) { /* duplicate username */ }
  } res.redirect('/admin/staff');
});
app.post('/admin/staff/:id/toggle', guard('staff'), async (req, res) => { await q(`UPDATE staff SET active=1-active WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/staff'); });
app.get('/admin/backup', guard('staff'), async (req, res) => {
  if (!req.query.go) return res.send(A(req, 'Backup', `<div class="card"><h3>Database backup</h3><p>Download all records (members, content, leaders, finance, support, staff) as one JSON file. Photos and documents are stored in the database and are not in this file — keep your database on a paid plan for permanent storage.</p><a class="btn g" href="/admin/backup?go=1">⬇ Download backup</a></div>`));
  const out = { exported: new Date().toISOString() }; for (const t of ['members', 'posts', 'leaders', 'support_requests', 'transactions', 'finance_reports', 'staff']) out[t] = await q(`SELECT * FROM ${t}`);
  res.set('Content-Type', 'application/json').set('Content-Disposition', `attachment; filename="sikkoo-mandoo-backup-${new Date().toISOString().slice(0, 10)}.json"`).send(JSON.stringify(out));
});
app.listen(process.env.PORT || 3000, () => console.log('Sikkoo-Mandoo portal running'));
