# Arquitetura da landing, da agenda e do gerenciador

## Princípios

1. A raiz sem contexto público apresenta o projeto e conduz o laboratorista à autorização Google; ela não carrega dados de escola.
2. A raiz com `school` ou `lab` no link mantém a agenda semanal como entrada direta do professor, inclusive para links e QR Codes já gerados.
3. Na área pública, o laboratório vem do parâmetro `lab` do link; o professor não vê seleção administrativa.
4. O professor navega apenas entre a agenda e o formulário de agendamento.
5. A visualização é uma matriz temporal: dias em colunas e períodos em linhas, no desktop e no celular.
6. Datas usam strings ISO (`YYYY-MM-DD`) sem conversão UTC implícita.
7. A agenda e o formulário do professor não conhecem detalhes de Google Sheets; o gerenciador delega a sincronização a uma integração isolada.
8. O gerenciador usa rotas próprias e aparece na agenda somente como um acesso secundário discreto para o laboratorista, sem criar menu administrativo.

## Rotas

```text
/ sem school/lab          landing page de apresentação
/?school=...&lab=...      agenda de segunda a sexta
/agendar   formulário único de agendamento
/gerenciar/entrar         autorização Google com GIS
/gerenciar/geral          escola e laboratórios
/gerenciar/agendamentos   reservas, filtros e desagendamento por aula
/gerenciar/horarios       turnos, dias, aulas e intervalos
/gerenciar/turmas         turmas e quantidade de estudantes
/gerenciar/disciplinas    catálogo de disciplinas
/gerenciar/formulario     recursos e campos opcionais
*          redirecionamento para a landing page
```

Como a aplicação usa `HashRouter`, esses caminhos aparecem publicamente depois de `#/`. Os botões de acesso da landing page levam diretamente a `/gerenciar/entrar`. O painel também pode ser acessado por `/gerenciar` ou pelo pequeno link da agenda para `/gerenciar/geral`; sem um access token em memória, suas rotas protegidas encaminham para a entrada e, depois da autorização e da escolha da escola, o fluxo retorna à seção solicitada ou à seção Geral. O formulário de agendamento não oferece acesso administrativo. A autorização OAuth limita o acesso aos arquivos criados ou abertos com o aplicativo, mas não substitui a futura autenticação administrativa.

## Fluxo de dados

```text
LandingPage ────────────── sem acesso ao backend público
WeeklySchedulePage ── getAvailability(data × 5) ─┐
                                                 ├─ BackendClient ─ Apps Script ─ Google Sheets
BookingPage ──────── createReservation ──────────┘
ManagerPage ──────── configurações e cancelamentos
      │
      └─ GoogleSheetsProvider
             ├─ Google Drive API ─ descoberta e vínculo
             └─ Google Sheets API ─ leitura, escrita e validação
```

O `BootstrapProvider` não consulta o backend público na landing page nem nas rotas do gerenciador. Ele carrega escola, laboratórios, períodos, turmas, disciplinas, recursos, opções do formulário e a revisão da configuração somente quando a raiz contém contexto público ou quando o formulário de agendamento é aberto. Reservas não fazem parte do bootstrap; a agenda consulta cada dia da semana e descarta respostas obsoletas quando o professor muda de semana. Depois de salvar no gerenciador, `reload()` renova essa projeção pública.

Sem uma data explícita, a agenda usa a semana vigente entre segunda e sexta e avança para a semana seguinte no sábado e no domingo. Essa mesma referência controla o botão **Hoje** e seu estado desabilitado. `reservationDate` recebido no estado da rota e `date` recebido na URL têm prioridade, garantindo que retornos de agendamento e links profundos não sejam substituídos pela regra automática.

Ao entrar, o gerenciador lê diretamente a configuração da planilha escolhida. O salvamento compara a revisão publicada, grava no Sheets e só então atualiza o rascunho local. `reload()` solicita novamente a projeção pública ao Apps Script.

`WeeklyCalendar` ordena os períodos por turno e pela ordem da aula. Sequências contíguas com o mesmo ID de reserva viram um único evento com `grid-row: span n`; intervalos ou mudanças de turno interrompem a mesclagem. No mobile, todos os dias úteis cabem na largura disponível, sem rolagem horizontal. Calendários longos usam rolagem vertical interna, com cabeçalhos e horários sticky.

A quantidade de linhas não é fixa. Cada período normalizado pelo backend contém:

```text
id, shiftId, shiftName, shiftOrder, classNumber,
name, startTime, endTime, order, active, activeWeekdays?
```

`activeWeekdays` usa a numeração ISO, de `1` (segunda-feira) a `7` (domingo). Quando omitido, o período vale para todos os dias; quando informado, a disponibilidade e a criação de reservas aceitam o período somente nos dias listados. Isso permite, por exemplo, um turno noturno exclusivo das quartas sem regras fixas na interface.

