import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AppBar, Toolbar, Typography, Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  IconButton, Button, CircularProgress, Divider, useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/ReceiptLong';
import PendingIcon from '@mui/icons-material/PendingActions';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import DrawIcon from '@mui/icons-material/Draw';
import VerifiedIcon from '@mui/icons-material/VerifiedUser';
import TaskIcon from '@mui/icons-material/TaskAlt';
import LogoutIcon from '@mui/icons-material/Logout';
import { logout } from '../lib/api';
import { ROLES } from '../lib/format';
import ChangePasswordDialog from './ChangePasswordDialog';

const NAV = [
  { href: '/dashboard/', label: 'Dashboard', icon: <DashboardIcon />, roles: null },
  { href: '/submitExpense/', label: 'Novo relatório', icon: <ReceiptIcon />, roles: null },
  { href: '/employees/', label: 'Funcionários', icon: <PeopleIcon />, roles: ['gerente'] },
  { href: '/pendingExpenses/', label: 'Pendentes', icon: <PendingIcon />, roles: ['aprovador', 'gerente'] },
  { href: '/validateExpense/', label: 'Validar', icon: <FactCheckIcon />, roles: ['aprovador', 'gerente'] },
  { href: '/signExpense/', label: 'Assinar', icon: <DrawIcon />, roles: ['aprovador', 'gerente'] },
  { href: '/signedExpenses/', label: 'Assinados', icon: <TaskIcon />, roles: ['aprovador', 'gerente'] },
  { href: '/verifySignature/', label: 'Verificar assinatura', icon: <VerifiedIcon />, roles: ['aprovador', 'gerente'] },
];

const WIDTH = 240;

export default function Layout({ user, title, children }) {
  const router = useRouter();
  const desktop = useMediaQuery('(min-width:900px)');
  const [open, setOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  if (!user) {
    return (
      <Box className="flex h-screen items-center justify-center">
        <CircularProgress />
      </Box>
    );
  }

  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  const drawer = (
    <Box sx={{ width: WIDTH }} role="navigation">
      <Toolbar />
      <List>
        {items.map((n) => (
          <ListItemButton key={n.href} component={Link} href={n.href} selected={router.pathname === n.href.replace(/\/$/, '')} onClick={() => setOpen(false)}>
            <ListItemIcon>{n.icon}</ListItemIcon>
            <ListItemText primary={n.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <List>
        <ListItemButton onClick={() => setPwdOpen(true)}>
          <ListItemText primary="Alterar senha" />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box className="flex min-h-screen bg-gray-50">
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          {!desktop && (
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} aria-label="menu">
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" className="flex-1 truncate">Assinatura Digital</Typography>
          <Box className="mr-3 hidden text-right sm:block">
            <Typography variant="body2">{user.name}</Typography>
            <Typography variant="caption">{ROLES[user.role]}</Typography>
          </Box>
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={() => { logout(); router.replace('/login/'); }}>
            Sair
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer variant={desktop ? 'permanent' : 'temporary'} open={desktop || open} onClose={() => setOpen(false)} sx={{ width: WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: WIDTH } }}>
        {drawer}
      </Drawer>
      <Box component="main" className="w-full min-w-0 flex-1 p-4 md:p-6">
        <Toolbar />
        {title && <Typography variant="h5" className="mb-4 font-semibold">{title}</Typography>}
        {children}
      </Box>
      <ChangePasswordDialog open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Box>
  );
}
