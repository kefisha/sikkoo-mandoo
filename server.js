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
    site: 'Gamtaa Barattoota Siikkoo-Mandoo', uni: 'Yuunivarsiitii Madda Walaabuu', tag: 'Mana dijitaalaa barattoota Siikkoo-Mandoo kaampasii sadanii',
    home: 'Fuula Jalqabaa', reg: "Galmaa'i", login: 'Seeni', logout: "Ba'i", dash: 'Daashboordii', admin: 'Bulchiinsa', announcement: 'Beeksisa', news: 'Oduu', event: 'Taateewwan', campus: 'Kaampasii',
    members: 'Miseensota', official: 'Miseensa Idilee', registered: "Galmaa'e", pending: 'Eeggataa', rejected: 'Kuufame', latest: 'Haaraa', none: 'Ammaaf homtu hin jiru',
    name: 'Maqaa Guutuu', gender: 'Saala', male: 'Dhiira', female: 'Dubartii', phone: 'Bilbila', email: 'Imeelii', dept: 'Muummee', year: 'Waggaa Barnootaa', sid: 'Lakkoofsa ID Barattootaa',
    pass: 'Jecha Darbii', photo: 'Suuraa', want: "Miseensa idilee ta'uu barbaadaa?", send: 'Ergi', card: 'Kaardii Miseensummaa', no: 'Lakkoofsa Miseensaa', verify: 'Mirkaneessi',
    valid: "Kaardiin kun dhugaa dha ✔", invalid: 'Kaardiin kun hin argamne ✘', upgrade: "Gaaffii miseensa idilee ta'uu ergi", print: 'Maxxansi', title: 'Mata-duree', body: 'Ibsa', date: 'Guyyaa', add: 'Dabaluu', del: 'Haqi',
    approve: 'Mirkaneessi', reject: 'Didi', total: 'Waliigala', bad: 'Odeeffannoon sirrii miti', exists: 'Lakkoofsi kun duraan galmaa’eera', more: 'Dabalataa',
    about: 'Waa’ee Keenya', leadership: 'Geggeessitoota', education: 'Barnoota', document: 'Sanadoota', project: 'Pirojektoota', gallery: 'Suuraa', finance: 'Maallaqa', contact: 'Nu Qunnamaa', support: 'Deeggarsa', search: 'Barbaadi',
    aboutText: 'Gamtaan Barattoota Siikkoo-Mandoo Yuunivarsiitii Madda Walaabuu kaampasii Roobee, Gooobaa fi Shaashamanee keessatti barattoota walitti fida, barnootaa fi tokkummaa isaanii cimsa.', menu: 'Baafata', message: 'Ergaa', dl: 'Buusi',
    portalTitle: 'Poortaalii Miseensotaa', welcome: 'Baga nagaan dhuftan', memberArea: 'Kutaa Qophii Miseensotaa'
  },
  am: {
    site: 'የሲቆ-ማንዶ ተማሪዎች ማህበር', uni: 'መደ ወላቡ ዩኒቨርሲቲ', tag: 'የሶስቱም ካምፓስ የሲቆ-ማንዶ ተማሪዎች ዲጂታል መድረክ',
    home: 'ዋና ገጽ', reg: 'ይመዝገቡ', login: 'ይግቡ (Login)', logout: 'ውጣ', dash: 'ዳሽቦርድ', admin: 'አድሚን', announcement: 'ማስታወቂያዎች', news: 'ዜና', event: 'ክስተቶች / ኩነቶች', campus: 'ካምፓስ',
    members: 'አባላት', official: 'ቋሚ አባል', registered: 'የተመዘገበ', pending: 'በመጠባበቅ ላይ', rejected: 'ውድቅ የተደረገ', latest: 'አዳዲስ መረጃዎች', none: 'ምንም መረጃ የለም',
    name: 'ሙሉ ስም', gender: 'ጾታ', male: 'ወንድ', female: 'ሴት', phone: 'ስልክ ቁጥር', email: 'ኢሜይል', dept: 'የትምህርት ክፍል', year: 'የትምህርት ዓመት', sid: 'የተማሪ መታወቂያ (ID)',
    pass: 'የይለፍ ቃል', photo: 'ፎቶ', want: 'ቋሚ አባል መሆን ይፈልጋሉ?', send: 'ላክ', card: 'የአባልነት መታወቂያ ካርድ', no: 'የአባልነት ቁጥር', verify: 'አረጋግጥ',
    valid: 'ይህ ካርድ ትክክለኛ ነው ✔', invalid: 'ካርዱ አልተገኘም ✘', upgrade: 'የቋሚ አባልነት ጥያቄ አቅርብ', print: 'አትም (Print)', title: 'ርዕስ', body: 'ዝርዝር መግለጫ', date: 'ቀን', add: 'ጨምር', del: 'ሰርዝ',
    approve: 'አጽድቅ', reject: 'ውድቅ አድርግ', total: 'አጠቃላይ', bad: 'መረጃው ትክክል አይደለም', exists: 'ይህ መለያ ቁጥር ቀደም ሲል ተመዝግቧል', more: 'ተጨማሪ',
    about: 'ስለ እኛ', leadership: 'አመራሮች', education: 'ትምህርት', document: 'ሰነዶች', project: 'ፕሮጀክቶች', gallery: 'ጋለሪ / ፎቶዎች', finance: 'ፋይናንስ', contact: 'አግኙን', support: 'እገዛ እና ድጋፍ', search: 'ፈልግ',
    aboutText: 'የመደ ወላቡ ዩኒቨርሲቲ የሲቆ-ማንዶ ተማሪዎች ማህበር በሮቤ፣ ጎባ እና ሻሸመኔ ካምፓሶች የሚገኙ ተማሪዎችን አንድ የሚያደርግና ትምህርታቸውን የሚያግዝ ማህበር ነው።', menu: 'ሜኑ', message: 'መልዕክት', dl: 'አውርድ (Download)',
    portalTitle: 'የአባላት ፖርታል', welcome: 'እንኳን ደህና መጡ', memberArea: 'የአባላት የተለየ ገጽ'
  },
  en: {
    site: 'Siikkoo-Mandoo Students Association', uni: 'Madda Walabu University', tag: 'The digital home of Siikkoo-Mandoo students across all three campuses',
    home: 'Home', reg: 'Register', login: 'Login', logout: 'Logout', dash: 'Dashboard', admin: 'Administration', announcement: 'Announcements', news: 'News', event: 'Events', campus: 'Campus',
    members: 'Members', official: 'Official Member', registered: 'Registered', pending: 'Pending', rejected: 'Rejected', latest: 'Latest', none: 'Nothing yet',
    name: 'Full Name', gender: 'Gender', male: 'Male', female: 'Female', phone: 'Phone', email: 'Email', dept: 'Department', year: 'Academic Year', sid: 'University Student ID',
    pass: 'Password', photo: 'Photo', want: 'Become an official member?', send: 'Submit', card: 'Membership Card', no: 'Membership No.', verify: 'Verify',
    valid: 'This card is valid ✔', invalid: 'Card not found ✘', upgrade: 'Request official membership', print: 'Print', title: 'Title', body: 'Details', date: 'Date', add: 'Add', del: 'Delete',
    approve: 'Approve', reject: 'Reject', total: 'Total', bad: 'Please check your information', exists: 'This ID is already registered', more: 'More',
    about: 'About', leadership: 'Leadership', education: 'Education', document: 'Documents', project: 'Projects', gallery: 'Gallery', finance: 'Finance', contact: 'Contact', support: 'Support', search: 'Search',
    aboutText: 'The Siikkoo-Mandoo Students Association of Madda Walabu University unites students on the Robe, Goba and Shashamane campuses and strengthens their education and solidarity.', menu: 'Menu', message: 'Message', dl: 'Download',
    portalTitle: 'Members Portal', welcome: 'Welcome back', memberArea: 'Members Exclusive Area'
  }
};

const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = req => (['en', 'am', 'om'].includes(req.session.lang) ? req.session.lang : 'om');
const tr = (req, k) => (T[L(req)] && T[L(req)][k]) || (T.en[k] || k);
const campusName = (req, cKey) => {
  const c = CAMPUS[cKey];
  if (!c) return cKey;
  const l = L(req);
  return c[l] || c.n;
};

