const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../index');
const books = require('../router/booksdb');
const { users } = require('../router/users');
const { getAllBooks, getBooksByISBN, getBooksByAuthor, getBooksByTitle } = require('../router/general');

let server;
let baseURL;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseURL = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
});
beforeEach(() => {
  users.clear();
  for (const book of Object.values(books)) {
    for (const username of Object.keys(book.reviews)) delete book.reviews[username];
  }
});

async function request(path, { method = 'GET', body, cookie, raw } = {}) {
  const headers = {};
  if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(baseURL + path, {
    method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function account(username) {
  const body = { username, password: 'senha-de-teste' };
  assert.equal((await request('/register', { method: 'POST', body })).status, 201);
  const login = await request('/customer/login', { method: 'POST', body });
  assert.equal(login.status, 200);
  return login.headers.get('set-cookie').split(';')[0];
}

test('catalogo oficial: retorna os 10 livros, incluindo titulos acentuados', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.equal(Object.keys(response.body).length, 10);
  assert.equal(response.body['1'].title, 'Things Fall Apart');
  assert.equal(response.body['7'].title, "Njál's Saga");
  assert.equal(response.body['9'].author, 'Honoré de Balzac');
});

test('ISBN: retorna um livro e responde 404 para ISBN inexistente', async () => {
  const response = await request('/isbn/1');
  assert.equal(response.status, 200);
  assert.equal(response.body.author, 'Chinua Achebe');
  assert.equal((await request('/isbn/999')).status, 404);
  assert.equal((await request('/isbn/__proto__')).status, 404);
});

test('autor: pesquisa parcial, sem distinguir maiusculas, e multiplos livros', async () => {
  const unknown = await request('/author/unknown');
  assert.equal(unknown.status, 200);
  assert.deepEqual(Object.keys(unknown.body), ['4', '5', '6', '7']);
  assert.equal((await request('/author/Chinua%20Achebe')).body['1'].title, 'Things Fall Apart');
  assert.equal((await request('/author/nao-existe')).status, 404);
});

test('titulo: aceita espacos, acentos e pesquisa parcial', async () => {
  const response = await request('/title/Things%20Fall%20Apart');
  assert.equal(response.status, 200);
  assert.equal(response.body['1'].author, 'Chinua Achebe');
  assert.ok((await request('/title/' + encodeURIComponent('Père'))).body['9']);
  assert.equal((await request('/title/nao-existe')).status, 404);
});

test('avaliacoes iniciais: retorna objeto vazio e valida o ISBN', async () => {
  assert.deepEqual((await request('/review/1')).body, {});
  assert.equal((await request('/review/999')).status, 404);
});

test('cadastro: valida credenciais e armazena apenas hash e salt da senha', async () => {
  assert.equal((await request('/register', { method: 'POST', body: {} })).status, 400);
  assert.equal((await request('/register', {
    method: 'POST', body: { username: 'ana', password: '123' }
  })).status, 201);
  assert.equal(users.get('ana').password, undefined);
  assert.ok(Buffer.isBuffer(users.get('ana').passwordHash));
  assert.equal((await request('/register', {
    method: 'POST', body: { username: 'ana', password: '456' }
  })).status, 409);
});

test('cadastros simultaneos do mesmo nome geram um unico usuario', async () => {
  const responses = await Promise.all([1, 2].map(() => request('/register', {
    method: 'POST', body: { username: 'simultaneo', password: '123' }
  })));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(users.size, 1);
});

test('login: rejeita senha incorreta e retorna cookie HttpOnly para usuario valido', async () => {
  await request('/register', { method: 'POST', body: { username: 'ana', password: '123' } });
  assert.equal((await request('/customer/login', {
    method: 'POST', body: { username: 'ana', password: 'errada' }
  })).status, 401);
  assert.equal((await request('/customer/login', { method: 'POST', body: {} })).status, 400);
  const response = await request('/customer/login', {
    method: 'POST', body: { username: 'ana', password: '123' }
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  assert.equal(response.body.username, 'ana');
  assert.equal(response.body.password, undefined);
  assert.equal(response.body.accessToken, undefined);
});

test('rotas de avaliacao exigem login', async () => {
  assert.equal((await request('/customer/auth/review/1', {
    method: 'PUT', body: { review: 'Texto' }
  })).status, 401);
  assert.equal((await request('/customer/auth/review/1', { method: 'DELETE' })).status, 401);
  const cookie = await account('ana');
  assert.equal((await request('/customer/auth/review/999', {
    method: 'PUT', cookie, body: { review: 'Texto' }
  })).status, 404);
  assert.equal((await request('/customer/auth/review/999', { method: 'DELETE', cookie })).status, 404);
});

test('adiciona, atualiza e exclui apenas a avaliacao do usuario autenticado', async () => {
  const ana = await account('ana');
  const bruno = await account('bruno');
  const path = '/customer/auth/review/1';
  assert.equal((await request(path, {
    method: 'PUT', cookie: ana, body: { review: ' ' }
  })).status, 400);
  const add = await request(path, { method: 'PUT', cookie: ana, body: { review: 'Primeira resenha' } });
  assert.equal(add.body.reviews.ana, 'Primeira resenha');
  const update = await request(path, { method: 'PUT', cookie: ana, body: { review: 'Resenha atualizada' } });
  assert.match(update.body.message, /atualizada/);
  assert.equal(update.body.reviews.ana, 'Resenha atualizada');
  assert.equal((await request(path + '?username=ana', { method: 'DELETE', cookie: bruno })).status, 404);
  await request(path, { method: 'PUT', cookie: bruno, body: { review: 'Resenha do Bruno', username: 'ana' } });
  await request(path, { method: 'DELETE', cookie: ana });
  const remaining = (await request('/review/1')).body;
  assert.deepEqual(remaining, { bruno: 'Resenha do Bruno' });
  assert.equal((await request(path, { method: 'DELETE', cookie: ana })).status, 404);
});

test('avaliacoes simultaneas de usuarios distintos sao preservadas', async () => {
  const cookies = await Promise.all(['ana', 'bruno', 'carla'].map(account));
  const responses = await Promise.all(cookies.map((cookie, i) => request('/customer/auth/review/1', {
    method: 'PUT', cookie, body: { review: 'Opiniao ' + i }
  })));
  assert.ok(responses.every(r => r.status === 200));
  assert.deepEqual((await request('/review/1')).body, {
    ana: 'Opiniao 0', bruno: 'Opiniao 1', carla: 'Opiniao 2'
  });
});

test('nomes de usuario especiais continuam vinculados ao proprio autor', async () => {
  const cookie = await account('__proto__');
  await request('/customer/auth/review/1', { method: 'PUT', cookie, body: { review: 'Minha resenha' } });
  assert.equal((await request('/review/1')).body['__proto__'], 'Minha resenha');
  assert.equal((await request('/customer/auth/review/1', { method: 'DELETE', cookie })).status, 200);
  assert.deepEqual((await request('/review/1')).body, {});
});

test('as quatro funcoes Axios fazem consultas HTTP reais e propagam erros', async () => {
  let callbackCount = 0;
  const results = await Promise.all([
    getAllBooks((err, data) => {
      assert.ifError(err);
      callbackCount++;
      assert.equal(Object.keys(data).length, 10);
    }, baseURL),
    getBooksByISBN('1', baseURL),
    getBooksByAuthor('Unknown', baseURL),
    getBooksByTitle('Things Fall Apart', baseURL)
  ]);
  assert.equal(callbackCount, 1);
  assert.equal(results[1].author, 'Chinua Achebe');
  assert.equal(Object.keys(results[2]).length, 4);
  assert.equal(results[3]['1'].title, 'Things Fall Apart');
  await assert.rejects(getBooksByISBN('999', baseURL), err => err.response.status === 404);
  await assert.rejects(getBooksByAuthor('inexistente', baseURL), err => err.response.status === 404);
  await assert.rejects(getBooksByTitle('inexistente', baseURL), err => err.response.status === 404);
  await assert.rejects(getAllBooks(undefined, baseURL + '/rota-inexistente'), err => err.response.status === 404);
  await new Promise((resolve, reject) => getAllBooks((err, data) => {
    try {
      assert.equal(err.response.status, 404);
      assert.equal(data, undefined);
      resolve();
    } catch (error) { reject(error); }
  }, baseURL + '/rota-inexistente'));
});

test('JSON malformado e rotas inexistentes retornam erro sem parar o servidor', async () => {
  assert.equal((await request('/register', { method: 'POST', raw: '{' })).status, 400);
  assert.equal((await request('/nao-existe')).status, 404);
  assert.equal((await request('/')).status, 200);
});
