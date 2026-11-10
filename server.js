require('dotenv').config();
const express = require('express'), session = require('express-session'), PgStore = require('connect-pg-simple')(session);
const { Pool } = require('pg'), bcrypt = require('bcryptjs'), multer = require('multer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (s, p) => pool.query(s, p || []).then(r => r.rows);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1.5 * 1024 * 1024 } });

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'change-me-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 864e5, sameSite: 'lax', secure: 'auto' }
}));

// CSRF guard
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const o = req.headers.origin || req.headers.referer;
  try {
    if (o && new URL(o).host !== req.headers.host) return res.status(403).send('Forbidden');
  } catch (e) {
    return res.status(403).send('Forbidden');
  }
  next();
});

const CAMPUS = {
  robe: { n: 'Robe', c: 'ROB', am: 'ሮቤ', om: 'Roobee' },
  goba: { n: 'Goba', c: 'GOB', am: 'ጎባ', om: 'Gooobaa' },
  shashamane: { n: 'Shashamane', c: 'SHA', am: 'ሻሸመኔ', om: 'Shaashamannee' }
};

const TYPES = ['announcement', 'news', 'event', 'education', 'document', 'project', 'gallery'];
const SLUG = { announcement: 'announcements', news: 'news', event: 'events', education: 'education', document: 'documents', project: 'projects', gallery: 'gallery' };
const CENTRAL = ['central_admin', 'president', 'vice_president', 'secretary', 'finance', 'pr'];
const ROLES = ['president', 'vice_president', 'secretary', 'finance', 'pr', 'campus_rep', 'campus_secretary', 'campus_finance'];
const PERMS = {
  central_admin: '*',
  president: '*',
  vice_president: ['members', 'content', 'finance', 'support', 'leaders', 'approve'],
  secretary: ['members', 'content', 'support', 'leaders'],
  finance: ['finance'],
  pr: ['content', 'leaders'],
  campus_rep: ['members', 'content', 'support', 'finance'],
  campus_secretary: ['members', 'content', 'support'],
  campus_finance: ['finance']
};

const can = (req, x) => {
  const a = PERMS[req.session.sr];
  return a === '*' || (Array.isArray(a) && a.includes(x));
};
const guard = x => (req, res, next) => (req.session.sr && can(req, x)) ? next() : res.redirect('/admin-login');
const needMember = (req, res, next) => req.session.mid ? next() : res.redirect('/login');
const needStaff = (req, res, next) => req.session.sr ? next() : res.redirect('/admin-login');

// ---------- Translations (OM, AM, EN) ----------
const T = {
  om: {
    site: 'Gamtaa Barattoota Siikkoo-Mandoo', uni: 'Yuunivarsiitii Madda Walaabuu',
    home: 'Fuula Jalqabaa', reg: "Galmaa'i", login: 'Seeni', logout: "Ba'i", dash: 'Daashboordii', admin: 'Bulchiinsa', announcement: 'Beeksisa', news: 'Oduu', event: 'Taateewwan', campus: 'Kaampasii',
    members: 'Miseensota', official: 'Miseensa Idilee', registered: "Galmaa'e", pending: 'Eeggataa', rejected: 'Kuufame', none: 'Ammaaf homtu hin jiru',
    name: 'Maqaa Guutuu', gender: 'Saala', male: 'Dhiira', female: 'Dubartii', phone: 'Bilbila', email: 'Imeelii', dept: 'Muummee', year: 'Waggaa Barnootaa', sid: 'ID Barattootaa',
    pass: 'Jecha Darbii', photo: 'Suuraa', want: "Miseensa idilee ta'uu barbaadaa?", send: 'Ergi', card: 'Kaardii Miseensummaa', no: 'Lakk. Miseensaa', verify: 'Mirkaneessi',
    valid: "Kaardiin kun dhugaa dha ✔", invalid: 'Kaardiin kun hin argamne ✘', upgrade: "Gaaffii miseensa idilee ergi", print: 'Maxxansi', title: 'Mata-duree', body: 'Ibsa', date: 'Guyyaa',
    approve: 'Mirkaneessi', reject: 'Didi', bad: 'Odeeffannoon sirrii miti', exists: 'Lakkoofsi kun duraan galmaa’eera',
    leadership: 'Geggeessitoota', education: 'Barnoota', document: 'Sanadoota', project: 'Pirojektoota', gallery: 'Suuraa', finance: 'Maallaqa', support: 'Deeggarsa',
    portalTitle: 'Poortaalii Miseensotaa'
  },
  am: {
    site: 'የሲቆ-ማንዶ ተማሪዎች ማህበር', uni: 'መደ ወላቡ ዩኒቨርሲቲ',
    home: 'ዋና ገጽ', reg: 'ይመዝገቡ', login: 'ይግቡ', logout: 'ውጣ', dash: 'ዳሽቦርድ', admin: 'አድሚን', announcement: 'ማስታወቂያዎች', news: 'ዜና', event: 'ክስተቶች', campus: 'ካምፓስ',
    members: 'አባላት', official: 'ቋሚ አባል', registered: 'የተመዘገበ', pending: 'በመጠባበቅ ላይ', rejected: 'ውድቅ የተደረገ', none: 'ምንም መረጃ የለም',
    name: 'ሙሉ ስም', gender: 'ጾታ', male: 'ወንድ', female: 'ሴት', phone: 'ስልክ', email: 'ኢሜይል', dept: 'ትምህርት ክፍል', year: 'ዓመት', sid: 'የተማሪ መታወቂያ (ID)',
    pass: 'የይለፍ ቃል', photo: 'ፎቶ', want: 'ቋሚ አባል መሆን ይፈልጋሉ?', send: 'ላክ', card: 'የአባልነት ካርድ', no: 'የአባልነት ቁጥር', verify: 'አረጋግጥ',
    valid: 'ካርዱ ትክክለኛ ነው ✔', invalid: 'ካርዱ አልተገኘም ✘', upgrade: 'የቋሚ አባልነት ጥያቄ ላክ', print: 'አትም', title: 'ርዕስ', body: 'ዝርዝር', date: 'ቀን',
    approve: 'አጽድቅ', reject: 'ውድቅ አድርግ', bad: 'መረጃው ትክክል አይደለም', exists: 'መለያው ቀደም ሲል ተመዝግቧል',
    leadership: 'አመራሮች', education: 'ትምህርት', document: 'ሰነዶች', project: 'ፕሮጀክቶች', gallery: 'ጋለሪ', finance: 'ፋይናንስ', support: 'እገዛ',
    portalTitle: 'የአባላት ፖርታል'
  },
  en: {
    site: 'Siikkoo-Mandoo Students Association', uni: 'Madda Walabu University',
    home: 'Home', reg: 'Register', login: 'Login', logout: 'Logout', dash: 'Dashboard', admin: 'Administration', announcement: 'Announcements', news: 'News', event: 'Events', campus: 'Campus',
    members: 'Members', official: 'Official Member', registered: 'Registered', pending: 'Pending', rejected: 'Rejected', none: 'Nothing yet',
    name: 'Full Name', gender: 'Gender', male: 'Male', female: 'Female', phone: 'Phone', email: 'Email', dept: 'Department', year: 'Year', sid: 'Student ID',
    pass: 'Password', photo: 'Photo', want: 'Become an official member?', send: 'Submit', card: 'Membership Card', no: 'Membership No.', verify: 'Verify',
    valid: 'This card is valid ✔', invalid: 'Card not found ✘', upgrade: 'Request official membership', print: 'Print', title: 'Title', body: 'Details', date: 'Date',
    approve: 'Approve', reject: 'Reject', bad: 'Please check your information', exists: 'This ID is already registered',
    leadership: 'Leadership', education: 'Education', document: 'Documents', project: 'Projects', gallery: 'Gallery', finance: 'Finance', support: 'Support',
    portalTitle: 'Members Portal'
  }
};

