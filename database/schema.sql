-- Schema para banco de dados Neon PostgreSQL
-- Baseado nos dados mockados da aplicação

-- Tabela de setores
CREATE TABLE IF NOT EXISTS sectors (
    key VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL,
    icon VARCHAR(50) NOT NULL
);

-- Tabela de automações
CREATE TABLE IF NOT EXISTS automations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    sector_key VARCHAR(50) NOT NULL REFERENCES sectors(key),
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'development', 'planned')),
    running BOOLEAN DEFAULT FALSE,
    runtime VARCHAR(20) DEFAULT '--:--:--',
    description TEXT,
    time_saved INTEGER DEFAULT 0
);

-- Tabela de timeline
CREATE TABLE IF NOT EXISTS timeline (
    id SERIAL PRIMARY KEY,
    date VARCHAR(50) NOT NULL,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('completed', 'action-plan', 'in-progress')),
    sector_key VARCHAR(50) NOT NULL REFERENCES sectors(key),
    sector VARCHAR(100) NOT NULL
);

-- Tabela de ações da timeline
CREATE TABLE IF NOT EXISTS timeline_actions (
    id SERIAL PRIMARY KEY,
    timeline_id INTEGER NOT NULL REFERENCES timeline(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done BOOLEAN DEFAULT FALSE
);

-- Tabela de dados de gráficos (notas por período)
CREATE TABLE IF NOT EXISTS chart_data (
    id SERIAL PRIMARY KEY,
    period VARCHAR(20) NOT NULL CHECK (period IN ('hora', 'dia', 'semana', 'mes')),
    labels TEXT[] NOT NULL,
    data INTEGER[] NOT NULL
);

-- Tabela de KPIs
CREATE TABLE IF NOT EXISTS kpis (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) UNIQUE NOT NULL,
    value INTEGER NOT NULL,
    unit VARCHAR(50),
    change_percent DECIMAL(5,2),
    change_period VARCHAR(50)
);

-- Tabela de notas
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    number VARCHAR(50) NOT NULL UNIQUE,
    value DECIMAL(10,2) NOT NULL,
    issue_date DATE NOT NULL,
    sector_key VARCHAR(50) NOT NULL REFERENCES sectors(key),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'error')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir dados iniciais (baseados nos dados mockados)

-- Setores
INSERT INTO sectors (key, name, color, icon) VALUES
('entrada-notas', 'Entrada de Notas', '#6366f1', 'receipt_long'),
('contabil', 'Contábil', '#8b5cf6', 'account_balance'),
('contas-pagar', 'Contas a Pagar', '#06b6d4', 'payments'),
('contas-receber', 'Contas a Receber', '#10b981', 'request_quote'),
('fiscal', 'Fiscal', '#f59e0b', 'gavel'),
('tesouraria', 'Tesouraria', '#ef4444', 'account_balance_wallet')
ON CONFLICT (key) DO NOTHING;

