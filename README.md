# PokerProfitMTT — Login Supabase

Versão inicial com login, cadastro, recuperação de senha e proteção de acesso ao dashboard usando Supabase Auth.

## Instalação no Google Antigravity
1. Extraia este ZIP e abra a pasta no Antigravity.
2. Execute `npm install`.
3. Crie um projeto em https://supabase.com/dashboard.
4. No Supabase, copie **Project URL** e a **publishable key** (ou anon public key).
5. Copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-publica
   ```
6. No Supabase > Authentication > Providers, habilite Email.
7. Em Authentication > URL Configuration, configure Site URL para `http://localhost:5173` durante desenvolvimento e adicione a URL de produção depois.
8. Execute `npm run dev`.

## Funcionalidades
- Login com e-mail e senha.
- Cadastro de usuário com confirmação por e-mail, se habilitada no Supabase.
- Recuperação de senha: solicita link por e-mail. **O formulário para definir uma nova senha após abrir o link ainda precisa ser implementado.**
- Sessão persistente com Supabase Auth.
- Logout.
- Dashboard protegido contra usuários não autenticados.

## Importante
- **Os dados de torneios ainda são salvos no localStorage e NÃO estão isolados por usuário.** A autenticação protege a navegação, mas não é ainda uma solução multiusuário segura para dados financeiros. A próxima etapa obrigatória é migrar torneios, sites e bankroll para tabelas do Supabase com RLS por `auth.uid()`.
- Não coloque `service_role` ou chaves secretas no frontend.
- A tela de login só permite autenticação após configurar `.env`.
- Para produção, adicionar fluxo completo de redefinição de senha e validações.

## Ajustes da versão 2
- Primeiro acesso sem torneios, sites ou bankroll fictícios.
- Cada usuário autenticado tem chaves de armazenamento local separadas por ID do Supabase.
- Primeiro acesso abre Perfil e exige nome e pelo menos um site antes de entrar no Dashboard.
- Nome da navegação alterado para Perfil.
- Dashboard tem período personalizado com calendário único: primeiro clique escolhe início, segundo escolhe fim.
- Cards reagem ao movimento do mouse em direção contrária.
- Busca digitável de sites com filtragem das opções no modal de torneios.
- Interface e campos aprimorados.

**ATENÇÃO**: continua sendo um protótipo com dados locais, sem banco remoto de torneios e sem sincronização entre dispositivos. Para produção, migrar para Supabase com RLS. A tentativa de instalar dependências neste ambiente não terminou dentro do tempo disponível; execute `npm install` e `npm run build` no Antigravity e corrija eventuais erros reportados.

## Versão 4 — padrões globais de entrada
- Novo torneio inicia com **site vazio** e **Buy-in vazio**.
- Rótulo **Buy-in**, sem "(BI)".
- Site usa campo digitável com sugestões integradas no fluxo do formulário (não sobrepõem campos). Botão de busca abre modal de opções.
- Moeda utiliza botões de seleção em vez de `select` nativo.
- Valores numéricos usam controles personalizados `−` e `+`, consistentes com o tema.
- Reutilize os componentes `SearchPicker` e `NumberField` em novos formulários.
- O projeto continua exigindo configuração Supabase e ainda guarda dados financeiros localmente.

## Versão 5 — Financeiro e correção do dashboard
- Nova aba Financeiro, abaixo de Torneios, com depósitos e saques.
- Histórico persistido no armazenamento local por ID do usuário Supabase.
- Movimentações financeiras alteram somente bankroll; não entram no ROI, lucro, ABI ou número de torneios.
- ROI e lucro realizado incluem apenas torneios encerrados; torneios abertos já descontam investimento do bankroll.
- Ao encerrar um torneio, os indicadores são recalculados automaticamente a partir do estado React.
- Entrada numérica aceita digitação direta (incluindo decimais com vírgula), além dos controles + e −.
- Exportação Excel inclui aba Financeiro.

**Limitações:** dados de torneios e movimentações continuam locais no navegador. Ainda é necessário implementar tabelas Supabase e RLS antes do uso multiusuário em produção.

