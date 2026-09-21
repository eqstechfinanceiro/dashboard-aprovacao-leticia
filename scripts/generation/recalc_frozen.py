import psycopg2
import re
import unicodedata
from collections import defaultdict
from datetime import datetime

DB_CONN = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
YEAR = 2026
MONTH = 8
QUINZENA = 2

def normalize_name(s):
    if not s:
        return ''
    s = s.upper()
    s = unicodedata.normalize('NFD', s)
    s = re.sub(r'[\u0300-\u036f]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

def fuzzy_ratio(a, b):
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    def bigrams(s):
        return set(s[i:i+2] for i in range(len(s)-1))
    ba, bb = bigrams(a), bigrams(b)
    inter = len(ba & bb)
    return (2 * inter) / (len(ba) + len(bb))

def is_fatura_or_cartao(name):
    n = name.strip().upper()
    n_norm = normalize_name(n)
    if 'CAIXA ITAU' in n_norm or 'CAIXA ITAÚ' in n:
        return True
    if n_norm.startswith('CAIXA'):
        return False
    if re.match(r'^(FATURA|CARTAO|CARTÃO|FATUAR|FARTUR|FATUT|FARUR|FATUTR)', n):
        return True
    if 'CARTÃO DE CRÉDITO' in n or 'CARTAO DE CREDITO' in n or 'CARTÃO DE CREDITO' in n:
        return True
    if 'CARTÃO CORPORATIVO' in n:
        return True
    if ('ITAU' in n_norm or 'ITAÚ' in n) and 'CAIXA' not in n:
        return True
    if 'DOLAR' in n or 'DÓLAR' in n:
        return True
    if n.startswith('DESPESA') and 'FATURA' in n:
        return True
    if n.startswith('COMPLEMENTAR') and 'FATURA' in n:
        return True
    if 'CARTÃO' in n and 'CRÉDITO' in n:
        return True
    if 'CARTAO' in n and 'CREDITO' in n:
        return True
    if n.startswith('CARTÃO VEXPENSES'):
        return True
    return False

def r2(v):
    return round(v, 2)

print("Conectando ao banco...")
conn = psycopg2.connect(DB_CONN)
cur = conn.cursor()

# Quinzena dates
prev_month = MONTH - 1 if MONTH > 1 else 12
prev_year = YEAR if MONTH > 1 else YEAR - 1
import calendar
prev_month_last_day = calendar.monthrange(prev_year, prev_month)[1]
financial_cutoff = f"{prev_year}-{prev_month:02d}-{prev_month_last_day:02d}"
saldo_cartao_controle_date = f"{YEAR}-{MONTH:02d}-01"
saldo_cartao_carga_date = f"{YEAR}-{MONTH:02d}-25"

print(f"Cutoff financeiro: {financial_cutoff}")
print(f"Saldo cartão controle: {saldo_cartao_controle_date}")
print(f"Saldo cartão carga: {saldo_cartao_carga_date}")

# 1. Load cadastro
print("Lendo cadastro...")
cur.execute("""
    SELECT cpf, colaborador, situacao, status_cartao, regional, centro_custo, gestor, diretor
    FROM quinzena_cadastro
    ORDER BY colaborador ASC NULLS LAST
""")
cadastro = cur.fetchall()
print(f"  {len(cadastro)} pessoas no cadastro")

# Build name→cpf map
nome_to_cpf = {}
nome_has_situacao = set()
for c in cadastro:
    cpf, colaborador = c[0], c[1]
    norm = normalize_name(colaborador)
    if not norm:
        continue
    has_sit = c[2] is not None and c[2] != ''
    if norm not in nome_to_cpf:
        nome_to_cpf[norm] = cpf
        if has_sit:
            nome_has_situacao.add(norm)
    else:
        if has_sit and norm not in nome_has_situacao:
            nome_to_cpf[norm] = cpf
            nome_has_situacao.add(norm)

fuzzy_cache = {}

def resolve_cpf(extrato_name):
    norm = normalize_name(extrato_name)
    if norm in nome_to_cpf:
        return nome_to_cpf[norm]
    if norm in fuzzy_cache:
        return fuzzy_cache[norm]
    best_cpf = None
    best_ratio = 0
    for cad_name, cpf in nome_to_cpf.items():
        ratio = fuzzy_ratio(norm, cad_name)
        if ratio > best_ratio:
            best_ratio = ratio
            best_cpf = cpf
    if best_ratio >= 0.88 and best_cpf:
        fuzzy_cache[norm] = best_cpf
        return best_cpf
    if len(norm) >= 10:
        prefix15 = norm[:15]
        for cad_name, cpf in nome_to_cpf.items():
            if cad_name[:15] == prefix15:
                return cpf
        prefix10 = norm[:10]
        for cad_name, cpf in nome_to_cpf.items():
            if cad_name[:10] == prefix10:
                return cpf
    return None

# 2. Extrato cumulativo até financial_cutoff (is_snapshot=false)
print("Lendo extrato (não-snapshot até cutoff)...")
cur.execute(f"""
    WITH deduped AS (
        SELECT DISTINCT ON (
            UPPER(usuario), data, tipo, valor,
            COALESCE(NULLIF(codigo_transacao, ''), hora::text)
        )
            UPPER(usuario) AS usuario_up,
            data, tipo, valor, codigo_transacao, descricao
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND data <= '{financial_cutoff}'
        ORDER BY UPPER(usuario), data, tipo, valor,
            COALESCE(NULLIF(codigo_transacao, ''), hora::text)
    )
    SELECT
        usuario_up,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0
            AND NOT (descricao ~* 'estorno.*taxa|taxa.*estorno|^CHARGEBACK_')), 0) AS carga_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) AS transf_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo IN ('Taxa', 'Estorno de taxa', 'Pendência de taxa')
            OR (tipo = 'Transferência' AND descricao ~* 'estorno.*taxa|taxa.*estorno|^CHARGEBACK_')), 0) AS tarifa_raw
    FROM deduped
    GROUP BY usuario_up
""")
extrato_rows = cur.fetchall()
print(f"  {len(extrato_rows)} usuários no extrato")

# 3. Prestação (Aprovado+Enviado, sem Itaú)
print("Lendo prestação (Aprovado+Enviado, sem Itaú)...")
cur.execute("""
    SELECT r.id, r.name
    FROM prestacao_reports r
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
""")
report_rows = cur.fetchall()
valid_report_ids = [r[0] for r in report_rows if not is_fatura_or_cartao(r[1] or '')]
print(f"  {len(valid_report_ids)} relatórios válidos")

somase_by_cpf = defaultdict(float)
if valid_report_ids:
    # Process in batches to avoid parameter limits
    BATCH = 500
    for i in range(0, len(valid_report_ids), BATCH):
        batch = valid_report_ids[i:i+BATCH]
        placeholders = ','.join(['%s'] * len(batch))
        cur.execute(f"""
            SELECT r.user_cpf, COALESCE(SUM(e.value), 0) AS total
            FROM prestacao_reports r
            JOIN prestacao_expenses e ON e.report_id = r.id
            WHERE r.id = ANY(ARRAY[{placeholders}])
              AND COALESCE(e.raw_data::json->>'payment_method_id', '') != '627401'
            GROUP BY r.user_cpf
        """, batch)
        for r in cur.fetchall():
            if r[0]:
                somase_by_cpf[r[0]] += float(r[1])
print(f"  {len(somase_by_cpf)} CPFs com prestação")

# 4. Saldo cartão CONTROLE (último snapshot até dia 1 do mês atual + transações pós-snapshot)
print("Calculando saldo cartão controle...")
cur.execute(f"""
    WITH deduped AS (
        SELECT DISTINCT ON (UPPER(usuario), data, tipo, valor, codigo_transacao)
            UPPER(usuario) AS usuario_up, data, tipo, valor, codigo_transacao
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND data <= '{saldo_cartao_controle_date}'
        ORDER BY UPPER(usuario), data, tipo, valor, codigo_transacao
    ),
    latest_snap AS (
        SELECT DISTINCT ON (UPPER(usuario))
            UPPER(usuario) AS usuario_up,
            valor AS saldo, data AS snapshot_date
        FROM extrato_movimentacao
        WHERE is_snapshot = TRUE
          AND valor IS NOT NULL
          AND data <= '{saldo_cartao_controle_date}'
        ORDER BY UPPER(usuario), data DESC
    ),
    post_snap_txns AS (
        SELECT d.usuario_up, SUM(d.valor) AS adjustment
        FROM deduped d
        JOIN latest_snap s ON d.usuario_up = s.usuario_up
        WHERE d.data > s.snapshot_date
        GROUP BY d.usuario_up
    ),
    computed_balance AS (
        SELECT usuario_up, COALESCE(SUM(valor), 0) AS saldo
        FROM deduped
        GROUP BY usuario_up
    )
    SELECT COALESCE(s.usuario_up, c.usuario_up) AS usuario_up,
           COALESCE(s.saldo, 0) + COALESCE(p.adjustment, 0) AS snap_saldo,
           COALESCE(c.saldo, 0) AS computed_saldo,
           (s.usuario_up IS NOT NULL) AS has_snapshot
    FROM latest_snap s
    FULL OUTER JOIN post_snap_txns p ON p.usuario_up = s.usuario_up
    FULL OUTER JOIN computed_balance c ON c.usuario_up = COALESCE(s.usuario_up, p.usuario_up)
""")
saldo_controle_rows = cur.fetchall()

# 5. Saldo cartão CARGA (último snapshot até data de fechamento + transações pós-snapshot)
print("Calculando saldo cartão carga...")
cur.execute(f"""
    WITH deduped AS (
        SELECT DISTINCT ON (UPPER(usuario), data, tipo, valor, codigo_transacao)
            UPPER(usuario) AS usuario_up, data, tipo, valor, codigo_transacao
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND data <= '{saldo_cartao_carga_date}'
        ORDER BY UPPER(usuario), data, tipo, valor, codigo_transacao
    ),
    latest_snap AS (
        SELECT DISTINCT ON (UPPER(usuario))
            UPPER(usuario) AS usuario_up,
            valor AS saldo, data AS snapshot_date
        FROM extrato_movimentacao
        WHERE is_snapshot = TRUE
          AND valor IS NOT NULL
          AND data <= '{saldo_cartao_carga_date}'
        ORDER BY UPPER(usuario), data DESC
    ),
    post_snap_txns AS (
        SELECT d.usuario_up, SUM(d.valor) AS adjustment
        FROM deduped d
        JOIN latest_snap s ON d.usuario_up = s.usuario_up
        WHERE d.data > s.snapshot_date
        GROUP BY d.usuario_up
    ),
    computed_balance AS (
        SELECT usuario_up, COALESCE(SUM(valor), 0) AS saldo
        FROM deduped
        GROUP BY usuario_up
    )
    SELECT COALESCE(s.usuario_up, c.usuario_up) AS usuario_up,
           COALESCE(s.saldo, 0) + COALESCE(p.adjustment, 0) AS snap_saldo,
           COALESCE(c.saldo, 0) AS computed_saldo,
           (s.usuario_up IS NOT NULL) AS has_snapshot
    FROM latest_snap s
    FULL OUTER JOIN post_snap_txns p ON p.usuario_up = s.usuario_up
    FULL OUTER JOIN computed_balance c ON c.usuario_up = COALESCE(s.usuario_up, p.usuario_up)
""")
saldo_carga_rows = cur.fetchall()

# Build saldo maps by CPF - accumulate when multiple names resolve to same CPF
saldo_controle_by_cpf = {}
for r in saldo_controle_rows:
    cpf = resolve_cpf(r[0])
    if cpf:
        snap = float(r[1]) if r[1] else 0
        computed = float(r[2]) if r[2] else 0
        has_snap = r[3]
        val = snap if has_snap else computed
        saldo_controle_by_cpf[cpf] = saldo_controle_by_cpf.get(cpf, 0) + val

saldo_carga_by_cpf = {}
for r in saldo_carga_rows:
    cpf = resolve_cpf(r[0])
    if cpf:
        snap = float(r[1]) if r[1] else 0
        computed = float(r[2]) if r[2] else 0
        has_snap = r[3]
        val = snap if has_snap else computed
        saldo_carga_by_cpf[cpf] = saldo_carga_by_cpf.get(cpf, 0) + val

# 6. Calculate financials for each CPF
print("Calculando financials por CPF...")

# Build extrato by CPF - accumulate when multiple names resolve to same CPF
carga_by_cpf = defaultdict(float)
transf_by_cpf = defaultdict(float)
tarifa_by_cpf = defaultdict(float)

for r in extrato_rows:
    cpf = resolve_cpf(r[0])
    if cpf:
        carga_by_cpf[cpf] += float(r[1] or 0)
        transf_by_cpf[cpf] += abs(float(r[2] or 0))
        tarifa_by_cpf[cpf] += abs(float(r[3] or 0))

# Calculate saldo_prestacao after accumulating all extrato for each CPF
saldo_prestacao_by_cpf = {}
for cpf in carga_by_cpf:
    somase = somase_by_cpf.get(cpf, 0)
    sp = r2(carga_by_cpf[cpf] - transf_by_cpf[cpf] - tarifa_by_cpf[cpf] - somase)
    saldo_prestacao_by_cpf[cpf] = sp

# 7. Load manual inputs
print("Lendo manual inputs...")
cur.execute(f"""
    SELECT col_1qz, adiantamento, obs, cpf
    FROM quinzena_manual_inputs
    WHERE year = {YEAR} AND month = {MONTH} AND quinzena = {QUINZENA}
""")
manual_by_cpf = {}
for r in cur.fetchall():
    if r[3]:
        manual_by_cpf[r[3]] = {
            'col_1qz': float(r[0]) if r[0] else None,
            'adiantamento': float(r[1]) if r[1] else 0,
            'obs': r[2] or '',
        }

# 8. Build result rows for all cadastro
print("Construindo resultados...")
results = []
for c in cadastro:
    cpf = c[0]
    colaborador = c[1] or ''
    situacao = c[2] or ''
    status_cartao = c[3] or ''
    regional = c[4]
    centro_custo = c[5]
    gestor = c[6]
    diretor = c[7]
    
    carga = carga_by_cpf.get(cpf, 0)
    transf = transf_by_cpf.get(cpf, 0)
    tarifa = tarifa_by_cpf.get(cpf, 0)
    prestacao = somase_by_cpf.get(cpf, 0)
    sp = saldo_prestacao_by_cpf.get(cpf, 0)
    sc = saldo_controle_by_cpf.get(cpf, 0)
    sf = r2(sp - sc)
    
    manual = manual_by_cpf.get(cpf, {})
    col_qz = manual.get('col_1qz')
    adiantamento = manual.get('adiantamento', 0)
    obs = manual.get('obs', '')
    
    # Carga formulas
    is_pendente = 'pendente' in status_cartao.lower()
    if is_pendente:
        carga_parcial = 0
        reembolso = 0
        carga_final = 0
    else:
        col_qz_efetivo = col_qz if col_qz is not None else 0
        carga_parcial = r2(col_qz_efetivo - max(sf, 0) - sc - adiantamento)
        reembolso = r2(max(0, sp) * 0.5) if QUINZENA == 1 else 0
        carga_final = r2(max(0, carga_parcial) + reembolso)
    
    results.append({
        'cpf': cpf, 'colaborador': colaborador, 'situacao': situacao, 'status_cartao': status_cartao,
        'regional': regional, 'centro_custo': centro_custo, 'gestor': gestor, 'diretor': diretor,
        'carga': carga, 'transferencia': transf, 'tarifa': tarifa, 'prestacao': prestacao,
        'saldo_prestacao': sp, 'saldo_cartao': sc, 'saldo_final': sf,
        'saldo_reembolsar': max(0, sp),
        'col_qz': col_qz, 'adiantamento': adiantamento, 'obs': obs,
        'carga_parcial': carga_parcial, 'reembolso': reembolso, 'carga_final': carga_final,
    })

print(f"  {len(results)} pessoas calculadas")

# 9. Delete old frozen snapshots and insert new ones
print("Atualizando frozen snapshots...")
cur.execute(f"""
    DELETE FROM quinzena_frozen_snapshots
    WHERE year = {YEAR} AND month = {MONTH} AND quinzena = {QUINZENA}
""")
deleted = cur.rowcount
print(f"  {deleted} snapshots antigos deletados")

# Insert new ones
for r in results:
    cur.execute(f"""
        INSERT INTO quinzena_frozen_snapshots (
            year, month, quinzena, cpf,
            colaborador, situacao, status_cartao,
            regional, centro_custo, gestor, diretor,
            carga, transferencia, tarifa, prestacao,
            saldo_prestacao, saldo_cartao, saldo_final,
            saldo_reembolsar, col_qz, adiantamento, obs,
            carga_parcial, reembolso, carga_final,
            reembolso_multiplier, frozen_by
        ) VALUES (
            {YEAR}, {MONTH}, {QUINZENA}, %s,
            %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            0.5, 'recalculate_script'
        )
        ON CONFLICT (year, month, quinzena, cpf) DO UPDATE SET
            colaborador = EXCLUDED.colaborador,
            situacao = EXCLUDED.situacao,
            status_cartao = EXCLUDED.status_cartao,
            regional = EXCLUDED.regional,
            centro_custo = EXCLUDED.centro_custo,
            gestor = EXCLUDED.gestor,
            diretor = EXCLUDED.diretor,
            carga = EXCLUDED.carga,
            transferencia = EXCLUDED.transferencia,
            tarifa = EXCLUDED.tarifa,
            prestacao = EXCLUDED.prestacao,
            saldo_prestacao = EXCLUDED.saldo_prestacao,
            saldo_cartao = EXCLUDED.saldo_cartao,
            saldo_final = EXCLUDED.saldo_final,
            saldo_reembolsar = EXCLUDED.saldo_reembolsar,
            col_qz = EXCLUDED.col_qz,
            adiantamento = EXCLUDED.adiantamento,
            obs = EXCLUDED.obs,
            carga_parcial = EXCLUDED.carga_parcial,
            reembolso = EXCLUDED.reembolso,
            carga_final = EXCLUDED.carga_final
    """, (
        r['cpf'], r['colaborador'], r['situacao'], r['status_cartao'],
        r['regional'], r['centro_custo'], r['gestor'], r['diretor'],
        r['carga'], r['transferencia'], r['tarifa'], r['prestacao'],
        r['saldo_prestacao'], r['saldo_cartao'], r['saldo_final'],
        r['saldo_reembolsar'], r['col_qz'], r['adiantamento'], r['obs'],
        r['carga_parcial'], r['reembolso'], r['carga_final'],
    ))

conn.commit()
print(f"  {len(results)} novos snapshots inseridos")

# 10. Verify specific people
print("\nVerificando pessoas corrigidas:")
check_cpfs = ['00185106048', '00448428997', '65975499020', '67645984015', 
              '85299839049', '99413736049', '08196835906', '68187483920',
              '03738994912', '06223031980', '11178519740', '02013700008',
              '00041171071', '29011288823']
cur.execute(f"""
    SELECT cpf, colaborador, carga, transferencia, tarifa, prestacao, saldo_prestacao, saldo_final
    FROM quinzena_frozen_snapshots
    WHERE year = {YEAR} AND month = {MONTH} AND quinzena = {QUINZENA}
    AND cpf = ANY(ARRAY{check_cpfs.__repr__() if isinstance(check_cpfs, list) else '[]'})
""")
for r in cur.fetchall():
    print(f"  {r[0]} {r[1]}: carga={r[2]}, transf={r[3]}, tarifa={r[4]}, prest={r[5]}, saldo_prest={r[6]}, saldo_final={r[7]}")

cur.close()
conn.close()
print("\nDone!")