-- Automações
INSERT INTO automations (name, sector_key, status, running, runtime, description, time_saved) VALUES
('Lançamento Automático de NF XML', 'entrada-notas', 'active', TRUE, '02:34:12', 'Automação de lançamento de notas fiscais via XML no TOTVS Protheus', 320),
('Download de XMLs TOTVS', 'entrada-notas', 'active', TRUE, '01:12:45', 'Download automatizado de XMLs do portal e integração com o sistema', 180),
('Validação de Dados Fiscais', 'entrada-notas', 'active', TRUE, '00:45:30', 'Verificação automática de dados fiscais e tributários das notas', 120),
('Classificação Automática de Despesas', 'entrada-notas', 'development', FALSE, '--:--:--', 'IA para classificar automaticamente itens e centros de custo', 0),
('Conciliação Bancária', 'contabil', 'active', TRUE, '03:15:22', 'Conciliação automática de extratos bancários com lançamentos contábeis', 210),
('Classificação Contábil Automática', 'contabil', 'development', FALSE, '--:--:--', 'Classificação automática de lançamentos contábeis usando regras e IA', 0),
('Fechamento Contábil', 'contabil', 'planned', FALSE, '--:--:--', 'Automação do processo de fechamento mensal contábil', 0),
('Agendamento de Pagamentos', 'contas-pagar', 'active', TRUE, '00:58:14', 'Agendamento automatizado de pagamentos via integração bancária', 95),
('Conferência de Duplicatas', 'contas-pagar', 'active', FALSE, '--:--:--', 'Detecção automática de títulos em duplicidade no sistema', 65),
('Geração de Remessa', 'contas-pagar', 'planned', FALSE, '--:--:--', 'Geração automatizada de arquivos de remessa bancária', 0),
('Emissão de Boletos', 'contas-receber', 'active', TRUE, '01:22:08', 'Emissão automatizada de boletos e envio por e-mail', 140),
('Acompanhamento de Inadimplência', 'contas-receber', 'development', FALSE, '--:--:--', 'Monitoramento automático de títulos vencidos e régua de cobrança', 0),
('Apuração de Impostos', 'fiscal', 'active', TRUE, '02:45:33', 'Cálculo automático de impostos (ICMS, PIS, COFINS, ISS)', 280),
('Geração de SPED', 'fiscal', 'development', FALSE, '--:--:--', 'Geração automatizada dos arquivos SPED Fiscal e Contribuições', 0),
('Fluxo de Caixa Automático', 'tesouraria', 'planned', FALSE, '--:--:--', 'Consolidação automática do fluxo de caixa em tempo real', 0),
('Previsão Financeira', 'tesouraria', 'planned', FALSE, '--:--:--', 'Modelo preditivo para projeções financeiras baseado em histórico', 0)
ON CONFLICT DO NOTHING;

-- Timeline
INSERT INTO timeline (date, title, description, type, sector_key, sector) VALUES
('15 Abr 2026', 'Refatoração do módulo de download de XMLs', 'Migração completa do PyAutoGUI para Playwright com manipulação direta do DOM e Shadow DOM. Eliminação de todas as interações baseadas em imagem.', 'completed', 'entrada-notas', 'Entrada de Notas'),
('13 Abr 2026', 'Automação Selenium → Playwright', 'Refatoração completa da automação TOTVS de Selenium para Playwright, melhorando a estabilidade e performance do lançamento de notas.', 'completed', 'entrada-notas', 'Entrada de Notas'),
('12 Abr 2026', 'Classificação Automática de Despesas — Plano', 'Planejamento da implementação de IA para classificação automática de itens e centros de custo nas notas fiscais.', 'action-plan', 'entrada-notas', 'Entrada de Notas'),
('10 Abr 2026', 'Conciliação Bancária — v1.0 implantada', 'Primeira versão da conciliação bancária automática implantada com sucesso, cobrindo 3 bancos principais.', 'completed', 'contabil', 'Contábil'),
('08 Abr 2026', 'Classificação Contábil — Em Desenvolvimento', 'Desenvolvimento do módulo de classificação contábil automática baseado em regras e padrões históricos.', 'in-progress', 'contabil', 'Contábil'),
('05 Abr 2026', 'Emissão de Boletos — Automação completa', 'Sistema de emissão automática de boletos integrado ao módulo de Contas a Receber, com envio por e-mail e tracking.', 'completed', 'contas-receber', 'Contas a Receber'),
('01 Abr 2026', 'Apuração de Impostos — Fase 1', 'Implementação da apuração automática de ICMS e ISS para operações interestaduais.', 'in-progress', 'fiscal', 'Fiscal'),
('28 Mar 2026', 'Geração de SPED — Plano de Ação', 'Planejamento para automação da geração dos arquivos SPED Fiscal e Contribuições, incluindo validação automática.', 'action-plan', 'fiscal', 'Fiscal'),
('25 Mar 2026', 'Fluxo de Caixa — Planejamento', 'Início do planejamento para consolidação automática do fluxo de caixa em tempo real, integrando todas as fontes.', 'action-plan', 'tesouraria', 'Tesouraria'),
('20 Mar 2026', 'Agendamento de Pagamentos — v1.0', 'Primeira versão do agendamento automático de pagamentos implantada, com integração bancária para os 3 principais bancos.', 'completed', 'contas-pagar', 'Contas a Pagar')
ON CONFLICT DO NOTHING;

