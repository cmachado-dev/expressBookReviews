const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(scryptCallback);
const users = new Map();

function validCredentials(username, password) {
  return typeof username === 'string' &&
    /^[a-zA-Z0-9_.-]{1,64}$/.test(username) &&
    typeof password === 'string' && password.length > 0 && password.length <= 128;
}

const isValid = username => users.has(username);

async function registerUser(username, password) {
  if (!validCredentials(username, password)) {
    return { status: 400, message: 'Informe usuario (1 a 64 letras, numeros, _, . ou -) e senha (1 a 128 caracteres).' };
  }
  if (isValid(username)) return { status: 409, message: 'Usuario ja cadastrado.' };
  const salt = randomBytes(16).toString('hex');
  const passwordHash = await scrypt(password, salt, 64);
  // A segunda verificacao impede cadastros duplicados em requisicoes concorrentes.
  if (isValid(username)) return { status: 409, message: 'Usuario ja cadastrado.' };
  users.set(username, { salt, passwordHash });
  return { status: 201, message: 'Usuario cadastrado com sucesso.' };
}

async function authenticatedUser(username, password) {
  if (!validCredentials(username, password)) return false;
  const user = users.get(username);
  if (!user) return false;
  const candidateHash = await scrypt(password, user.salt, 64);
  return timingSafeEqual(candidateHash, user.passwordHash);
}

module.exports = { users, isValid, registerUser, authenticatedUser };
