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
const TYPES = ['announcement', 'news', 'event'];
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
footer{background:#111;color:#bbb;text-align:center;padding:18px;margin-top:30px;font-size:13px}.err{background:#ffe3e3;border:2px solid #d62828;padding:10px;border-radius:12px;margin:10px 0}
@media print{header,footer,.str,.np{display:none!important}body{background:#fff}}`;
function page(req, title, body) {
  const l = L(req), a = n => `<a href="${n[0]}">${n[1]}</a>`;
  const nav = [['/', tr(req, 'home')], ['/announcements', tr(req, 'announcement')], ['/news', tr(req, 'news')], ['/events', tr(req, 'event')]]
    .concat(Object.keys(CAMPUS).map(k => ['/campus/' + k, CAMPUS[k].n]))
    .concat(req.session.mid || req.session.admin ? [[req.session.admin || req.session.role === 'campus_rep' ? '/admin' : '/student-dashboard', tr(req, 'dash')], ['/logout', tr(req, 'logout')]] : [['/sikkoo-mandoo-register', tr(req, 'reg')], ['/login', tr(req, 'login')]]);
  return `<!DOCTYPE html><html lang="${l === 'om' ? 'om' : 'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b7a43">
<title>${h(title)} · ${h(T[l].site)}</title><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
<div class="str"></div><header><div class="in"><div class="top"><a class="logo" href="/"><i>🌳</i><span>${h(T[l].site)}<br><small style="font-weight:400;opacity:.8">${h(T[l].uni)}</small></span></a>
<span><a class="btn k" style="padding:6px 12px;font-size:13px" href="/lang/${l === 'om' ? 'en' : 'om'}">${l === 'om' ? 'English' : 'Afaan Oromoo'}</a></span></div><nav>${nav.map(a).join('')}</nav></div></header>
${body}<footer>© ${new Date().getFullYear()} ${h(T[l].site)} · ${h(T[l].uni)}</footer></body></html>`;
}
const wrap = c => `<div class="in">${c}</div>`;
const pick = (r, k) => (L(r) === 'om' ? r['_' + k + '_om'] : null);
function postT(req, p, f) { const o = p[f + '_om'], e = p[f + '_en']; return L(req) === 'om' ? (o || e || '') : (e || o || ''); }
function postCard(req, p) {
  return `<div class="card"><small>${h(p.campus === 'all' ? '' : (CAMPUS[p.campus] || {}).n)} ${h(p.event_date || '')}</small><h3 style="margin:4px 0">${h(postT(req, p, 'title'))}</h3><div>${h(postT(req, p, 'body')).replace(/\n/g, '<br>')}</div></div>`;
}
const needLogin = (req, res) => { if (!req.session.mid && !req.session.admin) { res.redirect('/login'); return false; } return true; };
const scopeOf = req => (req.session.admin ? null : (req.session.campus || '-'));

// ---------- database ----------
(async () => {
  await q(`CREATE TABLE IF NOT EXISTS files (id SERIAL PRIMARY KEY, mime TEXT, data BYTEA)`);
  await q(`CREATE TABLE IF NOT EXISTS members (id SERIAL PRIMARY KEY, member_no TEXT UNIQUE, name TEXT, gender TEXT, phone TEXT, email TEXT, campus TEXT, department TEXT, year TEXT,
    student_id TEXT UNIQUE, photo_id INTEGER, password TEXT, status TEXT DEFAULT 'registered', role TEXT DEFAULT 'student', created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, type TEXT, campus TEXT DEFAULT 'all', title_om TEXT, title_en TEXT, body_om TEXT, body_en TEXT, event_date TEXT, created_at TIMESTAMP DEFAULT NOW())`);
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
TYPES.forEach(tp => app.get('/' + tp + 's', async (req, res) => {
  const rows = await q(`SELECT * FROM posts WHERE type=$1 ORDER BY id DESC LIMIT 60`, [tp]);
  res.send(page(req, tr(req, tp), wrap(`<h2>${h(tr(req, tp))}</h2>${rows.map(p => postCard(req, p)).join('') || `<div class="card">${h(tr(req, 'none'))}</div>`}`)));
}));
app.get('/campus/:c', async (req, res) => {
  const c = CAMPUS[req.params.c]; if (!c) return res.redirect('/');
  const [n] = await q(`SELECT COUNT(*)::int AS n, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int AS o FROM members WHERE campus=$1`, [req.params.c]);
  const rows = await q(`SELECT * FROM posts WHERE campus IN ('all',$1) ORDER BY id DESC LIMIT 30`, [req.params.c]);
  res.send(page(req, c.n, wrap(`<h2>${h(tr(req, 'campus'))}: ${c.n}</h2><div class="grid"><div class="tile"><b>${n.n}</b>${h(tr(req, 'registered'))}</div><div class="tile"><b>${n.o || 0}</b>${h(tr(req, 'official'))}</div></div>
${rows.map(p => postCard(req, p)).join('')}`)));
});
app.get('/photo/:id', async (req, res) => {
  const [f] = await q(`SELECT mime, data FROM files WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (!f) return res.status(404).end(); res.set('Content-Type', f.mime).set('Cache-Control', 'public,max-age=604800').send(f.data);
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
app.get('/login', (req, res) => res.send(page(req, tr(req, 'login'), wrap(`<div class="card"><h2>${h(tr(req, 'login'))}</h2>${req.query.e ? `<div class="err">${h(tr(req, 'bad'))}</div>` : ''}
<form method="POST" action="/login"><label>${h(tr(req, 'no'))} / Admin</label><input name="u" required><label>${h(tr(req, 'pass'))}</label><input name="p" type="password" required><p><button>${h(tr(req, 'login'))}</button></p></form></div>`))));
app.post('/login', async (req, res) => {
  const ip = req.ip, f = fails.get(ip) || { n: 0, t: Date.now() }; if (Date.now() - f.t > 9e5) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 10) return res.status(429).send('Too many attempts. Try again later.');
  const u = String(req.body.u || '').trim(), p = String(req.body.p || '');
  if (process.env.ADMIN_USER && u === process.env.ADMIN_USER && p === process.env.ADMIN_PASS) { req.session.admin = true; return res.redirect('/admin'); }
  const [m] = await q(`SELECT * FROM members WHERE UPPER(member_no)=UPPER($1)`, [u]);
  if (m && bcrypt.compareSync(p, m.password)) { req.session.mid = m.member_no; req.session.campus = m.campus; req.session.role = m.role; return res.redirect(m.role === 'campus_rep' ? '/admin' : '/student-dashboard'); }
  f.n++; fails.set(ip, f); res.redirect('/login?e=1');
});
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));
app.get('/student-dashboard', async (req, res) => {
  if (!req.session.mid) return res.redirect('/login');
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]); if (!m) return res.redirect('/logout');
  const base = 'https://' + req.headers.host + '/verify/' + encodeURIComponent(m.member_no);
  res.send(page(req, tr(req, 'card'), wrap(`<h2>${h(tr(req, 'card'))}</h2>
<div class="id"><div class="hd">${h(tr(req, 'site'))} · ${h(tr(req, 'uni'))}</div><div class="bd"><img src="${m.photo_id ? '/photo/' + m.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}" alt="">
<div><b style="font-size:17px">${h(m.name)}</b><br><small>${h(tr(req, 'no'))}</small><br><b style="color:#d62828">${h(m.member_no)}</b><br><small>${h(CAMPUS[m.campus].n)} · ${h(m.department)} · Y${h(m.year)}</small><br>
<span class="badge ${m.status}">${h(tr(req, m.status))}</span></div></div><div style="padding:0 14px 14px;display:flex;justify-content:space-between;align-items:end"><small>${h(m.student_id)}</small><div id="qr"></div></div></div>
<p class="np" style="text-align:center"><button onclick="print()">🖨️ ${h(tr(req, 'print'))}</button> ${m.status === 'registered' ? `<form method="POST" action="/student/upgrade" style="display:inline"><button class="btn g">${h(tr(req, 'upgrade'))}</button></form>` : ''}</p>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><script>new QRCode(document.getElementById('qr'),{text:${JSON.stringify(base)},width:84,height:84});</script>`)));
});
app.post('/student/upgrade', async (req, res) => {
  if (req.session.mid) await q(`UPDATE members SET status='pending' WHERE member_no=$1 AND status='registered'`, [req.session.mid]); res.redirect('/student-dashboard');
});
app.get('/verify/:no', async (req, res) => {
  const [m] = await q(`SELECT name,member_no,campus,department,year,status,photo_id FROM members WHERE UPPER(member_no)=UPPER($1)`, [req.params.no]);
  res.send(page(req, tr(req, 'verify'), wrap(m ? `<div class="card"><h2 class="ok" style="color:#0b7a43">${h(tr(req, 'valid'))}</h2><div class="id" style="box-shadow:none"><div class="bd"><img src="${m.photo_id ? '/photo/' + m.photo_id : ''}" alt=""><div><b>${h(m.name)}</b><br>${h(m.member_no)}<br><small>${h(CAMPUS[m.campus].n)} · ${h(m.department)} · Y${h(m.year)}</small><br><span class="badge ${m.status}">${h(tr(req, m.status))}</span></div></div></div></div>`
    : `<div class="card"><h2 style="color:#d62828">${h(tr(req, 'invalid'))}</h2></div>`)));
});

// ---------- administration (central admin = all campuses; campus rep = own campus) ----------
app.get('/admin', async (req, res) => {
  if (!req.session.admin && req.session.role !== 'campus_rep') return res.redirect('/login');
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : '');
  const ms = await q(`SELECT id,member_no,name,campus,department,year,phone,status,role FROM members ${cf ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 300`, cf ? [cf] : []);
  const ps = await q(`SELECT * FROM posts ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 30`, sc ? [sc] : []);
  const act = (id, a, k, cls) => `<form method="POST" action="/admin/members/${id}/${a}" style="display:inline"><button class="btn ${cls || ''}" style="padding:4px 10px;font-size:12px">${h(tr(req, k))}</button></form>`;
  res.send(page(req, tr(req, 'admin'), wrap(`<h2>${h(tr(req, 'admin'))} ${sc ? '· ' + CAMPUS[sc].n : ''}</h2>
${sc ? '' : `<p>${Object.keys(CAMPUS).map(k => `<a class="btn k" style="padding:5px 12px;font-size:13px" href="/admin?campus=${k}">${CAMPUS[k].n}</a>`).join(' ')} <a class="btn" style="padding:5px 12px;font-size:13px" href="/admin">All</a></p>`}
<div class="card"><h3>${h(tr(req, 'members'))} (${ms.length})</h3><div class="tw"><table><tr><th>No</th><th>${h(tr(req, 'name'))}</th><th>${h(tr(req, 'campus'))}</th><th>${h(tr(req, 'dept'))}</th><th>${h(tr(req, 'phone'))}</th><th></th></tr>
${ms.map(m => `<tr><td>${h(m.member_no)}</td><td>${h(m.name)}</td><td>${h(CAMPUS[m.campus].n)}</td><td>${h(m.department)} Y${h(m.year)}</td><td>${h(m.phone)}</td>
<td><span class="badge ${m.status}">${h(tr(req, m.status))}</span> ${m.status !== 'official' ? act(m.id, 'approve', 'approve', 'g') : ''} ${m.status === 'pending' ? act(m.id, 'reject', 'reject') : ''}
${req.session.admin && m.role !== 'campus_rep' ? act(m.id, 'rep', 'Rep', 'k') : ''}</td></tr>`).join('')}</table></div></div>
<div class="card"><h3>${h(tr(req, 'add'))}</h3><form method="POST" action="/admin/posts">
<label>Type</label><select name="type">${TYPES.map(x => `<option value="${x}">${h(tr(req, x))}</option>`).join('')}</select>
<label>${h(tr(req, 'campus'))}</label><select name="campus">${sc ? `<option value="${sc}">${CAMPUS[sc].n}</option>` : `<option value="all">All</option>${Object.keys(CAMPUS).map(k => `<option value="${k}">${CAMPUS[k].n}</option>`).join('')}`}</select>
<label>${h(tr(req, 'title'))} (Afaan Oromoo)</label><input name="title_om"><label>${h(tr(req, 'title'))} (English)</label><input name="title_en">
<label>${h(tr(req, 'body'))} (Afaan Oromoo)</label><textarea name="body_om" rows="3"></textarea><label>${h(tr(req, 'body'))} (English)</label><textarea name="body_en" rows="3"></textarea>
<label>${h(tr(req, 'date'))}</label><input name="event_date" placeholder="2026-12-01"><p><button>${h(tr(req, 'add'))}</button></p></form></div>
<div class="card"><h3>${h(tr(req, 'latest'))}</h3>${ps.map(p => `<div style="display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #eee;padding:6px 0"><span><b>${h(p.type)}</b> · ${h(p.campus)} · ${h(postT(req, p, 'title'))}</span>
<form method="POST" action="/admin/posts/${p.id}/delete"><button class="btn" style="padding:3px 10px;font-size:12px">${h(tr(req, 'del'))}</button></form></div>`).join('') || h(tr(req, 'none'))}</div>`)));
});
async function guardMember(req, res, id) {
  if (!req.session.admin && req.session.role !== 'campus_rep') { res.redirect('/login'); return null; }
  const [m] = await q(`SELECT * FROM members WHERE id=$1`, [parseInt(id, 10) || 0]);
  if (!m || (!req.session.admin && m.campus !== req.session.campus)) { res.redirect('/admin'); return null; } return m;
}
app.post('/admin/members/:id/approve', async (req, res) => { const m = await guardMember(req, res, req.params.id); if (m) { await q(`UPDATE members SET status='official' WHERE id=$1`, [m.id]); res.redirect('/admin'); } });
app.post('/admin/members/:id/reject', async (req, res) => { const m = await guardMember(req, res, req.params.id); if (m) { await q(`UPDATE members SET status='rejected' WHERE id=$1`, [m.id]); res.redirect('/admin'); } });
app.post('/admin/members/:id/rep', async (req, res) => { if (!req.session.admin) return res.redirect('/login'); await q(`UPDATE members SET role='campus_rep' WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin'); });
app.post('/admin/posts', async (req, res) => {
  if (!req.session.admin && req.session.role !== 'campus_rep') return res.redirect('/login');
  const b = req.body, sc = scopeOf(req), campus = sc || (CAMPUS[b.campus] ? b.campus : 'all'), s = (k, n) => String(b[k] || '').trim().slice(0, n);
  if (TYPES.includes(b.type) && (s('title_om', 200) || s('title_en', 200)))
    await q(`INSERT INTO posts (type,campus,title_om,title_en,body_om,body_en,event_date) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [b.type, campus, s('title_om', 200), s('title_en', 200), s('body_om', 4000), s('body_en', 4000), s('event_date', 40)]);
  res.redirect('/admin');
});
app.post('/admin/posts/:id/delete', async (req, res) => {
  if (!req.session.admin && req.session.role !== 'campus_rep') return res.redirect('/login');
  const sc = scopeOf(req); await q(`DELETE FROM posts WHERE id=$1 ${sc ? 'AND campus=$2' : ''}`, sc ? [parseInt(req.params.id, 10) || 0, sc] : [parseInt(req.params.id, 10) || 0]); res.redirect('/admin');
});
app.listen(process.env.PORT || 3000, () => console.log('Sikkoo-Mandoo portal running'));
