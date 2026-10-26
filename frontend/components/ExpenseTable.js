import { Table, TableHead, TableBody, TableRow, TableCell, Box, Typography } from '@mui/material';
import { StatusChip } from './ExpenseDetails';
import { brl, dateBR, CATEGORIES } from '../lib/format';

/** Tabela genérica de relatórios. `actions(expense)` renderiza os botões da última coluna. */
export default function ExpenseTable({ expenses, actions, showEmployee = true, empty = 'Nenhum relatório.' }) {
  if (!expenses) return null;
  if (!expenses.length) return <Typography color="text.secondary" className="py-4">{empty}</Typography>;
  return (
    <Box className="overflow-x-auto rounded border bg-white">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Título</TableCell>
            {showEmployee && <TableCell>Colaborador</TableCell>}
            <TableCell>Categoria</TableCell>
            <TableCell align="right">Valor</TableCell>
            <TableCell>Data</TableCell>
            <TableCell>Status</TableCell>
            {actions && <TableCell align="right">Ações</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id} hover>
              <TableCell>{e.title}</TableCell>
              {showEmployee && <TableCell>{e.employee.name}</TableCell>}
              <TableCell>{CATEGORIES[e.category]}</TableCell>
              <TableCell align="right">{brl(e.amountCents)}</TableCell>
              <TableCell>{dateBR(e.expenseDate)}</TableCell>
              <TableCell><StatusChip status={e.status} /></TableCell>
              {actions && <TableCell align="right" className="whitespace-nowrap">{actions(e)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
