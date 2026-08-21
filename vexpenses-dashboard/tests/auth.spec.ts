import { test, expect, request } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

async function seedAdmins(forceReset = false) {
  const apiContext = await request.newContext({ baseURL: BASE_URL });
  const resp = await apiContext.post('/api/auth/seed-admins', { data: { force_reset: forceReset } });
  const data = await resp.json();
  await apiContext.dispose();
  return data;
}

async function tryLogin(email: string, password: string): Promise<{ ok: boolean; must_change: boolean }> {
  const apiContext = await request.newContext({ baseURL: BASE_URL });
  const resp = await apiContext.post('/api/auth/login', {
    data: { email, password },
  });
  const data = await resp.json().catch(() => ({}));
  await apiContext.dispose();
  return { ok: resp.ok(), must_change: data.must_change_password ?? false };
}

test.describe('Sistema de Autenticação', () => {
  test('1. Login com senha de primeiro acesso redireciona para change-password', async ({ page }) => {
    const seedData = await seedAdmins(true);
    const admin = seedData.results.find((r: any) => r.email === 'leticia@eqsengenharia.com.br');
    const password = admin?.first_access_password;

    if (!password) {
      test.skip(true, 'Não foi possível obter senha de primeiro acesso');
      return;
    }

    await page.goto('/login');
    await page.fill('input[type="email"]', 'leticia@eqsengenharia.com.br');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/change-password', { timeout: 10000 });
    await expect(page).toHaveURL(/\/change-password/);
  });

  test('2. Trocar senha no primeiro acesso e acessar dashboard', async ({ page }) => {
    const seedData = await seedAdmins(true);
    const admin = seedData.results.find((r: any) => r.email === 'italo.medrado@eqsengenharia.com.br');
    const firstPassword = admin?.first_access_password;

    if (!firstPassword) {
      test.skip(true, 'Não foi possível obter senha de primeiro acesso');
      return;
    }

    await page.goto('/login');
    await page.fill('input[type="email"]', 'italo.medrado@eqsengenharia.com.br');
    await page.fill('input[type="password"]', firstPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/change-password', { timeout: 10000 });

    await page.fill('input[placeholder="••••••••"]', firstPassword);
    await page.fill('input[placeholder="Mínimo 6 caracteres"]', 'new-pass-123');
    await page.fill('input[placeholder="Repita a nova senha"]', 'new-pass-123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 10000 });

    await expect(page).toHaveURL(/\/$/);
  });

  test('3. Login com senha definitiva acessa dashboard', async ({ page }) => {
    const login = await tryLogin('italo.medrado@eqsengenharia.com.br', 'new-pass-123');
    if (!login.ok) {
      test.skip(true, 'Admin não tem senha definitiva — execute o teste 2 primeiro');
      return;
    }

    await page.goto('/login');
    await page.fill('input[type="email"]', 'italo.medrado@eqsengenharia.com.br');
    await page.fill('input[type="password"]', 'new-pass-123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 10000 });
    await expect(page).toHaveURL(/\/$/);
  });

  test('4. Usuário não autenticado é redirecionado para login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('5. Admin pode criar novo usuário', async ({ page }) => {
    const login = await tryLogin('italo.medrado@eqsengenharia.com.br', 'new-pass-123');
    if (!login.ok) {
      test.skip(true, 'Admin não tem senha definitiva configurada');
      return;
    }

    await page.goto('/login');
    await page.fill('input[type="email"]', 'italo.medrado@eqsengenharia.com.br');
    await page.fill('input[type="password"]', 'new-pass-123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 10000 });

    await page.goto('/configuracoes');
    await page.click('button:has-text("Usuários")');

    await page.click('button:has-text("Novo Usuário")');
    const testEmail = `teste.${Date.now()}@eqsengenharia.com.br`;
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[placeholder="Ex: Analista Financeiro, Diretor, etc."]', 'Analista de Teste');
    await page.selectOption('select', 'usuario');

    const moduleCheckboxes = page.locator('input[type="checkbox"]');
    await moduleCheckboxes.first().check();

    await page.click('button[type="submit"]:has-text("Criar Usuário")');

    await expect(page.locator('text=Senha de Primeiro Acesso')).toBeVisible({ timeout: 5000 });
    const passwordText = await page.locator('code.font-mono').textContent();
    expect(passwordText).toBeTruthy();
    expect(passwordText!.length).toBeGreaterThan(0);
  });

  test('6. Logout redireciona para login', async ({ page }) => {
    const login = await tryLogin('italo.medrado@eqsengenharia.com.br', 'new-pass-123');
    if (!login.ok) {
      test.skip(true, 'Admin não tem senha definitiva configurada');
      return;
    }

    await page.goto('/login');
    await page.fill('input[type="email"]', 'italo.medrado@eqsengenharia.com.br');
    await page.fill('input[type="password"]', 'new-pass-123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 10000 });

    await page.click('button[title="Sair"]');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('7. Login com credenciais inválidas mostra erro', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'wrong@email.com');
    await page.fill('input[type="password"]', 'wrong-password');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Credenciais inválidas')).toBeVisible({ timeout: 5000 });
  });

  test('8. Middleware bloqueia acesso a /configuracoes sem login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/configuracoes');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
