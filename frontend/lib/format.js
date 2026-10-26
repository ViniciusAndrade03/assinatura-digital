export const brl = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dateBR = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');

export const dateTimeBR = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

export const CATEGORIES = {
  transporte: 'Transporte',
  hospedagem: 'Hospedagem',
  alimentacao: 'Alimentação',
  material: 'Material',
  combustivel: 'Combustível',
  outros: 'Outros',
};

export const ROLES = { colaborador: 'Colaborador', aprovador: 'Aprovador (financeiro)', gerente: 'Gerente' };

export const STATUS = {
  PENDENTE: { label: 'Pendente', color: 'warning' },
  VALIDADO: { label: 'Validado', color: 'info' },
  REJEITADO: { label: 'Rejeitado', color: 'error' },
  ASSINADO: { label: 'Assinado', color: 'success' },
};

export const short = (hash, n = 12) => (hash ? `${hash.slice(0, n)}…${hash.slice(-6)}` : '');
