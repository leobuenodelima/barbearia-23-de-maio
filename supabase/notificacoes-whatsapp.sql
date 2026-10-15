-- =====================================================================
--  Aviso no WhatsApp do barbeiro a cada novo agendamento / cancelamento
--  (usa o serviço gratuito CallMeBot — veja o README, seção 6)
--  Cole tudo no Supabase: SQL Editor → New query → Run
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- Guarda a chave do CallMeBot fora do alcance do site (sem nenhuma policy = ninguém lê pela API)
create table if not exists public.private_config (
  key   text primary key,
  value text not null
);
alter table public.private_config enable row level security;
revoke all on public.private_config from anon, authenticated;

-- Envia uma mensagem para o WhatsApp cadastrado
create or replace function public.notify_whatsapp(msg text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text;
  p text;
begin
  select value into k from public.private_config where key = 'callmebot_apikey';
  select value into p from public.private_config where key = 'callmebot_phone';
  if k is null or p is null or coalesce(msg,'') = '' then return; end if;
  perform net.http_get(
    url    := 'https://api.callmebot.com/whatsapp.php',
    params := jsonb_build_object('phone', p, 'text', msg, 'apikey', k)
  );
exception when others then
  -- nunca impedir um agendamento por falha no aviso
  raise warning 'notify_whatsapp falhou: %', sqlerrm;
end;
$$;
revoke all on function public.notify_whatsapp(text) from public, anon, authenticated;

-- Monta a mensagem a partir do agendamento
create or replace function public.trg_appointments_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  svcs text;
  quando text;
  valor text;
  cel text;
begin
  select string_agg(s->>'name', ' + ') into svcs from jsonb_array_elements(new.services) s;
  quando := (array['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])[extract(dow from new.date)::int + 1]
            || ' ' || to_char(new.date, 'DD/MM') || ' às ' || new.time;
  valor  := case when new.assinante then 'Assinante (incluso no plano)'
                 else 'R$ ' || replace(to_char(new.total, 'FM999990.00'), '.', ',') end;
  cel    := case when length(new.phone) = 11
                 then '(' || substr(new.phone,1,2) || ') ' || substr(new.phone,3,5) || '-' || substr(new.phone,8)
                 else new.phone end;

  if tg_op = 'INSERT' and new.origem = 'site' and new.status = 'agendado' then
    perform public.notify_whatsapp(
      '✂️ *Novo agendamento*' || chr(10) ||
      '*' || new.name || '*' || chr(10) ||
      coalesce(svcs, '') || chr(10) ||
      '📅 ' || quando || chr(10) ||
      '💰 ' || valor || chr(10) ||
      '📱 ' || cel);
  elsif tg_op = 'UPDATE' and old.status = 'agendado' and new.status = 'cancelado'
        and new.canceled_by = 'cliente' then
    perform public.notify_whatsapp(
      '❌ *Cancelamento pelo cliente*' || chr(10) ||
      '*' || new.name || '*' || chr(10) ||
      coalesce(svcs, '') || chr(10) ||
      '📅 ' || quando || ' (horário liberado)');
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_notify on public.appointments;
create trigger appointments_notify
  after insert or update of status on public.appointments
  for each row execute function public.trg_appointments_notify();

-- =====================================================================
--  DEPOIS de receber a chave do CallMeBot no WhatsApp, rode isto
--  (troque SUA_CHAVE pela chave recebida):
--
--  insert into public.private_config (key, value) values
--    ('callmebot_phone',  '+554198142660'),  -- número igual ao do link de teste do CallMeBot (geralmente sem o 9º dígito)
--    ('callmebot_apikey', 'SUA_CHAVE')
--  on conflict (key) do update set value = excluded.value;
--
--  Para testar:
--  select public.notify_whatsapp('Teste do site da 23 de Maio ✅');
-- =====================================================================
