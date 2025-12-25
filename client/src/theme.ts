import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#d46a1f',
    },
    secondary: {
      main: '#1f7a8c',
    },
    background: {
      default: '#f8f4ef',
      paper: '#fffaf3',
    },
    text: {
      primary: '#1c1b18',
      secondary: '#5e574d',
    },
  },
  typography: {
    fontFamily: '"Space Grotesk", "IBM Plex Sans", sans-serif',
    h6: {
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
});

export default theme;