const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = req => (['en', 'am', 'om'].includes(req.session.lang) ? req.session.lang : 'om');
const tr = (req, k) => (T[L(req)] && T[L(req)][k]) || (T.en[k] || k);
const campusName = (req, cKey) => { const c = CAMPUS[cKey]; if (!c) return cKey; return c[L(req)] || c.n; };

// ---------- ULTRA HIGH-END CSS (Glassmorphism & Neon Accents) ----------
const CSS = `
:root {
  --primary: #10b981;
  --primary-dark: #059669;
  --accent: #ef4444;
  --dark-header: rgba(15, 23, 42, 0.75);
  --bg-color: #0f172a;
  --text: #f8fafc;
  --text-muted: #94a3b8;
  --card-bg: rgba(255, 255, 255, 0.04);
  --border-color: rgba(255, 255, 255, 0.1);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Poppins', system-ui, sans-serif;
  background: var(--bg-color);
  background-image: 
    radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.15) 0px, transparent 50%),
    radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.15) 0px, transparent 50%);
  background-attachment: fixed;
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
a { color: var(--primary); text-decoration: none; transition: all 0.3s ease; }
a:hover { color: #34d399; }

/* Header - Sleek & Sticky */
header {
  background: var(--dark-header);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-color);
  position: sticky; top: 0; z-index: 50;
  padding: 16px 0;
}
.in { max-width: 1100px; margin: auto; padding: 0 20px; width: 100%; }
.header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
.logo-area { display: flex; align-items: center; gap: 16px; }
.logo-icon {
  width: 50px; height: 50px; border-radius: 14px; 
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  display: grid; place-items: center; font-size: 24px;
  box-shadow: 0 10px 20px -10px var(--primary);
}
.logo-text h1 { font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
.logo-text p { font-size: 13px; color: var(--text-muted); }

/* Language Switcher */
.nav-group { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.lang-box { display: flex; gap: 6px; background: rgba(0,0,0,0.3); padding: 6px; border-radius: 99px; border: 1px solid var(--border-color); }
.lang-btn {
  padding: 6px 16px; font-size: 13px; font-weight: 600; border-radius: 99px;
  color: var(--text-muted); cursor: pointer; transition: all 0.3s;
}
.lang-btn:hover { color: #fff; }
.lang-btn.active { background: var(--primary); color: #fff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); }

/* Auth Buttons */
.ext-nav { display: flex; gap: 12px; }
.ext-btn {
  padding: 10px 20px; font-size: 14px; font-weight: 600; border-radius: 12px;
  background: rgba(255,255,255,0.05); color: #fff; border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}
.ext-btn:hover { background: rgba(255,255,255,0.1); transform: translateY(-2px); }
.ext-btn.login-btn { background: var(--primary); border: none; box-shadow: 0 8px 16px -8px var(--primary); }
.ext-btn.login-btn:hover { background: var(--primary-dark); }

/* High-End Glass Cards */
.card, .glass-card {
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 32px;
  margin: 24px 0;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
}

/* Forms */
label { display: block; font-weight: 600; font-size: 14px; margin: 16px 0 8px; color: var(--text-muted); }
input, select, textarea { 
  width: 100%; padding: 14px 16px; 
  background: rgba(0,0,0,0.3); 
  border: 1px solid var(--border-color); 
  border-radius: 12px; font: inherit; color: #fff; 
  transition: all 0.3s ease;
}
input:focus, select:focus, textarea:focus {
  outline: none; border-color: var(--primary); background: rgba(0,0,0,0.5);
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
}

/* Main Premium Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark)); 
  color: #fff; border: 0; border-radius: 14px; padding: 14px 28px;
  font-weight: 600; cursor: pointer; font-size: 15px; transition: all 0.3s ease;
  box-shadow: 0 10px 20px -10px var(--primary);
}
.btn:hover { transform: translateY(-3px); box-shadow: 0 15px 25px -10px var(--primary); }
.btn.secondary { background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); box-shadow: none; color: #fff; }
.btn.secondary:hover { background: rgba(255,255,255,0.1); }
.btn.danger { background: var(--accent); box-shadow: 0 10px 20px -10px var(--accent); }
.btn.danger:hover { background: #dc2626; box-shadow: 0 15px 25px -10px var(--accent); }

/* Portal Menu */
.portal-menu {
  background: rgba(0,0,0,0.25); border-radius: 20px; padding: 24px;
  display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; border: 1px solid var(--border-color);
}
.portal-btn {
  background: rgba(255,255,255,0.05); color: #fff;
  border-radius: 12px; padding: 12px 20px; font-size: 14px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 8px; border: 1px solid transparent; transition: all 0.3s ease;
}
.portal-btn:hover { background: rgba(255,255,255,0.1); border-color: var(--border-color); transform: translateY(-2px); }
.portal-btn.active { background: var(--primary); color: #fff; box-shadow: 0 8px 16px -8px var(--primary); }

/* Utility & Layout */
main { flex: 1; display: flex; flex-direction: column; }
table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
th, td { padding: 16px; border-bottom: 1px solid var(--border-color); text-align: left; }
th { background: rgba(0,0,0,0.3); font-weight: 600; color: var(--text-muted); }
th:first-child { border-top-left-radius: 12px; } th:last-child { border-top-right-radius: 12px; }
.tw { overflow-x: auto; background: rgba(0,0,0,0.15); border-radius: 12px; border: 1px solid var(--border-color); }

.badge { display: inline-block; padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.1); }
.badge.official { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
.badge.pending { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
.badge.rejected { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

.err { background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--accent); color: #fca5a5; padding: 16px; border-radius: 12px; margin: 16px 0; }
.msgok { background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--primary); color: #6ee7b7; padding: 16px; border-radius: 12px; margin: 16px 0; }

.id { border: 1px solid var(--border-color); border-radius: 24px; max-width: 400px; margin: 24px auto; background: rgba(0,0,0,0.3); box-shadow: 0 20px 40px rgba(0,0,0,0.4); overflow: hidden; backdrop-filter: blur(12px); }
.id .hd { background: rgba(0,0,0,0.5); padding: 16px 20px; font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); }
.id .bd { display: flex; gap: 20px; padding: 24px; align-items: center; }
.id img { width: 100px; height: 125px; border-radius: 12px; object-fit: cover; border: 2px solid var(--border-color); box-shadow: 0 8px 16px rgba(0,0,0,0.3); }

footer { text-align: center; padding: 32px; color: var(--text-muted); font-size: 14px; margin-top: auto; border-top: 1px solid var(--border-color); background: rgba(15,23,42,0.4); }

/* Fancy Animations for Landing */
@keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-15px); } 100% { transform: translateY(0px); } }
.floating-icon { display: inline-block; animation: float 4s ease-in-out infinite; font-size: 75px; margin-bottom: 16px; text-shadow: 0 20px 30px rgba(0,0,0,0.6); }
.gradient-text { background: -webkit-linear-gradient(45deg, #34d399, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
`;

