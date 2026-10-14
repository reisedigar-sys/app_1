# Modelos de mensagem do WhatsApp (semana 7)

Cadastre cada modelo no WhatsApp Manager (*Gerenciador do WhatsApp → Modelos de mensagem → Criar modelo*) com:
- **Categoria:** Utilidade. **Idioma:** Português (BR). **Nome:** exatamente o da tabela (o worker envia por ele).
- **Corpo:** o texto abaixo, igual, com as variáveis `{{1}}`, `{{2}}`… A Meta pede um exemplo para cada variável.
- Sem cabeçalho, rodapé ou botões.

O texto vem de `public.modelo_mensagem` (migração 012) e é o mesmo que o painel mostra em *Mensagens*. Mudar um texto
exige um modelo novo aprovado na Meta e uma migração; `tests/db/mensagens.test.ts` confere este arquivo com o banco.

## `hp_aviso_loja_sem_confirmacao`

Aviso à loja: o tutor não confirmou.

```text
Hora do Pet: {{1}} ({{2}}) não confirmou {{3}}, {{4}}. Veja a agenda no painel.
```

Exemplos: `{{1}}` = Ana Souza; `{{2}}` = +5511988880001; `{{3}}` = Thor e Mel; `{{4}}` = qui, 16/10 às 10:00

## `hp_cancelado_loja`

A loja cancelou o agendamento.

```text
Olá! {{1}}: o agendamento de {{2}}, {{3}}, foi cancelado pela loja. Para agendar de novo: {{4}}

Para não receber mais avisos, responda PARAR.
```

Exemplos: `{{1}}` = Pet Feliz Centro; `{{2}}` = Thor; `{{3}}` = qui, 16/10 às 10:00; `{{4}}` = https://hora-do-pet.vercel.app/pet-feliz-centro

## `hp_confirmacao`

Agendamento recebido ou remarcado, com o link.

```text
Olá! {{1}}: agendamento {{2}} para {{3}}, {{4}}. Para confirmar, remarcar ou cancelar: {{5}}

Para não receber mais avisos, responda PARAR.
```

Exemplos: `{{1}}` = Pet Feliz Centro; `{{2}}` = recebido; `{{3}}` = Thor e Mel; `{{4}}` = qui, 16/10 às 10:00; `{{5}}` = https://hora-do-pet.vercel.app/c/7f3a

## `hp_lembrete_antes`

Lembrete algumas horas antes.

```text
Olá! {{1}}: esperamos {{2}} às {{3}}. Precisa mudar? {{4}}

Para não receber mais avisos, responda PARAR.
```

Exemplos: `{{1}}` = Pet Feliz Centro; `{{2}}` = Thor e Mel; `{{3}}` = 10:00; `{{4}}` = https://hora-do-pet.vercel.app/c/7f3a

## `hp_lembrete_vespera`

Lembrete da véspera, pedindo confirmação.

```text
Olá! {{1}}: lembrete de amanhã, {{2}}, para {{3}}. Confirme sua presença: {{4}}

Para não receber mais avisos, responda PARAR.
```

Exemplos: `{{1}}` = Pet Feliz Centro; `{{2}}` = qui, 16/10 às 10:00; `{{3}}` = Thor e Mel; `{{4}}` = https://hora-do-pet.vercel.app/c/7f3a

## `hp_lembrete_vespera_confirmado`

Lembrete da véspera, já confirmado.

```text
Olá! {{1}}: até amanhã! {{2}}, {{3}}. Precisa mudar? {{4}}

Para não receber mais avisos, responda PARAR.
```

Exemplos: `{{1}}` = Pet Feliz Centro; `{{2}}` = Thor e Mel; `{{3}}` = qui, 16/10 às 10:00; `{{4}}` = https://hora-do-pet.vercel.app/c/7f3a

## `hp_liberado_sem_confirmacao`

Horário liberado por falta de confirmação.

```text
Olá! {{1}}: o horário de {{2}}, {{3}}, foi liberado porque não recebemos a confirmação. Para agendar de novo: {{4}}

Para não receber mais avisos, responda PARAR.
```

Exemplos: `{{1}}` = Pet Feliz Centro; `{{2}}` = Thor; `{{3}}` = qui, 16/10 às 10:00; `{{4}}` = https://hora-do-pet.vercel.app/pet-feliz-centro

## `hp_pet_pronto`

Pet pronto para buscar.

```text
Olá! {{1}}: {{2}} está pronto! Pode vir buscar.

Para não receber mais avisos, responda PARAR.
```

Exemplos: `{{1}}` = Pet Feliz Centro; `{{2}}` = Thor

## `hp_vaga_lista_espera`

Vaga para quem está na lista de espera.

```text
Olá! {{1}}: abriu horário em {{2}} ({{3}}) para {{4}}. Quem agendar primeiro leva a vaga: {{5}}

Para não receber mais avisos, responda PARAR.
```

Exemplos: `{{1}}` = Pet Feliz Centro; `{{2}}` = 16/10; `{{3}}` = manhã; `{{4}}` = Thor; `{{5}}` = https://hora-do-pet.vercel.app/pet-feliz-centro/agendar
