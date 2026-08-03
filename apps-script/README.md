# Backend Apps Script

Web App público multi-escola. Cada escola usa `CONFIGURACOES.ID_ESCOLA` como
identificador público do workspace; o ID real da planilha nunca aparece no link,
no QR Code ou nas chamadas públicas.

Não há dados de demonstração, fallback em memória nem fallback para a antiga
Script Property `SPREADSHEET_ID`.

## Implantação com clasp

1. Crie um projeto independente em <https://script.google.com>.
2. Copie `.clasp.json.example` para `.clasp.json` e informe o ID do projeto.
3. Dentro desta pasta, execute `clasp login` e `clasp push`.
4. Implante como **Aplicativo da Web**, executando como o proprietário e com acesso
   para qualquer pessoa. Em uma atualização, crie uma nova versão da implantação.
5. Consulte `GET ?action=serviceInfo`. A resposta deve conter o e-mail da conta que
   executa o backend em `backendAccountEmail` e informa em `googleChatConfigured` se
   as credenciais opcionais do Google Chat foram reconhecidas.
6. Configure esse mesmo e-mail no frontend em
   `VITE_GOOGLE_APPS_SCRIPT_ACCOUNT_EMAIL`. Uma divergência impede o
   compartilhamento da planilha.

Normalmente o e-mail é obtido de `Session.getEffectiveUser()`. Se a implantação não
o disponibilizar, configure uma única Script Property global chamada
`BACKEND_ACCOUNT_EMAIL`. Se o valor configurado divergir da conta efetiva, o serviço
recusa a operação para evitar que planilhas sejam compartilhadas com a conta errada.

## Notificações privadas pelo Google Chat

As notificações de novas reservas usam a Google Chat API e são enviadas como o app
Lab Reserva. Não há webhook por escola e nenhuma credencial é enviada ao navegador
ou gravada nas planilhas.

Para configurar o backend:

1. use o mesmo projeto Google Cloud do OAuth Client do frontend;
2. habilite e configure a Google Chat API, deixando o app disponível para as contas
   que participarão do piloto;
3. crie uma service account nesse projeto para representar o Chat app;
4. no Apps Script, crie a Script Property `GOOGLE_CHAT_SERVICE_ACCOUNT_JSON` com o
   conteúdo integral do JSON da service account;
5. publique uma nova versão do Web App e autorize o uso de conexões externas;
6. confirme que `serviceInfo.googleChatConfigured` retorna `true`.

A chave privada é um segredo: não a inclua no Git, no frontend ou no Google Sheets.
Somente editores confiáveis devem ter acesso ao projeto Apps Script. Rotacione a
chave imediatamente se ela for exposta.

Cada laboratório só recebe avisos quando `AVISAR_NOVA_RESERVA` e `CHAT_ATIVO` estão
ativados e `CHAT_ESPACO` contém o resource name de uma conversa direta no formato
`spaces/...`. Essa conversa privada precisa ter sido criada previamente entre o
laboratorista e o Chat app. O backend usa o escopo de app `chat.bot`, mantém o token
de curta duração no `CacheService` e usa o ID da reserva como `requestId` para evitar
mensagens duplicadas em uma repetição da mesma chamada à API. Antes do primeiro envio,
o backend também consulta os metadados e exige `DIRECT_MESSAGE` com
`singleUserBotDm`; essa validação é mantida temporariamente no cache. Assim, editar a
planilha manualmente para apontar a um espaço ou conversa em grupo não desvia os
avisos para um destino público.

O envio acontece somente depois que a linha foi confirmada em `RESERVAS` e fora do
`LockService`. Falhas ou indisponibilidade do Chat são registradas nos logs, mas não
desfazem nem fazem a API reportar falha para uma reserva já salva.

Cancelamentos continuam sendo registrados diretamente em `CANCELAMENTOS` pelo fluxo
administrativo autenticado. Este Web App público não possui endpoint de notificação
de cancelamento, evitando que chamadas anônimas sejam usadas para forjar ou disparar
mensagens.

## Registro automático de uma escola

Depois de salvar a configuração no Google Sheets, o painel:

1. consulta `serviceInfo`;
2. compartilha a planilha como editora com `backendAccountEmail`;
3. envia `registerSchool` com `spreadsheetId`, `schoolId` e `revision`.