// ---------- Modern, High-Contrast & Vibrant CSS ----------
const CSS = `
:root {
  --primary: #0b7a43;
  --primary-dark: #064e2b;
  --accent: #d62828;
  --accent-light: #ff4d4d;
  --gold: #f59e0b;
  --dark: #121417;
  --surface: #1e2229;
  --bg: #f3f5f8;
  --text: #1a202c;
  --text-muted: #64748b;
  --card-bg: #ffffff;
}
*{box-sizing:border-box}
body{margin:0;font-family:'Poppins',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
a{color:var(--primary);text-decoration:none;transition:all .2s ease}
a:hover{color:var(--accent)}

/* Brand Top Strip */
.top-strip {
  height: 8px;
  background: repeating-linear-gradient(90deg, #0b7a43 0 25px, #d62828 25px 50px, #111111 50px 75px);
}

/* Header */
header {
  background: #0f172a;
  color: #fff;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  position: sticky;
  top: 0;
  z-index: 100;
}
.in { max-width: 1100px; margin: auto; padding: 12px 18px; }
.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.logo {
  font-weight: 800;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.05rem;
}
.logo-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #0b7a43, #15803d);
  display: grid;
  place-items: center;
  font-size: 22px;
  box-shadow: 0 4px 10px rgba(11,122,67,0.4);
  border: 2px solid rgba(255,255,255,0.2);
}
.logo small { font-weight: 400; font-size: 11px; color: #94a3b8; display: block; margin-top: 2px; }

/* Language Switcher */
.lang-box {
  display: flex;
  gap: 4px;
  background: rgba(255,255,255,0.08);
  padding: 4px;
  border-radius: 99px;
  border: 1px solid rgba(255,255,255,0.12);
}
.lang-btn {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 99px;
  color: #cbd5e1;
  text-decoration: none;
}
.lang-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
.lang-btn.active {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 2px 6px rgba(11,122,67,0.5);
}

/* Nav Menu */
nav.menu-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
}
nav.menu-links a {
  color: #e2e8f0;
  padding: 7px 15px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
}
nav.menu-links a:hover {
  background: var(--primary);
  color: #fff;
  transform: translateY(-1px);
}
nav.menu-links a.highlight {
  background: linear-gradient(135deg, var(--accent), #b91c1c);
  color: #fff;
  border: none;
}

/* Hero Section */
.hero {
  background: linear-gradient(135deg, #0b7a43 0%, #064e2b 60%, #0f172a 100%);
  color: #fff;
  padding: 55px 18px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.hero::after {
  content: '';
  position: absolute;
  bottom: -30px;
  left: 0;
  right: 0;
  height: 60px;
  background: var(--bg);
  border-radius: 50% 50% 0 0;
}
.hero h1 { margin: 0 0 10px; font-size: clamp(1.8rem, 5.5vw, 2.7rem); font-weight: 800; letter-spacing: -0.5px; }
.hero p { margin: 0 auto 24px; max-width: 620px; font-size: 1.05rem; opacity: .9; color: #e2e8f0; }

/* Buttons */
.btn, button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, var(--accent), #b91c1c);
  color: #fff;
  border: 0;
  border-radius: 12px;
  padding: 12px 24px;
  font-weight: 700;
  font-size: 14.5px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(214,40,40,0.3);
  transition: all 0.2s ease;
}
.btn:hover, button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(214,40,40,0.4);
}
.btn.g {
  background: linear-gradient(135deg, var(--primary), #056033);
  box-shadow: 0 4px 14px rgba(11,122,67,0.3);
}
.btn.g:hover { box-shadow: 0 6px 18px rgba(11,122,67,0.45); }
.btn.k {
  background: #1e293b;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
.btn.outline {
  background: transparent;
  border: 2px solid var(--primary);
  color: var(--primary);
  box-shadow: none;
}

/* Cards & Grid */
.card {
  background: var(--card-bg);
  border-radius: 18px;
  padding: 24px;
  margin: 18px 0;
  box-shadow: 0 4px 20px rgba(0,0,0,0.04);
  border: 1px solid rgba(0,0,0,0.06);
  border-top: 4px solid var(--primary);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.tile {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  text-align: center;
  border-bottom: 4px solid var(--accent);
  box-shadow: 0 4px 15px rgba(0,0,0,0.04);
  transition: transform .2s ease;
}
.tile:hover { transform: translateY(-3px); }
.tile b { display: block; font-size: 2.2rem; color: var(--primary); font-weight: 800; line-height: 1.1; margin-bottom: 4px; }

/* Form styles */
label { display: block; font-weight: 700; font-size: 13px; margin: 12px 0 6px; color: #334155; }
input, select, textarea {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font: inherit;
  background: #fff;
  transition: border .2s;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--primary);
}

/* Tables & Badges */
table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th { background: #0f172a; color: #fff; text-align: left; padding: 12px; font-weight: 600; }
th, td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
.tw { overflow-x: auto; border-radius: 12px; border: 1px solid #e2e8f0; }
.badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 11.5px; font-weight: 700; background: #e2e8f0; }
.badge.official { background: #0b7a43; color: #fff; }
.badge.pending { background: #f59e0b; color: #fff; }
.badge.rejected { background: #d62828; color: #fff; }

/* Student ID Card Modern */
.id {
  max-width: 400px;
  margin: 16px auto;
  border-radius: 20px;
  overflow: hidden;
  background: #ffffff;
  border: 2px solid #0f172a;
  box-shadow: 0 12px 30px rgba(0,0,0,0.15);
}
.id .hd {
  background: linear-gradient(135deg, #0b7a43, #064e2b);
  color: #fff;
  padding: 14px 16px;
  font-weight: 700;
  font-size: 13.5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.id .bd { display: flex; gap: 16px; padding: 18px; align-items: center; }
.id img { width: 95px; height: 120px; object-fit: cover; border-radius: 12px; border: 3px solid #0b7a43; background: #f1f5f9; }

/* Portal Sidebar / Subnav */
.portal-bar {
  background: #1e293b;
  border-radius: 16px;
  padding: 12px 16px;
  margin-bottom: 20px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  box-shadow: 0 6px 16px rgba(0,0,0,0.08);
}
.portal-bar a {
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(255,255,255,0.07);
}
.portal-bar a:hover {
  background: var(--primary);
  color: #fff;
}

footer {
  background: #0f172a;
  color: #94a3b8;
  text-align: center;
  padding: 24px;
  margin-top: 50px;
  font-size: 13px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
footer a { color: #cbd5e1; }
.err { background: #fee2e2; border-left: 4px solid var(--accent); color: #991b1b; padding: 12px; border-radius: 10px; margin: 12px 0; font-weight: 600; }
.msgok { background: #dcfce7; border-left: 4px solid var(--primary); color: #166534; padding: 12px; border-radius: 10px; margin: 12px 0; font-weight: 600; }
.im { width: 100%; max-height: 260px; object-fit: cover; border-radius: 14px; margin: 10px 0; }
@media print { header, footer, .top-strip, .np, .portal-bar { display: none !important; } body { background: #fff; } .id { box-shadow: none; border: 1px solid #000; } }
`;

