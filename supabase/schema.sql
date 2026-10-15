-- =====================================================================
--  23 de Maio Barbearia — banco de dados (Supabase / Postgres)
--  Cole tudo no Supabase: SQL Editor → New query → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists public.settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null default '',
  services    jsonb not null default '[]'::jsonb,
  total       numeric(10,2) not null default 0,
  dur         int not null default 30,
  date        date not null,
  time        text not null check (time ~ '^\d{2}:\d{2}$'),
  status      text not null default 'agendado'
              check (status in ('agendado','concluido','cancelado','faltou','bloqueio')),
  assinante   boolean not null default false,
  charged     numeric(10,2) not null default 0,
  origem      text not null default 'site',
  note        text,
  canceled_by text,
  created_at  timestamptz not null default now()
);
create index if not exists appointments_date_idx  on public.appointments (date);
create index if not exists appointments_phone_idx on public.appointments (phone);

create table if not exists public.subscribers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  plan       text,
  price      numeric(10,2) not null default 0,
  start      date,
  due        date not null,
  active     boolean not null default true,
  payments   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists subscribers_phone_idx on public.subscribers (phone);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  description text not null,
  cat         text not null default 'Outros',
  amount      numeric(10,2) not null check (amount >= 0),
  date        date not null,
  fixed       boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses (date);

-- Quem pode entrar no painel do barbeiro
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Funções auxiliares ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.hm(t text)
returns int language sql immutable as $$
  select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int;
$$;

-- ---------- Segurança (RLS) ----------
alter table public.settings     enable row level security;
alter table public.appointments enable row level security;
alter table public.subscribers  enable row level security;
alter table public.expenses     enable row level security;
alter table public.admins       enable row level security;

drop policy if exists settings_read  on public.settings;
drop policy if exists settings_admin on public.settings;
create policy settings_read  on public.settings for select to anon, authenticated using (true);
create policy settings_admin on public.settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists appointments_admin on public.appointments;
create policy appointments_admin on public.appointments for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists subscribers_admin on public.subscribers;
create policy subscribers_admin on public.subscribers for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());

-- =====================================================================
--  Funções públicas do site (o cliente nunca lê a tabela diretamente)
-- =====================================================================

-- Horários ocupados (sem nome nem celular de ninguém)
create or replace function public.busy_slots(d1 date, d2 date)
returns table ("date" date, "time" text, dur int)
language sql stable security definer set search_path = public as $$
  select a.date, a.time, a.dur
  from public.appointments a
  where a.date between d1 and d2
    and d2 - d1 <= 62
    and a.status in ('agendado','concluido','bloqueio');
$$;

-- Agendar (o preço vem do banco, não do navegador)
create or replace function public.book_appointment(
  p_name text, p_phone text, p_service_ids text[], p_date date, p_time text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg      jsonb;
  svc      jsonb;
  svcs     jsonb := '[]'::jsonb;
  tot      numeric := 0;
  du       int := 0;
  h        jsonb;
  s_m      int;
  chairs   int;
  busy     int;
  v_sub    boolean;
  new_id   uuid;
  v_phone  text;
  v_name   text;
  now_l    timestamp := now() at time zone 'America/Sao_Paulo';
  dow      int;
begin
  v_name := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g');
  if length(v_name) > 120 or array_length(regexp_split_to_array(v_name, ' '), 1) < 2 then
    raise exception 'NOME_INVALIDO';
  end if;
  v_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  if length(v_phone) not in (10, 11) then raise exception 'CELULAR_INVALIDO'; end if;

  select data into cfg from public.settings where id = 1;
  if cfg is null then raise exception 'CONFIG_AUSENTE'; end if;

  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0
     or array_length(p_service_ids, 1) > 8 then
    raise exception 'SERVICO_INVALIDO';
  end if;
  for svc in select value from jsonb_array_elements(cfg->'services') loop
    if (svc->>'id') = any (p_service_ids) then
      svcs := svcs || jsonb_build_array(jsonb_build_object(
                'name', svc->>'name', 'price', (svc->>'price')::numeric, 'dur', (svc->>'dur')::int));
      tot := tot + (svc->>'price')::numeric;
      du  := du  + (svc->>'dur')::int;
    end if;
  end loop;
  if jsonb_array_length(svcs) = 0 then raise exception 'SERVICO_INVALIDO'; end if;

  if p_date < now_l::date or p_date > now_l::date + 60 then raise exception 'DATA_INVALIDA'; end if;
  if coalesce(cfg->'blocked', '[]'::jsonb) ? p_date::text then raise exception 'DIA_FECHADO'; end if;
  dow := extract(dow from p_date);
  if dow = 0 then raise exception 'DIA_FECHADO';
  elsif dow = 6 then h := cfg->'hours'->'sat';
  else h := cfg->'hours'->'wk';
  end if;

  if p_time !~ '^\d{2}:\d{2}$' then raise exception 'HORARIO_INVALIDO'; end if;
  s_m := public.hm(p_time);
  if s_m < public.hm(h->>0) or s_m + du > public.hm(h->>1) then raise exception 'HORARIO_INVALIDO'; end if;
  if p_date = now_l::date and s_m <= extract(hour from now_l) * 60 + extract(minute from now_l) then
    raise exception 'HORARIO_PASSADO';
  end if;

  -- evita duas pessoas pegarem o mesmo horário ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext('agenda-' || p_date::text));

  chairs := greatest(coalesce((cfg->>'chairs')::int, 1), 1);
  select count(*) into busy from public.appointments a
   where a.date = p_date
     and a.status in ('agendado','concluido','bloqueio')
     and public.hm(a.time) < s_m + du
     and public.hm(a.time) + a.dur > s_m;
  if busy >= chairs then raise exception 'HORARIO_OCUPADO'; end if;

  if (select count(*) from public.appointments a
       where a.phone = v_phone and a.status = 'agendado' and a.date >= now_l::date) >= 3 then
    raise exception 'LIMITE_AGENDAMENTOS';
  end if;

  select true into v_sub from public.subscribers s
   where s.phone = v_phone and s.active and s.due >= now_l::date limit 1;
  v_sub := coalesce(v_sub, false);

  insert into public.appointments (name, phone, services, total, dur, date, time, status, assinante, charged, origem)
  values (v_name, v_phone, svcs, tot, du, p_date, p_time, 'agendado', v_sub, case when v_sub then 0 else tot end, 'site')
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'assinante', v_sub, 'total', tot, 'dur', du, 'services', svcs);
end;
$$;