-- Ações da timeline
INSERT INTO timeline_actions (timeline_id, text, done) VALUES
(1, 'Substituir PyAutoGUI por Playwright', TRUE),
(1, 'Implementar seletores Shadow DOM', TRUE),
(1, 'Adicionar logging diagnóstico', TRUE),
(1, 'Testes de integração end-to-end', TRUE),
(2, 'Instalar e configurar Playwright', TRUE),
(2, 'Migrar seletores de elementos', TRUE),
(2, 'Testar fluxo completo de NF', TRUE),
(2, 'Documentar mudanças', TRUE),
(3, 'Levantar histórico de classificações (12 meses)', FALSE),
(3, 'Definir modelo de ML para classificação', FALSE),
(3, 'Criar pipeline de treinamento', FALSE),
(3, 'Integrar com TOTVS via API', FALSE),
(4, 'Integração com OFX/CNAB', TRUE),
(4, 'Motor de matching automático', TRUE),
(4, 'Relatório de divergências', TRUE),
(4, 'Aprovação do time contábil', TRUE),
(5, 'Mapear plano de contas', TRUE),
(5, 'Criar engine de regras', TRUE),
(5, 'Implementar sugestões inteligentes', FALSE),
(5, 'Testes com dados reais', FALSE),
(6, 'Integração API bancária', TRUE),
(6, 'Template de e-mail de cobrança', TRUE),
(6, 'Sistema de tracking de abertura', TRUE),
(6, 'Dashboard de cobrança', TRUE),
(7, 'Cadastrar alíquotas por UF', TRUE),
(7, 'Motor de cálculo ICMS-ST', TRUE),
(7, 'Integrar com módulo fiscal TOTVS', FALSE),
(7, 'Validação com contabilidade', FALSE),
(8, 'Mapear layout SPED atualizado', FALSE),
(8, 'Criar rotina de extração de dados', FALSE),
(8, 'Implementar validador sintático', FALSE),
(8, 'Testes com arquivo piloto', FALSE),
(9, 'Mapear fontes de dados (CP, CR, Bancos)', FALSE),
(9, 'Definir arquitetura de consolidação', FALSE),
(9, 'Prototipar dashboard real-time', FALSE),
(9, 'Validar com tesouraria', FALSE),
(10, 'Conectar APIs bancárias', TRUE),
(10, 'Criar fila de prioridade de pagamento', TRUE),
(10, 'Implementar aprovação multi-nível', TRUE),
(10, 'Gerar comprovantes automáticos', TRUE)
ON CONFLICT DO NOTHING;

-- Dados de gráficos
INSERT INTO chart_data (period, labels, data) VALUES
('hora', ARRAY['08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h'], ARRAY[8, 15, 22, 18, 5, 12, 25, 20, 17, 0]),
('dia', ARRAY['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], ARRAY[142, 138, 155, 148, 160, 35, 0]),
('semana', ARRAY['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'], ARRAY[680, 720, 750, 810]),
('mes', ARRAY['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], ARRAY[2800, 2950, 3100, 3250, 3180, 3400])
ON CONFLICT DO NOTHING;

-- KPIs
INSERT INTO kpis (key, value, unit, change_percent, change_period) VALUES
('time-saved', 847, 'horas', 12.5, 'este mês'),
('automations-active', 8, '/ 14', NULL, '+2 esta semana'),
('notes-today', 142, 'notas', 8.3, 'vs ontem'),
('efficiency', 94, '%', 3.2, 'este mês')
ON CONFLICT (key) DO NOTHING;

-- Notas
INSERT INTO notes (number, value, issue_date, sector_key, status) VALUES
('NF-12345', 1500.00, '2024-04-30', 'entrada-notas', 'completed'),
('NF-12346', 2300.00, '2024-04-30', 'contabil', 'processing'),
('NF-12347', 890.00, '2024-04-29', 'contas-pagar', 'pending')
ON CONFLICT (number) DO NOTHING;
