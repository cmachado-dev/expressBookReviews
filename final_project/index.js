const express = require('express');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const { jwtSecret, sessionSecret } = require('./config');
const { authenticated } = require('./router/auth_users');
const { general } = require('./router/general');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('json spaces', 2);
  app.use(express.json({ limit: '16kb' }));
  app.use('/customer', session({
    name: 'bookshop.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 1000,
      path: '/customer'
    }
  }));

  app.use('/customer/auth', (req, res, next) => {
    const token = req.session.authorization?.accessToken;
    if (!token) return res.status(401).json({ message: 'Faca login para gerenciar avaliacoes.' });
    try {
      req.user = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      return next();
    } catch {
      return res.status(401).json({ message: 'Sessao invalida ou expirada. Faca login novamente.' });
    }
  });
  app.use('/customer', authenticated);
  app.use('/', general);
  app.use((req, res) => res.status(404).json({ message: 'Rota nao encontrada.' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON invalido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Corpo da requisicao muito grande.' });
    console.error(err.message);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  });
  return app;
}

if (require.main === module) {
  const app = createApp();
  const server = app.listen(Number(process.env.PORT ?? 5000), '127.0.0.1', () => {
    console.log('Livraria em http://127.0.0.1:' + server.address().port);
  });
  server.on('error', err => {
    console.error('Nao foi possivel iniciar a livraria: ' + err.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
