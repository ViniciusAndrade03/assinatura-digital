import { useState } from 'react';
import { Card, CardContent, Typography, Chip, Box, Button, Table, TableBody, TableRow, TableCell, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { api } from '../lib/api';
import { sha256Hex } from '../lib/signing';
import { brl, dateBR, dateTimeBR, CATEGORIES, STATUS, short } from '../lib/format';

export function StatusChip({ status }) {
  const s = STATUS[status] || { label: status, color: 'default' };
  return <Chip size="small" label={s.label} color={s.color} />;
}

/** Abre o recibo e confere, no navegador, se o SHA-256 do arquivo baixado bate com o registrado. */
function ReceiptRow({ expenseId, receipt }) {
  const [integrity, setIntegrity] = useState(null);
  const [url, setUrl] = useState(null);

  async function open() {
    const res = await api(`/expenses/${expenseId}/receipts/${receipt.id}`, { raw: true });
    const buf = await res.arrayBuffer();
    setIntegrity((await sha256Hex(buf)) === receipt.sha256);
    setUrl(URL.createObjectURL(new Blob([buf], { type: receipt.mimeType })));
  }

  function close() {
    URL.revokeObjectURL(url);
    setUrl(null);
  }

  return (
    <TableRow>
      <TableCell>{receipt.filename}</TableCell>
      <TableCell className="mono text-xs">{short(receipt.sha256, 16)}</TableCell>
      <TableCell>
        <Button size="small" startIcon={<OpenInNewIcon />} onClick={open}>Abrir e conferir hash</Button>
        {integrity !== null && <Chip size="small" className="ml-2" color={integrity ? 'success' : 'error'} label={integrity ? 'Íntegro' : 'ALTERADO'} />}
        <Dialog open={!!url} onClose={close} fullWidth maxWidth="md">
          <DialogTitle>{receipt.filename}</DialogTitle>
          <DialogContent>
            {url && (receipt.mimeType === 'application/pdf'
              ? <iframe src={url} title={receipt.filename} className="h-[70vh] w-full border-0" />
              : <img src={url} alt={receipt.filename} className="mx-auto max-h-[70vh] max-w-full" />)}
          </DialogContent>
          <DialogActions>
            <Button component="a" href={url || '#'} download={receipt.filename}>Baixar</Button>
            <Button onClick={close}>Fechar</Button>
          </DialogActions>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

export default function ExpenseDetails({ expense }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Box className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Typography variant="h6">{expense.title}</Typography>
          <StatusChip status={expense.status} />
        </Box>
        <Box className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Typography><b>Colaborador:</b> {expense.employee.name} ({expense.employee.email})</Typography>
          <Typography><b>Valor:</b> {brl(expense.amountCents)}</Typography>
          <Typography><b>Categoria:</b> {CATEGORIES[expense.category]}</Typography>
          <Typography><b>Data da despesa:</b> {dateBR(expense.expenseDate)}</Typography>
          <Typography><b>Enviado em:</b> {dateTimeBR(expense.createdAt)}</Typography>
        </Box>
        {expense.description && <Typography className="mt-2 whitespace-pre-wrap"><b>Descrição:</b> {expense.description}</Typography>}
        {expense.validation && (
          <Alert severity={expense.validation.approved ? 'info' : 'error'} className="mt-3">
            {expense.validation.approved ? 'Validado' : 'Rejeitado'} por {expense.validation.byName} em {dateTimeBR(expense.validation.at)}
            {expense.validation.comment ? ` — "${expense.validation.comment}"` : ''}
          </Alert>
        )}
        <Typography variant="subtitle1" className="mt-4">Recibos ({expense.receipts.length})</Typography>
        <Box className="overflow-x-auto">
          <Table size="small">
            <TableBody>
              {expense.receipts.map((r) => <ReceiptRow key={r.id} expenseId={expense.id} receipt={r} />)}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
}
