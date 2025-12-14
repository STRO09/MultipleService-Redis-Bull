import { useState, useEffect, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Stack,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Pagination,
  Button,
  SelectChangeEvent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import BreadCrumbNav from './breadcrumb';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import SortIcon from '@mui/icons-material/Sort';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import NumbersIcon from '@mui/icons-material/Numbers';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoIcon from '@mui/icons-material/Info';
import TableChartIcon from '@mui/icons-material/TableChart';

interface FilterConfig {
  column: string;
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan';
  value: string;
}

function MySQLData() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
  const [showFiltersDialog, setShowFiltersDialog] = useState(false);
  const [newFilter, setNewFilter] = useState<FilterConfig>({
    column: '',
    operator: 'contains',
    value: ''
  });

  const SERVER_URL  = import.meta.env.VITE_SERVER_URL;

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected successfully for MySQL');
      setConnectionStatus('connected');
      setError(null);
      
      // Request initial data
      newSocket.emit('requestMySQLData');
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error for MySQL:', err);
      setConnectionStatus('disconnected');
      setError('Failed to connect to server. Please check if the backend is running.');
      setLoading(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected for MySQL:', reason);
      setConnectionStatus('disconnected');
      if (reason === 'io server disconnect') {
        setError('Disconnected from server. Trying to reconnect...');
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected for MySQL after', attemptNumber, 'attempts');
      setConnectionStatus('connected');
      setError(null);
      // Request data after reconnection
      newSocket.emit('requestMySQLData');
    });

    newSocket.on('reconnect_attempt', () => {
      console.log('Attempting to reconnect MySQL...');
      setConnectionStatus('connecting');
    });

    newSocket.on('reconnect_error', () => {
      setError('Reconnection failed for MySQL. Please refresh the page.');
    });

    // Handle MySQL data response
    newSocket.on('mysqlDataResponse', (response) => {
      console.log('Received mysqlDataResponse:', response);
      setLoading(false);
      setIsRefreshing(false);
      
      if (response.success) {
        setData(response.data || []);
        setLastUpdated(response.timestamp);
        setError(null);
        // Reset to first page when new data arrives
        setPage(1);
      } else {
        setError(response.error || 'Failed to fetch data from MySQL database');
        setData([]);
      }
    });

    // Listen for real-time updates from worker (when new data is inserted)
    newSocket.on('mysqlDataUpdate', (response) => {
      console.log('Received MySQL real-time update:', response);
      if (response.success) {
        // Request fresh data on update
        newSocket.emit('requestMySQLData');
      }
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up MySQL socket connection');
      newSocket.disconnect();
    };
  }, []);

  const handleRefresh = useCallback(() => {
    if (socket && connectionStatus === 'connected') {
      setLoading(true);
      setIsRefreshing(true);
      socket.emit('requestMySQLData');
    } else if (!socket) {
      setError('Socket not initialized. Please refresh the page.');
    }
  }, [socket, connectionStatus]);

  // Get unique column names
  const columns = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let filtered = [...data];

    // Apply search term
    if (searchTerm) {
      filtered = filtered.filter(row =>
        Object.values(row).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply filters
    filters.forEach(filter => {
      const { column, operator, value } = filter;
      if (!column || !value) return;

      filtered = filtered.filter(row => {
        const cellValue = String(row[column] || '').toLowerCase();
        const filterValue = value.toLowerCase();

        switch (operator) {
          case 'contains':
            return cellValue.includes(filterValue);
          case 'equals':
            return cellValue === filterValue;
          case 'startsWith':
            return cellValue.startsWith(filterValue);
          case 'endsWith':
            return cellValue.endsWith(filterValue);
          case 'greaterThan':
            return !isNaN(Number(cellValue)) && !isNaN(Number(filterValue)) && Number(cellValue) > Number(filterValue);
          case 'lessThan':
            return !isNaN(Number(cellValue)) && !isNaN(Number(filterValue)) && Number(cellValue) < Number(filterValue);
          default:
            return true;
        }
      });
    });

    // Apply sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.column];
        const bValue = b[sortConfig.column];

        if (aValue === bValue) return 0;
        if (aValue == null) return sortConfig.direction === 'asc' ? -1 : 1;
        if (bValue == null) return sortConfig.direction === 'asc' ? 1 : -1;

        const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [data, searchTerm, filters, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (page - 1) * rowsPerPage;
    return filteredData.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredData, page, rowsPerPage]);

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  // Handle pagination
  const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
  };

  const handleRowsPerPageChange = (event: SelectChangeEvent) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(1); // Reset to first page
  };

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortConfig?.column === column) {
      if (sortConfig.direction === 'asc') {
        setSortConfig({ column, direction: 'desc' });
      } else {
        setSortConfig(null);
      }
    } else {
      setSortConfig({ column, direction: 'asc' });
    }
  };

  // Handle filters
  const addFilter = () => {
    if (newFilter.column && newFilter.value) {
      setFilters([...filters, { ...newFilter }]);
      setNewFilter({ column: '', operator: 'contains', value: '' });
      setPage(1); // Reset to first page
    }
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    setFilters(newFilters);
    setPage(1); // Reset to first page
  };

  const clearAllFilters = () => {
    setFilters([]);
    setSearchTerm('');
    setSortConfig(null);
    setPage(1);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }) + ' • ' + date.toLocaleDateString();
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#10B981';
      case 'connecting': return '#F59E0B';
      case 'disconnected': return '#DC2626';
      default: return '#6B7280';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        bgcolor: '#f8fafc',
        p: { xs: 1, sm: 2, md: 3 },
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: { xs: 2, sm: 3, md: 4 },
          width: '100%',
          maxWidth: '1400px',
          borderRadius: 3,
          border: '2px solid',
          borderColor: connectionStatus === 'connected' ? '#3B82F6' : '#F59E0B',
          background: 'white',
          boxShadow: '0 8px 32px rgba(59, 130, 246, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {/* Connection Status Banner */}
        {connectionStatus !== 'connected' && (
          <Alert 
            severity={connectionStatus === 'connecting' ? 'warning' : 'error'}
            icon={connectionStatus === 'connecting' ? <WarningAmberIcon /> : <ErrorIcon />}
            sx={{ 
              borderRadius: 2,
              alignItems: 'center',
              '& .MuiAlert-message': { width: '100%' }
            }}
            action={
              connectionStatus === 'disconnected' && (
                <Tooltip title="Retry connection">
                  <IconButton size="small" onClick={handleRefresh}>
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              )
            }
          >
            <Typography fontWeight={600}>
              {connectionStatus === 'connecting' ? 'Connecting to MySQL server...' : 'MySQL connection lost'}
            </Typography>
            {connectionStatus === 'connecting' && (
              <LinearProgress sx={{ mt: 1, height: 4, borderRadius: 2 }} />
            )}
          </Alert>
        )}

        {/* Header */}
        <Box sx={{ mb: 2 }}>
          <BreadCrumbNav />
        </Box>

        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ mb: 3 }}>
            <Box sx={{ 
              p: 2, 
              bgcolor: '#DBEAFE', 
              borderRadius: 3,
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.1)'
            }}>
              <TableChartIcon sx={{ fontSize: { xs: 32, sm: 40 }, color: '#3B82F6' }} />
            </Box>
            <Box>
              <Typography variant="h4" component="h1" sx={{ 
                fontWeight: 800, 
                color: '#1E40AF',
                fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
                mb: 0.5
              }}>
                MySQL Data Dashboard
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Real-time relational database synchronization
              </Typography>
            </Box>
          </Stack>
          
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="center">
            {lastUpdated && (
              <Chip
                icon={<TimelapseIcon />}
                label={`Last updated: ${formatDate(lastUpdated)}`}
                variant="outlined"
                sx={{ 
                  borderColor: '#3B82F6', 
                  color: '#1E40AF',
                  fontWeight: 600,
                  px: 1,
                  fontSize: { xs: '0.875rem', sm: '1rem' }
                }}
              />
            )}
            <Tooltip title={connectionStatus === 'connected' ? "Refresh MySQL data" : "Cannot refresh - Disconnected"}>
              <span>
                <IconButton 
                  onClick={handleRefresh} 
                  disabled={loading || connectionStatus !== 'connected'}
                  sx={{ 
                    bgcolor: '#3B82F6',
                    color: 'white',
                    '&:hover': { 
                      bgcolor: '#1E40AF',
                      transform: 'rotate(180deg)',
                      transition: 'transform 0.3s'
                    },
                    '&.Mui-disabled': {
                      bgcolor: '#E5E7EB',
                      color: '#9CA3AF'
                    }
                  }}
                >
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>

        {/* Stats Grid */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              height: '100%', 
              border: '2px solid #DBEAFE',
              bgcolor: '#EFF6FF',
              borderRadius: 3,
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.05)',
              transition: 'all 0.3s',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.1)'
              }
            }}>
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <NumbersIcon sx={{ color: '#3B82F6', fontSize: 40, mb: 2 }} />
                <Typography variant="h6" color="#1E40AF" sx={{ fontWeight: 700, mb: 1 }}>
                  Total Rows
                </Typography>
                <Typography variant="h2" sx={{ fontWeight: 800, color: '#1E3A8A' }}>
                  {data.length}
                </Typography>
                <Typography variant="caption" color="#6B7280" sx={{ display: 'block', mt: 1 }}>
                  Records in foodpreferences table
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              height: '100%', 
              border: '2px solid #D1FAE5',
              bgcolor: '#F0FDF4',
              borderRadius: 3,
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)',
              transition: 'all 0.3s',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.1)'
              }
            }}>
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <ViewColumnIcon sx={{ color: '#10B981', fontSize: 40, mb: 2 }} />
                <Typography variant="h6" color="#047857" sx={{ fontWeight: 700, mb: 1 }}>
                  Columns
                </Typography>
                <Typography variant="h2" sx={{ fontWeight: 800, color: '#065F46' }}>
                  {columns.length}
                </Typography>
                <Typography variant="caption" color="#6B7280" sx={{ display: 'block', mt: 1 }}>
                  Table fields
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              height: '100%', 
              border: '2px solid #FDE68A',
              bgcolor: '#FEF3C7',
              borderRadius: 3,
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.05)',
              transition: 'all 0.3s',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.1)'
              }
            }}>
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="h6" color="#92400E" sx={{ fontWeight: 700, mb: 2 }}>
                  Filtered Rows
                </Typography>
                <Typography variant="h2" sx={{ 
                  fontWeight: 800, 
                  color: '#92400E',
                  fontSize: '2.5rem'
                }}>
                  {filteredData.length}
                </Typography>
                <Typography variant="caption" color="#92400E" sx={{ display: 'block', mt: 1 }}>
                  {filters.length > 0 ? `${filters.length} active filter(s)` : 'No filters applied'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              height: '100%', 
              border: '2px solid #E5E7EB',
              bgcolor: '#F9FAFB',
              borderRadius: 3,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.3s',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
              }
            }}>
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="h6" color="#374151" sx={{ fontWeight: 700, mb: 2 }}>
                  Showing
                </Typography>
                <Typography variant="h2" sx={{ 
                  fontWeight: 800, 
                  color: '#1F2937',
                  fontSize: '2.5rem'
                }}>
                  {paginatedData.length}
                </Typography>
                <Typography variant="caption" color="#6B7280" sx={{ display: 'block', mt: 1 }}>
                  Page {page} of {totalPages}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search and Filter Controls */}
        {!loading && data.length > 0 && (
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3, 
              bgcolor: '#F8FAFC',
              borderRadius: 3,
              border: '1px solid #E5E7EB'
            }}
          >
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  placeholder="Search across all columns..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: searchTerm && (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSearchTerm('')}>
                          <ClearIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  size="small"
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Tooltip title="Advanced Filters">
                    <Button
                      startIcon={<FilterListIcon />}
                      onClick={() => setShowFiltersDialog(true)}
                      variant="outlined"
                      size="small"
                      sx={{ 
                        borderColor: '#3B82F6',
                        color: '#3B82F6',
                        '&:hover': {
                          borderColor: '#1E40AF',
                          bgcolor: '#EFF6FF'
                        }
                      }}
                    >
                      Filters {filters.length > 0 && `(${filters.length})`}
                    </Button>
                  </Tooltip>
                  
                  {sortConfig && (
                    <Chip
                      icon={<SortIcon />}
                      label={`Sorted by: ${sortConfig.column} (${sortConfig.direction})`}
                      onDelete={() => setSortConfig(null)}
                      variant="outlined"
                      color="primary"
                      size="small"
                    />
                  )}
                  
                  {(searchTerm || filters.length > 0 || sortConfig) && (
                    <Button
                      startIcon={<ClearIcon />}
                      onClick={clearAllFilters}
                      variant="text"
                      size="small"
                      sx={{ color: '#DC2626' }}
                    >
                      Clear All
                    </Button>
                  )}
                  
                  <FormControl size="small" sx={{ minWidth: 120, ml: 'auto' }}>
                    <InputLabel>Rows per page</InputLabel>
                    <Select
                      value={rowsPerPage.toString()}
                      label="Rows per page"
                      onChange={handleRowsPerPageChange}
                    >
                      {[5, 10, 25, 50, 100].map((size) => (
                        <MenuItem key={size} value={size}>
                          {size} rows
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Grid>
            </Grid>

            {/* Active Filters Display */}
            {filters.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="#6B7280" sx={{ mb: 1, display: 'block' }}>
                  Active Filters:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {filters.map((filter, index) => (
                    <Chip
                      key={index}
                      label={`${filter.column} ${filter.operator} "${filter.value}"`}
                      onDelete={() => removeFilter(index)}
                      size="small"
                      variant="outlined"
                      sx={{ mb: 1 }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Paper>
        )}

        {/* Error Alert */}
        {error && (
          <Alert 
            severity="error" 
            icon={<ErrorIcon />}
            sx={{ 
              borderRadius: 2,
              alignItems: 'center',
              border: '1px solid #FCA5A5'
            }}
            action={
              <IconButton 
                size="small" 
                onClick={handleRefresh}
                disabled={connectionStatus !== 'connected'}
              >
                <RefreshIcon />
              </IconButton>
            }
          >
            <Typography fontWeight={600}>MySQL Error</Typography>
            <Typography variant="body2">{error}</Typography>
          </Alert>
        )}

        {/* Loading State */}
        {(loading || isRefreshing) && (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            py: 8,
            bgcolor: '#F8FAFC',
            borderRadius: 3,
            border: '2px dashed #DBEAFE'
          }}>
            <CircularProgress 
              sx={{ 
                color: '#3B82F6', 
                mb: 3,
                width: '60px !important',
                height: '60px !important'
              }} 
            />
            <Typography variant="h5" color="#1E40AF" fontWeight={600} sx={{ mb: 1 }}>
              {isRefreshing ? 'Refreshing MySQL Data...' : 'Loading MySQL Database'}
            </Typography>
            <Typography variant="body1" color="#6B7280">
              {connectionStatus === 'connected' 
                ? 'Fetching records from foodpreferences table...' 
                : 'Establishing MySQL connection...'}
            </Typography>
            {connectionStatus === 'connecting' && (
              <LinearProgress sx={{ mt: 3, width: '80%', height: 6, borderRadius: 3 }} />
            )}
          </Box>
        )}

        {/* Data Table */}
        {!loading && !error && data.length > 0 && (
          <Box sx={{ width: '100%' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E40AF' }}>
                MySQL Table Data
                <Typography component="span" variant="body1" color="#6B7280" sx={{ ml: 2 }}>
                  {filteredData.length === data.length 
                    ? `(${data.length} rows)` 
                    : `(${filteredData.length} of ${data.length} filtered rows)`}
                </Typography>
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Chip 
                  label="Real-time Sync" 
                  color="primary" 
                  variant="outlined"
                  icon={<CheckCircleIcon />}
                />
              </Stack>
            </Stack>
            
            <TableContainer 
              component={Paper} 
              variant="outlined"
              sx={{ 
                border: '2px solid #DBEAFE',
                borderRadius: 3,
                overflow: 'auto',
                maxHeight: '500px'
              }}
            >
              <Table stickyHeader sx={{ minWidth: 800 }}>
                <TableHead sx={{ bgcolor: '#EFF6FF' }}>
                  <TableRow>
                    <TableCell sx={{ 
                      fontWeight: 800, 
                      color: '#1E40AF',
                      fontSize: '0.875rem',
                      textAlign: 'center',
                      py: 2,
                      borderBottom: '2px solid #3B82F6',
                      borderRight: '1px solid #BFDBFE'
                    }}>
                      #
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell 
                        key={column} 
                        sx={{ 
                          fontWeight: 800, 
                          color: '#1E40AF',
                          fontSize: '0.875rem',
                          textAlign: 'center',
                          py: 2,
                          borderBottom: '2px solid #3B82F6',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          borderRight: '1px solid #BFDBFE',
                          cursor: 'pointer',
                          '&:hover': {
                            bgcolor: '#DBEAFE'
                          },
                          '&:last-child': {
                            borderRight: 'none'
                          }
                        }}
                        onClick={() => handleSort(column)}
                      >
                        <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                          {column}
                          {sortConfig?.column === column && (
                            <SortIcon 
                              sx={{ 
                                fontSize: 16,
                                transform: sortConfig.direction === 'desc' ? 'rotate(180deg)' : 'none'
                              }} 
                            />
                          )}
                        </Stack>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((row, index) => (
                    <TableRow 
                      key={index}
                      sx={{ 
                        '&:nth-of-type(odd)': { bgcolor: '#F9FAFB' },
                        '&:hover': { bgcolor: '#EFF6FF' },
                        transition: 'background-color 0.2s'
                      }}
                    >
                      <TableCell sx={{ 
                        fontWeight: 700, 
                        color: '#6B7280', 
                        textAlign: 'center',
                        py: 2,
                        borderRight: '1px solid #E5E7EB'
                      }}>
                        {(page - 1) * rowsPerPage + index + 1}
                      </TableCell>
                      {columns.map((column) => (
                        <TableCell 
                          key={column} 
                          sx={{ 
                            textAlign: 'center',
                            py: 2,
                            borderRight: '1px solid #E5E7EB',
                            '&:last-child': {
                              borderRight: 'none'
                            }
                          }}
                        >
                          {row[column] !== null && row[column] !== undefined
                            ? String(row[column])
                            : <Typography variant="caption" color="#9CA3AF" fontStyle="italic">
                                NULL
                              </Typography>
                          }
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Pagination Controls */}
            {filteredData.length > 0 && (
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                mt: 3,
                p: 2,
                bgcolor: '#F8FAFC',
                borderRadius: 3,
                border: '1px solid #E5E7EB'
              }}>
                <Typography variant="body2" color="#6B7280">
                  Showing {Math.min((page - 1) * rowsPerPage + 1, filteredData.length)} to {Math.min(page * rowsPerPage, filteredData.length)} of {filteredData.length} entries
                </Typography>
                
                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="First Page">
                    <span>
                      <IconButton 
                        onClick={() => setPage(1)} 
                        disabled={page === 1}
                        size="small"
                      >
                        <FirstPageIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Previous Page">
                    <span>
                      <IconButton 
                        onClick={() => setPage(page - 1)} 
                        disabled={page === 1}
                        size="small"
                      >
                        <NavigateBeforeIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  
                  <Pagination
                    count={totalPages}
                    page={page}
                    onChange={handlePageChange}
                    size="small"
                    showFirstButton={false}
                    showLastButton={false}
                    siblingCount={1}
                    boundaryCount={1}
                    sx={{
                      '& .MuiPaginationItem-root': {
                        borderRadius: 2,
                        '&.Mui-selected': {
                          bgcolor: '#3B82F6',
                          color: 'white',
                          '&:hover': {
                            bgcolor: '#1E40AF'
                          }
                        }
                      }
                    }}
                  />
                  
                  <Tooltip title="Next Page">
                    <span>
                      <IconButton 
                        onClick={() => setPage(page + 1)} 
                        disabled={page === totalPages}
                        size="small"
                      >
                        <NavigateNextIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Last Page">
                    <span>
                      <IconButton 
                        onClick={() => setPage(totalPages)} 
                        disabled={page === totalPages}
                        size="small"
                      >
                        <LastPageIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Box>
            )}
            
            <Typography variant="body2" color="#6B7280" sx={{ mt: 2, textAlign: 'center' }}>
              Scroll to view all columns • Click column headers to sort • Updates automatically when new data is inserted
            </Typography>
          </Box>
        )}

        {/* Empty State */}
        {!loading && !error && data.length === 0 && (
          <Alert 
            severity="info" 
            icon={<InfoIcon />}
            sx={{ 
              borderRadius: 3,
              border: '2px dashed #DBEAFE',
              bgcolor: '#EFF6FF',
              py: 4,
              textAlign: 'center'
            }}
          >
            <Typography variant="h6" fontWeight={600} color="#1E40AF" sx={{ mb: 1 }}>
              MySQL Table Empty
            </Typography>
            <Typography variant="body1" color="#4B5563">
              The foodpreferences table is empty. Submit data through the form to see records here.
            </Typography>
            <Typography variant="caption" color="#6B7280" sx={{ display: 'block', mt: 2 }}>
              New data will appear automatically when inserted via worker.
            </Typography>
          </Alert>
        )}

        {/* Filters Dialog */}
        <Dialog 
          open={showFiltersDialog} 
          onClose={() => setShowFiltersDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}>
              <FilterListIcon />
              <Typography variant="h6">Advanced Filters</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Column</InputLabel>
                    <Select
                      value={newFilter.column}
                      label="Column"
                      onChange={(e) => setNewFilter({...newFilter, column: e.target.value})}
                    >
                      {columns.map((col) => (
                        <MenuItem key={col} value={col}>
                          {col}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Operator</InputLabel>
                    <Select
                      value={newFilter.operator}
                      label="Operator"
                      onChange={(e) => setNewFilter({...newFilter, operator: e.target.value as any})}
                    >
                      <MenuItem value="contains">Contains</MenuItem>
                      <MenuItem value="equals">Equals</MenuItem>
                      <MenuItem value="startsWith">Starts With</MenuItem>
                      <MenuItem value="endsWith">Ends With</MenuItem>
                      <MenuItem value="greaterThan">Greater Than</MenuItem>
                      <MenuItem value="lessThan">Less Than</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Value"
                    value={newFilter.value}
                    onChange={(e) => setNewFilter({...newFilter, value: e.target.value})}
                    size="small"
                  />
                </Grid>
              </Grid>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 0 }}>
            <Button 
              onClick={() => {
                setNewFilter({ column: '', operator: 'contains', value: '' });
                setShowFiltersDialog(false);
              }}
              color="inherit"
            >
              Cancel
            </Button>
            <Button 
              onClick={addFilter} 
              variant="contained"
              disabled={!newFilter.column || !newFilter.value}
              sx={{ 
                bgcolor: '#3B82F6',
                '&:hover': { bgcolor: '#1E40AF' }
              }}
            >
              Add Filter
            </Button>
          </DialogActions>
        </Dialog>

        {/* Footer */}
        <Box sx={{ 
          mt: 'auto', 
          pt: 3, 
          borderTop: '1px solid #E5E7EB',
          textAlign: 'center'
        }}>
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ mb: 1 }}>
            <Box sx={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%',
              bgcolor: getConnectionStatusColor()
            }} />
            <Typography variant="body2" color="#6B7280" sx={{ fontWeight: 500 }}>
              {socket?.connected ? 'Connected • ' : 'Disconnected • '}
              <Box component="span" sx={{ color: '#1E40AF', fontWeight: 600 }}>
                MySQL Database
              </Box>
              {' • Real-time WebSocket • '}
              {data.length} records
            </Typography>
          </Stack>
          <Typography variant="caption" color="#9CA3AF">
            Synchronized with MongoDB • Updates when worker inserts new records
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}

export default MySQLData;