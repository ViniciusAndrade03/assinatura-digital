import Head from 'next/head';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import '../styles/globals.css';

const theme = createTheme({
  palette: {
    primary: { main: '#9b1b30' },
    secondary: { main: '#37474f' },
  },
  shape: { borderRadius: 8 },
});

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider theme={theme}>
      <Head>
        <title>Assinatura Digital de Despesas</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <CssBaseline />
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
