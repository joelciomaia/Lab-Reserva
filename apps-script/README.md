# Backend Apps Script

Web App público que usa exclusivamente a planilha definida na Script Property
`SPREADSHEET_ID`. Não há dados de demonstração nem fallback em memória.

## Implantação com clasp

1. Crie um projeto independente em <https://script.google.com>.
2. Copie `.clasp.json.example` para `.clasp.json` e informe o ID do projeto.
3. Dentro desta pasta, execute `clasp login` e `clasp push`.
4. Em **Configurações do projeto > Propriedades do script**, crie
   `SPREADSHEET_ID` com apenas o ID da planilha.
5. Implante como **Aplicativo da Web**, executando como o proprietário e com acesso
   para qualquer pessoa. Em uma atualização, crie uma nova versão da implantação.

O proprietário do script precisa ter permissão de edição na planilha. `RESERVAS`
é imutável e recebe uma linha por reserva. O script acrescenta a coluna
`AULAS_HORARIOS` ao cabeçalho legado sem regravar reservas. `CANCELAMENTOS` é
criada com uma linha por aula cancelada; o par `RESERVA_ID` + `AULA_ID` libera
somente aquela aula. Não existe endpoint público de cancelamento ou administração.
A disponibilidade pública informa apenas se a aula está livre e, quando ocupada, o
ID técnico necessário para agrupar os períodos da mesma reserva. Nome do professor,
turma e disciplina não são expostos nesse endpoint.

O bootstrap retorna `sourceSpreadsheetFingerprint`, um SHA-256 com namespace do
ID da planilha configurada. Esse valor permite diagnosticar o vínculo sem expor o
ID original, tokens ou credenciais. O link e o QR Code são liberados assim que o
painel confirma a gravação no Sheets; a disponibilidade do Web App não bloqueia o
download. Sempre que `SPREADSHEET_ID` mudar, publique uma nova versão do Web App.

## API

- `GET ?action=bootstrap&lab=LAB_ID`
- `GET ?action=availability&laboratoryId=LAB_ID&date=AAAA-MM-DD`
- `POST` com `Content-Type: text/plain`:
  `{"action":"createReservation","request":{...}}`

Toda resposta usa `{"ok":true,"data":...}` ou
`{"ok":false,"error":{"code":"...","message":"..."}}`. O ContentService
não permite controlar status HTTP nem cabeçalhos CORS; por isso o cliente deve
avaliar `ok`. `text/plain` evita preflight no POST feito pelo navegador.

## Limite do endpoint público

A criação de reservas é pública e não possui autenticação nem limitação de taxa
nativas. Para um piloto, monitore as cotas do Apps Script e novas linhas em
`RESERVAS`. Antes de divulgar o link amplamente, proteja a implantação com uma
camada que ofereça limitação de taxa e mitigação de automação; isso não é fornecido
por este Web App.
