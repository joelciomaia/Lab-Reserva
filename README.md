# Lab Reserva

MVP mobile-first para o professor consultar a semana de um laboratório escolar e fazer um agendamento sem passar por dashboard ou menus.

## Fluxo disponível

Ao abrir o link, a aplicação mostra diretamente:

- escola e laboratório vinculados ao link;
- semana atual, com navegação para a semana anterior ou seguinte;
- grade única com os dias em colunas e os horários em linhas;
- reservas como eventos coloridos, unificando aulas consecutivas;
- botão **Agendar uma aula**.

Os espaços livres da grade são clicáveis e abrem o formulário com laboratório, data e aula já selecionados. O formulário compacto possui nome do professor, disciplina, turma, data, aulas desejadas, objetos do conhecimento e itens utilizados configurados pela escola. O campo de observações é opcional e começa oculto. As aulas são agrupadas em colunas de Manhã, Tarde e Noite conforme os turnos realmente disponíveis na data escolhida, inclusive no celular. Em larguras estreitas, cada botão reduz o texto para o ordinal da aula sem alterar seu nome acessível completo. Após a confirmação, a aplicação volta para a semana da reserva, atualiza os horários e destaca o novo evento.

No celular, a agenda mantém os cinco dias úteis visíveis sem rolagem horizontal. A altura das linhas se adapta ao total configurado pela escola e calendários extensos continuam navegáveis verticalmente, com os turnos identificados no eixo de horários.

A abertura padrão mantém a semana vigente de segunda a sexta. A partir do sábado, passa automaticamente para a próxima semana escolar; o botão **Hoje** usa a mesma referência. Uma data recebida pelo link ou pelo retorno de um agendamento sempre prevalece, preservando a semana que o usuário solicitou.

Os períodos são dados do backend, não valores fixos da interface. O mesmo layout aceita escolas com um, dois ou três turnos e quantidades diferentes de aulas por turno. Cada período pode informar os dias da semana em que existe; assim, um turno extra de quarta-feira aparece somente quando uma quarta-feira é escolhida. O backend público definitivo deverá entregar esse catálogo normalizado para cada escola.

Sem uma configuração real publicada, a agenda apresenta um erro explícito. Dados demonstrativos nunca são usados como fallback em produção.

O painel do gerenciador fica em `/gerenciar`, separado da experiência do professor. A agenda pública mostra apenas um acesso secundário e discreto para o laboratorista; o fluxo principal do professor continua restrito à semana e ao agendamento. O painel permite configurar:

- nome da escola e laboratórios ativos;
- turnos, dias da semana, início, duração, quantidade de aulas e intervalo;
- turmas, etapa e quantidade de estudantes;
- disciplinas disponíveis no formulário;
- itens que serão utilizados e exibição opcional do campo de observações.

As alterações são publicadas no Google Sheets. Depois da autorização Google, o aplicativo localiza ou cria a planilha e restaura sua configuração. Na seção **Geral**, basta informar escola, laboratório, responsável e e-mail e usar **Salvar e gerar QR Code**; horários, turmas e recursos podem ser configurados depois. A agenda pública usa o Web App de `apps-script/` para ler disponibilidade e gravar reservas reais com trava contra conflitos.

## Integração Google para várias escolas