// ---------- Layout Builder ----------
function page(req, title, body, isPortal = false) {
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

  // Public portal links: clean & focused
  let navItems = [
    ['/', tr(req, 'home')],
    ['/about', tr(req, 'about')],
    ['/contact', tr(req, 'contact')]
  ];

  if (isMemberLoggedIn) {
    navItems.push(['/student-dashboard', `🎓 ${tr(req, 'portalTitle')}`]);
    navItems.push(['/logout', tr(req, 'logout')]);
  } else if (isAdminLoggedIn) {
    navItems.push(['/admin', `⚙️ ${tr(req, 'dash')}`]);
    navItems.push(['/logout', tr(req, 'logout')]);
  } else {
    navItems.push(['/login', `🔑 ${tr(req, 'login')}`]);
    navItems.push(['/sikkoo-mandoo-register', `📝 ${tr(req, 'reg')}`]);
  }

  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b7a43">
  <title>${h(title)} · ${h(tr(req, 'site'))}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Noto+Sans+Ethiopic:wght@400;600;700&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body>
<div class="top-strip"></div>
<header>
  <div class="in">
    <div class="top-nav">
      <a class="logo" href="/">
        <div class="logo-icon">🌳</div>
        <div>
          <span>${h(tr(req, 'site'))}</span>
          <small>${h(tr(req, 'uni'))}</small>
        </div>
      </a>
      ${langSwitcher}
    </div>
    <nav class="menu-links">
      ${navItems.map(n => `<a href="${n[0]}" class="${n[0] === '/login' || n[0] === '/student-dashboard' ? 'highlight' : ''}">${n[1]}</a>`).join('')}
    </nav>
  </div>
</header>

${body}

<footer>
  <div class="in">
    <p style="margin: 0 0 8px 0;">© ${new Date().getFullYear()} ${h(tr(req, 'site'))} · ${h(tr(req, 'uni'))}</p>
    <div>
      <a href="/">${tr(req, 'home')}</a> · 
      <a href="/login">${tr(req, 'login')}</a> · 
      <a href="/admin-login" style="opacity: 0.8;">Admin Staff</a>
    </div>
  </div>
</footer>
</body>
</html>`;
}

const wrap = c => `<div class="in">${c}</div>`;

function postT(req, p, f) {
  const l = L(req);
  if (l === 'am') return p[f + '_am'] || p[f + '_om'] || p[f + '_en'] || '';
  if (l === 'om') return p[f + '_om'] || p[f + '_en'] || '';
  return p[f + '_en'] || p[f + '_om'] || '';
}

function postCard(req, p) {
  return `<div class="card">
    <small style="color:var(--text-muted);font-weight:600">${h(p.campus === 'all' ? 'All Campuses' : campusName(req, p.campus))} · ${h(p.event_date || '')}</small>
    <h3 style="margin:6px 0 10px;font-size:1.25rem">${h(postT(req, p, 'title'))}</h3>
    ${p.image_id ? `<img class="im" src="/photo/${p.image_id}" alt="" loading="lazy">` : ''}
    <div style="color:#334155">${h(postT(req, p, 'body')).replace(/\n/g, '<br>')}</div>
    ${p.type === 'project' ? `<div style="height:10px;border-radius:99px;background:#e2e8f0;overflow:hidden;margin-top:10px"><i style="display:block;height:100%;background:var(--primary);width:${Math.min(100, p.progress || 0)}%"></i></div><small style="font-weight:700">${p.progress || 0}% Complete</small>` : ''}
    ${p.file_id ? `<p><a class="btn g" style="padding:6px 14px;font-size:12.5px" href="/photo/${p.file_id}?dl=1">⬇ ${h(tr(req, 'dl'))}</a></p>` : ''}
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

  // default admin
  const adminPass = bcrypt.hashSync('sikomando123', 10);
  await q(`
    INSERT INTO staff (username, name, role, campus, password, active)
    VALUES ('admin', 'Central Admin', 'central_admin', NULL, $1, 1)
    ON CONFLICT (username) DO UPDATE SET password = $1, role = 'central_admin', active = 1
  `, [adminPass]);
})().catch(e => console.error('DB init err:', e.message));

// ---------- Language Switch Route ----------
app.get('/lang/:l', (req, res) => {
  const l = req.params.l;
  if (['om', 'am', 'en'].includes(l)) req.session.lang = l;
  res.redirect(req.get('referer') || '/');
});

// ---------- PUBLIC PORTAL (Clean, Styled, Login/Register focused) ----------
app.get('/', async (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  try {
    const st = await q(`SELECT campus, COUNT(*)::int AS n, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int AS o FROM members GROUP BY campus`);
    const total = st.reduce((a, r) => a + r.n, 0), off = st.reduce((a, r) => a + r.o, 0);

    const html = `
      <div class="hero">
        <h1>${h(tr(req, 'site'))}</h1>
        <p>${h(tr(req, 'tag'))}</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <a class="btn highlight" style="font-size:16px;padding:14px 30px" href="/login">🔑 ${h(tr(req, 'login'))}</a>
          <a class="btn g" style="font-size:16px;padding:14px 30px" href="/sikkoo-mandoo-register">📝 ${h(tr(req, 'reg'))}</a>
        </div>
      </div>
      ` + wrap(`
        <div class="grid" style="margin-top:-25px;position:relative;z-index:10">
          <div class="tile"><b>${total}</b>${h(tr(req, 'registered'))}</div>
          <div class="tile"><b>${off}</b>${h(tr(req, 'official'))}</div>
          ${Object.keys(CAMPUS).map(k => {
            const count = (st.find(r => r.campus === k) || { n: 0 }).n;
            return `<div class="tile"><b>${count}</b>${campusName(req, k)}</div>`;
          }).join('')}
        </div>

        <div class="card" style="text-align:center;margin-top:30px;padding:36px 20px">
          <h2 style="margin:0 0 10px;font-size:1.8rem;color:var(--primary)">${h(tr(req, 'portalTitle'))}</h2>
          <p style="max-width:560px;margin:auto;color:var(--text-muted);font-size:15px">
            ${L(req) === 'am' 
              ? 'ይህ ለሲቆ-ማንዶ ተማሪዎች ብቻ የተዘጋጀ ፖርታል ነው። ወደ ውስጠኛው ፖርታል ለመግባት እባክዎ መጀመሪያ ይግቡ (Login) ወይም አዲስ አካውንት ይመዝገቡ።' 
              : (L(req) === 'om' 
                ? 'Kun poortaalii qophii barattoota Siikkoo-Mandoo ti. Tajaajiloota guutuu argachuuf maaloo dura seeni (Login) ykn galmaa’i.'
                : 'This is the dedicated portal for Siikkoo-Mandoo students. Please login or register to access student materials, events, ID card and resources.')}
          </p>
          <div style="margin-top:24px">
            <a href="/login" class="btn" style="min-width:160px">🔑 ${h(tr(req, 'login'))}</a>
          </div>
        </div>
      `);
    res.send(page(req, tr(req, 'home'), html));
  } catch (e) {
    res.status(500).send('Error');
  }
});

app.get('/about', (req, res) => {
  res.send(page(req, tr(req, 'about'), wrap(`
    <div class="card">
      <h2 style="color:var(--primary)">${h(tr(req, 'about'))}</h2>
      <p style="font-size:16px;line-height:1.7">${h(tr(req, 'aboutText'))}</p>
    </div>
  `)));
});

app.get('/contact', (req, res) => {
  res.send(page(req, tr(req, 'contact'), wrap(`
    <div class="card">
      <h2 style="color:var(--primary)">${h(tr(req, 'contact'))}</h2>
      <p>✉ ${h(process.env.CONTACT_EMAIL || 'support@sikkoomandoo.org')} · ☎ ${h(process.env.CONTACT_PHONE || '+251 900 000000')}</p>
      ${req.query.ok ? `<div class="msgok">✔ ${L(req) === 'am' ? 'መልዕክትዎ በተሳካ ሁኔታ ተልኳል!' : (L(req) === 'om' ? 'Ergaan keessan ergameera!' : 'Message sent successfully!')}</div>` : ''}
      <form method="POST" action="/contact">
        <label>${h(tr(req, 'name'))}</label><input name="name" required>
        <label>${h(tr(req, 'message'))}</label><textarea name="message" rows="4" required></textarea>
        <p><button>${h(tr(req, 'send'))}</button></p>
      </form>
    </div>
  `)));
});

app.post('/contact', async (req, res) => {
  const n = String(req.body.name || '').slice(0, 80), m = String(req.body.message || '').slice(0, 2000);
  if (n && m) await q(`INSERT INTO support_requests (member_no,name,campus,subject,message) VALUES ('PUBLIC',$1,'all','Contact form',$2)`, [n, m]);
  res.redirect('/contact?ok=1');
});

