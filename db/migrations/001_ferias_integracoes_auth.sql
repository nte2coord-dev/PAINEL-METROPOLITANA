create table if not exists escolas (
  id bigserial primary key,
  nome text not null,
  municipio text,
  unidade_id int references units(id) on delete restrict,
  ativo boolean not null default true,
  fonte text,
  id_externo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (fonte, id_externo)
);

create index if not exists escolas_nome_idx on escolas (lower(nome));

create table if not exists diretores (
  id bigserial primary key,
  nome text not null,
  email text,
  escola_id bigint not null references escolas(id) on delete restrict,
  ativo boolean not null default true,
  fonte text,
  id_externo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (fonte, id_externo)
);

create index if not exists diretores_escola_idx on diretores(escola_id);
alter table users add column if not exists diretor_id bigint references diretores(id) on delete set null;

create table if not exists ferias_lotes (
  id bigserial primary key,
  nome text not null,
  observacao text,
  criado_por int references users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists ferias_periodos (
  id bigserial primary key,
  diretor_id bigint not null references diretores(id) on delete cascade,
  lote_id bigint references ferias_lotes(id) on delete set null,
  data_inicio date not null,
  data_fim date not null,
  link_drive text,
  observacao text,
  fonte text,
  id_externo text,
  criado_por int references users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (data_fim >= data_inicio),
  unique (fonte, id_externo)
);

create index if not exists ferias_periodos_diretor_datas_idx on ferias_periodos(diretor_id, data_inicio, data_fim);
create index if not exists ferias_periodos_lote_idx on ferias_periodos(lote_id);

create table if not exists afastamentos (
  id bigserial primary key,
  diretor_id bigint not null references diretores(id) on delete cascade,
  tipo text not null,
  data_inicio date not null,
  data_fim date not null,
  dias_uteis int not null default 0 check (dias_uteis >= 0),
  observacao text,
  fonte text,
  id_externo text,
  criado_por int references users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (data_fim >= data_inicio),
  unique (fonte, id_externo)
);

create index if not exists afastamentos_diretor_datas_idx on afastamentos(diretor_id, data_inicio, data_fim);

create table if not exists documentos_autenticidade (
  id bigserial primary key,
  codigo text not null unique,
  tipo text not null check (tipo in ('extrato_ferias','relatorio_ferias')),
  diretor_id bigint references diretores(id) on delete set null,
  resumo jsonb not null,
  hash_sha256 text not null,
  criado_por int references users(id),
  criado_em timestamptz not null default now()
);

create table if not exists integracoes_log (
  id bigserial primary key,
  fonte text not null,
  inicio_em timestamptz not null default now(),
  fim_em timestamptz,
  lidos int not null default 0,
  criados int not null default 0,
  atualizados int not null default 0,
  rejeitados int not null default 0,
  erro text
);

create index if not exists integracoes_log_fonte_inicio_idx on integracoes_log(fonte, inicio_em desc);

create table if not exists pendencias_importacao (
  id bigserial primary key,
  fonte text not null,
  raw_id bigint,
  motivo text not null,
  resolvida_em timestamptz,
  resolvida_por int references users(id),
  criado_em timestamptz not null default now()
);

create table if not exists dipe_raw (
  id bigserial primary key,
  id_externo text,
  payload jsonb not null,
  processado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id_externo)
);

create table if not exists appsscript_raw (
  id bigserial primary key,
  id_externo text,
  payload jsonb not null,
  processado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id_externo)
);

create table if not exists sessoes (
  id bigserial primary key,
  user_id int not null references users(id) on delete cascade,
  token_hash text not null unique,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index if not exists sessoes_expira_idx on sessoes(expira_em);
