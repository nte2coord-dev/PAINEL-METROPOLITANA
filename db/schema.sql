-- Schema idempotente: roda a cada inicialização.
create table if not exists units (
  id serial primary key,
  sigla text unique not null,
  nome text not null,
  ordem int not null default 0
);

create table if not exists sectors (
  id serial primary key,
  unit_id int not null references units(id) on delete restrict,
  nome text not null,
  ramais text[] not null default '{}',
  telefones text[] not null default '{}',
  sala text,
  emails text[] not null default '{}',
  ativo boolean not null default true,
  unique (unit_id, nome)
);

create table if not exists users (
  id serial primary key,
  nome text not null,
  email text unique not null,
  senha_hash text,
  perfil text not null check (perfil in ('superintendente','admin','diretor','coord_setor')),
  unit_id int references units(id),
  sector_id int references sectors(id),
  ativo boolean not null default true,
  reset_token_hash text,
  reset_expires timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists config (chave text primary key, valor text not null);

create table if not exists tipos_demanda (
  id serial primary key,
  nome text unique not null,
  ativo boolean not null default true
);

create table if not exists demandas (
  id serial primary key,
  sector_id int not null references sectors(id),
  processo text not null,                      -- nº SEI ou protocolo
  assunto text not null,
  tipo_id int references tipos_demanda(id),
  origem text not null default 'outra_unidade'
    check (origem in ('escola','servidor','mp','tce','ouvidoria','outra_unidade')),
  data_entrada date not null default current_date,
  prazo date not null,
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  responsavel text,
  status text not null default 'aberta'
    check (status in ('aberta','em_andamento','aguardando_terceiros','concluida','cancelada')),
  data_conclusao date,
  observacoes text,
  created_by int references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_conclusao is null or data_conclusao >= data_entrada),
  check (prazo >= data_entrada)
);
create index if not exists demandas_sector_idx on demandas(sector_id);
create index if not exists demandas_prazo_idx on demandas(prazo);

create table if not exists pendencias (
  id serial primary key,
  sector_id int not null references sectors(id),
  demanda_id int references demandas(id) on delete set null,
  descricao text not null,
  motivo text,
  responsavel text,
  prazo date,
  resolvida boolean not null default false,
  created_by int references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists acompanhamentos (
  id serial primary key,
  demanda_id int not null references demandas(id) on delete cascade,
  data date not null default current_date,
  tipo text not null default 'andamento'
    check (tipo in ('andamento','contato','despacho','reuniao','comentario')),
  texto text not null,
  user_id int references users(id),
  created_at timestamptz not null default now()
);

create table if not exists consolidados (
  id serial primary key,
  sector_id int not null references sectors(id),
  periodo_inicio date not null,
  periodo_fim date not null,
  recebidas int not null default 0,
  concluidas int not null default 0,
  em_aberto int not null default 0,
  tempo_medio_dias numeric(7,1),
  observacoes text,
  created_by int references users(id),
  created_at timestamptz not null default now(),
  unique (sector_id, periodo_inicio, periodo_fim),
  check (periodo_fim >= periodo_inicio)
);

create table if not exists indicadores (
  id serial primary key,
  sector_id int not null references sectors(id),
  nome text not null,
  meta numeric(12,2) not null,
  realizado numeric(12,2),
  unidade text not null default 'num' check (unidade in ('pct','num','dias')),
  periodicidade text not null default 'mensal' check (periodicidade in ('quinzenal','mensal','trimestral','anual')),
  menor_melhor boolean not null default false,   -- ex.: tempo médio de resposta
  updated_at timestamptz not null default now()
);

create table if not exists alertas (
  id serial primary key,
  de_user_id int not null references users(id),
  unit_id int references units(id),
  sector_id int references sectors(id),
  demanda_id int references demandas(id) on delete set null,
  mensagem text not null,
  created_at timestamptz not null default now(),
  lido_em timestamptz
);

create table if not exists audit_log (
  id bigserial primary key,
  user_id int references users(id),
  user_email text,
  acao text not null,            -- criar | editar | excluir | login ...
  entidade text not null,
  entidade_id int,
  antes jsonb,
  depois jsonb,
  em timestamptz not null default now()
);
create index if not exists audit_entidade_idx on audit_log(entidade, entidade_id);

-- Acesso sem login: senhas e recuperação de senha deixaram de existir
alter table users alter column senha_hash drop not null;
alter table users drop column if exists reset_token_hash;
alter table users drop column if exists reset_expires;