function page(req, title, body) {
  const l = L(req);
  const isMemberLoggedIn = !!req.session.mid;
  const isAdminLoggedIn = !!req.session.sr;

  const langSwitcher = `
    <div class="lang-box">
      <a class="lang-btn ${l === 'om' ? 'active' : ''}" href="/lang/om">Oromo</a>
      <a class="lang-btn ${l === 'am' ? 'active' : ''}" href="/lang/am">አማርኛ</a>
      <a class="lang-btn ${l === 'en' ? 'active' : ''}" href="/lang/en">Eng</a>
    </div>
  `;

  // Extremely strict external nav: ONLY Login and Register.
  let extNav = '';
  if (isMemberLoggedIn) {
    extNav = `<div class="ext-nav"><a class="ext-btn" href="/student-dashboard">🎓 Dashboard</a><a class="ext-btn login-btn" href="/logout">Logout</a></div>`;
  } else if (isAdminLoggedIn) {
    extNav = `<div class="ext-nav"><a class="ext-btn" href="/admin">⚙️ Admin</a><a class="ext-btn login-btn" href="/logout">Logout</a></div>`;
  } else {
    extNav = `<div class="ext-nav"><a class="ext-btn login-btn" href="/login">🔑 Login</a><a class="ext-btn" href="/sikkoo-mandoo-register">📝 Register</a></div>`;
  }

  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(title)} · ${h(tr(req, 'site'))}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body>
<header>
  <div class="in">
    <div class="header-top">
      <div class="logo-area">
        <div class="logo-icon">🌳</div>
        <div class="logo-text">
          <h1>${h(tr(req, 'site'))}</h1>
          <p>${h(tr(req, 'uni'))}</p>
        </div>
      </div>
      <div class="nav-group">
        ${langSwitcher}
        ${extNav}
      </div>
    </div>
  </div>
</header>
<main>
  <div class="in" style="padding-top: 32px; padding-bottom: 32px; width: 100%;">
    ${body}
  </div>
</main>
<footer>
  © ${new Date().getFullYear()} ${h(tr(req, 'site'))} · <a href="/admin-login" style="color:var(--text-muted); opacity:0.7">Admin</a>
