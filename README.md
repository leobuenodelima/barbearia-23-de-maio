# 23 de Maio Barbearia

Site de agendamento + painel do barbeiro (agenda, clientes, assinantes e financeiro).

- **Site do cliente:** escolhe serviços, dia e horário, informa nome completo e celular, e pode cancelar em "Meus horários".
- **Painel** (`/#barbeiro` ou link "Área do barbeiro" no rodapé): login com e-mail e senha.
- Tecnologia: HTML + JavaScript puro, banco **Supabase** (grátis), hospedagem **Vercel** (grátis). Não tem etapa de build.

## Segurança
- O cliente nunca lê as tabelas. Ele só usa funções do banco que devolvem **horários ocupados** (sem nome nem celular) e criam o agendamento.
- O **preço é calculado no banco**, não no navegador.
- Só usuários cadastrados na tabela `admins` entram no painel e veem financeiro, clientes e assinantes.
- Limite de 3 agendamentos futuros por celular, para evitar abuso.

---

## Passo a passo para colocar no ar (≈ 15 min)

### 1. Supabase (banco de dados)
1. Entre em <https://supabase.com> → **New project**. Nome: `barbearia-23-de-maio`, região **South America (São Paulo)**. Guarde a senha do banco.
2. Menu **SQL Editor** → **New query** → cole todo o arquivo [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. Menu **Authentication → Users → Add user → Create new user**: e-mail e senha do barbeiro, marque **Auto Confirm User**.
4. Volte ao **SQL Editor** e rode (trocando o e-mail):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'SEU-EMAIL@gmail.com';
   ```
5. Menu **Authentication → Sign In / Providers** → desligue **Allow new users to sign up** (ninguém mais cria conta).
6. Menu **Project Settings → API**: copie a **Project URL** e a chave **publishable** (`sb_publishable_...`). Nunca use a chave **secret** (`sb_secret_...`).

### 2. Configurar o site
Abra o arquivo `config.js` e cole os dois valores:
```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```
Salve e faça commit no GitHub (dá para editar direto pelo site do GitHub, no lápis ✏️).

### 3. Vercel (hospedagem)
1. Entre em <https://vercel.com> com sua conta do GitHub.
2. **Add New → Project** → escolha o repositório `barbearia-23-de-maio` → **Deploy** (não precisa mudar nada).
3. Pronto: o site fica em `barbearia-23-de-maio.vercel.app`. Cada commit no GitHub publica sozinho.

### 4. Domínio próprio (opcional)
1. Registre em <https://registro.br> (ex.: `23demaiobarbearia.com.br`, cerca de R$ 40/ano).
2. Na Vercel: **Project → Settings → Domains → Add** e siga as instruções de DNS.

### 5. No celular do barbeiro
Abra `seusite/#barbeiro`, faça login e use **Adicionar à tela inicial**. O painel abre como app.

---

## Estrutura
```
index.html              página (site + painel)
app.js                  lógica
config.js               chaves do Supabase (preencher)
supabase/schema.sql     tabelas, segurança e funções
assets/                 logo e ícones
manifest.webmanifest    instalação como app
```

## Ajustes do dia a dia (pelo painel → Ajustes)
WhatsApp, endereço, horário de funcionamento, quantos barbeiros atendem ao mesmo tempo, serviços/preços e planos mensais.