// ---------- Registration Page ----------
function regForm(req, err, v) {
  v = v || {};
  const s = (k, o) => o.map(x => `<option value="${x[0]}"${v[k] === x[0] ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  return page(req, tr(req, 'reg'), wrap(`
    <div class="card" style="max-width:580px;margin:24px auto">
      <h2 style="color:var(--primary);margin-top:0">${h(tr(req, 'reg'))}</h2>
      ${err ? `<div class="err">${h(err)}</div>` : ''}
      <form method="POST" action="/sikkoo-mandoo-register" enctype="multipart/form-data">
        <label>${h(tr(req, 'name'))}</label><input name="name" required value="${h(v.name)}">
        <label>${h(tr(req, 'gender'))}</label><select name="gender">${s('gender', [['M', tr(req, 'male')], ['F', tr(req, 'female')]])}</select>
        <label>${h(tr(req, 'campus'))}</label><select name="campus" required>${s('campus', Object.keys(CAMPUS).map(k => [k, campusName(req, k)]))}</select>
        <label>${h(tr(req, 'dept'))}</label><input name="department" required value="${h(v.department)}">
        <label>${h(tr(req, 'year'))}</label><select name="year">${s('year', [1, 2, 3, 4, 5, 6].map(x => [String(x), String(x)]))}</select>
        <label>${h(tr(req, 'sid'))}</label><input name="student_id" required value="${h(v.student_id)}" placeholder="UGRR/12345/15">
        <label>${h(tr(req, 'phone'))}</label><input name="phone" required type="tel" value="${h(v.phone)}">
        <label>${h(tr(req, 'email'))}</label><input name="email" type="email" value="${h(v.email)}">
        <label>${h(tr(req, 'photo'))}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" id="ph">
        <label>${h(tr(req, 'pass'))} (6+)</label><input name="password" type="password" minlength="6" required>
        <label style="display:flex;gap:10px;align-items:center;margin-top:14px"><input type="checkbox" name="want" value="1" style="width:auto"> ${h(tr(req, 'want'))}</label>
        <p style="margin-top:20px"><button style="width:100%">${h(tr(req, 'send'))}</button></p>
      </form>
    </div>
    <script>
      document.getElementById('ph').addEventListener('change',function(e){
        var f=e.target.files[0];if(!f)return;
        var i=new Image();i.onload=function(){
          var s=Math.min(1,600/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*s;c.height=i.height*s;
          c.getContext('2d').drawImage(i,0,0,c.width,c.height);
          c.toBlob(function(b){try{var d=new DataTransfer();d.items.add(new File([b],'photo.jpg',{type:'image/jpeg'}));e.target.files=d.files}catch(x){}},'image/jpeg',.82)
        };i.src=URL.createObjectURL(f)
      });
    </script>
  `));
}

app.get('/sikkoo-mandoo-register', (req, res) => res.send(regForm(req)));
app.post('/sikkoo-mandoo-register', upload.single('photo'), async (req, res) => {
  const b = req.body, c = CAMPUS[b.campus];
  if (!c || !b.name || !b.student_id || !b.phone || !b.department || String(b.password || '').length < 6) return res.send(regForm(req, tr(req, 'bad'), b));
  try {
    if ((await q(`SELECT 1 FROM members WHERE UPPER(student_id)=UPPER($1)`, [b.student_id.trim()])).length) return res.send(regForm(req, tr(req, 'exists'), b));
    let pid = null;
    if (req.file && /^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) {
      pid = (await q(`INSERT INTO files (mime,data) VALUES ($1,$2) RETURNING id`, [req.file.mimetype, req.file.buffer]))[0].id;
    }
    const hash = bcrypt.hashSync(String(b.password), 10), yr = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM members WHERE campus=$1`, [b.campus]);
      const no = `SM-${c.c}-${yr}-${String(n + 1 + i).padStart(4, '0')}`;
      try {
        await q(`INSERT INTO members (member_no,name,gender,phone,email,campus,department,year,student_id,photo_id,password,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [no, b.name.trim().slice(0, 80), b.gender === 'F' ? 'F' : 'M', b.phone.trim().slice(0, 30), (b.email || '').slice(0, 80), b.campus, b.department.trim().slice(0, 80), String(b.year || '1'), b.student_id.trim().slice(0, 40), pid, hash, b.want ? 'pending' : 'registered']);
        req.session.mid = no;
        req.session.campus = b.campus;
        req.session.role = 'student';
        return res.redirect('/student-dashboard');
      } catch (e) {
        if (!/duplicate|unique/i.test(e.message)) throw e;
      }
    }
    res.send(regForm(req, tr(req, 'bad'), b));
  } catch (e) {
    console.error(e.message);
    res.status(500).send('Error');
  }
});

// ---------- LOGIN PAGE ----------
const fails = new Map();
function limited(req, res) {
  const f = fails.get(req.ip) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 9e5) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 10) { res.status(429).send('Too many attempts. Try again later.'); return null; }
  return f;
}

app.get('/login', (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  res.send(page(req, tr(req, 'login'), wrap(`
    <div class="card" style="max-width:440px;margin:30px auto;border-top-color:var(--accent);box-shadow:0 8px 30px rgba(0,0,0,0.08)">
      <h2 style="margin-top:0;color:var(--accent);display:flex;align-items:center;gap:8px">🔑 ${h(tr(req, 'login'))}</h2>
      ${req.query.e ? `<div class="err">${h(tr(req, 'bad'))}</div>` : ''}
      <form method="POST" action="/login">
        <label>${h(tr(req, 'no'))} / ${h(tr(req, 'sid'))}</label>
        <input name="u" required placeholder="SM-ROB-2026-0001 or ID" autocomplete="username">
        <label>${h(tr(req, 'pass'))}</label>
        <input name="p" type="password" required autocomplete="current-password">
        <p style="margin-top:20px"><button style="width:100%">${h(tr(req, 'login'))}</button></p>
        <div style="text-align:center;margin-top:14px">
          <a href="/sikkoo-mandoo-register" style="font-weight:600">${h(tr(req, 'reg'))} →</a>
        </div>
      </form>
    </div>
  `)));
});

app.post('/login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const identifier = String(req.body.u || '').trim();
  const [m] = await q(`SELECT * FROM members WHERE UPPER(member_no)=UPPER($1) OR UPPER(student_id)=UPPER($1)`, [identifier]);
  if (m && bcrypt.compareSync(String(req.body.p || ''), m.password)) {
    req.session.sr = null;
    req.session.mid = m.member_no;
    req.session.campus = m.campus;
    return res.redirect('/student-dashboard');
  }
  f.n++;
  fails.set(req.ip, f);
  res.redirect('/login?e=1');
});

// ---------- DEDICATED MEMBERS PORTAL (ውስጣዊ የአባላት ፖርታል) ----------
function memberPortalNav(req, activeTab) {
  const navs = [
    ['/student-dashboard', `🪪 ${tr(req, 'card')}`],
    ['/portal/announcements', `📢 ${tr(req, 'announcement')}`],
    ['/portal/news', `📰 ${tr(req, 'news')}`],
    ['/portal/events', `📅 ${tr(req, 'event')}`],
    ['/portal/education', `📚 ${tr(req, 'education')}`],
    ['/portal/documents', `📁 ${tr(req, 'document')}`],
    ['/portal/projects', `🏗️ ${tr(req, 'project')}`],
    ['/portal/gallery', `🖼️ ${tr(req, 'gallery')}`],
    ['/portal/leadership', `👥 ${tr(req, 'leadership')}`],
    ['/portal/finance', `💰 ${tr(req, 'finance')}`]
  ];
  return `
    <div class="portal-bar np">
      ${navs.map(x => `<a href="${x[0]}" style="${activeTab === x[0] ? 'background:var(--primary);color:#fff;' : ''}">${x[1]}</a>`).join('')}
    </div>
  `;
}

app.get('/student-dashboard', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');
  const sr = await q(`SELECT * FROM support_requests WHERE member_no=$1 ORDER BY id DESC LIMIT 10`, [m.member_no]);
  const base = 'https://' + req.headers.host + '/verify/' + encodeURIComponent(m.member_no);

  const html = wrap(`
    <div style="margin-top:16px;">
      <h2 style="margin:0 0 4px;font-size:1.6rem">🎓 ${h(tr(req, 'welcome'))}, ${h(m.name)}</h2>
      <p style="color:var(--text-muted);margin:0 0 16px">${h(tr(req, 'memberArea'))}</p>
      ${memberPortalNav(req, '/student-dashboard')}

      <div class="grid" style="align-items:start">
        <!-- Digital Membership ID -->
        <div>
          <div class="id">
            <div class="hd">
              <span>${h(tr(req, 'site'))}</span>
              <span class="badge ${m.status}">${h(tr(req, m.status))}</span>
            </div>
            <div class="bd">
              <img src="${m.photo_id ? '/photo/' + m.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}" alt="">
              <div>
                <b style="font-size:17px;color:#0f172a">${h(m.name)}</b><br>
                <small style="color:var(--text-muted)">${h(tr(req, 'no'))}</small><br>
                <b style="color:var(--accent);font-size:15px">${h(m.member_no)}</b><br>
                <small style="color:#475569">${h(campusName(req, m.campus))} · ${h(m.department)} · Y${h(m.year)}</small>
              </div>
            </div>
            <div style="padding:0 18px 16px;display:flex;justify-content:space-between;align-items:flex-end">
              <div>
                <small style="color:var(--text-muted)">Student ID</small><br>
                <b style="font-size:13px">${h(m.student_id)}</b>
              </div>
              <div id="qr"></div>
            </div>
          </div>
          <p class="np" style="text-align:center;gap:8px;display:flex;justify-content:center">
            <button onclick="print()" class="btn k" style="padding:8px 16px">🖨️ ${h(tr(req, 'print'))}</button>
            ${m.status === 'registered' ? `<form method="POST" action="/student/upgrade" style="display:inline"><button class="btn g" style="padding:8px 16px">${h(tr(req, 'upgrade'))}</button></form>` : ''}
          </p>
        </div>

        <!-- Support and Password section -->
        <div>
          <div class="card np" style="margin-top:0">
            <h3>💬 ${h(tr(req, 'support'))}</h3>
            <form method="POST" action="/student/support">
              <label>${h(tr(req, 'title'))}</label><input name="subject" required>
              <label>${h(tr(req, 'message'))}</label><textarea name="message" rows="3" required></textarea>
              <p><button class="btn g">${h(tr(req, 'send'))}</button></p>
            </form>
            <div style="margin-top:14px">
              ${sr.map(r => `
                <div style="border-top:1px solid #f1f5f9;padding:10px 0">
                  <div style="display:flex;justify-content:space-between">
                    <b>${h(r.subject)}</b>
                    <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span>
                  </div>
                  <div style="font-size:13px;color:#475569;margin-top:4px">${h(r.message)}</div>
                  ${r.reply ? `<div style="margin-top:6px;font-size:13px;color:var(--primary);font-weight:600">↪ ${h(r.reply)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card np">
            <h3>🔑 ${h(tr(req, 'pass'))}</h3>
            <form method="POST" action="/student/password">
              <input name="old" type="password" placeholder="Current Password" required>
              <input name="nw" type="password" placeholder="New Password (6+)" minlength="6" required style="margin-top:8px">
              <p><button class="btn k" style="margin-top:8px">OK</button></p>
            </form>
          </div>
        </div>
      </div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>new QRCode(document.getElementById('qr'),{text:${JSON.stringify(base)},width:75,height:75});</script>
  `);
  res.send(page(req, tr(req, 'dash'), html, true));
});

// Member Exclusive Portal Routes (Content Types)
TYPES.forEach(tp => {
  app.get('/portal/' + SLUG[tp], needMember, async (req, res) => {
    const rows = await q(`SELECT * FROM posts WHERE type=$1 ORDER BY id DESC LIMIT 60`, [tp]);
    const body = wrap(`
      <div style="margin-top:16px;">
        <h2 style="margin:0 0 4px;font-size:1.6rem">${h(tr(req, tp))}</h2>
        <p style="color:var(--text-muted);margin:0 0 16px">${h(tr(req, 'memberArea'))}</p>
        ${memberPortalNav(req, '/portal/' + SLUG[tp])}
        ${tp === 'gallery'
          ? `<div class="grid">${rows.map(p => `<div class="card" style="padding:10px"><img class="im" style="max-height:220px;margin:0" src="/photo/${p.image_id}" loading="lazy"><p style="font-weight:600;margin:6px 0 0">${h(postT(req, p, 'title'))}</p></div>`).join('')}</div>`
          : rows.map(p => postCard(req, p)).join('')
        }
        ${rows.length ? '' : `<div class="card">${h(tr(req, 'none'))}</div>`}
      </div>
    `);
    res.send(page(req, tr(req, tp), body, true));
  });
});

app.get('/portal/leadership', needMember, async (req, res) => {
  const ls = await q(`SELECT * FROM leaders ORDER BY (level='central') DESC, ord, id`);
  const grp = (t, list) => list.length ? `
    <h3 style="margin:20px 0 10px;color:var(--primary)">${h(t)}</h3>
    <div class="grid">${list.map(x => `
      <div class="card" style="text-align:center;padding:16px">
        <img style="width:110px;height:110px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);margin:auto" 
             src="${x.photo_id ? '/photo/' + x.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}" alt="">
        <h4 style="margin:10px 0 4px">${h(x.name)}</h4>
        <small style="color:var(--text-muted);font-weight:600">${h(L(req) === 'om' ? (x.position_om || x.position_en) : (L(req) === 'am' ? (x.position_am || x.position_en || x.position_om) : (x.position_en || x.position_om)))}</small>
      </div>
    `).join('')}</div>` : '';

  const body = wrap(`
    <div style="margin-top:16px;">
      <h2 style="margin:0 0 4px">${h(tr(req, 'leadership'))}</h2>
      <p style="color:var(--text-muted);margin:0 0 16px">${h(tr(req, 'memberArea'))}</p>
      ${memberPortalNav(req, '/portal/leadership')}
      ${grp('Central Leadership', ls.filter(x => x.level === 'central'))}
      ${Object.keys(CAMPUS).map(k => grp(campusName(req, k), ls.filter(x => x.level !== 'central' && x.campus === k))).join('')}
      ${ls.length ? '' : `<div class="card">${h(tr(req, 'none'))}</div>`}
    </div>
  `);
  res.send(page(req, tr(req, 'leadership'), body, true));
});

app.get('/portal/finance', needMember, async (req, res) => {
  const rs = await q(`SELECT * FROM finance_reports WHERE approved=1 ORDER BY period DESC, id DESC LIMIT 36`);
  const body = wrap(`
    <div style="margin-top:16px;">
      <h2 style="margin:0 0 4px">${h(tr(req, 'finance'))}</h2>
      <p style="color:var(--text-muted);margin:0 0 16px">${h(tr(req, 'memberArea'))}</p>
      ${memberPortalNav(req, '/portal/finance')}
      ${rs.map(r => {
        const d = JSON.parse(r.detail || '{}');
        return `
          <div class="card">
            <h3 style="margin-top:0">${h(r.period)} · ${h(r.campus === 'all' ? 'All Campuses' : campusName(req, r.campus))}</h3>
            <div class="grid">
              <div class="tile"><b>${Number(r.income).toLocaleString()}</b>Income (ETB)</div>
              <div class="tile"><b>${Number(r.expense).toLocaleString()}</b>Expense (ETB)</div>
              <div class="tile"><b>${(r.income - r.expense).toLocaleString()}</b>Balance (ETB)</div>
            </div>
            <p style="margin-top:14px;color:var(--text-muted);font-size:13.5px">
              ${Object.keys(d).map(k => `<b>${h(k)}</b>: ${Number(d[k]).toLocaleString()} ETB`).join(' · ')}
            </p>
          </div>
        `;
      }).join('') || `<div class="card">${h(tr(req, 'none'))}</div>`}
    </div>
  `);
  res.send(page(req, tr(req, 'finance'), body, true));
});

// Member actions
app.post('/student/upgrade', needMember, async (req, res) => {
  await q(`UPDATE members SET status='pending' WHERE member_no=$1 AND status='registered'`, [req.session.mid]);
  res.redirect('/student-dashboard');
});
app.post('/student/support', needMember, async (req, res) => {
  const [m] = await q(`SELECT name,campus FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.subject && req.body.message) {
    await q(`INSERT INTO support_requests (member_no,name,campus,subject,message) VALUES ($1,$2,$3,$4,$5)`,
      [req.session.mid, m.name, m.campus, String(req.body.subject).slice(0, 150), String(req.body.message).slice(0, 2000)]);
  }
  res.redirect('/student-dashboard');
});
app.post('/student/password', needMember, async (req, res) => {
  const [m] = await q(`SELECT password FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && bcrypt.compareSync(String(req.body.old || ''), m.password) && String(req.body.nw || '').length >= 6) {
    await q(`UPDATE members SET password=$1 WHERE member_no=$2`, [bcrypt.hashSync(String(req.body.nw), 10), req.session.mid]);
  }
  res.redirect('/student-dashboard');
});

// Verification URL
app.get('/verify/:no', async (req, res) => {
  const [m] = await q(`SELECT name,member_no,campus,department,year,status,photo_id FROM members WHERE UPPER(member_no)=UPPER($1)`, [req.params.no]);
  res.send(page(req, tr(req, 'verify'), wrap(m ? `
    <div class="card" style="max-width:440px;margin:30px auto;text-align:center">
      <h2 style="color:var(--primary);margin-top:0">${h(tr(req, 'valid'))}</h2>
      <div class="id" style="box-shadow:none;margin-top:14px">
        <div class="bd">
          <img src="${m.photo_id ? '/photo/' + m.photo_id : ''}" alt="">
          <div style="text-align:left">
            <b style="font-size:16px">${h(m.name)}</b><br>
            <span style="color:var(--accent);font-weight:700">${h(m.member_no)}</span><br>
            <small>${h(campusName(req, m.campus))} · ${h(m.department)} · Y${h(m.year)}</small><br>
            <span class="badge ${m.status}" style="margin-top:6px">${h(tr(req, m.status))}</span>
          </div>
        </div>
      </div>
    </div>
  ` : `
    <div class="card" style="max-width:440px;margin:30px auto;text-align:center">
      <h2 style="color:var(--accent)">${h(tr(req, 'invalid'))}</h2>
    </div>
  `)));
});

// Photo delivery
app.get('/photo/:id', async (req, res) => {
  const [f] = await q(`SELECT mime, data, name FROM files WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (!f) return res.status(404).end();
  res.set('Content-Type', f.mime).set('Cache-Control', 'public,max-age=604800');
  if (req.query.dl) res.set('Content-Disposition', `attachment; filename="${String(f.name || 'file').replace(/[^\w.\-]/g, '_')}"`);
  res.send(f.data);
});

// ---------- ADMIN LOGIN & MANAGEMENT ----------
app.get('/admin-login', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Portal</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;font-family:'Poppins',sans-serif;color:#fff}
    .b{width:min(400px,92vw);background:#1e293b;border-radius:20px;padding:30px;border-top:6px solid #d62828;box-shadow:0 12px 30px rgba(0,0,0,0.5)}
    input{width:100%;box-sizing:border-box;padding:12px;margin:8px 0 16px;border-radius:10px;border:1px solid #475569;background:#0f172a;color:#fff}
    button{width:100%;padding:13px;border:0;border-radius:10px;background:#0b7a43;color:#fff;font-weight:700;cursor:pointer}
    a{color:#38bdf8;text-decoration:none}
  </style></head>
  <body><div class="b">
    <h2>🔐 Staff & Admin</h2>
    <p style="color:#94a3b8;font-size:13px">Association Administration Only</p>
    ${req.query.e ? '<p style="color:#f87171">Invalid credentials</p>' : ''}
    <form method="POST" action="/admin-login">
      <label>Username</label><input name="u" required autocomplete="username">
      <label>Password</label><input name="p" type="password" required autocomplete="current-password">
      <button>Sign In</button>
    </form>
    <p style="text-align:center;margin-top:20px"><a href="/">← Return to Public Website</a></p>
  </div></body></html>`);
});

app.post('/admin-login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const u = String(req.body.u || '').trim(), pw = String(req.body.p || '');

  const isHardcodedAdmin = (u.toLowerCase() === 'admin' && pw === 'sikomando123');
  const isEnvAdmin = (process.env.ADMIN_USER && u === process.env.ADMIN_USER && pw === process.env.ADMIN_PASS);

  if (isHardcodedAdmin || isEnvAdmin) {
    req.session.mid = null;
    req.session.sr = 'central_admin';
    req.session.sname = 'Central Admin';
    req.session.campus = null;
    return res.redirect('/admin');
  }

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

// Admin Dashboard & Functions
const A = (req, title, body) => {
  const links = [
    ['/admin', 'Overview', null],
    ['/admin/members', 'Members', 'members'],
    ['/admin/content/announcement', 'Announcements', 'content'],
    ['/admin/content/news', 'News', 'content'],
    ['/admin/content/event', 'Events', 'content'],
    ['/admin/content/education', 'Education', 'content'],
    ['/admin/content/document', 'Documents', 'content'],
    ['/admin/content/project', 'Projects', 'content'],
    ['/admin/content/gallery', 'Gallery', 'content'],
    ['/admin/leaders', 'Leadership', 'leaders'],
    ['/admin/support', 'Support', 'support'],
    ['/admin/finance', 'Finance', 'finance'],
    ['/admin/staff', 'Staff', 'staff'],
    ['/admin/backup', 'Backup', 'staff']
  ].filter(x => !x[2] || can(req, x[2]));

  return page(req, title, wrap(`
    <div class="card" style="border-top-color:var(--accent)">
      <b>${h(req.session.sname || '')}</b> · <span class="badge official">${h(req.session.sr)}</span> ${req.session.campus ? '· ' + h(campusName(req, req.session.campus)) : '· All campuses'}
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        ${links.map(x => `<a class="btn k" style="padding:6px 14px;font-size:12.5px" href="${x[0]}">${x[1]}</a>`).join('')}
      </div>
    </div>
    ${body}
  `));
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
  const [s] = await q(`SELECT COUNT(*)::int n FROM support_requests WHERE status='open'${sc ? " AND campus IN ($1,'all')" : ''}`, pr);
  const byC = await q(`SELECT campus, COUNT(*)::int n FROM members${w} GROUP BY campus`, pr);
  res.send(A(req, 'Dashboard', `
    <div class="grid">
      <div class="tile"><b>${m.n}</b>Members</div>
      <div class="tile"><b>${m.o || 0}</b>Official</div>
      <div class="tile"><b>${m.p || 0}</b>Pending Approval</div>
      <div class="tile"><b>${s.n}</b>Open Support</div>
      ${byC.map(r => `<div class="tile"><b>${r.n}</b>${h(campusName(req, r.campus))}</div>`).join('')}
    </div>
  `));
});

// Admin Members Management
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
  const act = (id, a, t, cls) => `<form method="POST" action="/admin/members/${id}/${a}" style="display:inline"><button class="btn ${cls || ''}" style="padding:4px 10px;font-size:12px">${t}</button></form>`;

  res.send(A(req, 'Members', `
    <div class="card">
      <h3>Members Directory (${ms.length})</h3>
      <form style="display:flex;gap:6px;flex-wrap:wrap">
        <input name="q" value="${h(qs)}" placeholder="Search name / no / ID / phone" style="flex:1;min-width:180px">
        ${sc ? '' : sel('campus', [['', 'All campuses']].concat(campusOpts(null)), cf)}
        <button>Search</button>
        <a class="btn g" href="/admin/members.csv?campus=${cf}">⬇ CSV</a>
      </form>
      <div class="tw" style="margin-top:14px">
        <table>
          <tr><th>No</th><th>Name</th><th>Campus</th><th>Dept</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
          ${ms.map(m => `
            <tr>
              <td>${h(m.member_no)}</td>
              <td>${h(m.name)}</td>
              <td>${h(campusName(req, m.campus))}</td>
              <td>${h(m.department)} Y${h(m.year)}</td>
              <td>${h(m.phone)}</td>
              <td><span class="badge ${m.status}">${h(m.status)}</span></td>
              <td>
                ${m.status !== 'official' ? act(m.id, 'approve', 'Approve', 'g') : ''}
                ${m.status === 'pending' ? act(m.id, 'reject', 'Reject') : ''}
                ${m.status === 'official' ? act(m.id, 'revoke', 'Revoke', 'k') : ''}
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `));
});

app.get('/admin/members.csv', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : ''), ms = await q(`SELECT member_no,name,gender,phone,email,campus,department,year,student_id,status,created_at FROM members ${cf ? 'WHERE campus=$1' : ''} ORDER BY id`, cf ? [cf] : []);
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="members.csv"')
    .send('\ufeff' + 'No,Name,Gender,Phone,Email,Campus,Department,Year,StudentID,Status,Registered\n' + ms.map(m => [m.member_no, m.name, m.gender, m.phone, m.email, m.campus, m.department, m.year, m.student_id, m.status, m.created_at].map(esc).join(',')).join('\n'));
});

[['approve', 'official'], ['reject', 'rejected'], ['revoke', 'registered']].forEach(([a, st]) => {
  app.post('/admin/members/:id/' + a, async (req, res) => {
    const m = await guardMember(req, res, req.params.id);
    if (m) { await q(`UPDATE members SET status=$1 WHERE id=$2`, [st, m.id]); res.redirect('/admin/members'); }
  });
});

// Admin Content Management (Supports Amharic, Oromo, English)
app.get('/admin/content/:type', guard('content'), async (req, res) => {
  const tp = req.params.type; if (!TYPES.includes(tp)) return res.redirect('/admin');
  const sc = scopeOf(req), ps = await q(`SELECT * FROM posts WHERE type=$1 ${sc ? 'AND campus=$2' : ''} ORDER BY id DESC LIMIT 60`, sc ? [tp, sc] : [tp]);
  res.send(A(req, tp, `
    <div class="card">
      <h3>Add · ${h(tp)}</h3>
      <form method="POST" action="/admin/content/${tp}" enctype="multipart/form-data">
        <label>Campus</label>${sel('campus', campusOpts(sc, true))}
        <label>Title (Afaan Oromoo)</label><input name="title_om">
        <label>Title (Amharic - አማርኛ)</label><input name="title_am">
        <label>Title (English)</label><input name="title_en">
        ${tp === 'gallery' ? '' : `
          <label>Details (Afaan Oromoo)</label><textarea name="body_om" rows="2"></textarea>
          <label>Details (Amharic - አማርኛ)</label><textarea name="body_am" rows="2"></textarea>
          <label>Details (English)</label><textarea name="body_en" rows="2"></textarea>
        `}
        ${tp === 'event' ? '<label>Date</label><input name="event_date" type="date">' : ''}
        ${tp === 'project' ? '<label>Progress %</label><input name="progress" type="number" min="0" max="100" value="0">' : ''}
        <label>Image ${tp === 'gallery' ? '(required)' : '(optional)'}</label><input name="image" type="file" accept="image/*">
        ${['document', 'education', 'news', 'announcement'].includes(tp) ? '<label>File (PDF / Word, max 6 MB)</label><input name="file" type="file">' : ''}
        <p style="margin-top:16px"><button>Publish</button></p>
      </form>
    </div>
    <div class="card">
      ${ps.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9;padding:8px 0">
          <span>${h(p.campus)} · ${h(p.title_om || p.title_am || p.title_en)}</span>
          <form method="POST" action="/admin/content/${tp}/${p.id}/delete">
            <button class="btn" style="padding:4px 10px;font-size:12px">Delete</button>
          </form>
        </div>
      `).join('') || h(tr(req, 'none'))}
    </div>
  `));
});

app.post('/admin/content/:type', guard('content'), files6([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const tp = req.params.type, b = req.body, sc = scopeOf(req), s = (k, n) => String(b[k] || '').trim().slice(0, n);
  if (!TYPES.includes(tp)) return res.redirect('/admin');
  const img = await saveFile(((req.files || {}).image || [])[0]), fl = await saveFile(((req.files || {}).file || [])[0]);
  if ((s('title_om', 200) || s('title_en', 200) || s('title_am', 200)) && (tp !== 'gallery' || img)) {
    await q(`INSERT INTO posts (type,campus,title_om,title_en,title_am,body_om,body_en,body_am,event_date,image_id,file_id,progress) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tp, sc || (CAMPUS[b.campus] ? b.campus : 'all'), s('title_om', 200), s('title_en', 200), s('title_am', 200), s('body_om', 4000), s('body_en', 4000), s('body_am', 4000), s('event_date', 40), img, fl, Math.max(0, Math.min(100, parseInt(b.progress, 10) || 0))]);
  }
  res.redirect('/admin/content/' + tp);
});

app.post('/admin/content/:type/:id/delete', guard('content'), async (req, res) => {
  const sc = scopeOf(req), id = parseInt(req.params.id, 10) || 0;
  await q(`DELETE FROM posts WHERE id=$1 ${sc ? 'AND campus=$2' : ''}`, sc ? [id, sc] : [id]);
  res.redirect('/admin/content/' + req.params.type);
});

// Admin Leadership
app.get('/admin/leaders', guard('leaders'), async (req, res) => {
  const sc = scopeOf(req), ls = await q(`SELECT * FROM leaders ${sc ? 'WHERE campus=$1' : ''} ORDER BY (level='central') DESC, ord, id`, sc ? [sc] : []);
  res.send(A(req, 'Leadership', `
    <div class="card">
      <h3>Add Leader</h3>
      <form method="POST" action="/admin/leaders" enctype="multipart/form-data">
        <label>Name</label><input name="name" required>
        <label>Position (Afaan Oromoo)</label><input name="position_om">
        <label>Position (Amharic - አማርኛ)</label><input name="position_am">
        <label>Position (English)</label><input name="position_en">
        <label>Level</label>${sel('level', sc ? [['campus', 'Campus']] : [['central', 'Central'], ['campus', 'Campus']])}
        <label>Campus (if campus level)</label>${sel('campus', campusOpts(sc, false))}
        <label>Order</label><input name="ord" type="number" value="1">
        <label>Photo</label><input name="photo" type="file" accept="image/*">
        <p style="margin-top:16px"><button>Add Leader</button></p>
      </form>
    </div>
    <div class="card">
      ${ls.map(x => `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9;padding:8px 0">
          <span>${h(x.name)} · ${h(x.position_en || x.position_om || x.position_am)} · ${h(x.level)} ${h(x.campus)}</span>
          <form method="POST" action="/admin/leaders/${x.id}/delete">
            <button class="btn" style="padding:4px 10px;font-size:12px">Delete</button>
          </form>
        </div>
      `).join('') || h(tr(req, 'none'))}
    </div>
  `));
});

app.post('/admin/leaders', guard('leaders'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const b = req.body, sc = scopeOf(req), pid = await saveFile(((req.files || {}).photo || [])[0]), lvl = sc ? 'campus' : (b.level === 'campus' ? 'campus' : 'central');
  if (b.name) {
    await q(`INSERT INTO leaders (name,position_om,position_en,position_am,level,campus,photo_id,ord) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [String(b.name).slice(0, 80), String(b.position_om || '').slice(0, 100), String(b.position_en || '').slice(0, 100), String(b.position_am || '').slice(0, 100), lvl, lvl === 'central' ? 'all' : (sc || (CAMPUS[b.campus] ? b.campus : 'robe')), pid, parseInt(b.ord, 10) || 0]);
  }
  res.redirect('/admin/leaders');
});

app.post('/admin/leaders/:id/delete', guard('leaders'), async (req, res) => {
  const sc = scopeOf(req), id = parseInt(req.params.id, 10) || 0;
  await q(`DELETE FROM leaders WHERE id=$1 ${sc ? 'AND campus=$2' : ''}`, sc ? [id, sc] : [id]);
  res.redirect('/admin/leaders');
});

// Admin Support Requests
app.get('/admin/support', guard('support'), async (req, res) => {
  const sc = scopeOf(req), rs = await q(`SELECT * FROM support_requests ${sc ? "WHERE campus IN ($1,'all')" : ''} ORDER BY (status='open') DESC, id DESC LIMIT 100`, sc ? [sc] : []);
  res.send(A(req, 'Student Support', rs.map(r => `
    <div class="card">
      <small style="color:var(--text-muted)">${h(r.member_no)} · ${h(r.name)} · ${h(r.campus)} · ${h(String(r.created_at).slice(0, 16))}</small>
      <h3 style="margin:6px 0">${h(r.subject)} <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span></h3>
      <p>${h(r.message)}</p>
      <form method="POST" action="/admin/support/${r.id}/reply">
        <textarea name="reply" rows="2" placeholder="Write reply...">${h(r.reply || '')}</textarea>
        <p><button class="btn g" style="margin-top:6px">Reply & Close</button></p>
      </form>
    </div>
  `).join('') || `<div class="card">${h(tr(req, 'none'))}</div>`));
});

app.post('/admin/support/:id/reply', guard('support'), async (req, res) => {
  const sc = scopeOf(req), id = parseInt(req.params.id, 10) || 0;
  await q(`UPDATE support_requests SET reply=$1, status='closed' WHERE id=$2 ${sc ? "AND campus IN ($3,'all')" : ''}`, sc ? [String(req.body.reply || '').slice(0, 2000), id, sc] : [String(req.body.reply || '').slice(0, 2000), id]);
  res.redirect('/admin/support');
});

// Admin Finance
const KINDS = [['contribution', 'Membership contribution'], ['donation', 'Donation'], ['fundraising', 'Fundraising'], ['income', 'Other income'], ['expense', 'Expense']];
app.get('/admin/finance', guard('finance'), async (req, res) => {
  const sc = scopeOf(req), w = sc ? 'WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const tx = await q(`SELECT * FROM transactions ${w} ORDER BY id DESC LIMIT 80`, pr);
  const [tot] = await q(`SELECT COALESCE(SUM(CASE WHEN kind='expense' THEN 0 ELSE amount END),0) i, COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) e FROM transactions ${w}`, pr);
  const rp = await q(`SELECT * FROM finance_reports ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 24`, pr);

  res.send(A(req, 'Finance', `
    <div class="grid">
      <div class="tile"><b>${Number(tot.i).toLocaleString()}</b>Income (ETB)</div>
      <div class="tile"><b>${Number(tot.e).toLocaleString()}</b>Expense (ETB)</div>
      <div class="tile"><b>${(tot.i - tot.e).toLocaleString()}</b>Balance (ETB)</div>
    </div>
    <div class="card">
      <h3>Record Transaction</h3>
      <form method="POST" action="/admin/finance/tx">
        <label>Type</label>${sel('kind', KINDS)}
        <label>Amount (ETB)</label><input name="amount" type="number" step="0.01" min="0" required>
        <label>Date</label><input name="tdate" type="date" required>
        <label>Campus</label>${sel('campus', campusOpts(sc, true))}
        <label>Note</label><input name="note">
        <p><button>Save Transaction</button></p>
      </form>
    </div>
    <div class="card">
      <h3>Generate Monthly / Annual Report</h3>
      <form method="POST" action="/admin/finance/report" style="display:flex;gap:8px;flex-wrap:wrap">
        <input name="period" placeholder="2026-11 or 2026" required style="max-width:160px">
        ${sel('campus', campusOpts(sc, true))}
        <button>Create Report</button>
      </form>
      <div class="tw" style="margin-top:14px">
        <table>
          <tr><th>Period</th><th>Campus</th><th>Income</th><th>Expense</th><th>Status</th><th>Actions</th></tr>
          ${rp.map(r => `
            <tr>
              <td>${h(r.period)}</td>
              <td>${h(r.campus)}</td>
              <td>${Number(r.income).toLocaleString()}</td>
              <td>${Number(r.expense).toLocaleString()}</td>
              <td>${r.approved ? '✔ Published' : 'Draft'}</td>
              <td>
                ${can(req, 'approve') ? `<form method="POST" action="/admin/finance/report/${r.id}/${r.approved ? 'hide' : 'approve'}" style="display:inline"><button class="btn ${r.approved ? 'k' : 'g'}" style="padding:4px 10px;font-size:12px">${r.approved ? 'Hide' : 'Approve & Publish'}</button></form>` : ''}
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `));
});

app.post('/admin/finance/tx', guard('finance'), async (req, res) => {
  const b = req.body, sc = scopeOf(req), amt = num(b.amount);
  if (KINDS.some(k => k[0] === b.kind) && amt > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.tdate || '')) {
    await q(`INSERT INTO transactions (kind,amount,tdate,note,campus,created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [b.kind, amt, b.tdate, String(b.note || '').slice(0, 200), sc || (CAMPUS[b.campus] ? b.campus : 'all'), req.session.sname || '']);
  }
  res.redirect('/admin/finance');
});

app.post('/admin/finance/report', guard('finance'), async (req, res) => {
  const per = String(req.body.period || '').trim(), sc = scopeOf(req), cmp = sc || (CAMPUS[req.body.campus] ? req.body.campus : 'all');
  if (/^\d{4}(-\d{2})?$/.test(per)) {
    const rows = await q(`SELECT kind, SUM(amount) a FROM transactions WHERE tdate LIKE $1 ${cmp === 'all' ? '' : 'AND campus=$2'} GROUP BY kind`, cmp === 'all' ? [per + '%'] : [per + '%', cmp]);
    let inc = 0, exp = 0; const d = {};
    rows.forEach(r => { d[r.kind] = Number(r.a); if (r.kind === 'expense') exp += Number(r.a); else inc += Number(r.a); });
    await q(`INSERT INTO finance_reports (period,campus,income,expense,detail) VALUES ($1,$2,$3,$4,$5)`, [per, cmp, inc, exp, JSON.stringify(d)]);
  }
  res.redirect('/admin/finance');
});

app.post('/admin/finance/report/:id/:a', guard('approve'), async (req, res) => {
  await q(`UPDATE finance_reports SET approved=$1 WHERE id=$2`, [req.params.a === 'approve' ? 1 : 0, parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/finance');
});

// Admin Staff & Backup
app.get('/admin/staff', guard('staff'), async (req, res) => {
  const st = await q(`SELECT id,username,name,role,campus,active FROM staff ORDER BY id`);
  res.send(A(req, 'Staff Accounts', `
    <div class="card">
      <h3>Create Staff Account</h3>
      <form method="POST" action="/admin/staff">
        <label>Name</label><input name="name" required>
        <label>Username</label><input name="username" required>
        <label>Role</label>${sel('role', ROLES.map(r => [r, r]))}
        <label>Campus</label>${sel('campus', campusOpts(null))}
        <label>Password (8+)</label><input name="password" type="password" minlength="8" required>
        <p><button>Create Account</button></p>
      </form>
    </div>
    <div class="card">
      <div class="tw">
        <table>
          <tr><th>Name</th><th>Username</th><th>Role</th><th>Campus</th><th>Status</th></tr>
          ${st.map(x => `
            <tr>
              <td>${h(x.name)}</td>
              <td>${h(x.username)}</td>
              <td>${h(x.role)}</td>
              <td>${h(x.campus || 'All')}</td>
              <td>
                <form method="POST" action="/admin/staff/${x.id}/toggle">
                  <button class="btn ${x.active ? 'k' : 'g'}" style="padding:4px 10px;font-size:12px">${x.active ? 'Disable' : 'Enable'}</button>
                </form>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `));
});

app.post('/admin/staff', guard('staff'), async (req, res) => {
  const b = req.body;
  if (ROLES.includes(b.role) && b.name && b.username && String(b.password || '').length >= 8) {
    try {
      await q(`INSERT INTO staff (username,name,role,campus,password) VALUES ($1,$2,$3,$4,$5)`,
        [String(b.username).trim().slice(0, 40), String(b.name).slice(0, 80), b.role, CAMPUS[b.campus] ? b.campus : null, bcrypt.hashSync(String(b.password), 10)]);
    } catch (e) {}
  }
  res.redirect('/admin/staff');
});

app.post('/admin/staff/:id/toggle', guard('staff'), async (req, res) => {
  await q(`UPDATE staff SET active=1-active WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/staff');
});

app.get('/admin/backup', guard('staff'), async (req, res) => {
  if (!req.query.go) {
    return res.send(A(req, 'Backup', `
      <div class="card">
        <h3>Database Backup</h3>
        <p>Export all tables and metadata as a downloadable JSON file.</p>
        <a class="btn g" href="/admin/backup?go=1">⬇ Download Backup</a>
      </div>
    `));
  }
  const out = { exported: new Date().toISOString() };
  for (const t of ['members', 'posts', 'leaders', 'support_requests', 'transactions', 'finance_reports', 'staff']) {
    out[t] = await q(`SELECT * FROM ${t}`);
  }
  res.set('Content-Type', 'application/json')
    .set('Content-Disposition', `attachment; filename="sikkoo-mandoo-backup-${new Date().toISOString().slice(0, 10)}.json"`)
    .send(JSON.stringify(out));
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Sikkoo-Mandoo portal running with multi-language & member portal support');
});
