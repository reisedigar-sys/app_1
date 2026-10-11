export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      agendamento: {
        Row: {
          buffer_minutos: number;
          canal: Database["public"]["Enums"]["canal_agendamento"];
          cancelado_em: string | null;
          criado_em: string;
          encaixe: boolean;
          fim: string;
          id: string;
          inicio: string;
          observacoes: string | null;
          ocupado: unknown;
          pedido_id: string;
          pet_id: string;
          petshop_id: string;
          preco_total_centavos: number;
          profissional_id: string;
          status: Database["public"]["Enums"]["status_agendamento"];
          tutor_id: string;
        };
        ComputedFields: never;
        Insert: {
          buffer_minutos: number;
          canal: Database["public"]["Enums"]["canal_agendamento"];
          cancelado_em?: string | null;
          criado_em?: string;
          encaixe?: boolean;
          fim: string;
          id?: string;
          inicio: string;
          observacoes?: string | null;
          ocupado: unknown;
          pedido_id: string;
          pet_id: string;
          petshop_id: string;
          preco_total_centavos?: number;
          profissional_id: string;
          status?: Database["public"]["Enums"]["status_agendamento"];
          tutor_id: string;
        };
        Update: {
          buffer_minutos?: number;
          canal?: Database["public"]["Enums"]["canal_agendamento"];
          cancelado_em?: string | null;
          criado_em?: string;
          encaixe?: boolean;
          fim?: string;
          id?: string;
          inicio?: string;
          observacoes?: string | null;
          ocupado?: unknown;
          pedido_id?: string;
          pet_id?: string;
          petshop_id?: string;
          preco_total_centavos?: number;
          profissional_id?: string;
          status?: Database["public"]["Enums"]["status_agendamento"];
          tutor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agendamento_pedido_id_petshop_id_fkey";
            columns: ["pedido_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "pedido";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "agendamento_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pet";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agendamento_profissional_id_petshop_id_fkey";
            columns: ["profissional_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "agendamento_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
      agendamento_item: {
        Row: {
          agendamento_id: string;
          duracao_minutos: number;
          id: string;
          ordem: number;
          petshop_id: string;
          preco_centavos: number;
          servico_id: string;
        };
        ComputedFields: never;
        Insert: {
          agendamento_id: string;
          duracao_minutos: number;
          id?: string;
          ordem?: number;
          petshop_id: string;
          preco_centavos: number;
          servico_id: string;
        };
        Update: {
          agendamento_id?: string;
          duracao_minutos?: number;
          id?: string;
          ordem?: number;
          petshop_id?: string;
          preco_centavos?: number;
          servico_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agendamento_item_agendamento_id_petshop_id_fkey";
            columns: ["agendamento_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "agendamento";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "agendamento_item_servico_id_petshop_id_fkey";
            columns: ["servico_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "servico";
            referencedColumns: ["id", "petshop_id"];
          },
        ];
      };
      avaliacao: {
        Row: {
          agendamento_id: string;
          comentario: string | null;
          criado_em: string;
          id: string;
          nota: number;
          petshop_id: string;
          profissional_id: string;
          tutor_id: string;
        };
        ComputedFields: never;
        Insert: {
          agendamento_id: string;
          comentario?: string | null;
          criado_em?: string;
          id?: string;
          nota: number;
          petshop_id: string;
          profissional_id: string;
          tutor_id: string;
        };
        Update: {
          agendamento_id?: string;
          comentario?: string | null;
          criado_em?: string;
          id?: string;
          nota?: number;
          petshop_id?: string;
          profissional_id?: string;
          tutor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "avaliacao_agendamento_id_petshop_id_fkey";
            columns: ["agendamento_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "agendamento";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "avaliacao_profissional_id_petshop_id_fkey";
            columns: ["profissional_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "avaliacao_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
      bloqueio: {
        Row: {
          criado_em: string;
          id: string;
          motivo: string | null;
          periodo: unknown;
          petshop_id: string;
          profissional_id: string | null;
          tipo: Database["public"]["Enums"]["tipo_bloqueio"];
        };
        ComputedFields: never;
        Insert: {
          criado_em?: string;
          id?: string;
          motivo?: string | null;
          periodo: unknown;
          petshop_id: string;
          profissional_id?: string | null;
          tipo?: Database["public"]["Enums"]["tipo_bloqueio"];
        };
        Update: {
          criado_em?: string;
          id?: string;
          motivo?: string | null;
          periodo?: unknown;
          petshop_id?: string;
          profissional_id?: string | null;
          tipo?: Database["public"]["Enums"]["tipo_bloqueio"];
        };
        Relationships: [
          {
            foreignKeyName: "bloqueio_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bloqueio_profissional_id_petshop_id_fkey";
            columns: ["profissional_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id", "petshop_id"];
          },
        ];
      };
      categoria_servico: {
        Row: {
          id: string;
          nome: string;
          ordem: number;
          petshop_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          nome: string;
          ordem?: number;
          petshop_id: string;
        };
        Update: {
          id?: string;
          nome?: string;
          ordem?: number;
          petshop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categoria_servico_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
        ];
      };
      horario_trabalho: {
        Row: {
          dia_semana: number;
          fim: string;
          id: string;
          inicio: string;
          petshop_id: string;
          profissional_id: string;
          servico_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          dia_semana: number;
          fim: string;
          id?: string;
          inicio: string;
          petshop_id: string;
          profissional_id: string;
          servico_id?: string | null;
        };
        Update: {
          dia_semana?: number;
          fim?: string;
          id?: string;
          inicio?: string;
          petshop_id?: string;
          profissional_id?: string;
          servico_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "horario_trabalho_profissional_id_petshop_id_fkey";
            columns: ["profissional_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "horario_trabalho_servico_id_petshop_id_fkey";
            columns: ["servico_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "servico";
            referencedColumns: ["id", "petshop_id"];
          },
        ];
      };
      lista_espera: {
        Row: {
          criado_em: string;
          data: string;
          id: string;
          notificado_em: string | null;
          periodo: Database["public"]["Enums"]["periodo_dia"];
          pet_id: string;
          petshop_id: string;
          profissional_id: string | null;
          servico_id: string;
          status: Database["public"]["Enums"]["status_lista_espera"];
          tutor_id: string;
        };
        ComputedFields: never;
        Insert: {
          criado_em?: string;
          data: string;
          id?: string;
          notificado_em?: string | null;
          periodo?: Database["public"]["Enums"]["periodo_dia"];
          pet_id: string;
          petshop_id: string;
          profissional_id?: string | null;
          servico_id: string;
          status?: Database["public"]["Enums"]["status_lista_espera"];
          tutor_id: string;
        };
        Update: {
          criado_em?: string;
          data?: string;
          id?: string;
          notificado_em?: string | null;
          periodo?: Database["public"]["Enums"]["periodo_dia"];
          pet_id?: string;
          petshop_id?: string;
          profissional_id?: string | null;
          servico_id?: string;
          status?: Database["public"]["Enums"]["status_lista_espera"];
          tutor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lista_espera_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pet";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lista_espera_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lista_espera_profissional_id_petshop_id_fkey";
            columns: ["profissional_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "lista_espera_servico_id_petshop_id_fkey";
            columns: ["servico_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "servico";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "lista_espera_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
      mensagem_log: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_mensagem"];
          conteudo: Json | null;
          criado_em: string;
          custo_centavos: number | null;
          destino: string | null;
          direcao: string;
          erro: string | null;
          id: string;
          notificacao_id: string | null;
          petshop_id: string;
          provedor: string;
          provedor_mensagem_id: string | null;
          status: string;
          tutor_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_mensagem"];
          conteudo?: Json | null;
          criado_em?: string;
          custo_centavos?: number | null;
          destino?: string | null;
          direcao: string;
          erro?: string | null;
          id?: string;
          notificacao_id?: string | null;
          petshop_id: string;
          provedor?: string;
          provedor_mensagem_id?: string | null;
          status: string;
          tutor_id?: string | null;
        };
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_mensagem"];
          conteudo?: Json | null;
          criado_em?: string;
          custo_centavos?: number | null;
          destino?: string | null;
          direcao?: string;
          erro?: string | null;
          id?: string;
          notificacao_id?: string | null;
          petshop_id?: string;
          provedor?: string;
          provedor_mensagem_id?: string | null;
          status?: string;
          tutor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mensagem_log_notificacao_id_fkey";
            columns: ["notificacao_id"];
            isOneToOne: false;
            referencedRelation: "notificacao_agendada";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mensagem_log_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mensagem_log_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
      notificacao_agendada: {
        Row: {
          agendamento_id: string | null;
          categoria: Database["public"]["Enums"]["categoria_mensagem"];
          criado_em: string;
          enviada_em: string | null;
          enviar_em: string;
          id: string;
          max_tentativas: number;
          pedido_id: string | null;
          petshop_id: string;
          status: Database["public"]["Enums"]["status_notificacao"];
          tentativas: number;
          tipo: Database["public"]["Enums"]["tipo_notificacao"];
          tutor_id: string | null;
          ultimo_erro: string | null;
        };
        ComputedFields: never;
        Insert: {
          agendamento_id?: string | null;
          categoria?: Database["public"]["Enums"]["categoria_mensagem"];
          criado_em?: string;
          enviada_em?: string | null;
          enviar_em: string;
          id?: string;
          max_tentativas?: number;
          pedido_id?: string | null;
          petshop_id: string;
          status?: Database["public"]["Enums"]["status_notificacao"];
          tentativas?: number;
          tipo: Database["public"]["Enums"]["tipo_notificacao"];
          tutor_id?: string | null;
          ultimo_erro?: string | null;
        };
        Update: {
          agendamento_id?: string | null;
          categoria?: Database["public"]["Enums"]["categoria_mensagem"];
          criado_em?: string;
          enviada_em?: string | null;
          enviar_em?: string;
          id?: string;
          max_tentativas?: number;
          pedido_id?: string | null;
          petshop_id?: string;
          status?: Database["public"]["Enums"]["status_notificacao"];
          tentativas?: number;
          tipo?: Database["public"]["Enums"]["tipo_notificacao"];
          tutor_id?: string | null;
          ultimo_erro?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notificacao_agendada_agendamento_id_petshop_id_fkey";
            columns: ["agendamento_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "agendamento";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "notificacao_agendada_pedido_id_petshop_id_fkey";
            columns: ["pedido_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "pedido";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "notificacao_agendada_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
      pedido: {
        Row: {
          canal: Database["public"]["Enums"]["canal_agendamento"];
          chave_idempotencia: string;
          confirmado_em: string | null;
          criado_em: string;
          criado_por: string | null;
          criado_por_tipo: Database["public"]["Enums"]["criado_por_tipo"];
          id: string;
          petshop_id: string;
          token_confirmacao: string;
          total_centavos: number;
          tutor_id: string;
        };
        ComputedFields: never;
        Insert: {
          canal: Database["public"]["Enums"]["canal_agendamento"];
          chave_idempotencia: string;
          confirmado_em?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          criado_por_tipo: Database["public"]["Enums"]["criado_por_tipo"];
          id?: string;
          petshop_id: string;
          token_confirmacao?: string;
          total_centavos?: number;
          tutor_id: string;
        };
        Update: {
          canal?: Database["public"]["Enums"]["canal_agendamento"];
          chave_idempotencia?: string;
          confirmado_em?: string | null;
          criado_em?: string;
          criado_por?: string | null;
          criado_por_tipo?: Database["public"]["Enums"]["criado_por_tipo"];
          id?: string;
          petshop_id?: string;
          token_confirmacao?: string;
          total_centavos?: number;
          tutor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pedido_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
      pet: {
        Row: {
          alergias: string | null;
          ativo: boolean;
          criado_em: string;
          especie: string;
          foto_url: string | null;
          id: string;
          nascimento: string | null;
          nome: string;
          pelagem: Database["public"]["Enums"]["pelagem"];
          porte: Database["public"]["Enums"]["porte"];
          raca: string | null;
          temperamento: string | null;
          tutor_id: string;
          vacinas: string | null;
        };
        ComputedFields: never;
        Insert: {
          alergias?: string | null;
          ativo?: boolean;
          criado_em?: string;
          especie?: string;
          foto_url?: string | null;
          id?: string;
          nascimento?: string | null;
          nome: string;
          pelagem: Database["public"]["Enums"]["pelagem"];
          porte: Database["public"]["Enums"]["porte"];
          raca?: string | null;
          temperamento?: string | null;
          tutor_id: string;
          vacinas?: string | null;
        };
        Update: {
          alergias?: string | null;
          ativo?: boolean;
          criado_em?: string;
          especie?: string;
          foto_url?: string | null;
          id?: string;
          nascimento?: string | null;
          nome?: string;
          pelagem?: Database["public"]["Enums"]["pelagem"];
          porte?: Database["public"]["Enums"]["porte"];
          raca?: string | null;
          temperamento?: string | null;
          tutor_id?: string;
          vacinas?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pet_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
      pet_petshop: {
        Row: {
          atualizado_em: string;
          observacoes: string | null;
          pet_id: string;
          petshop_id: string;
        };
        ComputedFields: never;
        Insert: {
          atualizado_em?: string;
          observacoes?: string | null;
          pet_id: string;
          petshop_id: string;
        };
        Update: {
          atualizado_em?: string;
          observacoes?: string | null;
          pet_id?: string;
          petshop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_petshop_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pet";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_petshop_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
        ];
      };
      petshop: {
        Row: {
          acao_sem_confirmacao: Database["public"]["Enums"]["acao_sem_confirmacao"];
          antecedencia_minima_minutos: number;
          ativo: boolean;
          bairro: string | null;
          buffer_minutos: number;
          cancelamento_gratuito_horas: number;
          cep: string | null;
          cidade: string | null;
          comissao_marketplace_pct: number;
          confirmar_ate_horas: number;
          criado_em: string;
          fuso: string;
          id: string;
          janela_maxima_dias: number;
          latitude: number | null;
          lembrete_antes_horas: number;
          lembrete_d1_hora: string;
          limite_faltas: number;
          logradouro: string | null;
          longitude: number | null;
          nome: string;
          numero: string | null;
          rede_id: string;
          sinal_percentual: number;
          slot_minutos: number;
          slug: string;
          telefone_e164: string | null;
          uf: string | null;
        };
        ComputedFields: never;
        Insert: {
          acao_sem_confirmacao?: Database["public"]["Enums"]["acao_sem_confirmacao"];
          antecedencia_minima_minutos?: number;
          ativo?: boolean;
          bairro?: string | null;
          buffer_minutos?: number;
          cancelamento_gratuito_horas?: number;
          cep?: string | null;
          cidade?: string | null;
          comissao_marketplace_pct?: number;
          confirmar_ate_horas?: number;
          criado_em?: string;
          fuso?: string;
          id?: string;
          janela_maxima_dias?: number;
          latitude?: number | null;
          lembrete_antes_horas?: number;
          lembrete_d1_hora?: string;
          limite_faltas?: number;
          logradouro?: string | null;
          longitude?: number | null;
          nome: string;
          numero?: string | null;
          rede_id: string;
          sinal_percentual?: number;
          slot_minutos?: number;
          slug: string;
          telefone_e164?: string | null;
          uf?: string | null;
        };
        Update: {
          acao_sem_confirmacao?: Database["public"]["Enums"]["acao_sem_confirmacao"];
          antecedencia_minima_minutos?: number;
          ativo?: boolean;
          bairro?: string | null;
          buffer_minutos?: number;
          cancelamento_gratuito_horas?: number;
          cep?: string | null;
          cidade?: string | null;
          comissao_marketplace_pct?: number;
          confirmar_ate_horas?: number;
          criado_em?: string;
          fuso?: string;
          id?: string;
          janela_maxima_dias?: number;
          latitude?: number | null;
          lembrete_antes_horas?: number;
          lembrete_d1_hora?: string;
          limite_faltas?: number;
          logradouro?: string | null;
          longitude?: number | null;
          nome?: string;
          numero?: string | null;
          rede_id?: string;
          sinal_percentual?: number;
          slot_minutos?: number;
          slug?: string;
          telefone_e164?: string | null;
          uf?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "petshop_rede_id_fkey";
            columns: ["rede_id"];
            isOneToOne: false;
            referencedRelation: "rede";
            referencedColumns: ["id"];
          },
        ];
      };
      petshop_membro: {
        Row: {
          criado_em: string;
          papel: Database["public"]["Enums"]["papel_loja"];
          petshop_id: string;
          profissional_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          criado_em?: string;
          papel: Database["public"]["Enums"]["papel_loja"];
          petshop_id: string;
          profissional_id?: string | null;
          user_id: string;
        };
        Update: {
          criado_em?: string;
          papel?: Database["public"]["Enums"]["papel_loja"];
          petshop_id?: string;
          profissional_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "petshop_membro_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "petshop_membro_profissional_id_petshop_id_fkey";
            columns: ["profissional_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id", "petshop_id"];
          },
        ];
      };
      petshop_whatsapp: {
        Row: {
          ativo: boolean;
          criado_em: string;
          petshop_id: string;
          phone_number_id: string;
          telefone_e164: string;
          waba_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          ativo?: boolean;
          criado_em?: string;
          petshop_id: string;
          phone_number_id: string;
          telefone_e164: string;
          waba_id?: string | null;
        };
        Update: {
          ativo?: boolean;
          criado_em?: string;
          petshop_id?: string;
          phone_number_id?: string;
          telefone_e164?: string;
          waba_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "petshop_whatsapp_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: true;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
        ];
      };
      profissional: {
        Row: {
          ativo: boolean;
          bio: string | null;
          criado_em: string;
          foto_url: string | null;
          id: string;
          nome: string;
          ordem: number;
          petshop_id: string;
        };
        ComputedFields: never;
        Insert: {
          ativo?: boolean;
          bio?: string | null;
          criado_em?: string;
          foto_url?: string | null;
          id?: string;
          nome: string;
          ordem?: number;
          petshop_id: string;
        };
        Update: {
          ativo?: boolean;
          bio?: string | null;
          criado_em?: string;
          foto_url?: string | null;
          id?: string;
          nome?: string;
          ordem?: number;
          petshop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profissional_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
        ];
      };
      profissional_servico: {
        Row: {
          fator_duracao: number;
          petshop_id: string;
          profissional_id: string;
          servico_id: string;
        };
        ComputedFields: never;
        Insert: {
          fator_duracao?: number;
          petshop_id: string;
          profissional_id: string;
          servico_id: string;
        };
        Update: {
          fator_duracao?: number;
          petshop_id?: string;
          profissional_id?: string;
          servico_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profissional_servico_profissional_id_petshop_id_fkey";
            columns: ["profissional_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "profissional";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "profissional_servico_servico_id_petshop_id_fkey";
            columns: ["servico_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "servico";
            referencedColumns: ["id", "petshop_id"];
          },
        ];
      };
      rede: {
        Row: {
          ativo: boolean;
          criado_em: string;
          id: string;
          nome: string;
        };
        ComputedFields: never;
        Insert: {
          ativo?: boolean;
          criado_em?: string;
          id?: string;
          nome: string;
        };
        Update: {
          ativo?: boolean;
          criado_em?: string;
          id?: string;
          nome?: string;
        };
        Relationships: [];
      };
      rede_membro: {
        Row: {
          criado_em: string;
          rede_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          criado_em?: string;
          rede_id: string;
          user_id: string;
        };
        Update: {
          criado_em?: string;
          rede_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rede_membro_rede_id_fkey";
            columns: ["rede_id"];
            isOneToOne: false;
            referencedRelation: "rede";
            referencedColumns: ["id"];
          },
        ];
      };
      servico: {
        Row: {
          ativo: boolean;
          categoria_id: string | null;
          criado_em: string;
          descricao: string | null;
          id: string;
          nome: string;
          ordem: number;
          petshop_id: string;
          tipo: Database["public"]["Enums"]["tipo_servico"];
        };
        ComputedFields: never;
        Insert: {
          ativo?: boolean;
          categoria_id?: string | null;
          criado_em?: string;
          descricao?: string | null;
          id?: string;
          nome: string;
          ordem?: number;
          petshop_id: string;
          tipo: Database["public"]["Enums"]["tipo_servico"];
        };
        Update: {
          ativo?: boolean;
          categoria_id?: string | null;
          criado_em?: string;
          descricao?: string | null;
          id?: string;
          nome?: string;
          ordem?: number;
          petshop_id?: string;
          tipo?: Database["public"]["Enums"]["tipo_servico"];
        };
        Relationships: [
          {
            foreignKeyName: "servico_categoria_id_petshop_id_fkey";
            columns: ["categoria_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "categoria_servico";
            referencedColumns: ["id", "petshop_id"];
          },
          {
            foreignKeyName: "servico_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
        ];
      };
      servico_preco: {
        Row: {
          duracao_minutos: number;
          id: string;
          pelagem: Database["public"]["Enums"]["pelagem"];
          petshop_id: string;
          porte: Database["public"]["Enums"]["porte"];
          preco_centavos: number;
          servico_id: string;
        };
        ComputedFields: never;
        Insert: {
          duracao_minutos: number;
          id?: string;
          pelagem: Database["public"]["Enums"]["pelagem"];
          petshop_id: string;
          porte: Database["public"]["Enums"]["porte"];
          preco_centavos: number;
          servico_id: string;
        };
        Update: {
          duracao_minutos?: number;
          id?: string;
          pelagem?: Database["public"]["Enums"]["pelagem"];
          petshop_id?: string;
          porte?: Database["public"]["Enums"]["porte"];
          preco_centavos?: number;
          servico_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "servico_preco_servico_id_petshop_id_fkey";
            columns: ["servico_id", "petshop_id"];
            isOneToOne: false;
            referencedRelation: "servico";
            referencedColumns: ["id", "petshop_id"];
          },
        ];
      };
      tutor: {
        Row: {
          criado_em: string;
          email: string | null;
          id: string;
          nome: string;
          telefone_e164: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          criado_em?: string;
          email?: string | null;
          id?: string;
          nome: string;
          telefone_e164: string;
          user_id?: string | null;
        };
        Update: {
          criado_em?: string;
          email?: string | null;
          id?: string;
          nome?: string;
          telefone_e164?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tutor_petshop: {
        Row: {
          consentimento_contato_em: string | null;
          consentimento_marketing_em: string | null;
          criado_em: string;
          exige_sinal: boolean;
          faltas: number;
          observacoes: string | null;
          petshop_id: string;
          tutor_id: string;
        };
        ComputedFields: never;
        Insert: {
          consentimento_contato_em?: string | null;
          consentimento_marketing_em?: string | null;
          criado_em?: string;
          exige_sinal?: boolean;
          faltas?: number;
          observacoes?: string | null;
          petshop_id: string;
          tutor_id: string;
        };
        Update: {
          consentimento_contato_em?: string | null;
          consentimento_marketing_em?: string | null;
          criado_em?: string;
          exige_sinal?: boolean;
          faltas?: number;
          observacoes?: string | null;
          petshop_id?: string;
          tutor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tutor_petshop_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tutor_petshop_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_entrada: {
        Row: {
          mensagem_id: string;
          payload: NonNullable<Json>;
          petshop_id: string;
          processado_em: string | null;
          recebido_em: string;
        };
        ComputedFields: never;
        Insert: {
          mensagem_id: string;
          payload: NonNullable<Json>;
          petshop_id: string;
          processado_em?: string | null;
          recebido_em?: string;
        };
        Update: {
          mensagem_id?: string;
          payload?: NonNullable<Json>;
          petshop_id?: string;
          processado_em?: string | null;
          recebido_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_entrada_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_sessao: {
        Row: {
          atendente_solicitado: boolean;
          atualizado_em: string;
          estado: NonNullable<Json>;
          expira_em: string;
          id: string;
          petshop_id: string;
          telefone_e164: string;
          tutor_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          atendente_solicitado?: boolean;
          atualizado_em?: string;
          estado?: NonNullable<Json>;
          expira_em: string;
          id?: string;
          petshop_id: string;
          telefone_e164: string;
          tutor_id?: string | null;
        };
        Update: {
          atendente_solicitado?: boolean;
          atualizado_em?: string;
          estado?: NonNullable<Json>;
          expira_em?: string;
          id?: string;
          petshop_id?: string;
          telefone_e164?: string;
          tutor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessao_petshop_id_fkey";
            columns: ["petshop_id"];
            isOneToOne: false;
            referencedRelation: "petshop";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_sessao_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "tutor";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      adicionar_membro: {
        Args: {
          p_email: string;
          p_papel: Database["public"]["Enums"]["papel_loja"];
          p_petshop_id: string;
          p_profissional_id?: string;
        };
        Returns: string;
      };
      checklist_onboarding: { Args: { p_petshop_id: string }; Returns: Json };
      criar_bloqueio: {
        Args: {
          p_fim: string;
          p_inicio: string;
          p_motivo?: string;
          p_petshop_id: string;
          p_profissional_id?: string;
          p_tipo?: Database["public"]["Enums"]["tipo_bloqueio"];
        };
        Returns: string;
      };
      criar_pedido: {
        Args: {
          p_canal: Database["public"]["Enums"]["canal_agendamento"];
          p_chave_idempotencia: string;
          p_encaixe?: boolean;
          p_inicio: string;
          p_itens: Json;
          p_observacoes?: string;
          p_petshop_id: string;
          p_profissional_id?: string;
          p_tutor_id: string;
        };
        Returns: Json;
      };
      criar_rede_e_loja: {
        Args: { p_fuso?: string; p_loja_nome: string; p_rede_nome: string; p_slug: string };
        Returns: string;
      };
      dias_com_vaga: {
        Args: { p_itens: Json; p_mes: string; p_petshop_id: string; p_profissional_id?: string };
        Returns: {
          dia: string;
        }[];
      };
      horarios_do_dia: {
        Args: { p_data: string; p_itens: Json; p_petshop_id: string; p_profissional_id?: string };
        Returns: {
          hora: string;
          inicio: string;
          profissionais: string[];
          retirada_estimada: string;
        }[];
      };
      listar_equipe: {
        Args: { p_petshop_id: string };
        Returns: {
          email: string;
          papel: Database["public"]["Enums"]["papel_loja"];
          profissional_id: string;
          user_id: string;
        }[];
      };
      profissionais_disponiveis: {
        Args: { p_inicio: string; p_itens: Json; p_petshop_id: string };
        Returns: {
          bio: string;
          foto_url: string;
          nome: string;
          profissional_id: string;
          retirada_estimada: string;
        }[];
      };
      timemultirange: { Args: Record<PropertyKey, never>; Returns: unknown };
    };
    Enums: {
      acao_sem_confirmacao: "avisar_loja" | "liberar_horario";
      canal_agendamento: "app_proprio" | "marketplace" | "balcao" | "whatsapp";
      categoria_mensagem: "utilidade" | "marketing" | "servico";
      criado_por_tipo: "tutor" | "equipe" | "bot_whatsapp" | "sistema";
      papel_loja: "dono" | "gerente" | "atendente" | "profissional";
      pelagem: "curta" | "media" | "longa";
      periodo_dia: "manha" | "tarde" | "qualquer";
      porte: "mini" | "pequeno" | "medio" | "grande" | "gigante";
      status_agendamento:
        "agendado" | "confirmado" | "em_atendimento" | "pronto" | "concluido" | "cancelado" | "faltou";
      status_lista_espera: "aguardando" | "notificado" | "atendido" | "expirado" | "cancelado";
      status_notificacao: "pendente" | "processando" | "enviada" | "falhou" | "cancelada";
      tipo_bloqueio: "folga" | "almoco" | "feriado" | "outro";
      tipo_notificacao:
        | "confirmacao_imediata"
        | "lembrete_d1"
        | "pedido_confirmacao"
        | "lembrete_antes"
        | "pet_pronto"
        | "vaga_lista_espera"
        | "aviso_loja_sem_confirmacao";
      tipo_servico: "principal" | "adicional";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      acao_sem_confirmacao: ["avisar_loja", "liberar_horario"],
      canal_agendamento: ["app_proprio", "marketplace", "balcao", "whatsapp"],
      categoria_mensagem: ["utilidade", "marketing", "servico"],
      criado_por_tipo: ["tutor", "equipe", "bot_whatsapp", "sistema"],
      papel_loja: ["dono", "gerente", "atendente", "profissional"],
      pelagem: ["curta", "media", "longa"],
      periodo_dia: ["manha", "tarde", "qualquer"],
      porte: ["mini", "pequeno", "medio", "grande", "gigante"],
      status_agendamento: ["agendado", "confirmado", "em_atendimento", "pronto", "concluido", "cancelado", "faltou"],
      status_lista_espera: ["aguardando", "notificado", "atendido", "expirado", "cancelado"],
      status_notificacao: ["pendente", "processando", "enviada", "falhou", "cancelada"],
      tipo_bloqueio: ["folga", "almoco", "feriado", "outro"],
      tipo_notificacao: [
        "confirmacao_imediata",
        "lembrete_d1",
        "pedido_confirmacao",
        "lembrete_antes",
        "pet_pronto",
        "vaga_lista_espera",
        "aviso_loja_sem_confirmacao",
      ],
      tipo_servico: ["principal", "adicional"],
    },
  },
} as const;
