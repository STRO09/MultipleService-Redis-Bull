import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Register from './components/Register';
import MongoDBData from './components/MongoDBData';
import MySQLData from './components/MySQLData';
import BulkUpload from './components/BulkUpload';
import { Grid } from '@mui/material';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    background: {
      default: '#f8fafc',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Grid
          container
          sx={{
            minHeight: '100vh',
            width: '100vw',
            margin: 0,
            padding: 0,
            bgcolor: '#f8fafc'
          }}
        >
          <Grid
            item
            xs={12}
            sx={{
              display: 'flex',
                 flexDirection: 'column',
    minHeight: '100vh',
    width: '100%',
    p: 0,
    m: 0,
            }}
          >
            <Routes>
              <Route path="/" element={<Register />} />
              <Route path="/data/mongodb" element={<MongoDBData />} />
              <Route path="/data/mysql" element={<MySQLData />} />
               <Route path="/bulk-upload" element={<BulkUpload />} />
            </Routes>
          </Grid>
        </Grid>
      </Router>
    </ThemeProvider>
  );
}

export default App;