O backend confirma que sua conta possui permissão explícita de edição, abre a
planilha, lê a aba `CONFIGURACOES` e exige que `ID_ESCOLA` e `REVISAO` sejam
exatamente iguais aos valores enviados. Só então, sob `LockService`, cria duas
Script Properties:

```text
LAB_RESERVA_SCHOOL_TO_SPREADSHEET::<schoolId> = <spreadsheetId>
LAB_RESERVA_SPREADSHEET_TO_SCHOOL::<spreadsheetId> = <schoolId>
```

O registro é idempotente: repetir a mesma associação é permitido e também repara
um dos lados ausente após uma falha parcial. Uma escola já ligada a outra planilha,
ou uma planilha já ligada a outra escola, nunca é substituída. Não edite essas
propriedades manualmente.

`registerSchool` retorna somente `schoolId` e `sourceSpreadsheetFingerprint`; o ID
da planilha não é devolvido. Antes de liberar o QR Code, o painel deve comparar esse
fingerprint com a planilha que acabou de sincronizar.

## Isolamento entre escolas

`bootstrap`, `availability` e `createReservation` exigem `school`. O backend procura
somente o mapeamento registrado, abre a planilha correspondente e confirma novamente
`CONFIGURACOES.ID_ESCOLA`. Ausência, vínculo reverso inconsistente, planilha sem
acesso ou ID divergente interrompem a operação com uma mensagem pública que não
revela nenhum `spreadsheetId`.

O proprietário do script precisa manter permissão de edição em cada planilha
registrada. Remover essa permissão desativa o acesso público daquela escola sem
afetar as demais.

`RESERVAS` continua imutável e recebe uma linha por reserva. O script acrescenta a
coluna `AULAS_HORARIOS` ao cabeçalho legado sem regravar reservas. `CANCELAMENTOS`
continua com uma linha por aula cancelada; o par `RESERVA_ID` + `AULA_ID` libera
somente aquela aula. Não existe endpoint público de cancelamento ou administração.
As rotas GET são somente leitura; qualquer ajuste de estrutura ocorre na
sincronização administrativa ou, sob trava, durante a criação de uma reserva.

## API

- `GET ?action=serviceInfo`
- `GET ?action=bootstrap&school=SCHOOL_ID&lab=LAB_ID`
- `GET ?action=availability&school=SCHOOL_ID&laboratoryId=LAB_ID&date=AAAA-MM-DD`
- `POST` com `Content-Type: text/plain` para registrar uma escola:

  ```json
  {
    "action": "registerSchool",
    "request": {
      "spreadsheetId": "ID_PRIVADO",
      "schoolId": "SCHOOL_ID",
      "revision": "REVISAO_PUBLICADA"
    }
  }
  ```

- `POST` com `Content-Type: text/plain` para reservar:

  ```json
  {
    "action": "createReservation",
    "school": "SCHOOL_ID",
    "request": {}
  }
  ```

`serviceInfo` responde com:

```json
{
  "ok": true,
  "data": {
    "backendAccountEmail": "backend@escola.edu.br",
    "googleChatConfigured": true
  }
}
```

Toda resposta usa `{"ok":true,"data":...}` ou
`{"ok":false,"error":{"code":"...","message":"..."}}`. O ContentService
não permite controlar status HTTP nem cabeçalhos CORS; por isso o cliente deve
avaliar `ok`. `text/plain` evita preflight no POST feito pelo navegador.

## Limites

A criação de reservas e a solicitação de registro chegam a um Web App público e não
possuem limitação de taxa nativa. O registro não permite trocar vínculos, mas um
agente pode consumir cotas criando planilhas próprias e tentando registrá-las. Para
um piloto, monitore cotas, Script Properties e novas linhas em `RESERVAS`. Antes de
abrir o serviço amplamente, proteja a implantação com rate limiting e mitigação de
automação.

Cada conversa direta também está sujeita às cotas da Google Chat API. O envio de
mensagens é intencionalmente best-effort; consulte os logs do Apps Script para
diagnosticar respostas HTTP da autenticação ou do Chat sem expor tokens nas respostas
públicas.

Script Properties possuem cota total e o `LockService` é compartilhado por todas as
escolas desta implantação. Esse registro é adequado ao piloto e a um número moderado
de escolas; crescimento maior exige um registro externo e um backend com isolamento
de cota por tenant.
