# Arquitetura — Fase 1

## Princípios

1. O Google Sheets será a fonte oficial quando o backend for conectado.
2. O navegador nunca acessa Sheets ou Calendar diretamente.
3. Componentes React não conhecem `google.script.run`.
4. Datas de calendário são strings ISO sem conversão UTC implícita.
5. Regras puras são testadas separadamente de leitura e escrita.
6. Uma única base de código atende todas as escolas.

## Fluxo de dados

```text
Página/componente
  → BootstrapContext ou BackendClient
    → MockBackend (desenvolvimento local)
```

Na Fase 1, o factory em `src/services/backend.ts` seleciona somente o mock. A Fase 2 adicionará `GoogleScriptBackend`, que implementará o mesmo contrato e delegará às funções públicas do Apps Script.

## Bootstrap

O shell da aplicação aparece antes da resposta do servidor. `BootstrapProvider` busca somente dados relativamente estáveis e cancela atualizações obsoletas durante desmontagem ou dupla execução do `StrictMode`.

O bootstrap não contém reservas. Consultas de agenda usam `getAvailability({ laboratoryId, date })`; a página de reservas usa `getMyReservations(userId)`.

## Parâmetro do QR Code

No Apps Script, `doGet(e)` transformará `e.parameter.lab` em:

```js
window.APP_BOOTSTRAP = {
  preselectedLaboratoryId: 'LAB01',
  applicationVersion: '...',
};
```

O frontend valida a existência do laboratório no bootstrap. O QR Code transporta apenas a URL do Web App, nunca configurações ou dados da escola.

## Separação de responsabilidades

- `app/`: ciclo de vida, roteamento e shell global;
- `components/`: peças reutilizáveis sem regra de negócio;
- `features/`: apresentação específica de laboratórios, disponibilidade e reservas;
- `pages/`: composição das jornadas;
- `services/`: fronteira com o backend;
- `domain/`: cálculos puros de horário;
- `utils/`: parsing de data e schemas compartilhados;
- `types/`: contratos serializáveis entre frontend e backend.

## Build para Apps Script

Na Fase 1, o build produz `dist/` com caminhos relativos, um bundle JS principal e um CSS. Na Fase 2, um script Node lerá esses artefatos e criará `apps-script/Index.html`, incorporando ambos para publicação com `HtmlService`.

## Limites do mock

O `MockBackend` serve para desenvolver e testar a interface. Ele simula latência, respostas e alguns erros de domínio, mas não substitui:

- releitura transacional da planilha;
- `ScriptLock`;
- validação de autorização;
- quantidade de materiais em manutenção;
- integração com Google Agenda;
- logs técnicos.

Essas garantias serão implementadas e testadas no Apps Script nas fases próprias.