Assim, a configuração futura do Sheets pode entregar de um a três turnos, com cinco, seis ou outra quantidade de aulas por turno. Períodos inativos não entram no bootstrap, na disponibilidade nem em novas reservas. No formulário, os períodos retornados para a data são agrupados por turno em uma, duas ou três colunas, tanto no celular quanto no desktop. Para impedir overflow, colunas estreitas exibem somente o ordinal da aula; o nome e o horário completos permanecem no nome acessível e voltam a aparecer visualmente quando cada coluna possui espaço suficiente. A densidade da grade semanal se adapta à quantidade exibida: confortável até cinco aulas, regular entre seis e oito, compacta entre nove e doze e densa acima disso. Uma célula de um período que não se aplica ao dia é neutra, não reservada.

No gerenciador, o horário é editado em uma representação mais simples por turno:

```text
id, name, order, startTime, classDurationMinutes, classCount,
breakAfterClass, breakDurationMinutes, activeWeekdays, active
```

Ao salvar, o backend valida nomes e IDs repetidos, limites numéricos, dias, fim do dia e sobreposição entre turnos que compartilham datas. Em seguida, gera o catálogo normalizado de períodos preservando IDs existentes por turno e número da aula.

Um slot livre navega para:

```text
/agendar?school=SCHOOL-UUID&lab=LAB01&date=2026-07-22&period=P02
```

O formulário só aplica o período informado depois de confirmar que ele continua livre.

Ao confirmar:

1. o backend reconsulta os períodos para impedir conflito;
2. a reserva é gravada na fonte da sessão;
3. a rota volta para a agenda levando laboratório, data e ID da reserva;
4. a semana é consultada novamente e o novo horário aparece reservado.

## Responsabilidades

- `app/`: bootstrap, foco e rotas públicas e gerenciais;
- `pages/LandingPage`: apresentação do projeto e entrada do laboratorista;
- `pages/WeeklySchedulePage`: dados, laboratório e navegação da semana;
- `features/calendar`: grade temporal, mesclagem de eventos, slots livres e detalhes;
- `pages/BookingPage`: formulário, disponibilidade da data e confirmação;
- `pages/ManagerPage`: edição e publicação da configuração;
- `integrations/google`: GIS, token em memória, descoberta pelo Drive, vínculo local, leitura, sincronização e validação do Sheets;
- `domain/configuration`: padrões, geração de períodos e validação;
- `services/`: fronteira assíncrona e mock em memória;
- `types/`: contratos mínimos de agenda e reserva;
- `utils/`: datas, semana e validação;
- `components/`: controles acessíveis reutilizáveis.

## Integração Google para várias escolas

### Autorização

O `GoogleSheetsProvider` usa o [token model do Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/use-token-model). O OAuth Client ID é lido de `VITE_GOOGLE_CLIENT_ID`, configurado em `.env.local`, e o único escopo solicitado é:

```text
https://www.googleapis.com/auth/drive.file
```

Esse escopo permite criar e operar somente os arquivos que o aplicativo criou ou que o usuário escolheu com ele. A Google Drive API é usada para encontrar e marcar esses arquivos; a Google Sheets API lê e atualiza as células. Ambas precisam estar habilitadas no projeto Google Cloud. O access token é mantido em memória e nunca é persistido no `localStorage` ou no `sessionStorage`. Recarregar a aplicação exige nova autorização. Não há Client Secret no frontend.

O Client ID é uma configuração central da implantação, não uma credencial por escola. Um único Client ID atende todas as contas que usam a mesma origem; ambientes diferentes podem ter Client IDs separados. Para receber novos laboratoristas sem cadastrá-los individualmente, a tela de consentimento deve ter audiência **External** e estado **In production**. As origens JavaScript são mantidas centralmente no cliente OAuth.