O acesso discreto da agenda aponta para `/gerenciar/geral`. Sem autorização ativa, a rota protegida encaminha para a tela simples `/gerenciar/entrar`; depois do login, retorna ao painel. O botão **Entrar com Google** usa o [token model do Google Identity Services (GIS)](https://developers.google.com/identity/oauth2/web/guides/use-token-model) e solicita um único escopo:

```text
https://www.googleapis.com/auth/drive.file
```

Esse escopo limita o aplicativo aos arquivos que ele criou ou que o usuário abriu/escolheu com ele; não concede leitura geral do Google Drive. A mesma autorização permite usar a Drive API para localizar os arquivos do Lab Reserva e a Sheets API para ler e escrever seu conteúdo. O access token existe somente em memória. Ele não é gravado no `localStorage` nem no `sessionStorage`; após recarregar a página ou perder a autorização, o laboratorista precisa autorizar novamente.

O Client ID pertence ao aplicativo implantado, não à escola. Portanto, cada ambiente normalmente possui um único Client ID centralizado — por exemplo, um para desenvolvimento e outro para produção — e esse mesmo Client ID atende todos os laboratoristas e escolas que acessarem aquela origem. O usuário final não precisa criar projeto Google Cloud, Client ID ou credenciais.

### Configurar o Client ID

Essa configuração é feita uma vez por quem publica o sistema:

1. No Google Cloud, crie ou selecione um projeto e habilite a **Google Sheets API** e a **Google Drive API**.
2. Configure a tela de consentimento com audiência **External**. Durante o desenvolvimento, mantenha o aplicativo em teste e cadastre os testadores; para atender livremente novas escolas, publique-o como **In production**.
3. Crie um [OAuth Client ID do tipo Web application](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
4. Cadastre centralmente todas as origens JavaScript autorizadas daquele ambiente, como `http://localhost:5173` e `https://agenda.exemplo.org`. Informe apenas esquema, domínio e porta, sem caminhos, hash ou barra final.
5. Crie um arquivo `.env.local` na raiz:

```env
VITE_GOOGLE_CLIENT_ID=000000000000-exemplo.apps.googleusercontent.com
```

O frontend não usa Client Secret. Reinicie o servidor do Vite depois de alterar o arquivo de ambiente. Em produção, use um domínio HTTPS estável, inclua-o nas origens e domínios autorizados do projeto e publique uma política de privacidade correspondente ao tratamento de dados do aplicativo.

Consulte também a documentação de [escopos da Drive API](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) e de [escopos aceitos pela Sheets API](https://developers.google.com/workspace/sheets/api/scopes).

### Entrada e recuperação da escola

Depois da autorização, o fluxo ocorre na própria conta Google do laboratorista:

1. o aplicativo testa o vínculo corrente salvo no navegador;
2. consulta o pequeno histórico local de IDs conhecidos;
3. procura no Drive somente planilhas marcadas com `appProperties` privadas do Lab Reserva;
4. se não encontrar nenhuma, deixa o usuário configurar uma nova escola;
5. se encontrar uma, vincula-a automaticamente;
6. se encontrar várias, mostra os nomes para o usuário escolher ou permite configurar uma nova escola;
7. antes de exibir os campos editáveis, lê a planilha escolhida e restaura sua configuração no backend da sessão.

Cada planilha criada recebe as propriedades `type=lab-reserva-config` e `version=1`. Essa marca permite reencontrá-la em outro navegador sem pesquisar arquivos alheios no Drive. Planilhas antigas já conhecidas localmente também são marcadas quando voltam a ficar acessíveis.

O `localStorage` contém apenas o ID corrente e um histórico limitado de IDs de planilhas conhecidas. Esses valores são referências de navegação, não tokens, senhas ou segredos. A descoberta pelo Drive reduz a dependência desse armazenamento: se ele for apagado, a conta ainda pode recuperar planilhas marcadas e escolher entre várias escolas.

### Sincronização

Ao autorizar uma nova escola, a aplicação cria imediatamente `Lab Reserva - Nova escola` com as abas abaixo e somente seus cabeçalhos:

```text
CONFIGURACOES
LABORATORIOS
TURNOS
DISCIPLINAS
TURMAS
RECURSOS
RESERVAS
CANCELAMENTOS
```

O painel começa sem laboratórios, turnos, turmas, disciplinas, recursos ou agendamentos demonstrativos. Os dados principais podem ser salvos como configuração inicial, e a planilha recebe o nome da escola; pendências de horários, turmas e recursos continuam visíveis no painel sem apagar o que já foi informado. As seis abas de configuração são substituídas em uma única operação atômica: uma falha mantém a versão anterior completa. `RESERVAS` é append-only: cada agendamento recebe uma linha com suas aulas e horários e nunca é apagado pela sincronização. `CANCELAMENTOS` também é append-only e recebe uma linha por aula desagendada, permitindo cancelamento parcial ou total com auditoria. Depois de escrever configurações, a aplicação relê e verifica as matrizes enviadas.

Ao abrir uma planilha criada antes dessa estrutura, a integração usa o catálogo padrão de recursos, mantém observações ocultas e realiza uma migração automática única para materializar a nova aba e a nova chave, sem limpar nem sobrescrever `RESERVAS`.

O Google Agenda continua opcional. Para a agenda pública, publique o projeto de `apps-script/` conforme [`apps-script/README.md`](apps-script/README.md) e configure `VITE_GOOGLE_APPS_SCRIPT_URL`.

## Executar localmente

Requisitos: Node.js 22 e npm 10 ou mais recente.

```bash
npm install
npm run dev
```

O Vite informa o endereço local, normalmente `http://localhost:5173`.

Links de exemplo:

```text
http://localhost:5173/#/
http://localhost:5173/#/?lab=LAB02
http://localhost:5173/?lab=LAB02#/
http://localhost:5173/#/gerenciar
http://localhost:5173/#/gerenciar/entrar
```

O parâmetro `lab` escolhe o laboratório correspondente ao link. Sem o parâmetro, a agenda usa o primeiro laboratório ativo; um ID informado e inexistente produz erro explícito.

Assim que os dados principais do laboratório são confirmados no Google Sheets, a seção **Geral** oferece os botões **Abrir**, **Copiar link** e **Baixar QR Code** em JPG. A disponibilidade do serviço público não bloqueia a geração do material de acesso. Links com um laboratório inexistente mostram erro e nunca caem silenciosamente em outro laboratório.

## Scripts

```bash
npm run dev          # servidor local com hot reload
npm run lint         # análise estática
npm run format       # formatação automática
npm run format:check # verificação da formatação
npm run test:run     # suíte completa
npm run build        # TypeScript estrito e build de produção
npm run preview      # pré-visualização de dist/
```

## Arquitetura

```text
HashRouter
  └── App
      ├── GoogleSheetsProvider
      ├── BootstrapProvider
      │   └── BackendClient
      │       └── AppsScriptBackend → Web App → Google Sheets
      └── rotas
          ├── /                    → agenda semanal
          ├── /agendar             → novo agendamento
          ├── /gerenciar/entrar    → autorização Google
          └── /gerenciar/:seção    → configuração do laboratorista
```

O contrato público do `BackendClient` possui três operações:

- carregar escola, laboratórios e aulas;
- consultar a disponibilidade de um laboratório em uma data;
- criar um agendamento.

O gerenciador lê e salva configurações diretamente pelo Google Sheets com o token do laboratorista. A guia **Agendamentos** lista reservas reais e acrescenta cancelamentos por aula; ela nunca remove a linha original. O `MockBackend` permanece apenas como utilitário injetado explicitamente nos testes e não faz parte do caminho de produção.

Datas circulam como strings `YYYY-MM-DD` e são interpretadas localmente, sem `new Date('YYYY-MM-DD')`, evitando mudança de dia por UTC.

Mais detalhes: [docs/architecture.md](docs/architecture.md).

## Testes

A suíte automatizada cobre:

- exibição direta da agenda semanal;
- posicionamento e mesclagem de eventos consecutivos;
- clique em espaço livre com data e aula pré-selecionadas;
- abertura dos detalhes de uma reserva;
- laboratório selecionado pelo link;
- navegação entre semanas;
- formulário único com os campos solicitados;
- aulas separadas por turno e turnos condicionados ao dia da semana;
- geração de aulas a partir da configuração de duração, quantidade e intervalo;
- carregamento, validação e salvamento do painel do gerenciador;
- autorização Google sem persistir o access token;
- descoberta e seleção de planilhas de uma ou mais escolas;
- restauração da configuração antes da edição;
- criação, atualização e validação por releitura da planilha;
- preservação da aba `RESERVAS` em sincronizações posteriores;
- leitura das reservas reais e cancelamento parcial ou total por registros append-only;
- geração do link e download do QR Code específico por laboratório;
- salvamento dos dados principais e geração do acesso antes da configuração de horários, turmas e recursos;
- migração compatível de planilhas antigas para a aba `RECURSOS`;
- propagação de horários, turmas, disciplinas e recursos configurados para a área do professor;
- exibição configurável do campo de observações;
- retorno à agenda com o novo horário reservado;
- ocupação e isolamento por laboratório e data;
- prevenção de conflito no mesmo período;
- validações de datas, horários e campos.

```bash
npm run test:run
```

## Fora do escopo atual

- dashboard, avisos, estatísticas, atalhos e menu global;
- autenticação administrativa completa e recuperação da sessão OAuth;
- backend público multi-tenant e links persistentes isolados por escola;
- Google Agenda;
- auditoria e regras para alterações que afetem reservas futuras;
- recorrência e regras avançadas de recursos.
