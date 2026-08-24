# -*- coding: utf-8 -*-
"""Remove emojis de strings de UI do app.js, substituindo por texto formal."""
import re

path = r'C:\Users\neitz\OneDrive\ECOMIM\ECOMIM_2\src\app.js'
with open(path, encoding='utf-8') as f:
    code = f.read()

# Substituições explícitas (emoji + texto -> texto formal)
subs = [
    ('🤖 Insight da IA', 'Insight da IA'),
    ('🤖 Leitura rápida da IA', 'Leitura rápida da IA'),
    ('🤖 Assistente IA', 'Assistente IA'),
    ('🤖 IA: sugerir resposta', 'IA: sugerir resposta'),
    ('🦊 Caçador de Leads', 'Caçador de Leads'),
    ('➕ Novo lead', 'Novo lead'),
    ('➕ Nova tarefa', 'Nova tarefa'),
    ('📥 Importar backup', 'Importar backup'),
    ('➕ Novo evento', 'Novo evento'),
    ('➕ Nova conta', 'Nova conta'),
    ('➕ Novo ticket', 'Novo ticket'),
    ('➕ Novo cliente', 'Novo cliente'),
    ('➕ Encaminhar lead', 'Encaminhar lead'),
    ('🔑 Esqueci minha senha', 'Esqueci minha senha'),
]
for old, new in subs:
    code = code.replace(old, new)

EMOJI = re.compile(
    '[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0000FE0F\U0001F1E6-\U0001F1FF]'
)

def clean(m):
    s = m.group(0)
    # remove emojis do conteúdo da string literal
    return EMOJI.sub('', s)

# Aplica a limpeza dentro de strings entre aspas simples e duplas,
# apenas quando há emoji presente (preserva código).
# Estratégia segura: remover emojis do arquivo inteiro fora de comentários,
# mantendo o restante intacto.
lines = code.split('\n')
out = []
for ln in lines:
    stripped = ln.strip()
    if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*'):
        out.append(ln)
        continue
    # dentro de string? simplificação: remove emoji direto
    out.append(EMOJI.sub('', ln))

code = '\n'.join(out)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

rest = EMOJI.findall(code)
print('Emojis restantes em app.js:', len(rest))
