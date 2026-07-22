# Lab Reserva

MVP responsivo para organizar reservas de laboratórios e materiais escolares. Esta entrega corresponde à **Fase 1 — Estrutura**: frontend React navegável, contratos tipados, backend local simulado, validações puras e testes automatizados.

O mesmo frontend será usado por todas as escolas. Dados específicos da unidade virão da planilha vinculada à implantação do Google Apps Script, sem IDs ou segredos expostos no navegador.

## Estado da implementação

Disponível nesta fase:

- layout institucional mobile-first, com navegação inferior no celular;
- rotas com `HashRouter` para início, reserva, agenda, minhas reservas, administração, configuração inicial e página 404;
- carregamento inicial assíncrono, tratamento de erro e nova tentativa;
- fluxo demonstrativo de reserva com React Hook Form e Zod;
- consulta de disponibilidade sob demanda;
- `BackendClient` como única fronteira entre interface e servidor;
- `MockBackend` determinístico para desenvolvimento local;
- tipos de escola, laboratório, material, turno, período, usuário e reserva;
- utilitários puros para datas ISO, intervalos de horário e validação;
- testes com Vitest e React Testing Library;
- build com um bundle JavaScript e um arquivo CSS, usando caminhos relativos.

Ainda não faz parte desta fase:

- projeto `.gs`, `doGet`, `Index.html`, `clasp push` e implantação do Web App (Fase 2);
- criação automática das abas e persistência do assistente (Fase 3);
- disponibilidade e cadastros lidos do Google Sheets (Fase 4);
- gravação real, `LockService`, conflitos, recursos e cancelamentos (Fase 5);
- sincronização com Google Agenda (Fase 6);
- administração funcional, QR Codes e bloqueios (Fase 7);
- recorrência (Fase 8);
- integração opcional com a SED (Fase 9).

Os cartões administrativos e o assistente inicial são estruturas de interface, não simulam segurança nem persistência real.

## Requisitos

- Node.js 22 (`22.18.0` foi usado nesta entrega);
- npm 10 ou mais recente;
- Git.

## Instalação e desenvolvimento

```bash
npm install
npm run dev
```

Abra o endereço informado pelo Vite, normalmente `http://localhost:5173`. Nesta fase, o `BackendClient` seleciona exclusivamente o `MockBackend`.

Rotas úteis:

```text
http://localhost:5173/#/
http://localhost:5173/#/reservar
http://localhost:5173/#/disponibilidade
http://localhost:5173/#/minhas-reservas
http://localhost:5173/#/admin
http://localhost:5173/#/configuracao-inicial
```

Para simular um QR Code específico no frontend local:

```text
http://localhost:5173/?lab=LAB02#/reservar
```

O parâmetro externo ao hash reproduz o formato que será injetado pelo `doGet(e)` na Fase 2. Links internos também aceitam `#/reservar?lab=LAB02`.

## Scripts

```bash
npm run dev          # servidor local com hot reload
npm run lint         # ESLint com TypeScript e regras de React
npm run format       # formata o projeto com Prettier
npm run format:check # verifica formatação sem alterar arquivos
npm run test         # Vitest em modo interativo
npm run test:run     # suíte completa em execução única
npm run build        # TypeScript estrito + build de produção
npm run preview      # pré-visualiza o diretório dist
```

O comando de build da Fase 1 termina em `dist/`. O script `scripts/build-apps-script.mjs` e os comandos `gas:*` serão adicionados na Fase 2, junto com o diretório `apps-script/`; incluí-los agora criaria comandos que ainda não poderiam funcionar.

## Arquitetura do frontend

```text
HashRouter
  └── App
      ├── BootstrapProvider
      │   └── BackendClient
      │       └── MockBackend (Fase 1)
      └── AppShell
          └── páginas e features
```

O `getBootstrapData` retorna apenas dados estáveis: escola, laboratórios, materiais, turnos, períodos, regras, avisos e usuário atual. Reservas só são consultadas depois, por página ou por laboratório/data.

Estrutura principal:

```text
src/
├── app/          # composição, contexto de bootstrap e rotas
├── components/   # componentes acessíveis e CSS Modules
├── domain/       # regras puras de agendamento
├── features/     # UI por domínio funcional
├── pages/        # telas roteadas
├── services/     # BackendClient e implementação mock da Fase 1
├── styles/       # tokens e estilos globais
├── test/         # configuração do ambiente de testes
├── types/        # contratos compartilhados
└── utils/        # datas e validações reutilizáveis
```

Mais detalhes estão em [docs/architecture.md](docs/architecture.md).

## Datas e fuso horário

Datas de reserva circulam como strings `YYYY-MM-DD`. Os utilitários fazem parsing local e estrito com `date-fns`; o projeto não usa `new Date('YYYY-MM-DD')`, evitando deslocamento de dia por UTC.

## Segurança nesta fase

- nenhum ID de planilha, token ou segredo está no frontend;
- nenhuma variável `VITE_*` é usada para segredo;
- páginas não acessam Sheets ou Calendar diretamente;
- toda operação passa pelo `BackendClient`;
- erros exibidos ao professor não incluem stack trace;
- a área administrativa informa claramente que a autorização real deverá ocorrer no backend.

O mock existe somente para desenvolvimento e não representa uma barreira de segurança.

## Testes

```bash
npm run test:run
```

A suíte cobre:

- datas ISO válidas, limites do ano letivo, antecedência e bloqueios;
- períodos adjacentes e sobrepostos;
- schemas Zod reutilizáveis;
- bootstrap sem carregamento prematuro de reservas;
- pré-seleção de laboratório recebida por QR Code;
- disponibilidade exclusiva e compartilhada no mock;
- capacidade, conflito, cancelamento e erros controlados do mock;
- seleção do mock pela fábrica de backend;
- carregamento, erro e rota 404 da aplicação.

As regras definitivas de conflito, materiais e recorrência ganharão testes próprios quando forem implementadas nas fases correspondentes; o mock não é a fonte oficial dessas políticas.

## Build

```bash
npm run build
```

O Vite está configurado com:

- `base: './'`;
- CSS sem divisão;
- ausência de importações dinâmicas;
- saída principal em um único bundle JavaScript;
- TypeScript em modo estrito.

## Versionamento e GitHub

O projeto inclui `.gitignore`, `.editorconfig`, Prettier, ESLint e `package-lock.json`. Para publicar em um repositório novo:

```bash
git init -b main
git add .
git commit -m "feat: estrutura inicial do Lab Reserva"
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

Nenhum repositório remoto ou implantação externa é criado automaticamente.

## Próxima fase

A Fase 2 adicionará o projeto Google Apps Script, `doGet`, `healthCheck`, o empacotador `scripts/build-apps-script.mjs`, configuração do `clasp` e o teste real da ponte `google.script.run`.
