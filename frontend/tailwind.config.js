/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  // O "reset" do Tailwind é desligado para não conflitar com o CssBaseline do Material-UI
  corePlugins: { preflight: false },
  important: true, // utilitários do Tailwind prevalecem sobre estilos do MUI (inclusive em diálogos)
  theme: {
    extend: {
      colors: { catolica: { DEFAULT: '#9b1b30', dark: '#6e1322' } },
    },
  },
  plugins: [],
};