## V6 — Lembrar e-mail no login
- Checkbox opcional “Lembrar meu e-mail neste dispositivo” na tela de login.
- Quando marcado, o e-mail é salvo após login bem-sucedido e preenchido automaticamente no próximo acesso.
- Desmarcar apaga o e-mail salvo imediatamente.
- A senha nunca é salva no localStorage pelo aplicativo. O navegador pode oferecer seu gerenciador de senhas padrão (`autocomplete`).
- O Supabase Auth já mantém a sessão ativa (`persistSession: true`), inclusive após fechar e reabrir o navegador, até o logout ou invalidação da sessão.

## Versão 7 — cartões e moeda
- Clique no cartão **Bankroll atual** do Dashboard ou Financeiro para selecionar BRL ou USD.
- A seleção é salva nas preferências locais e reflete em todas as telas.
- **Não existe conversão cambial:** a opção altera a moeda de referência dos registros, não recalcula quantias em outra moeda.
- Todos os cartões estatísticos do Dashboard e os três cartões de Financeiro compartilham efeito 3D responsivo à posição do mouse, com iluminação localizada.
- O efeito é desabilitado para usuários com preferência de movimento reduzido.

## V8 — alternância rápida de moedas
- Clique no card Bankroll do Dashboard ou Financeiro: alterna imediatamente para a próxima moeda cadastrada, sem modal.
- Perfil: lista moedas ativas, permite selecionar, remover (exceto última) e adicionar pesquisando por nome/código/símbolo.
- Compatível com preferências anteriores (BRL/USD).
- IMPORTANTE: não há conversão cambial ou carteiras separadas; alternar troca somente o formato/unidade exibida, não o valor numérico.

## Versão 9 — Conversão pela cotação online
- Ao selecionar ou alternar moeda, consulta a API Frankfurter v2 (`https://api.frankfurter.dev/v2/rate/brl/{moeda}`), sem chave.
- Todos os valores financeiros exibidos no Dashboard, Financeiro e tabelas de torneios usam a mesma taxa consultada, e a data da cotação é mostrada.
- Os dados originais são preservados em **BRL**, que é a moeda-base desta versão. Trocar moeda **não altera** os lançamentos armazenados.
- Se a cotação falhar, os valores convertidos não são exibidos (traço), e há opção para retornar a BRL. Nunca usa uma taxa inventada.
- As cotações são de referência, atualizadas conforme disponibilidade da fonte, normalmente diariamente; **não são taxas de execução de câmbio em tempo real**.
- **Importante:** esta versão assume que os lançamentos históricos foram feitos em BRL. Se os registros existentes forem em outra moeda, eles precisam de migração de moeda de origem antes de usar os resultados convertidos.
- Para operação com múltiplas moedas reais, o ideal é salvar `currency` e `fx_rate_at_transaction` em cada lançamento no Supabase e calcular a banca numa moeda contábil definida.

## Versão 10 — moeda de registro configurável
- Em Perfil, selecione uma das moedas cadastradas como **moeda de registro**.
- Para contas sem lançamentos, a moeda de registro muda imediatamente.
- Com lançamentos existentes, a alteração pede confirmação e consulta a cotação online para converter banca inicial, buy-ins, addons, prêmios, depósitos e saques; o valor é arredondado a 2 casas. Faça backup antes.
- A moeda de registro não pode ser removida da lista de moedas.
- Campos de entrada mostram a moeda de registro; a moeda de exibição continua alternável pelo card do bankroll.
- A informação da cotação sai do topo do conteúdo e aparece discretamente no rodapé.
- A fonte usa cotações de referência, não taxa de transação em tempo real.
- Atenção: mudanças da moeda de registro com dados existentes podem causar pequenas diferenças de arredondamento; histórico de cotação por transação ainda não foi implementado.

## V11 — Desfazer
O botão Desfazer é exibido por 7 segundos após cada alteração de torneio. Após o prazo, desaparece e a ação de desfazer é descartada. Uma nova alteração reinicia a contagem.


## V12 — Correção do ABI
O ABI agora é calculado como investimento total (buy-ins + rebuys + addons) dividido pelo total de entradas (1 entrada inicial por torneio + quantidade de rebuys). Exemplo: torneio 10 + torneio 1 com 2 rebuys = 13 / 4 = 3,25. O número de torneios permanece 2. Addon é custo adicional, não entrada extra.