</footer>
</body>
</html>`;
}

function portalMenu(activePath) {
  const items = [
    { p: '/student-dashboard', i: '🪪', t: 'Membership Card' },
    { p: '/portal/announcements', i: '📢', t: 'Announcements' },
    { p: '/portal/news', i: '📰', t: 'News' },
    { p: '/portal/events', i: '📅', t: 'Events' },
    { p: '/portal/education', i: '📚', t: 'Education' },
    { p: '/portal/documents', i: '📁', t: 'Documents' },
    { p: '/portal/projects', i: '🏗️', t: 'Projects' },
    { p: '/portal/gallery', i: '🖼️', t: 'Gallery' },
    { p: '/portal/leadership', i: '👥', t: 'Leadership' },
    { p: '/portal/finance', i: '💰', t: 'Finance' }
  ];
  return `<div class="portal-menu">${items.map(x => `<a href="${x.p}" class="portal-btn ${activePath === x.p ? 'active' : ''}">${x.i} ${x.t}</a>`).join('')}</div>`;
}

function postT(req, p, f) {
  const l = L(req);
  if (l === 'am') return p[f + '_am'] || p[f + '_om'] || p[f + '_en'] || '';
  if (l === 'om') return p[f + '_om'] || p[f + '_en'] || '';
  return p[f + '_en'] || p[f + '_om'] || '';
}

function postCard(req, p) {
  return `<div class="glass-card" style="margin-bottom:24px; padding:24px">
    <small style="color:var(--text-muted);font-weight:600">${h(p.campus === 'all' ? 'All Campuses' : campusName(req, p.campus))} · ${h(p.event_date || '')}</small>
    <h3 style="margin:8px 0 16px; font-size:20px">${h(postT(req, p, 'title'))}</h3>
    ${p.image_id ? `<img style="width:100%;max-height:350px;object-fit:cover;border-radius:12px;margin-bottom:16px;border:1px solid var(--border-color)" src="/photo/${p.image_id}" alt="">` : ''}
    <div style="color:#cbd5e1">${h(postT(req, p, 'body')).replace(/\n/g, '<br>')}</div>
    ${p.file_id ? `<p style="margin-top:20px"><a class="btn" style="padding:10px 20px;font-size:14px" href="/photo/${p.file_id}?dl=1">⬇ Download File</a></p>` : ''}
  </div>`;
}

const scopeOf = req => (CENTRAL.includes(req.session.sr) ? null : (req.session.campus || '-'));

// ---------- Database Initializer ----------
(async () => {
  await q(`CREATE TABLE IF NOT EXISTS files (id SERIAL PRIMARY KEY, mime TEXT, data BYTEA)`);
  await q(`CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY, member_no TEXT UNIQUE, name TEXT, gender TEXT, phone TEXT, email TEXT,
    campus TEXT, department TEXT, year TEXT, student_id TEXT UNIQUE, photo_id INTEGER, password TEXT,
    status TEXT DEFAULT 'registered', role TEXT DEFAULT 'student', created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY, type TEXT, campus TEXT DEFAULT 'all',
    title_om TEXT, title_en TEXT, title_am TEXT,
    body_om TEXT, body_en TEXT, body_am TEXT,
    event_date TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);
  
  for (const sql of [
    `ALTER TABLE files ADD COLUMN IF NOT EXISTS name TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS file_id INTEGER`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_id INTEGER`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS progress INTEGER`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_am TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS body_am TEXT`,
    `CREATE TABLE IF NOT EXISTS staff (id SERIAL PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, campus TEXT, password TEXT, active INTEGER DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS leaders (id SERIAL PRIMARY KEY, name TEXT, position_om TEXT, position_en TEXT, position_am TEXT, level TEXT DEFAULT 'central', campus TEXT DEFAULT 'all', photo_id INTEGER, ord INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS support_requests (id SERIAL PRIMARY KEY, member_no TEXT, name TEXT, campus TEXT, subject TEXT, message TEXT, status TEXT DEFAULT 'open', reply TEXT, created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS transactions (id SERIAL PRIMARY KEY, kind TEXT, amount NUMERIC, tdate TEXT, note TEXT, campus TEXT DEFAULT 'all', created_by TEXT, created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS finance_reports (id SERIAL PRIMARY KEY, period TEXT, campus TEXT, income NUMERIC, expense NUMERIC, detail TEXT, approved INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`
  ]) await q(sql);

  const adminPass = bcrypt.hashSync('sikomando123', 10);
  await q(`INSERT INTO staff (username, name, role, campus, password, active) VALUES ('admin', 'Central Admin', 'central_admin', NULL, $1, 1) ON CONFLICT (username) DO UPDATE SET password = $1, role = 'central_admin', active = 1`, [adminPass]);
})().catch(e => console.error('DB init err:', e.message));

app.get('/lang/:l', (req, res) => {
  const l = req.params.l; if (['om', 'am', 'en'].includes(l)) req.session.lang = l;
  res.redirect(req.get('referer') || '/');
});

// ---------- HIGH-END PUBLIC LANDING PAGE (Only Welcome + Auth) ----------
app.get('/', (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  if (req.session.sr) return res.redirect('/admin');
  
  const html = `
    <div style="min-height: 70vh; display: flex; align-items: center; justify-content: center;">
      <div class="glass-card" style="text-align: center; max-width: 700px; width: 100%; padding: 60px 40px; margin:0">
        <div class="floating-icon">🌳</div>
        <h2 class="gradient-text" style="font-size: 2.8rem; font-weight: 800; margin: 0 0 16px 0; line-height: 1.2;">
          ${h(tr(req, 'site'))}
        </h2>
        <p style="font-size: 1.15rem; color: var(--text-muted); margin: 0 0 48px 0; font-weight: 500;">
          ${h(tr(req, 'uni'))}
        </p>
        
        <div style="display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;">
          <a href="/login" class="btn" style="padding: 16px 48px; font-size: 16px;">
            <span style="margin-right: 8px;">🔑</span> ${h(tr(req, 'login'))}
          </a>
          <a href="/sikkoo-mandoo-register" class="btn secondary" style="padding: 16px 48px; font-size: 16px;">
            <span style="margin-right: 8px;">📝</span> ${h(tr(req, 'reg'))}
          </a>
        </div>
      </div>
    </div>
  `;
  res.send(page(req, tr(req, 'home'), html));
});

// ---------- AUTHENTICATION ----------
const fails = new Map();
function limited(req, res) {
  const f = fails.get(req.ip) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 9e5) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 10) { res.status(429).send('Too many attempts. Try again later.'); return null; }
  return f;
}

app.get('/login', (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  res.send(page(req, tr(req, 'login'), `
    <div class="glass-card" style="max-width:440px;margin:40px auto">
      <h2 style="margin-top:0; font-size:24px; margin-bottom: 24px">🔑 ${h(tr(req, 'login'))}</h2>
      ${req.query.e ? `<div class="err">${h(tr(req, 'bad'))}</div>` : ''}
      <form method="POST" action="/login">
        <label>${h(tr(req, 'no'))} / ID</label>
        <input name="u" required placeholder="SM-ROB-2026-0001">
        <label>${h(tr(req, 'pass'))}</label>
        <input name="p" type="password" required>
        <p style="margin-top:32px"><button class="btn" style="width:100%">${h(tr(req, 'login'))}</button></p>
      </form>
    </div>
  `));
});

app.post('/login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const identifier = String(req.body.u || '').trim();
  const [m] = await q(`SELECT * FROM members WHERE UPPER(member_no)=UPPER($1) OR UPPER(student_id)=UPPER($1)`, [identifier]);
  if (m && bcrypt.compareSync(String(req.body.p || ''), m.password)) {
    req.session.sr = null; req.session.mid = m.member_no; req.session.campus = m.campus;
    return res.redirect('/student-dashboard');
  }
  f.n++; fails.set(req.ip, f); res.redirect('/login?e=1');
});

function regForm(req, err, v) {
  v = v || {};
  const s = (k, o) => o.map(x => `<option value="${x[0]}"${v[k] === x[0] ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  return page(req, tr(req, 'reg'), `
    <div class="glass-card" style="max-width:600px;margin:40px auto">
      <h2 style="margin-top:0; font-size: 26px; margin-bottom:24px">📝 ${h(tr(req, 'reg'))}</h2>
      ${err ? `<div class="err">${h(err)}</div>` : ''}
      <form method="POST" action="/sikkoo-mandoo-register" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
          <div><label>${h(tr(req, 'name'))}</label><input name="name" required value="${h(v.name)}"></div>
          <div><label>${h(tr(req, 'gender'))}</label><select name="gender">${s('gender', [['M', tr(req, 'male')], ['F', tr(req, 'female')]])}</select></div>
          <div><label>${h(tr(req, 'campus'))}</label><select name="campus" required>${s('campus', Object.keys(CAMPUS).map(k => [k, campusName(req, k)]))}</select></div>
          <div><label>${h(tr(req, 'dept'))}</label><input name="department" required value="${h(v.department)}"></div>
          <div><label>${h(tr(req, 'year'))}</label><select name="year">${s('year', [1, 2, 3, 4, 5, 6].map(x => [String(x), String(x)]))}</select></div>
          <div><label>${h(tr(req, 'sid'))}</label><input name="student_id" required value="${h(v.student_id)}" placeholder="UGRR/12345/15"></div>
          <div><label>${h(tr(req, 'phone'))}</label><input name="phone" required type="tel" value="${h(v.phone)}"></div>
          <div><label>${h(tr(req, 'email'))}</label><input name="email" type="email" value="${h(v.email)}"></div>
        </div>
        <label>${h(tr(req, 'photo'))}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
        <label>${h(tr(req, 'pass'))} (6+)</label><input name="password" type="password" minlength="6" required>
        
        <label style="display:flex;align-items:center;gap:12px;margin-top:24px; padding:16px; background:rgba(0,0,0,0.2); border-radius:12px; border:1px solid var(--border-color); color:#fff">
          <input type="checkbox" name="want" value="1" style="width:24px; height:24px"> ${h(tr(req, 'want'))}
        </label>
        
        <p style="margin-top:32px"><button class="btn" style="width:100%; font-size:16px; padding:16px">${h(tr(req, 'send'))}</button></p>
      </form>
    </div>
  `);
}

app.get('/sikkoo-mandoo-register', (req, res) => res.send(regForm(req)));
app.post('/sikkoo-mandoo-register', upload.single('photo'), async (req, res) => {
  const b = req.body, c = CAMPUS[b.campus];
  if (!c || !b.name || !b.student_id || !b.phone || !b.department || String(b.password || '').length < 6) return res.send(regForm(req, tr(req, 'bad'), b));
  try {
    if ((await q(`SELECT 1 FROM members WHERE UPPER(student_id)=UPPER($1)`, [b.student_id.trim()])).length) return res.send(regForm(req, tr(req, 'exists'), b));
    let pid = null;
    if (req.file && /^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) { pid = (await q(`INSERT INTO files (mime,data) VALUES ($1,$2) RETURNING id`, [req.file.mimetype, req.file.buffer]))[0].id; }
    const hash = bcrypt.hashSync(String(b.password), 10), yr = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM members WHERE campus=$1`, [b.campus]);
      const no = `SM-${c.c}-${yr}-${String(n + 1 + i).padStart(4, '0')}`;
      try {
        await q(`INSERT INTO members (member_no,name,gender,phone,email,campus,department,year,student_id,photo_id,password,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [no, b.name.trim().slice(0, 80), b.gender === 'F' ? 'F' : 'M', b.phone.trim().slice(0, 30), (b.email || '').slice(0, 80), b.campus, b.department.trim().slice(0, 80), String(b.year || '1'), b.student_id.trim().slice(0, 40), pid, hash, b.want ? 'pending' : 'registered']);
        req.session.mid = no; req.session.campus = b.campus; req.session.role = 'student';
        return res.redirect('/student-dashboard');
      } catch (e) { if (!/duplicate|unique/i.test(e.message)) throw e; }
    }
    res.send(regForm(req, tr(req, 'bad'), b));
  } catch (e) { res.status(500).send('Error'); }
});

// ---------- INTERNAL MEMBER PORTAL ----------
app.get('/student-dashboard', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');
  const base = 'https://' + req.headers.host + '/verify/' + encodeURIComponent(m.member_no);

  const html = `
    ${portalMenu('/student-dashboard')}
    <div class="id">
      <div class="hd">
        <span>${h(tr(req, 'site'))}</span>
        <span class="badge ${m.status}">${h(tr(req, m.status))}</span>
      </div>
      <div class="bd">
        <img src="${m.photo_id ? '/photo/' + m.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}" alt="">
        <div>
          <b style="font-size:18px">${h(m.name)}</b><br>
          <small style="color:var(--text-muted)">${h(tr(req, 'no'))}</small><br>
          <b style="color:var(--primary);font-size:16px">${h(m.member_no)}</b><br>
          <small style="color:#e2e8f0;font-weight:600">${h(campusName(req, m.campus))} · ${h(m.department)} · Y${h(m.year)}</small>
        </div>
      </div>
      <div style="padding:0 24px 24px;display:flex;justify-content:space-between;align-items:flex-end">
        <small style="font-weight:600; color:var(--text-muted)">ID: <span style="color:#fff">${h(m.student_id)}</span></small>
        <div id="qr" style="background:#fff; padding:6px; border-radius:8px"></div>
      </div>
    </div>
    <div style="text-align:center;margin-top:32px">
      <button onclick="print()" class="btn secondary">🖨️ ${h(tr(req, 'print'))}</button>
      ${m.status === 'registered' ? `<form method="POST" action="/student/upgrade" style="display:inline; margin-left:12px"><button class="btn">${h(tr(req, 'upgrade'))}</button></form>` : ''}
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>new QRCode(document.getElementById('qr'),{text:${JSON.stringify(base)},width:70,height:70,colorDark:"#0f172a",colorLight:"#ffffff"});</script>
  `;
  res.send(page(req, tr(req, 'dash'), html));
});

TYPES.forEach(tp => {
  app.get('/portal/' + SLUG[tp], needMember, async (req, res) => {
    const rows = await q(`SELECT * FROM posts WHERE type=$1 ORDER BY id DESC LIMIT 60`, [tp]);
    let content = '';
    if (tp === 'gallery') {
      content = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px">
        ${rows.map(p => `<div class="glass-card" style="padding:16px;margin:0"><img style="width:100%;height:220px;object-fit:cover;border-radius:12px;margin-bottom:12px;border:1px solid var(--border-color)" src="/photo/${p.image_id}"><p style="margin:0;font-weight:600;font-size:16px">${h(postT(req, p, 'title'))}</p></div>`).join('')}
      </div>`;
    } else {
      content = rows.map(p => postCard(req, p)).join('');
    }
    const html = portalMenu('/portal/' + SLUG[tp]) + (rows.length ? content : `<div class="glass-card" style="text-align:center">${h(tr(req, 'none'))}</div>`);
    res.send(page(req, tr(req, tp), html));
  });
});

app.get('/portal/leadership', needMember, async (req, res) => {
  const ls = await q(`SELECT * FROM leaders ORDER BY (level='central') DESC, ord, id`);
  const grp = (t, list) => list.length ? `<h3 style="margin:32px 0 16px; color:var(--primary)">${h(t)}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px">
    ${list.map(x => `<div class="glass-card" style="text-align:center;margin:0;padding:24px"><img style="width:110px;height:110px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);margin:auto;box-shadow:0 8px 16px rgba(0,0,0,0.3)" src="${x.photo_id ? '/photo/' + x.photo_id : ''}"><h4 style="margin:16px 0 6px;font-size:18px">${h(x.name)}</h4><small style="color:var(--text-muted);font-weight:600">${h(L(req) === 'om' ? (x.position_om || x.position_en) : (L(req) === 'am' ? (x.position_am || x.position_en || x.position_om) : (x.position_en || x.position_om)))}</small></div>`).join('')}
    </div>` : '';
  const html = portalMenu('/portal/leadership') + grp('Central Leadership', ls.filter(x => x.level === 'central')) + Object.keys(CAMPUS).map(k => grp(campusName(req, k), ls.filter(x => x.level !== 'central' && x.campus === k))).join('');
  res.send(page(req, tr(req, 'leadership'), html || `<div class="glass-card">${h(tr(req, 'none'))}</div>`));
});

app.get('/portal/finance', needMember, async (req, res) => {
  const rs = await q(`SELECT * FROM finance_reports WHERE approved=1 ORDER BY period DESC, id DESC LIMIT 36`);
  const html = portalMenu('/portal/finance') + rs.map(r => {
    const d = JSON.parse(r.detail || '{}');
    return `<div class="glass-card" style="padding:32px"><h3 style="margin-top:0;font-size:20px;margin-bottom:24px">${h(r.period)} · ${h(r.campus === 'all' ? 'All' : campusName(req, r.campus))}</h3><div style="display:flex;gap:24px;margin-bottom:24px;flex-wrap:wrap"><div><b style="color:var(--primary);font-size:28px">${Number(r.income).toLocaleString()}</b><br><small style="color:var(--text-muted)">Income</small></div><div><b style="color:var(--accent);font-size:28px">${Number(r.expense).toLocaleString()}</b><br><small style="color:var(--text-muted)">Expense</small></div><div><b style="font-size:28px;color:#fff">${(r.income - r.expense).toLocaleString()}</b><br><small style="color:var(--text-muted)">Balance</small></div></div><p style="font-size:14px;color:#cbd5e1;background:rgba(0,0,0,0.2);padding:16px;border-radius:12px;border:1px solid var(--border-color)">${Object.keys(d).map(k => `<b>${h(k)}</b>: ${Number(d[k]).toLocaleString()}`).join(' &nbsp;•&nbsp; ')}</p></div>`;
  }).join('');
  res.send(page(req, tr(req, 'finance'), html || `<div class="glass-card" style="text-align:center">${h(tr(req, 'none'))}</div>`));
});

app.post('/student/upgrade', needMember, async (req, res) => {
  await q(`UPDATE members SET status='pending' WHERE member_no=$1 AND status='registered'`, [req.session.mid]);
  res.redirect('/student-dashboard');
});

app.get('/photo/:id', async (req, res) => {
  const [f] = await q(`SELECT mime, data, name FROM files WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (!f) return res.status(404).end();
  res.set('Content-Type', f.mime).set('Cache-Control', 'public,max-age=604800');
  if (req.query.dl) res.set('Content-Disposition', `attachment; filename="${String(f.name || 'file').replace(/[^\w.\-]/g, '_')}"`);
  res.send(f.data);
});

app.get('/verify/:no', async (req, res) => {
  const [m] = await q(`SELECT name,member_no,campus,department,year,status,photo_id FROM members WHERE UPPER(member_no)=UPPER($1)`, [req.params.no]);
  res.send(page(req, tr(req, 'verify'), m ? `<div class="glass-card" style="max-width:400px;margin:40px auto;text-align:center"><h2 style="color:var(--primary);margin-bottom:24px">${h(tr(req, 'valid'))}</h2><img style="width:120px;height:150px;border-radius:16px;object-fit:cover;border:2px solid var(--border-color);box-shadow:0 10px 20px rgba(0,0,0,0.3)" src="${m.photo_id ? '/photo/' + m.photo_id : ''}"><h3 style="margin:16px 0 8px;font-size:20px">${h(m.name)}</h3><p style="color:var(--primary);font-weight:700;font-size:16px">${h(m.member_no)}</p><p style="color:var(--text-muted);margin:8px 0 16px">${h(campusName(req, m.campus))} · ${h(m.department)}</p><span class="badge ${m.status}">${h(tr(req, m.status))}</span></div>` : `<div class="glass-card" style="max-width:400px;margin:40px auto;text-align:center"><h2 style="color:var(--accent)">${h(tr(req, 'invalid'))}</h2></div>`));
});

// ---------- ADMIN PORTAL ----------
app.get('/admin-login', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Portal</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;font-family:'Poppins',sans-serif;color:#f8fafc}.glass-card{width:min(420px,92vw);background:rgba(255,255,255,0.03);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:40px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.3)}input{width:100%;box-sizing:border-box;padding:14px;margin:8px 0 20px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.2);color:#fff;transition:0.3s}input:focus{outline:none;border-color:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,0.1)}button{width:100%;padding:14px;border:0;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:600;font-size:15px;cursor:pointer;box-shadow:0 10px 20px -10px #10b981}a{color:#34d399;text-decoration:none}</style></head><body><div class="glass-card"><h2 style="margin:0 0 8px;font-size:24px">🔐 Admin Access</h2><p style="color:#94a3b8;font-size:14px;margin:0 0 24px">Authorized Personnel Only</p>${req.query.e ? '<p style="color:#f87171;background:rgba(239,68,68,0.1);padding:12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2)">Invalid credentials</p>' : ''}<form method="POST" action="/admin-login"><label style="display:block;font-size:13px;color:#94a3b8;margin-bottom:6px">Username</label><input name="u" required><label style="display:block;font-size:13px;color:#94a3b8;margin-bottom:6px">Password</label><input name="p" type="password" required><button>Sign In</button></form><p style="text-align:center;margin-top:32px;font-size:14px"><a href="/">← Return Home</a></p></div></body></html>`);
});

app.post('/admin-login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const u = String(req.body.u || '').trim(), pw = String(req.body.p || '');
  if ((u.toLowerCase() === 'admin' && pw === 'sikomando123') || (process.env.ADMIN_USER && u === process.env.ADMIN_USER && pw === process.env.ADMIN_PASS)) {
    req.session.mid = null; req.session.sr = 'central_admin'; req.session.sname = 'Central Admin'; req.session.campus = null;
    return res.redirect('/admin');
  }
  const [st] = await q(`SELECT * FROM staff WHERE LOWER(username)=LOWER($1) AND active=1`, [u]);
  if (st && bcrypt.compareSync(pw, st.password)) {
    req.session.mid = null; req.session.sr = st.role; req.session.sname = st.name; req.session.campus = CENTRAL.includes(st.role) ? null : st.campus;
    return res.redirect('/admin');
  }
  f.n++; fails.set(req.ip, f); res.redirect('/admin-login?e=1');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

const A = (req, title, body) => {
  const links = [
    ['/admin', 'Dashboard', null], ['/admin/members', 'Members', 'members'],
    ['/admin/content/announcement', 'Announcements', 'content'], ['/admin/content/news', 'News', 'content'],
    ['/admin/content/event', 'Events', 'content'], ['/admin/content/education', 'Education', 'content'],
    ['/admin/content/document', 'Docs', 'content'], ['/admin/content/project', 'Projects', 'content'],
    ['/admin/content/gallery', 'Gallery', 'content'], ['/admin/leaders', 'Leadership', 'leaders'],
    ['/admin/support', 'Support', 'support'], ['/admin/finance', 'Finance', 'finance'],
    ['/admin/staff', 'Staff', 'staff'], ['/admin/backup', 'Backup', 'staff']
  ].filter(x => !x[2] || can(req, x[2]));

  return page(req, title, `
    <div class="portal-menu" style="margin-top:0">
      ${links.map(x => `<a href="${x[0]}" class="portal-btn ${req.path === x[0] ? 'active' : ''}">${x[1]}</a>`).join('')}
    </div>
    ${body}
  `);
};

const OKMIME = /^(image\/(jpeg|png|webp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-[\w.]+))$/;
const up6 = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const files6 = fields => (req, res, next) => up6.fields(fields)(req, res, err => (err ? res.status(400).send('File too large (max 6 MB)') : next()));
async function saveFile(f) {
  if (!f || !OKMIME.test(f.mimetype)) return null;
  return (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [f.mimetype, f.buffer, String(f.originalname || 'file').slice(0, 100)]))[0].id;
}
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const sel = (name, opts, cur) => `<select name="${name}">${opts.map(o => `<option value="${o[0]}"${cur === o[0] ? ' selected' : ''}>${h(o[1])}</option>`).join('')}</select>`;
const campusOpts = (sc, all) => (sc ? [[sc, CAMPUS[sc].n]] : (all ? [['all', 'All campuses']] : []).concat(Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n])));

app.get('/admin', needStaff, async (req, res) => {
  const sc = scopeOf(req), w = sc ? ' WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const [m] = await q(`SELECT COUNT(*)::int n, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int p, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int o FROM members${w}`, pr);
  res.send(A(req, 'Admin Dashboard', `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px">
      <div class="glass-card" style="text-align:center; padding:40px; margin:0">
        <b style="color:var(--primary);font-size:3rem;display:block;line-height:1">${m.n}</b><span style="color:var(--text-muted);font-weight:600">Total Members</span>
      </div>
      <div class="glass-card" style="text-align:center; padding:40px; margin:0">
        <b style="color:#3b82f6;font-size:3rem;display:block;line-height:1">${m.o || 0}</b><span style="color:var(--text-muted);font-weight:600">Official</span>
      </div>
      <div class="glass-card" style="text-align:center; padding:40px; margin:0">
        <b style="color:#f59e0b;font-size:3rem;display:block;line-height:1">${m.p || 0}</b><span style="color:var(--text-muted);font-weight:600">Pending</span>
      </div>
    </div>
  `));
});

async function guardMember(req, res, id) {
  if (!(req.session.sr && can(req, 'members'))) { res.redirect('/admin-login'); return null; }
  const [m] = await q(`SELECT * FROM members WHERE id=$1`, [parseInt(id, 10) || 0]), sc = scopeOf(req);
  if (!m || (sc && m.campus !== sc)) { res.redirect('/admin/members'); return null; }
  return m;
}

app.get('/admin/members', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : ''), qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); }
  if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length} OR student_id ILIKE $${pr.length} OR phone ILIKE $${pr.length})`); }
  const ms = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 400`, pr);
  const act = (id, a, t, cls) => `<form method="POST" action="/admin/members/${id}/${a}" style="display:inline"><button class="btn ${cls || ''}" style="padding:6px 12px;font-size:12px;box-shadow:none">${t}</button></form>`;

  res.send(A(req, 'Members', `
    <div class="glass-card">
      <form style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
        <input name="q" value="${h(qs)}" placeholder="Search members..." style="flex:1;min-width:200px">
        ${sc ? '' : sel('campus', [['', 'All campuses']].concat(campusOpts(null)), cf)}
        <button class="btn" style="padding:0 24px">Search</button>
      </form>
      <div class="tw">
        <table>
          <tr><th>No</th><th>Name</th><th>Campus</th><th>Status</th><th>Actions</th></tr>
          ${ms.map(m => `<tr><td>${h(m.member_no)}</td><td>${h(m.name)}</td><td>${h(campusName(req, m.campus))}</td><td><span class="badge ${m.status}">${h(m.status)}</span></td><td>${m.status !== 'official' ? act(m.id, 'approve', 'Approve', 'g') : ''} ${m.status === 'pending' ? act(m.id, 'reject', 'Reject', 'danger') : ''} ${m.status === 'official' ? act(m.id, 'revoke', 'Revoke', 'secondary') : ''}</td></tr>`).join('')}
        </table>
      </div>
    </div>
  `));
});

