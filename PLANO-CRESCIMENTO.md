# Plano de crescimento — Meta 1

Decidido pelo dono do produto em 14/10/2026. Os números financeiros (preços, custos, margem e receita) ficam no
documento interno do projeto, fora deste repositório público.

## A meta
**Cerca de 240 petshops pagando**, por volta de 18 meses depois do fim do piloto. É o número que torna o Hora do Pet
sustentável. Toda prioridade de produto, qualidade e divulgação é decidida por quanto ela aproxima a meta.

| Marco | Lojas pagando | Quando (a partir do fim do piloto) |
| --- | --- | --- |
| Pilotos convertidos | 2 a 3 | mês 1 |
| Lojas fundadoras completas | 10 | mês 3 |
| Fim da Fase 3 | 30 | mês 6 |
| Tração | 100 | mês 12 |
| **Meta 1** | **240** | **mês 18** |

Do mês 6 em diante são cerca de 20 lojas líquidas por mês. Como algumas lojas cancelam (hipótese de 3% ao mês),
isso significa cerca de 25 contratos novos por mês.

### Indicadores acompanhados todo mês
- Lojas pagando, contratos novos e cancelamentos.
- Ativação: loja com agendamentos online toda semana no primeiro mês.
- Parte dos agendamentos que chega online (app, WhatsApp) em vez de balcão.
- Faltas evitadas (sempre como estimativa, ver semana 10) e confirmações após lembrete.
- Custo para conquistar cada loja e tempo até ela se pagar.

## Frente 1 — Roadmap de recursos que vendem
O critério é simples: o recurso faz uma loja assinar, subir de plano ou deixar de cancelar?

1. **Prova de resultado**: painel de resultados ("faltas evitadas", ocupação, semana 10) é o principal argumento de
   venda e de renovação. Entra no plano Padrão.
2. **Preço claro e página que vende**: simulador de preço na página da loja, prévia do link para WhatsApp e
   Instagram, dados para o Google (entre as semanas 6 e 7) e kit de divulgação com QR code (semana 9).
3. **Trocar de sistema sem dor**: importar clientes e pets de planilha ou do sistema anterior (Fase 3). Sem isso,
   cada loja nova custa horas de cadastro.
4. **Onboarding sozinho e cobrança automática** (Fase 3): 25 lojas novas por mês não cabem em implantação feita à mão.
5. **Diferenciais da Fase 2** na ordem do PLANO-MVP (retorno automático, financeiro leve, fotos, pacotes, horários
   ociosos), reavaliados com o que os pilotos pedirem. Vários entram só no plano Movimento.
6. **Rede com várias unidades** como vitrine para contas maiores (já existe no produto).

## Frente 2 — Qualidade e consistência
Loja que perde agendamento por erro cancela e fala mal. A meta exige que o produto seja confiável sem o dono olhando.

- **Monitoramento e alertas** (Sentry, worker de notificações, falhas de envio) e backup diário (semana 9).
- **Meta de disponibilidade** de 99,5% no horário comercial, com página de status simples.
- **Suporte com prazo**: resposta no mesmo dia útil pelo WhatsApp do Hora do Pet; base de respostas para as dúvidas
  repetidas.
- **Ritmo de entrega**: tudo por PR com `pnpm check` verde, staging antes de produção, sem pular testes.
- **Desempenho**: manter as consultas de agenda abaixo de 25 ms (p95) conforme o número de lojas cresce.
- **LGPD**: consentimento, exclusão de dados e política de privacidade revisados antes de escalar.
- Uma semana de "consistência" a cada quatro semanas de recursos, para corrigir o que os pilotos encontrarem.

## Frente 3 — Campanha e divulgação (regional, depois nacional)
1. **Regional primeiro**: concentrar na cidade dos pilotos. Lojas próximas geram indicação e, mais tarde, a
   densidade que o marketplace (Fase 4) precisa.
2. **Casos com números**: cada piloto vira um caso ("faltas caíram de X para Y"), com autorização da loja.
3. **Página de vendas do Hora do Pet** para petshops, com planos e preços, demonstração e teste (Fase 3).
4. **Indicação**: loja que indica outra ganha desconto; rodapé "Agendamento pelo Hora do Pet" na página de cada
   loja, levando à página de vendas.
5. **Canais pagos e conteúdo**: anúncios para donos de petshop na região (Meta e Google), conteúdo sobre como
   reduzir faltas no banho e tosa, e parcerias com distribuidores, associações e feiras do setor.
6. **Nacional** quando o custo por loja conquistada estiver medido e abaixo de 3 mensalidades.

Funil a medir (hipóteses iniciais): cerca de 300 contatos qualificados → 60 demonstrações → 25 contratos por mês.

## Como isso muda o roadmap
- **Fase 1 (MVP)** e **Fase 2** continuam como no PLANO-MVP, com o painel de resultados no começo da Fase 2.
- **Fase 3** ganha importação de clientes, página de vendas e programa de indicação, além do que já tinha.
- **Meta 1 (meses 6 a 18)**: crescimento até 240 lojas, com as três frentes acima rodando em paralelo.
- **Fase 4 (marketplace)** passa a depender de densidade regional de lojas, que é consequência da Meta 1.
