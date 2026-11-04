alter table ferias_lotes add column if not exists fonte text;
alter table ferias_lotes add column if not exists id_externo text;
create unique index if not exists ferias_lotes_fonte_id_externo_uidx on ferias_lotes(fonte,id_externo);