Em produção, a origem deve usar domínio HTTPS estável, estar cadastrada no projeto Google Cloud e possuir uma política de privacidade adequada. Consulte a documentação oficial de [criação do Client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [escopos da Drive API](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) e [escopos aceitos pela Sheets API](https://developers.google.com/workspace/sheets/api/scopes).

### Descoberta, histórico local e escolha

Cada planilha criada ou adotada é marcada na Drive API com `appProperties` privadas:

```text
type=lab-reserva-config
version=1
```

Depois de obter o token, o provider executa esta resolução:

1. verifica se o `spreadsheetId` corrente do navegador ainda está acessível;
2. tenta os IDs do histórico local que ainda não foram verificados;
3. consulta no Drive apenas os arquivos com as `appProperties` do Lab Reserva;
4. sem resultado, inicia a configuração de uma nova escola;
5. com um resultado, vincula a planilha automaticamente;
6. com vários resultados, pede ao usuário que escolha a escola ou inicie uma nova.

O `localStorage` usa as chaves `lab-reserva.google.spreadsheet-id.v1` para o vínculo corrente e `lab-reserva.google.known-spreadsheet-ids.v1` para um histórico limitado. São somente IDs de arquivos, não access tokens, senhas ou segredos. A descoberta por `appProperties` permite recuperar as planilhas marcadas mesmo quando esse armazenamento não existe, inclusive em outro navegador.

O escopo `drive.file` impede uma busca geral no Drive: a listagem permanece limitada aos arquivos acessíveis ao aplicativo. Cada conta Google cria e recupera suas próprias planilhas dentro desse limite.

### Restauração, escrita e validação

Ao autorizar uma nova escola, a integração cria imediatamente `Lab Reserva - Nova escola`, somente com os cabeçalhos. Uma planilha inteiramente vazia é restaurada como configuração ainda não iniciada. Escola e laboratório válidos podem ser persistidos antes de turnos, turmas e recursos; somente essas três pendências de completude são toleradas, enquanto conteúdo estruturalmente inválido continua sendo rejeitado. O primeiro salvamento renomeia a planilha com o nome da escola e reutiliza o mesmo ID nos salvamentos seguintes. A estrutura possui estas abas:

| Aba             | Estrutura                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `CONFIGURACOES` | `CHAVE \| VALOR`                                                                                                               |
| `LABORATORIOS`  | `ID \| NOME \| ATIVO \| LIMITE_SIMULTANEO`                                                                                     |
| `TURNOS`        | `ID \| NOME \| HORA_INICIO \| DURACAO_AULA \| QUANTIDADE_AULAS \| INTERVALO_APOS \| DURACAO_INTERVALO \| DIAS_SEMANA \| ATIVO` |
| `DISCIPLINAS`   | `ID \| NOME \| ATIVO`                                                                                                          |
| `TURMAS`        | `ID \| NOME \| ETAPA \| QUANTIDADE_ALUNOS \| ATIVO`                                                                            |
| `RECURSOS`      | `ID \| NOME \| ATIVO`                                                                                                          |
| `RESERVAS`      | reserva imutável, aulas, horários e dados informados pelo professor                                                            |
| `CANCELAMENTOS` | uma linha de auditoria por aula desagendada                                                                                    |

Cada sincronização substitui somente as seis abas de configuração em um único `spreadsheets.batchUpdate` atômico. Uma falha preserva integralmente a versão anterior. `RESERVAS` e `CANCELAMENTOS` são append-only e nunca são limpas. Planilhas legadas recebem somente as colunas e abas operacionais ausentes, sem regravar linhas existentes.

Após cada escrita, a integração faz um `values.batchGet` das seis abas de configuração e compara as matrizes normalizadas com os dados enviados. A sincronização só é considerada confirmada quando essa releitura valida os valores; diferenças geram uma falha explícita. Em seguida, o frontend consulta a conta efetiva do Web App, concede a ela permissão de edição somente nessa planilha via `drive.file` e registra o par imutável escola–planilha. O link e o QR Code só são liberados quando o fingerprint SHA-256 retornado pelo backend corresponde à planilha sincronizada, sem expor ID, token ou credencial.

Antes da edição, essas mesmas seis abas são lidas, validadas e convertidas em `AdminConfiguration`. A ausência ou invalidade dos dados produz um estado explícito; não existe fallback para valores demonstrativos.

Planilhas legadas sem `RECURSOS` ou sem `EXIBIR_OBSERVACOES` continuam legíveis. A leitura aplica o catálogo padrão e observações ocultas; em seguida, o provider sincroniza essa configuração uma única vez para criar a estrutura ausente. A migração não escreve na aba `RESERVAS`.

## Backend público

O Web App em `apps-script/` executa como uma conta central e mantém em Script Properties um registro imutável e reverso entre o ID público da escola e a planilha que foi compartilhada automaticamente com essa conta. Não existe fallback para `SPREADSHEET_ID`. Bootstrap, disponibilidade e criação exigem `school`; a resolução valida o mapa reverso e também `CONFIGURACOES.ID_ESCOLA` antes de abrir os dados. O serviço usa `LockService` para registrar vínculos e revalidar conflitos, e grava reservas com UUID. A disponibilidade pública retorna apenas a ocupação e o ID técnico da reserva, sem professor, turma ou disciplina. Cancelamentos administrativos usam o token Google do laboratorista e são acrescentados diretamente em `CANCELAMENTOS`; não existe endpoint público de exclusão. A criação pública não possui autenticação ou limitação de taxa nativas e precisa de uma camada antiautomação antes de exposição ampla.

O `MockBackend` permanece exclusivamente nos testes por injeção explícita. Sem `VITE_GOOGLE_APPS_SCRIPT_URL`, a aplicação informa que a agenda real ainda não foi conectada.

O salvamento compara a revisão lida antes de regravar. Se outra tela já publicou uma revisão diferente, a alteração é rejeitada em vez de sobrescrever silenciosamente. Desativação preserva IDs no cadastro; ainda será necessário definir regras para impedir alterações de horário que afetem reservas futuras.

O catálogo demonstrativo usado pela suíte existe somente no `MockBackend` injetado pelos testes. Nenhum dado desse catálogo é carregado no caminho de produção.