[['approve', 'official'], ['reject', 'rejected'], ['revoke', 'registered']].forEach(([a, st]) => {
  app.post('/admin/members/:id/' + a, async (req, res) => {
    const m = await guardMember(req, res, req.params.id);
    if (m) { await q(`UPDATE members SET status=$1 WHERE id=$2`, [st, m.id]); res.redirect('/admin/members'); }
  });
});

app.get('/admin/content/:type', guard('content'), async (req, res) => {
  const tp = req.params.type; if (!TYPES.includes(tp)) return res.redirect('/admin');
  const sc = scopeOf(req), ps = await q(`SELECT * FROM posts WHERE type=$1 ${sc ? 'AND campus=$2' : ''} ORDER BY id DESC LIMIT 60`, sc ? [tp, sc] : [tp]);
  res.send(A(req, tp, `
    <div class="glass-card">
      <form method="POST" action="/admin/content/${tp}" enctype="multipart/form-data">
        <label>Campus</label>${sel('campus', campusOpts(sc, true))}
        <label>Title (Oromo / Amharic / Eng)</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px"><input name="title_om" placeholder="Oromo"><input name="title_am" placeholder="Amharic"><input name="title_en" placeholder="English"></div>
        ${tp === 'gallery' ? '' : `<label>Details (Oromo / Amharic / Eng)</label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px"><textarea name="body_om" rows="3" placeholder="Oromo"></textarea><textarea name="body_am" rows="3" placeholder="Amharic"></textarea><textarea name="body_en" rows="3" placeholder="English"></textarea></div>`}
        <label>Image</label><input name="image" type="file" accept="image/*">
        ${['document', 'education'].includes(tp) ? `<label>File</label><input name="file" type="file">` : ''}
        <p style="margin-top:24px"><button class="btn">Publish Content</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h3 style="margin-bottom:16px">Published</h3>
      ${ps.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);padding:12px 0"><span>${h(p.title_en || p.title_om || p.title_am)}</span><form method="POST" action="/admin/content/${tp}/${p.id}/delete"><button class="btn danger" style="padding:6px 12px;font-size:12px">Delete</button></form></div>`).join('') || `<p style="color:var(--text-muted)">No content yet.</p>`}
    </div>
  `));
});

app.post('/admin/content/:type', guard('content'), files6([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const tp = req.params.type, b = req.body, sc = scopeOf(req), s = (k, n) => String(b[k] || '').trim().slice(0, n);
  if (!TYPES.includes(tp)) return res.redirect('/admin');
  const img = await saveFile(((req.files || {}).image || [])[0]), fl = await saveFile(((req.files || {}).file || [])[0]);
  if (s('title_om', 200) || s('title_en', 200) || s('title_am', 200)) {
    await q(`INSERT INTO posts (type,campus,title_om,title_en,title_am,body_om,body_en,body_am,image_id,file_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tp, sc || (CAMPUS[b.campus] ? b.campus : 'all'), s('title_om', 200), s('title_en', 200), s('title_am', 200), s('body_om', 4000), s('body_en', 4000), s('body_am', 4000), img, fl]);
  }
  res.redirect('/admin/content/' + tp);
});
app.post('/admin/content/:type/:id/delete', guard('content'), async (req, res) => { await q(`DELETE FROM posts WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/content/' + req.params.type); });

app.get('/admin/leaders', guard('leaders'), async (req, res) => {
  const sc = scopeOf(req), ls = await q(`SELECT * FROM leaders ${sc ? 'WHERE campus=$1' : ''} ORDER BY (level='central') DESC, ord, id`, sc ? [sc] : []);
  res.send(A(req, 'Leadership', `
    <div class="glass-card">
      <form method="POST" action="/admin/leaders" enctype="multipart/form-data">
        <label>Name</label><input name="name" required>
        <label>Position (Oromo / Amharic / Eng)</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px"><input name="position_om" placeholder="Oromo"><input name="position_am" placeholder="Amharic"><input name="position_en" placeholder="English"></div>
        <label>Level</label>${sel('level', sc ? [['campus', 'Campus']] : [['central', 'Central'], ['campus', 'Campus']])}
        <label>Campus</label>${sel('campus', campusOpts(sc, false))}
        <label>Order</label><input name="ord" type="number" value="1">
        <label>Photo</label><input name="photo" type="file" accept="image/*">
        <p style="margin-top:24px"><button class="btn">Add Leader</button></p>
      </form>
    </div>
    <div class="glass-card">
      ${ls.map(x => `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);padding:12px 0"><span>${h(x.name)} · ${h(x.position_en || x.position_am || x.position_om)}</span><form method="POST" action="/admin/leaders/${x.id}/delete"><button class="btn danger" style="padding:6px 12px;font-size:12px;box-shadow:none">Delete</button></form></div>`).join('') || `<p style="color:var(--text-muted)">No leaders added yet.</p>`}
    </div>
  `));
});
app.post('/admin/leaders', guard('leaders'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const b = req.body, sc = scopeOf(req), pid = await saveFile(((req.files || {}).photo || [])[0]), lvl = sc ? 'campus' : (b.level === 'campus' ? 'campus' : 'central');
  if (b.name) await q(`INSERT INTO leaders (name,position_om,position_en,position_am,level,campus,photo_id,ord) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [String(b.name).slice(0, 80), String(b.position_om || '').slice(0, 100), String(b.position_en || '').slice(0, 100), String(b.position_am || '').slice(0, 100), lvl, lvl === 'central' ? 'all' : (sc || (CAMPUS[b.campus] ? b.campus : 'robe')), pid, parseInt(b.ord, 10) || 0]);
  res.redirect('/admin/leaders');
});
app.post('/admin/leaders/:id/delete', guard('leaders'), async (req, res) => { await q(`DELETE FROM leaders WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/leaders'); });

app.get('/admin/support', guard('support'), async (req, res) => {
  const sc = scopeOf(req), rs = await q(`SELECT * FROM support_requests ${sc ? "WHERE campus IN ($1,'all')" : ''} ORDER BY (status='open') DESC, id DESC LIMIT 100`, sc ? [sc] : []);
  res.send(A(req, 'Support', rs.map(r => `
    <div class="glass-card" style="padding:24px">
      <small style="color:var(--text-muted)">${h(r.member_no)} · ${h(r.name)} · ${h(r.campus)}</small>
      <h3 style="margin:8px 0">${h(r.subject)} <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span></h3>
      <p style="color:#cbd5e1">${h(r.message)}</p>
      <form method="POST" action="/admin/support/${r.id}/reply" style="margin-top:16px">
        <textarea name="reply" rows="3" placeholder="Write reply...">${h(r.reply || '')}</textarea>
        <p style="margin-top:12px"><button class="btn">Reply & Close</button></p>
      </form>
    </div>
  `).join('') || `<div class="glass-card"><p style="color:var(--text-muted)">No support requests.</p></div>`));
});
app.post('/admin/support/:id/reply', guard('support'), async (req, res) => { await q(`UPDATE support_requests SET reply=$1, status='closed' WHERE id=$2`, [String(req.body.reply || '').slice(0, 2000), parseInt(req.params.id, 10) || 0]); res.redirect('/admin/support'); });

const KINDS = [['contribution', 'Membership contribution'], ['donation', 'Donation'], ['fundraising', 'Fundraising'], ['income', 'Other income'], ['expense', 'Expense']];
app.get('/admin/finance', guard('finance'), async (req, res) => {
  const sc = scopeOf(req), w = sc ? 'WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const tx = await q(`SELECT * FROM transactions ${w} ORDER BY id DESC LIMIT 80`, pr), rp = await q(`SELECT * FROM finance_reports ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 24`, pr);
  res.send(A(req, 'Finance', `
    <div class="glass-card">
      <h3 style="margin-bottom:16px">Record Transaction</h3>
      <form method="POST" action="/admin/finance/tx">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
          <div><label>Type</label>${sel('kind', KINDS)}</div><div><label>Amount</label><input name="amount" type="number" step="0.01" min="0" required></div>
          <div><label>Date</label><input name="tdate" type="date" required></div><div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
        </div>
        <label>Note</label><input name="note">
        <p style="margin-top:24px"><button class="btn">Save Transaction</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h3 style="margin-bottom:16px">Generate Report</h3>
      <form method="POST" action="/admin/finance/report" style="display:flex;gap:16px;flex-wrap:wrap">
        <input name="period" placeholder="2026-11 or 2026" required style="max-width:200px">
        ${sel('campus', campusOpts(sc, true))}
        <button class="btn secondary">Create Report</button>
      </form>
      <div class="tw" style="margin-top:24px">
        <table>
          <tr><th>Period</th><th>Campus</th><th>Income</th><th>Expense</th><th>Status</th><th>Actions</th></tr>
          ${rp.map(r => `<tr><td>${h(r.period)}</td><td>${h(r.campus)}</td><td style="color:#34d399">${Number(r.income).toLocaleString()}</td><td style="color:#f87171">${Number(r.expense).toLocaleString()}</td><td>${r.approved ? '✔ Published' : 'Draft'}</td><td>${can(req, 'approve') ? `<form method="POST" action="/admin/finance/report/${r.id}/${r.approved ? 'hide' : 'approve'}"><button class="btn ${r.approved ? 'secondary' : 'g'}" style="padding:6px 12px;font-size:12px;box-shadow:none">${r.approved ? 'Hide' : 'Publish'}</button></form>` : ''}</td></tr>`).join('')}
        </table>
      </div>
    </div>
  `));
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

app.get('/admin/staff', guard('staff'), async (req, res) => {
  const st = await q(`SELECT id,username,name,role,campus,active FROM staff ORDER BY id`);
  res.send(A(req, 'Staff Accounts', `
    <div class="glass-card">
      <form method="POST" action="/admin/staff">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
          <div><label>Name</label><input name="name" required></div><div><label>Username</label><input name="username" required></div>
          <div><label>Role</label>${sel('role', ROLES.map(r => [r, r]))}</div><div><label>Campus</label>${sel('campus', campusOpts(null))}</div>
        </div>
        <label>Password (8+)</label><input name="password" type="password" minlength="8" required>
        <p style="margin-top:24px"><button class="btn">Create Account</button></p>
      </form>
    </div>
    <div class="glass-card">
      <div class="tw">
        <table>
          <tr><th>Name</th><th>Username</th><th>Role</th><th>Campus</th><th>Status</th></tr>
          ${st.map(x => `<tr><td>${h(x.name)}</td><td>${h(x.username)}</td><td>${h(x.role)}</td><td>${h(x.campus || 'All')}</td><td><form method="POST" action="/admin/staff/${x.id}/toggle"><button class="btn ${x.active ? 'secondary' : 'g'}" style="padding:6px 12px;font-size:12px;box-shadow:none">${x.active ? 'Disable' : 'Enable'}</button></form></td></tr>`).join('')}
        </table>
      </div>
    </div>
  `));
});
app.post('/admin/staff', guard('staff'), async (req, res) => {
  const b = req.body;
  if (ROLES.includes(b.role) && b.name && b.username && String(b.password || '').length >= 8) {
    try { await q(`INSERT INTO staff (username,name,role,campus,password) VALUES ($1,$2,$3,$4,$5)`, [String(b.username).trim().slice(0, 40), String(b.name).slice(0, 80), b.role, CAMPUS[b.campus] ? b.campus : null, bcrypt.hashSync(String(b.password), 10)]); } catch (e) {}
  }
  res.redirect('/admin/staff');
});
app.post('/admin/staff/:id/toggle', guard('staff'), async (req, res) => { await q(`UPDATE staff SET active=1-active WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/staff'); });

app.get('/admin/backup', guard('staff'), async (req, res) => {
  if (!req.query.go) return res.send(A(req, 'Backup', `
    <div class="glass-card" style="text-align:center;padding:60px 20px">
      <h3 style="margin-bottom:16px;font-size:24px">Database Backup</h3>
      <p style="color:var(--text-muted);margin-bottom:32px">Export all tables and metadata as a downloadable JSON file.</p>
      <a class="btn" style="padding:16px 32px" href="/admin/backup?go=1">⬇ Download Backup</a>
    </div>
  `));
  const out = { exported: new Date().toISOString() };
  for (const t of ['members', 'posts', 'leaders', 'support_requests', 'transactions', 'finance_reports', 'staff']) { out[t] = await q(`SELECT * FROM ${t}`); }
  res.set('Content-Type', 'application/json').set('Content-Disposition', `attachment; filename="sikkoo-mandoo-backup-${new Date().toISOString().slice(0, 10)}.json"`).send(JSON.stringify(out));
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Sikkoo-Mandoo Ultra Premium Portal Running.');
});
