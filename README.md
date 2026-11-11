# Livraria online — projeto final IBM

API em Node.js e Express para consultar livros, cadastrar usuários, fazer login e gerenciar avaliações. Baseada no [projeto oficial da IBM](https://github.com/ibm-developer-skills-network/expressBookReviews).

O catálogo original de dez livros foi preservado em `final_project/router/booksdb.js`, incluindo os ISBNs de exemplo, autores, títulos e avaliações inicialmente vazias.

## Executar

Requisitos: Node.js 22 ou superior e npm.

```powershell
cd final_project
npm.cmd ci
npm.cmd start
```

A API fica em http://127.0.0.1:5000. No Windows, use `curl.exe` para executar os comandos de cURL.

Em outro terminal:

```powershell
cd final_project
npm.cmd test
npm.cmd run client
```

Os testes verificam consultas, autenticação, permissões, adição/alteração/exclusão de avaliações, cadastros concorrentes e consultas Axios por HTTP real.

## Rotas

| Método | Endereço | Função |
| --- | --- | --- |
| GET | / | Todos os livros |
| GET | /isbn/:isbn | Livro por ISBN |
| GET | /author/:author | Livros por autor |
| GET | /title/:title | Livros por título |
| GET | /review/:isbn | Avaliações de um livro |
| POST | /register | Cadastro com username e password |
| POST | /customer/login | Login com username e password |
| PUT | /customer/auth/review/:isbn | Adicionar ou atualizar sua avaliação |
| DELETE | /customer/auth/review/:isbn | Excluir sua avaliação |

Autor e título aceitam trechos de texto e ignoram diferenças entre maiúsculas e minúsculas. Espaços e acentos devem ser codificados na URL.

As rotas protegidas usam o cookie recebido no login. O usuário da sessão determina a autoria da avaliação. Cada usuário pode manter uma avaliação por livro.

Exemplo de consulta:

```powershell
curl.exe -sS http://127.0.0.1:5000/isbn/1
```

Os arquivos em `final_project/scripts/payloads` contêm somente dados fictícios de demonstração.

## Axios no arquivo exigido

[final_project/router/general.js](final_project/router/general.js) contém as rotas públicas e quatro funções de consulta:

- `getAllBooks`: async/await com callback.
- `getBooksByISBN`: Promise com .then().
- `getBooksByAuthor`: async/await.
- `getBooksByTitle`: async/await.

`npm run client` executa as quatro consultas simultaneamente com Promise.all, usando Axios contra o servidor iniciado.

## Evidências da atividade

Os arquivos em [evidencias](evidencias) contêm comandos cURL e saídas reais. [evidencias/RESPOSTAS.txt](evidencias/RESPOSTAS.txt) reúne as respostas por pergunta.

Para gerar novamente, pare o servidor iniciado por `npm start` e execute:

```powershell
cd final_project
npm.cmd run evidence
```

O gerador inicia um servidor independente, com usuários e avaliações vazios, executa cURL, verifica os resultados e encerra esse servidor. Ele exige a porta 5000 livre e acesso à API pública do GitHub. Cookies temporários são apagados ao final.

Para gerar somente a comprovação do fork:

```powershell
npm.cmd run evidence -- --github-only
```

O gerador valida que o repositório é um fork e que o campo parent aponta para o projeto oficial da IBM. Para usar outro fork, defina GITHUB_REPOSITORY no ambiente no formato usuario/repositorio.

## Dados e sessões

Usuários, sessões e avaliações ficam em memória e reiniciam com o processo, conforme o escopo do exercício. As senhas são armazenadas como hash scrypt com salt aleatório; a sessão autenticada contém um JWT com validade de uma hora.

Cadastros repetidos são verificados novamente após o cálculo assíncrono do hash. As alterações de avaliações são operações síncronas por usuário, sem leitura e gravação separadas por espera assíncrona. Isso preserva avaliações de usuários distintos em requisições concorrentes no mesmo processo.

PORT, JWT_SECRET e SESSION_SECRET podem ser definidos no ambiente. As chaves são aleatórias por execução quando não configuradas. O exemplo `final_project/.env.example` documenta essas variáveis; para carregar um arquivo .env, use `node --env-file=.env index.js`.

Para implantação com vários processos ou dados permanentes, seria necessário compartilhar sessões e armazenar usuários e avaliações em banco de dados.

## Licença

Mantida a licença Apache-2.0 do projeto original.
