import { useState } from 'react';
import { io } from 'socket.io-client';
import {
  Paper,
  Typography,
  TextField,
  MenuItem,
  Button,
  Box,
  Avatar,
  Stack,
  useTheme,
  Fade,
  Alert,
  CircularProgress
} from '@mui/material';
import BreadCrumbNav from './breadcrumb';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SendIcon from '@mui/icons-material/Send';

const SERVER_URL=import.meta.env.VITE_SERVER_URL;

function Register() {
  const [formData, setFormData] = useState({ name: "", age: 0, foods: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const theme = useTheme();

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`http://${SERVER_URL}/api/FormUpload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Success:', data);
      
      setSuccess(true);
      // Reset form after successful submission
      setFormData({ name: "", age: 0, foods: "" });
      
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(err.message || 'Failed to submit form');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ 
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      height: '100vh',   
      p: 2
    }}>
      <Fade in={true} timeout={500}>
        <Paper 
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4 },
            width: '100%',
            maxWidth: '500px',
            borderRadius: 4,
            background: 'white',
            border: '2px solid',
            borderColor: 'primary.main',
            boxShadow: '0 20px 60px rgba(25, 118, 210, 0.1)',
          }}
        >
          {/* Breadcrumb */}
          <Box sx={{ mb: 4 }}>
            <BreadCrumbNav />
          </Box>

          {/* Header Section */}
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
            <Avatar
              sx={{
                bgcolor: theme.palette.primary.main,
                width: 48,
                height: 48,
                border: '2px solid',
                borderColor: 'primary.light',
              }}
            >
              <PersonAddIcon />
            </Avatar>
            <Box>
              <Typography variant="h5" component="h1" sx={{ 
                fontWeight: 700,
                color: 'text.primary',
                lineHeight: 1.2
              }}>
                User Registration
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Complete your profile details
              </Typography>
            </Box>
          </Stack>

          {/* Success/Error Messages */}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Registered successfully!
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleFormSubmit}>
            <Stack spacing={3}>
              <TextField
                fullWidth
                label="Full Name"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                placeholder="John Doe"
                required
                disabled={loading}
                variant="outlined"
                size="medium"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  }
                }}
              />

              <TextField
                fullWidth
                label="Age"
                name="age"
                type="number"
                value={formData.age}
                onChange={handleFormChange}
                placeholder="25"
                inputProps={{ min: "0", max: "120" }}
                required
                disabled={loading}
                variant="outlined"
                size="medium"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  }
                }}
              />

              <TextField
                select
                fullWidth
                label="Food Preferences"
                name="foods"
                value={formData.foods}
                onChange={handleFormChange}
                required
                disabled={loading}
                variant="outlined"
                size="medium"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  }
                }}
              >
                <MenuItem value="" disabled>Choose your preference</MenuItem>
                <MenuItem value="nonveg">🍗 Non-Vegetarian</MenuItem>
                <MenuItem value="egg">🥚 Only Egg</MenuItem>
                <MenuItem value="veg">🥦 Vegetarian</MenuItem>
              </TextField>

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                sx={{
                  py: 1.5,
                  borderRadius: 2,
                  fontWeight: 600,
                  fontSize: '1rem',
                  textTransform: 'none',
                  border: '1px solid',
                  borderColor: 'primary.dark',
                  '&:hover': {
                    boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                {loading ? 'Submitting...' : 'Submit'}
              </Button>
            </Stack>
          </form>

          <Box sx={{ 
            mt: 4, 
            pt: 3, 
            borderTop: '1px solid',
            borderColor: 'divider',
            textAlign: 'center'
          }}>
            <Typography variant="caption" color="text.secondary">
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                🔒 Secure WebSocket connection to: 10.10.15.140:3007
              </Box>
            </Typography>
          </Box>
        </Paper>
      </Fade>
    </Box>
  );
}

export default Register;