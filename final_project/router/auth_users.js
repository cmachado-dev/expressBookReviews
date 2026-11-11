const express = require('express');
const jwt = require('jsonwebtoken');
const books = require('./booksdb');
const { jwtSecret } = require('../config');
const { users, isValid, authenticatedUser } = require('./users');
const regd_users = express.Router();

regd_users.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Informe usuario e senha.' });
    }
    if (!await authenticatedUser(username, password)) {
      return res.status(401).json({ message: 'Usuario ou senha incorretos.' });
    }
    // Regenera a sessao antes de vincular a identidade autenticada.
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.authorization = {
        accessToken: jwt.sign({ username }, jwtSecret, { algorithm: 'HS256', expiresIn: '1h' })
      };
      req.session.save(saveError => {
        if (saveError) return next(saveError);
        return res.json({ message: 'Login realizado com sucesso.', username });
      });
    });
  } catch (err) {
    next(err);
  }
});

regd_users.put('/auth/review/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) {
    return res.status(404).json({ message: 'Livro nao encontrado.' });
  }
  const review = req.body?.review ?? req.query.review;
  if (typeof review !== 'string' || !review.trim() || review.length > 5000) {
    return res.status(400).json({ message: 'Informe uma avaliacao de 1 a 5000 caracteres.' });
  }
  const book = books[req.params.isbn];
  const { username } = req.user;
  const existed = Object.hasOwn(book.reviews, username);
  Object.defineProperty(book.reviews, username, {
    value: review.trim(), enumerable: true, writable: true, configurable: true
  });
  return res.json({
    message: existed ? 'Avaliacao atualizada com sucesso.' : 'Avaliacao adicionada com sucesso.',
    isbn: req.params.isbn,
    reviews: book.reviews
  });
});

regd_users.delete('/auth/review/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) {
    return res.status(404).json({ message: 'Livro nao encontrado.' });
  }
  const book = books[req.params.isbn];
  const { username } = req.user;
  if (!Object.hasOwn(book.reviews, username)) {
    return res.status(404).json({ message: 'Voce nao tem avaliacao neste livro.' });
  }
  delete book.reviews[username];
  return res.json({
    message: 'Avaliacao excluida com sucesso.',
    isbn: req.params.isbn,
    reviews: book.reviews
  });
});

module.exports = { authenticated: regd_users, users, isValid, authenticatedUser };
