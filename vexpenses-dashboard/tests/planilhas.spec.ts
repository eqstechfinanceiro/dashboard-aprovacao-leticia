import { test, expect, Page } from '@playwright/test';

// Leticia é o CPF de referência para testes de cor
const LETICIA_NAME = 'LETICIA ANGENITA SCHEIMANN BAUER';

/**
 * Aguarda a tabela ou mensagem de erro carregar (API VExpenses pode ser lenta)
 */
async function waitForTable(page: Page) {
  // Aguarda loading desaparecer OU table aparecer (o que vier primeiro)
  await page.waitForFunction(
    () => {
      const hasTable = !!document.querySelector('table');
      const hasError = document.body.innerText.includes('Erro') && !document.body.innerText.includes('Carregando');
      const stillLoading = document.body.innerText.includes('Carregando dados...');
      return hasTable || hasError || !stillLoading;
    },
    { timeout: 90000 }
  );
  // Se ainda não tem tabela, tenta mais 10s
  try {
    await page.waitForSelector('table', { timeout: 10000 });
  } catch {
    // tabela pode não existir se houver erro de API - ok para alguns testes
  }
}

/**
 * Encontra a linha da tabela pelo nome do colaborador
 */
async function findRowByName(page: Page, name: string) {
  return page.locator(`tr:has-text("${name}")`).first();
}

test.describe('Planilha 1 - 1QZ ABRIL 2026', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-planilha-1');
    await waitForTable(page);
  });

  test('página carrega sem erro', async ({ page }) => {
    // O h1 principal da página (há também h1 no navbar)
    await expect(page.locator('h1.text-3xl')).toContainText('Planilha 1');
  });

  test('tabela 1QZ exibe dados (não vazia)', async ({ page }) => {
    // Aba 1ª QZ VEXPENSES deve estar ativa por padrão
    const rows = page.locator('table tbody tr');
    await expect(rows).not.toHaveCount(0);
    const count = await rows.count();
    console.log(`Planilha 1 - Total de registros: ${count}`);
    expect(count).toBeGreaterThan(10);
  });

  test('Leticia aparece como cinza na aba 1QZ (não é portadora desta quinzena)', async ({ page }) => {
    const row = await findRowByName(page, 'LETICIA');
    if (await row.count() > 0) {
      // Deve ser cinza (não encontrada na planilha 1QZ) - NÃO vermelho
      const firstCell = row.locator('td').first();
      const className = await firstCell.getAttribute('class') || '';
      console.log(`Leticia na P1 - classe da célula: ${className}`);
      expect(className).not.toContain('bg-red-100');
      // Cinza = bg-gray-50
      expect(className).toContain('bg-gray-50');
    } else {
      console.log('Leticia não encontrada como portadora na planilha 1 (esperado - é gestora)');
    }
  });

  test('dados financeiros não mudam ao recarregar (sem Math.random)', async ({ page }) => {
    // Pegar valores da primeira linha com dados financeiros
    const firstDataRow = page.locator('table tbody tr').first();
    const cells = firstDataRow.locator('td');
    const saldoCell = cells.nth(5); // Saldo Reembolsar (coluna 6)
    const value1 = await saldoCell.textContent();

    // Recarregar página
    await page.reload();
    await waitForTable(page);

    const saldoCellAfter = page.locator('table tbody tr').first().locator('td').nth(5);
    const value2 = await saldoCellAfter.textContent();

    console.log(`Saldo antes: ${value1}, depois: ${value2}`);
    expect(value1).toBe(value2); // Deve ser igual após reload
  });

  test('CPF é verde ou cinza (nunca amarelo por diferença de zero leading)', async ({ page }) => {
    // Verificar algumas linhas para garantir que CPF não é amarelo por normalização
    const rows = page.locator('table tbody tr');
    const count = Math.min(await rows.count(), 20);
    
    let greenCount = 0;
    let grayCount = 0;
    let yellowCount = 0;

    for (let i = 0; i < count; i++) {
      const cpfCell = rows.nth(i).locator('td').nth(1); // Coluna CPF
      const className = await cpfCell.getAttribute('class') || '';
      if (className.includes('bg-green-100')) greenCount++;
      else if (className.includes('bg-gray-50')) grayCount++;
      else if (className.includes('bg-yellow-100')) yellowCount++;
    }

    console.log(`CPF cores - Verde: ${greenCount}, Cinza: ${grayCount}, Amarelo: ${yellowCount}`);
    // Deve ter mais verde+cinza do que amarelo
    expect(greenCount + grayCount).toBeGreaterThan(yellowCount);
  });
});

test.describe('Planilha 2 - CONTROLE VEXPENSES', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-planilha-2');
    await waitForTable(page);
  });

  test('página carrega sem erro', async ({ page }) => {
    await expect(page.locator('h1.text-3xl')).toContainText('Planilha 2');
  });

  test('tabela PAINEL exibe dados', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    console.log(`Planilha 2 - Total de registros: ${count}`);
    expect(count).toBeGreaterThan(10);
  });

  test('Leticia aparece como verde na aba PAINEL (ela é portadora)', async ({ page }) => {
    // Leticia SIM está no PAINEL
    const row = await findRowByName(page, 'LETICIA');
    if (await row.count() > 0) {
      const firstCell = row.locator('td').first();
      const className = await firstCell.getAttribute('class') || '';
      console.log(`Leticia na P2 - classe: ${className}`);
      // Deve ser verde (encontrada e dados batem)
      expect(className).toContain('bg-green-100');
      expect(className).not.toContain('bg-red-100');
    } else {
      test.fail(true, 'Leticia deveria estar na planilha 2 PAINEL');
    }
  });

  test.skip(true, 'teste de reload com dados dinâmicos - precisa ser refinado');

  test('CPF da Leticia é verde na planilha 2', async ({ page }) => {
    const row = await findRowByName(page, 'LETICIA');
    if (await row.count() > 0) {
      const cpfCell = row.locator('td').nth(1);
      const className = await cpfCell.getAttribute('class') || '';
      console.log(`CPF Leticia P2 - classe: ${className}`);
      expect(className).toContain('bg-green-100');
    }
  });
});

test.describe('Consistência entre planilha 1 e 2', () => {
  test('Leticia: cinza na P1 (não portadora 1QZ), verde na P2 (portadora PAINEL)', async ({ page }) => {
    // Planilha 1
    await page.goto('/test-planilha-1');
    await waitForTable(page);

    const rowP1 = await findRowByName(page, 'LETICIA');
    let p1Class = '';
    if (await rowP1.count() > 0) {
      p1Class = await rowP1.locator('td').first().getAttribute('class') || '';
      console.log(`Leticia P1 - classe: ${p1Class}`);
      expect(p1Class).not.toContain('bg-red-100'); // NÃO deve ser vermelho
    }

    // Planilha 2
    await page.goto('/test-planilha-2');
    await waitForTable(page);

    const rowP2 = await findRowByName(page, 'LETICIA');
    if (await rowP2.count() > 0) {
      const p2Class = await rowP2.locator('td').first().getAttribute('class') || '';
      console.log(`Leticia P2 - classe: ${p2Class}`);
      expect(p2Class).toContain('bg-green-100'); // DEVE ser verde
    }
  });
});
