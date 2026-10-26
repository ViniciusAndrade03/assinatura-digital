import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Card, CardContent, CardActionArea, Typography, Box, Alert } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/ReceiptLong';
import PendingIcon from '@mui/icons-material/PendingActions';
import TaskIcon from '@mui/icons-material/TaskAlt';
import VerifiedIcon from '@mui/icons-material/VerifiedUser';
import Layout from '../components/Layout';
import ExpenseTable from '../components/ExpenseTable';
import SigningKeyCard from '../components/SigningKeyCard';
import { useAuth, REVIEWERS } from '../lib/useAuth';
import { api } from '../lib/api';
import { brl, STATUS } from '../lib/format';

const ACTIONS = [
  { href: '/submitExpense/', title: 'Cadastrar relatório de despesa', desc: 'Enviar despesa com recibos', icon: <ReceiptIcon fontSize="large" />, roles: null },
  { href: '/employees/', title: 'Funcionários', desc: 'Cadastrar, listar, editar e excluir', icon: <PeopleIcon fontSize="large" />, roles: ['gerente'] },
  { href: '/pendingExpenses/', title: 'Documentos pendentes', desc: 'Validar e assinar', icon: <PendingIcon fontSize="large" />, roles: REVIEWERS },
  { href: '/signedExpenses/', title: 'Documentos assinados', desc: 'Consultar assinaturas', icon: <TaskIcon fontSize="large" />, roles: REVIEWERS },
  { href: '/verifySignature/', title: 'Verificar assinatura', desc: 'Autenticidade e integridade', icon: <VerifiedIcon fontSize="large" />, roles: REVIEWERS },
];

/** dashboard.js — página principal após o login. */
export default function Dashboard() {
  const user = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [mine, setMine] = useState(null);

  useEffect(() => {
    if (!user) return;
    api('/expenses/stats').then((d) => setStats(d.stats));
    api('/expenses?scope=mine').then((d) => setMine(d.expenses));
  }, [user]);

  return (
    <Layout user={user} title={user ? `Olá, ${user.name.split(' ')[0]}` : ''}>
      {router.query.negado && <Alert severity="warning" className="mb-4">Você não tem permissão para acessar aquela página.</Alert>}

      {stats && (
        <Box className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(STATUS).map(([k, s]) => (
            <Card key={k} variant="outlined">
              <CardContent>
                <Typography variant="overline" color="text.secondary">{s.label}{user && !REVIEWERS.includes(user.role) ? ' (meus)' : ''}</Typography>
                <Typography variant="h4">{stats[k].count}</Typography>
                <Typography variant="body2" color="text.secondary">{brl(stats[k].totalCents)}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Box className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {user && ACTIONS.filter((a) => !a.roles || a.roles.includes(user.role)).map((a) => (
          <Card key={a.href} variant="outlined">
            <CardActionArea component={Link} href={a.href} className="h-full">
              <CardContent className="flex items-center gap-3">
                <Box className="text-catolica">{a.icon}</Box>
                <Box>
                  <Typography variant="subtitle1" className="font-semibold">{a.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{a.desc}</Typography>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      {user && REVIEWERS.includes(user.role) && (
        <Box className="mb-6"><SigningKeyCard /></Box>
      )}

      <Typography variant="h6" className="mb-2">Meus relatórios</Typography>
      <ExpenseTable expenses={mine} showEmployee={false} empty="Você ainda não enviou relatórios." />
    </Layout>
  );
}
