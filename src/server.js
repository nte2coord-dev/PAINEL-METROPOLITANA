const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { migrate } = require('./db');
const { seed } = require('./bootstrap');
const { loadUser, refreshConfig } = require('./util');

const app = express();
app.set('trust proxy', 1); // atrás do proxy do Render
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/healthz', (_req, res) => res.send('ok'));

// Mitigação de CSRF: escritas só com JSON (exige preflight em requisições cross-site) + cookie SameSite=Lax
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ erro: 'Content-Type deve ser application/json.' });
  }
  next();
});
app.use('/api', loadUser);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', require('./routes/data'));
app.use('/api', require('./routes/admin'));

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m' }));
app.get('*', (req, res, next) =>
  req.path.startsWith('/api') ? next() : res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === '23514' ? 400 : 500);
  if (status >= 500) console.error(err);
  const msg = status >= 500 ? 'Erro interno. Tente novamente.' : err.code === '23514' ? 'Dados violam uma regra (verifique as datas).' : err.message;
  res.status(status).json({ erro: msg });
});

const port = process.env.PORT || 3000;
(async () => {
  await migrate();
  await seed();
  await refreshConfig();
  if (process.env.SEED_DEMO === 'true') await require('./demo').run();
  app.listen(port, () => console.log(`Painel SRE Metropolitana A em http://localhost:${port}`));
})().catch(e => { console.error('Falha ao iniciar:', e); process.exit(1); });

module.exports = app;