-- "Meus horários": próximos agendamentos de um celular
create or replace function public.my_appointments(p_phone text)
returns table (id uuid, "date" date, "time" text, services jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.date, a.time, a.services
  from public.appointments a
  where a.phone = regexp_replace(coalesce(p_phone,''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 10
    and a.status = 'agendado'
    and a.date >= (now() at time zone 'America/Sao_Paulo')::date
  order by a.date, a.time;
$$;

-- Cliente cancela o próprio horário (precisa do celular certo)
create or replace function public.cancel_appointment(p_id uuid, p_phone text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.appointments
     set status = 'cancelado', canceled_by = 'cliente'
   where id = p_id
     and phone = regexp_replace(coalesce(p_phone,''), '\D', '', 'g')
     and status = 'agendado';
  return found;
end;
$$;

revoke all on function public.book_appointment(text,text,text[],date,text) from public;
revoke all on function public.cancel_appointment(uuid,text) from public;
revoke all on function public.my_appointments(text) from public;
revoke all on function public.busy_slots(date,date) from public;
grant execute on function public.book_appointment(text,text,text[],date,text) to anon, authenticated;
grant execute on function public.cancel_appointment(uuid,text)             to anon, authenticated;
grant execute on function public.my_appointments(text)                     to anon, authenticated;
grant execute on function public.busy_slots(date,date)                     to anon, authenticated;
grant execute on function public.is_admin()                                to authenticated;

-- ---------- Atualização em tempo real no painel ----------
do $$
declare t text;
begin
  foreach t in array array['appointments','subscribers','expenses','settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- ---------- Configuração inicial da barbearia ----------
insert into public.settings (id, data) values (1, '{
  "services": [
    {"id":"corte","name":"Corte","price":45,"dur":30},
    {"id":"barba","name":"Barba","price":45,"dur":30},
    {"id":"cbs","name":"Corte + barba + sobrancelha","price":90,"dur":60,"combo":true},
    {"id":"sobrancelha","name":"Sobrancelha","price":15,"dur":15},
    {"id":"alisamento","name":"Alisamento","price":30,"dur":30},
    {"id":"hidratacao","name":"Hidratação","price":20,"dur":15},
    {"id":"limpeza","name":"Limpeza de pele","price":30,"dur":30},
    {"id":"depilacao","name":"Depilação nariz e orelha","price":15,"dur":15}
  ],
  "hours": {"wk":["09:30","19:00"], "sat":["09:30","17:00"]},
  "step": 30,
  "chairs": 1,
  "whatsapp": "41987402139",
  "address": "",
  "blocked": [],
  "plans": [
    {"name":"Plano Cabelo","price":129.9},
    {"name":"Plano Cabelo + Sobrancelha","price":149.9},
    {"name":"Plano Cabelo + Barba","price":219.9}
  ]
}'::jsonb)
on conflict (id) do nothing;

-- =====================================================================
--  DEPOIS de criar o usuário do barbeiro (Authentication → Users → Add user),
--  rode esta linha trocando o e-mail:
--
--  insert into public.admins (user_id)
--  select id from auth.users where email = 'SEU-EMAIL@gmail.com';
-- =====================================================================
