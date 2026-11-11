const { spawn, spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const project = path.resolve(__dirname, '..');
const output = path.resolve(project, '..', 'evidencias');
const cookieFile = '.evidence-session.cookies';
const repository = process.env.GITHUB_REPOSITORY || 'cmachado-dev/expressBookReviews';
if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
  throw new Error('GITHUB_REPOSITORY deve ter o formato usuario/repositorio.');
}
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
mkdirSync(output, { recursive: true });

function runCurl(args) {
  const allArgs = ['-sS', '--max-time', '20', ...args, '--write-out', '\nHTTP %{http_code}\n'];
  const result = spawnSync(curl, allArgs, { cwd: project, encoding: 'utf8', timeout: 25000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Falha ao executar cURL.');
  const match = result.stdout.match(/\nHTTP (\d{3})\n$/);
  if (!match) throw new Error('Resposta cURL sem status HTTP.');
  const status = Number(match[1]);
  const body = JSON.parse(result.stdout.slice(0, match.index));
  const quote = value => !value.startsWith('@') && /^[a-zA-Z0-9_./:@%+-]+$/.test(value)
    ? value : '"' + value.replaceAll('"', '\\"').replaceAll('\n', '\\n') + '"';
  const command = [curl, ...allArgs].map(quote).join(' ');
  // A sintaxe de --write-out usa "\n" interpretado pelo proprio cURL.
  return { command, stdout: result.stdout, body, status };
}

function save(name, result, expectedStatus = 200) {
  assert.equal(result.status, expectedStatus, name + ': status HTTP inesperado');
  const text = 'Comando (execute na pasta final_project):\n' + result.command +
    '\n\nSaida real:\n' + result.stdout;
  writeFileSync(path.join(output, name), text, 'utf8');
  console.log('Gerado: evidencias/' + name);
  return result.body;
}

function githubEvidence() {
  const result = runCurl(['https://api.github.com/repos/' + repository]);
  assert.equal(result.status, 200, 'O fork ainda nao esta acessivel na API do GitHub.');
  assert.equal(result.body.fork, true, 'O repositorio informado precisa ser um fork.');
  assert.equal(result.body.parent?.full_name, 'ibm-developer-skills-network/expressBookReviews',
    'O fork precisa ter o repositorio oficial da IBM como parent.');
  if (process.platform === 'win32') {
    const command = 'curl.exe -fsSL --max-time 20 https://api.github.com/repos/' + repository +
      ' | ConvertFrom-Json | Select-Object full_name,fork,@{Name="parent";Expression={$_.parent.full_name}} | ConvertTo-Json';
    const compact = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      cwd: project, encoding: 'utf8', timeout: 25000, windowsHide: true
    });
    if (compact.error) throw compact.error;
    assert.equal(compact.status, 0, compact.stderr);
    const summary = JSON.parse(compact.stdout);
    assert.equal(summary.full_name, result.body.full_name);
    assert.equal(summary.fork, true);
    assert.equal(summary.parent, result.body.parent.full_name);
    writeFileSync(path.join(output, 'githubrepo'),
      'Comando (PowerShell):\n' + command + '\n\nSaida real:\n' + compact.stdout, 'utf8');
    console.log('Gerado: evidencias/githubrepo');
  } else {
    save('githubrepo', result);
  }
}

function writeAnswers() {
  const names = ['githubrepo', 'getallbooks', 'getbooksbyISBN', 'getbooksbyauthor',
    'getbooksbytitle', 'getbookreview', 'register', 'login', 'reviewadded', 'deletereview'];
  const sections = names.map((name, i) => {
    const file = path.join(output, name);
    return 'PERGUNTA ' + (i + 1) + ' - ' + name + '\n\n' +
      (existsSync(file) ? readFileSync(file, 'utf8') : 'PENDENTE: execute npm run evidence com acesso a internet.');
  });
  sections.push('PERGUNTA 11 - URL PUBLICA DO ARQUIVO general.js\n\n' +
    'https://github.com/' + repository + '/blob/main/final_project/router/general.js\n\n' +
    'A URL so deve ser enviada depois que os arquivos forem publicados no fork.');
  writeFileSync(path.join(output, 'RESPOSTAS.txt'), sections.join('\n\n' + '='.repeat(72) + '\n\n'), 'utf8');
}

async function main() {
  if (process.argv.includes('--github-only')) {
    githubEvidence();
    writeAnswers();
    return;
  }
  const server = spawn(process.execPath, ['index.js'], {
    cwd: project,
    env: { ...process.env, PORT: process.env.EVIDENCE_PORT || '5000', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let errors = '';
  server.stderr.on('data', data => { errors += data; });
  const stopped = new Promise(resolve => server.once('exit', resolve));
  try {
    const baseURL = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Servidor nao iniciou. ' + errors)), 15000);
      server.once('error', err => { clearTimeout(timer); reject(err); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('Servidor encerrou. ' + errors)); });
      server.stdout.on('data', data => {
        const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const get = (name, route) => save(name, runCurl([baseURL + route]));
    assert.equal(Object.keys(get('getallbooks', '/')).length, 10);
    assert.equal(get('getbooksbyISBN', '/isbn/1').author, 'Chinua Achebe');
    assert.ok(get('getbooksbyauthor', '/author/Chinua%20Achebe')['1']);
    assert.ok(get('getbooksbytitle', '/title/Things%20Fall%20Apart')['1']);
    assert.deepEqual(get('getbookreview', '/review/1'), {});

    const json = ['-H', 'Content-Type: application/json'];
    save('register', runCurl(['-X', 'POST', baseURL + '/register',
      ...json, '--data-binary', '@scripts/payloads/register.json']), 201);
    save('login', runCurl(['-X', 'POST', baseURL + '/customer/login',
      ...json, '--data-binary', '@scripts/payloads/register.json', '-c', cookieFile]));

    const reviewURL = baseURL + '/customer/auth/review/1';
    const added = save('reviewadded', runCurl(['-X', 'PUT', reviewURL, '-b', cookieFile,
      ...json, '--data-binary', '@scripts/payloads/review.json']));
    assert.equal(added.reviews.cristiano_demo, 'Excelente livro, com uma historia envolvente.');
    const updated = save('reviewupdated', runCurl(['-X', 'PUT', reviewURL, '-b', cookieFile,
      ...json, '--data-binary', '@scripts/payloads/review-update.json']));
    assert.equal(updated.reviews.cristiano_demo,
      'Excelente livro. Recomendo a leitura pela riqueza cultural.');
    const deleted = save('deletereview', runCurl(['-X', 'DELETE', reviewURL, '-b', cookieFile]));
    assert.deepEqual(deleted.reviews, {});
    assert.deepEqual(runCurl([baseURL + '/review/1']).body, {});

    const axiosClient = spawnSync(process.execPath, ['router/general.js'], {
      cwd: project, env: { ...process.env, BOOKSHOP_API_URL: baseURL },
      encoding: 'utf8', timeout: 20000, windowsHide: true
    });
    if (axiosClient.error) throw axiosClient.error;
    assert.equal(axiosClient.status, 0, axiosClient.stderr);
    writeFileSync(path.join(output, 'axios-client.txt'),
      'Comando: npm run client\n\nSaida real:\n' + axiosClient.stdout, 'utf8');
    if (!process.argv.includes('--skip-github')) githubEvidence();
    writeAnswers();
    console.log('Evidencias e respostas geradas com saidas reais.');
  } finally {
    if (server.exitCode === null) server.kill();
    await stopped;
    const cookiePath = path.join(project, cookieFile);
    if (existsSync(cookiePath)) unlinkSync(cookiePath);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
