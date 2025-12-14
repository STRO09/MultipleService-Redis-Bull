import {
  Breadcrumbs,
  Link,
  Typography,
  Menu,
  MenuItem,
  IconButton,
  Chip,
  Box
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import HomeIcon from '@mui/icons-material/Home';
import StorageIcon from '@mui/icons-material/Storage';
import DnsIcon from '@mui/icons-material/Dns';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function BreadCrumbNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [registerAnchorEl, setRegisterAnchorEl] = useState<null | HTMLElement>(null);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  
  const handleRegisterOpen = (event: React.MouseEvent<HTMLElement>) => setRegisterAnchorEl(event.currentTarget);
  const handleRegisterClose = () => setRegisterAnchorEl(null);
  
  const handleRoute = (path: string) => {
    navigate(path);
    handleClose();
  };

  // Determine current page
  const isRegisterPage = location.pathname === '/';
  const isBulkUploadPage = location.pathname === '/bulk-upload';
  const isMongoDBPage = location.pathname === '/data/mongodb';
  const isMySQLPage = location.pathname === '/data/mysql';

  return (
    <Breadcrumbs 
      aria-label="breadcrumb"
      separator={<Box sx={{ color: 'divider', mx: 0.5 }}>/</Box>}
      sx={{ 
        '& .MuiBreadcrumbs-ol': {
          alignItems: 'center',
          flexWrap: 'wrap',
        }
      }}
    >
      {/* Home Link with dropdown for Register and Data options */}
      <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <Link
          underline="none"
          onClick={handleOpen}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: 'text.secondary',
            cursor: 'pointer',
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            '&:hover': {
              color: 'primary.main',
              backgroundColor: 'action.hover',
            },
            transition: 'all 0.2s ease',
          }}
        >
          <HomeIcon fontSize="small" />
          Navigation
          <IconButton
            size="small"
            onClick={handleOpen}
            sx={{ 
              ml: -0.5,
              color: 'inherit',
              '&:hover': { 
                backgroundColor: 'transparent',
                color: 'inherit'
              }
            }}
          >
            <ArrowDropDownIcon fontSize="small" />
          </IconButton>
        </Link>
        <Menu 
          anchorEl={anchorEl} 
          open={Boolean(anchorEl)} 
          onClose={handleClose}
          PaperProps={{
            sx: {
              mt: 1,
              borderRadius: 2,
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
              minWidth: 200,
            }
          }}
        >
          <MenuItem 
            onClick={handleRegisterOpen}
            sx={{ 
              borderRadius: 1,
              mx: 1,
              my: 0.5,
              bgcolor: (isRegisterPage || isBulkUploadPage) ? 'primary.50' : 'transparent',
              '&:hover': {
                backgroundColor: 'action.hover',
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <HowToRegIcon fontSize="small" sx={{ color: '#1976d2' }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={500}>Register</Typography>
                <Typography variant="caption" color="text.secondary">
                  {isRegisterPage ? 'Single submission' : isBulkUploadPage ? 'Bulk upload' : 'User registration'}
                </Typography>
              </Box>
              <ArrowDropDownIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </Box>
          </MenuItem>
          <MenuItem 
            onClick={() => handleRoute("/data/mongodb")}
            sx={{ 
              borderRadius: 1,
              mx: 1,
              my: 0.5,
              bgcolor: isMongoDBPage ? 'primary.50' : 'transparent',
              '&:hover': {
                backgroundColor: 'action.hover',
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <StorageIcon fontSize="small" sx={{ color: '#10B981' }} />
              <Box>
                <Typography variant="body2" fontWeight={500}>MongoDB Data</Typography>
                <Typography variant="caption" color="text.secondary">NoSQL database view</Typography>
              </Box>
            </Box>
          </MenuItem>
          <MenuItem 
            onClick={() => handleRoute("/data/mysql")}
            sx={{ 
              borderRadius: 1,
              mx: 1,
              my: 0.5,
              bgcolor: isMySQLPage ? 'primary.50' : 'transparent',
              '&:hover': {
                backgroundColor: 'action.hover',
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <DnsIcon fontSize="small" sx={{ color: '#3B82F6' }} />
              <Box>
                <Typography variant="body2" fontWeight={500}>MySQL Data</Typography>
                <Typography variant="caption" color="text.secondary">Relational database view</Typography>
              </Box>
            </Box>
          </MenuItem>
        </Menu>
      </Box>

      {/* Nested Register Menu */}
      <Menu
        anchorEl={registerAnchorEl}
        open={Boolean(registerAnchorEl)}
        onClose={handleRegisterClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        PaperProps={{
          sx: {
            mt: -1,
            ml: 1,
            borderRadius: 2,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
            minWidth: 220,
          }
        }}
      >
        <MenuItem 
          onClick={() => {
            navigate("/");
            handleRegisterClose();
            handleClose();
          }}
          sx={{ 
            borderRadius: 1,
            mx: 1,
            my: 0.5,
            bgcolor: isRegisterPage ? 'primary.50' : 'transparent',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
            <PersonAddIcon fontSize="small" sx={{ color: '#1976d2' }} />
            <Box>
              <Typography variant="body2" fontWeight={500}>Single Submission</Typography>
              <Typography variant="caption" color="text.secondary">Submit individual records</Typography>
            </Box>
          </Box>
        </MenuItem>
        <MenuItem 
          onClick={() => {
            navigate("/bulk-upload");
            handleRegisterClose();
            handleClose();
          }}
          sx={{ 
            borderRadius: 1,
            mx: 1,
            my: 0.5,
            bgcolor: isBulkUploadPage ? 'primary.50' : 'transparent',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
            <CloudUploadIcon fontSize="small" sx={{ color: '#9333EA' }} />
            <Box>
              <Typography variant="body2" fontWeight={500}>Bulk Upload</Typography>
              <Typography variant="caption" color="text.secondary">Upload multiple records via CSV/Excel</Typography>
            </Box>
          </Box>
        </MenuItem>
      </Menu>

      {/* Current Page Indicator */}
      {isRegisterPage && (
        <Chip
          icon={<PersonAddIcon />}
          label="Single Submission"
          size="small"
          sx={{
            height: 32,
            borderRadius: 2,
            backgroundColor: '#1976d2',
            color: 'white',
            fontWeight: 500,
            '& .MuiChip-icon': {
              color: 'white',
            }
          }}
        />
      )}
      {isBulkUploadPage && (
        <Chip
          icon={<CloudUploadIcon />}
          label="Bulk Upload"
          size="small"
          sx={{
            height: 32,
            borderRadius: 2,
            backgroundColor: '#9333EA',
            color: 'white',
            fontWeight: 500,
            '& .MuiChip-icon': {
              color: 'white',
            }
          }}
        />
      )}
      {isMongoDBPage && (
        <Chip
          icon={<StorageIcon />}
          label="MongoDB Data"
          size="small"
          sx={{
            height: 32,
            borderRadius: 2,
            backgroundColor: '#10B981',
            color: 'white',
            fontWeight: 500,
            '& .MuiChip-icon': {
              color: 'white',
            }
          }}
        />
      )}
      {isMySQLPage && (
        <Chip
          icon={<DnsIcon />}
          label="MySQL Data"
          size="small"
          sx={{
            height: 32,
            borderRadius: 2,
            backgroundColor: '#3B82F6',
            color: 'white',
            fontWeight: 500,
            '& .MuiChip-icon': {
              color: 'white',
            }
          }}
        />
      )}
    </Breadcrumbs>
  );
}

export default BreadCrumbNav;