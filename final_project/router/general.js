const express = require('express');
const axios = require('axios');
const books = require('./booksdb');
const { registerUser } = require('./users');
const public_users = express.Router();

// Rotas publicas: o catalogo fornecido pela IBM permanece a fonte de dados.
public_users.post('/register', async (req, res, next) => {
  try {
    const result = await registerUser(req.body?.username, req.body?.password);
    return res.status(result.status).json({ message: result.message });
  } catch (err) {
    next(err);
  }
});

public_users.get('/', (req, res) => res.json(books));

public_users.get('/isbn/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) {
    return res.status(404).json({ message: 'Livro nao encontrado.' });
  }
  return res.json(books[req.params.isbn]);
});

function searchBooks(field, value) {
  const search = value.trim().toLocaleLowerCase('en');
  return Object.fromEntries(Object.entries(books).filter(([, book]) =>
    book[field].toLocaleLowerCase('en').includes(search)
  ));
}

public_users.get('/author/:author', (req, res) => {
  const result = searchBooks('author', req.params.author);
  if (!Object.keys(result).length) return res.status(404).json({ message: 'Autor nao encontrado.' });
  return res.json(result);
});

public_users.get('/title/:title', (req, res) => {
  const result = searchBooks('title', req.params.title);
  if (!Object.keys(result).length) return res.status(404).json({ message: 'Titulo nao encontrado.' });
  return res.json(result);
});

public_users.get('/review/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) {
    return res.status(404).json({ message: 'Livro nao encontrado.' });
  }
  return res.json(books[req.params.isbn].reviews);
});

// Tarefas de Axios: estas funcoes chamam a API por HTTP de verdade.
// O servidor deve estar iniciado antes de executar "npm run client".
const DEFAULT_BASE_URL = process.env.BOOKSHOP_API_URL || 'http://127.0.0.1:5000';
const client = baseURL => axios.create({ baseURL, timeout: 10000, proxy: false });

// Tarefa 10 do laboratorio: async/await com callback no formato (erro, dados).
async function getAllBooks(callback, baseURL = DEFAULT_BASE_URL) {
  let data;
  try {
    const response = await client(baseURL).get('/');
    data = response.data;
  } catch (error) {
    if (callback) return callback(error);
    throw error;
  }
  if (callback) callback(null, data);
  return data;
}

// Tarefa 11 do laboratorio: Promise e .then() para consultar por ISBN.
function getBooksByISBN(isbn, baseURL = DEFAULT_BASE_URL) {
  return client(baseURL).get('/isbn/' + encodeURIComponent(isbn))
    .then(response => response.data);
}

// Tarefa 12 do laboratorio: busca por autor usando async/await com Axios.
async function getBooksByAuthor(author, baseURL = DEFAULT_BASE_URL) {
  const response = await client(baseURL).get('/author/' + encodeURIComponent(author));
  return response.data;
}

// Tarefa 13 do laboratorio: busca por titulo usando async/await com Axios.
async function getBooksByTitle(title, baseURL = DEFAULT_BASE_URL) {
  const response = await client(baseURL).get('/title/' + encodeURIComponent(title));
  return response.data;
}

if (require.main === module) {
  (async () => {
    const results = await Promise.all([
      getAllBooks((error, data) => {
        if (!error) console.log('Callback: ' + Object.keys(data).length + ' livros recuperados.');
      }),
      getBooksByISBN('1'),
      getBooksByAuthor('Chinua Achebe'),
      getBooksByTitle('Things Fall Apart')
    ]);
    for (const [index, name] of ['Todos os livros', 'ISBN 1', 'Autor', 'Titulo'].entries()) {
      console.log(name + ':\n' + JSON.stringify(results[index], null, 2));
    }
  })().catch(error => {
    console.error('Falha na consulta Axios: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  general: public_users,
  getAllBooks,
  getBooksByISBN,
  getBooksByAuthor,
  getBooksByTitle
};
