import React, { useState, useCallback, useEffect, useRef } from 'react';
import BreadCrumbNav from './breadcrumb';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Chip,
  Stack,
  Card,
  CardContent,
  Grid,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormHelperText,
  Snackbar,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import PauseIcon from '@mui/icons-material/Pause'; // ✅ ADDED
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import io from 'socket.io-client';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  data: any[];
  previewData: any[];
  uploadedAt: Date;
}

interface ValidationError {
  row: number;
  column: string;
  error: string;
}

interface BulkUploadResult {
  jobId: string;
  successCount: number;
  failCount: number;
  totalRecords: number;
  errors: Array<{ row: number; error: string }>;
}

function BulkUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [currentFile, setCurrentFile] = useState<UploadedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [socket, setSocket] = useState<any>(null);
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [uploadStartTime, setUploadStartTime] = useState<number>(0); // ✅ ADDED
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null); // ✅ ADDED for optimistic progress
  const SERVER_URL = import.meta.env.VITE_SERVER_URL ;

  // ✅ FIXED: Match your database schema
  const expectedColumns = [
    'name',    // Matches MongoDB and MySQL
    'age',     // Matches MongoDB and MySQL
    'foods'    // Matches MySQL "foods" column (NOT favoriteFood!)
  ];

  // Initialize Socket.io connection
useEffect(() => {
  const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true
  });

  socket.on('connect', () => {
    console.log('✅ Connected to WebSocket. My ID:', socket.id);
    console.log('🏠 Room name: client-' + socket.id);
    
    // Register for bulk updates
    socket.emit('registerForBulkUpdates', socket.id);
    
    // Join personal room
    socket.emit('joinMyRoom', socket.id);
    
    setSocket(socket);
  });

  // Main handler
  socket.on('bulkUploadComplete', (data) => {
  console.log('🎉 WebSocket upload complete:', data);
  
  // Clear optimistic progress interval
  if (progressIntervalRef.current) {
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }
  
  setUploadProgress(100);
  handleUploadCompletion(data);
});

socket.on('bulkUploadProgress', (data) => {
  console.log('📊 WebSocket progress:', data);
  if (data.clientId === socket.id) {
    // Update progress based on server feedback
    const progress = Math.round((data.processedRecords / data.totalRecords) * 100);
    setUploadProgress(Math.min(progress, 95)); // Cap at 95% until complete
  }
});
  
  // // Listen to ALL socket events for debugging
  // socket.onAny((event, ...args) => {
  //   console.log(`🔍 Socket event [${event}]:`, args);
  // });

  socket.on('disconnect', () => {
    console.log('❌ WebSocket disconnected');
  });

  return () => {
    console.log('🧹 Cleaning up socket connection');
    socket.disconnect();
  };
}, []);

  const handleUploadCompletion = (data) => {
    console.log('🔄 Processing upload completion...');
    setUploading(false);
    
      // Clear interval if exists
  if (progressIntervalRef.current) {
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }

    setUploading(false);
  setUploadProgress(100);
  
    if (data.success) {
          const speed = calculateUploadSpeed(100, uploadStartTime);
      setSuccess(`✅ Upload completed: ${data.successCount}/${data.totalRecords} records inserted`);
      
      setUploadResult({
        jobId: data.jobId,
        successCount: data.successCount,
        failCount: data.failCount,
        totalRecords: data.totalRecords,
        errors: data.errors || []
      });
      
      // Auto-clear after success
      setTimeout(() => {
        if (currentFile) {
          setCurrentFile(null);
          setUploadedFiles([]);
        }
      }, 500);
    } else {
      setError(`❌ Upload failed: ${data.error || 'Unknown error'}`);
    }
  };

  // ✅ ERROR HANDLER
const handleUploadError = (errorMessage: string) => {
  console.error('Upload error:', errorMessage);
  
  if (progressIntervalRef.current) {
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }
  
  setUploading(false);
  setUploadProgress(0);
  setError(errorMessage);
  
  // Fallback alert
  if (!socket?.connected) {
    showSnackbar('WebSocket disconnected, using REST API', 'warning');
  }
};

const determineUploadStrategy = (fileSize: number, recordCount: number) => {
  // Check WebSocket connection first
  if (!socket?.connected) {
    console.log('Using REST API: WebSocket not connected');
    return 'rest';
  }
  
  // Thresholds for WebSocket vs REST API
  const MAX_WEBSOCKET_SIZE = 100000; // 100KB - increased for better performance
  const MAX_WEBSOCKET_RECORDS = 500; // Increased to 500 records
  
  // For very small files, always use WebSocket
  if (fileSize <= 10000 && recordCount <= 50) {
    console.log(`Using WebSocket: Small file (${formatFileSize(fileSize)}, ${recordCount} records)`);
    return 'socket';
  }
  
  // For medium files, use WebSocket if connected
  if (fileSize <= MAX_WEBSOCKET_SIZE && recordCount <= MAX_WEBSOCKET_RECORDS) {
    console.log(`Using WebSocket: ${formatFileSize(fileSize)}, ${recordCount} records`);
    return 'socket';
  }
  
  // For large files, use REST API
  console.log(`Using REST API: Large file (${formatFileSize(fileSize)}, ${recordCount} records)`);
  return 'rest';
};
  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setSnackbar({ open: true, message, severity });
  };

  // Add speed calculation function
  const calculateUploadSpeed = (progress: number, startTime: number) => {
    if (progress <= 0 || !startTime) return '0 rec/min';
    
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    if (elapsedSeconds < 1) return 'Calculating...';
    
    const currentRecords = Math.round((progress / 100) * (currentFile?.data.length || 0));
    const recordsPerSecond = currentRecords / elapsedSeconds;
    const recordsPerMinute = Math.round(recordsPerSecond * 60);
    
    return `${recordsPerMinute} rec/min`;
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    setSuccess(null);
    setValidationErrors([]);
    setUploadResult(null);

    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          if (jsonData.length === 0) {
            setError('File is empty or cannot be read.');
            return;
          }

          // ✅ FIXED: Validate columns match database schema
          const firstRow = jsonData[0];
          const fileColumns = Object.keys(firstRow);
          
          // Check for required columns
          const missingColumns = expectedColumns.filter(col => !fileColumns.includes(col));
          if (missingColumns.length > 0) {
            setError(`Missing required columns: ${missingColumns.join(', ')}. Required: ${expectedColumns.join(', ')}`);
            return;
          }

          // Warn about extra columns but don't fail
          const extraColumns = fileColumns.filter(col => !expectedColumns.includes(col));
          if (extraColumns.length > 0) {
            console.warn(`Extra columns found: ${extraColumns.join(', ')}`);
          }

          // Validate data types and constraints
          const errors: ValidationError[] = [];
          jsonData.forEach((row: any, index: number) => {
            // Validate age is a number between 0-150
            const age = row.age;
            if (age === undefined || age === null || age === '') {
              errors.push({
                row: index + 2,
                column: 'age',
                error: 'Age is required'
              });
            } else if (isNaN(Number(age)) || Number(age) < 0 || Number(age) > 150) {
              errors.push({
                row: index + 2,
                column: 'age',
                error: 'Age must be a valid number between 0 and 150'
              });
            }

            // Validate required fields
            expectedColumns.forEach(field => {
              if (!row[field] && row[field] !== 0) {
                errors.push({
                  row: index + 2,
                  column: field,
                  error: `${field} is required`
                });
              } else if (typeof row[field] === 'string' && row[field].trim() === '') {
                errors.push({
                  row: index + 2,
                  column: field,
                  error: `${field} cannot be empty`
                });
              }
            });

            // Validate string lengths
            Object.keys(row).forEach(key => {
              if (typeof row[key] === 'string' && row[key].length > 255) {
                errors.push({
                  row: index + 2,
                  column: key,
                  error: `${key} exceeds maximum length of 255 characters`
                });
              }
            });
          });

          if (errors.length > 0) {
            setValidationErrors(errors);
            setError(`Found ${errors.length} validation errors. Please fix before uploading.`);
            return;
          }

          // Get preview data (first 5 rows)
          const previewData = jsonData.slice(0, 5);

          const newFile: UploadedFile = {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            data: jsonData,
            previewData,
            uploadedAt: new Date()
          };

          setUploadedFiles(prev => [...prev, newFile]);
          setCurrentFile(newFile);
          setSuccess(`✅ Successfully loaded ${jsonData.length} records from ${file.name}`);

        } catch (err) {
          setError(`Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      };

      reader.onerror = () => {
        setError('Error reading file');
      };

      if (file.type.includes('excel') || file.type.includes('spreadsheet') || 
          file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || 
          file.name.endsWith('.csv')) {
        reader.readAsBinaryString(file);
      } else {
        setError('Please upload Excel (.xlsx, .xls) or CSV files only');
      }
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv']
    },
    maxFiles: 1,
    multiple: false
  });

  // ✅ SINGLE FIXED handleUploadToServer function
const handleUploadToServer = async () => {
  if (!currentFile || currentFile.data.length === 0) {
    setError('No data to upload');
    return;
  }

  setUploading(true);
  setUploadStartTime(Date.now()); 
  setError(null);
  setSuccess(null);
  setUploadResult(null);

    // ✅ Clear any existing interval
  if (progressIntervalRef.current) {
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }


  try {
    console.log('📤 Starting upload...');
    console.log('📋 Socket ID:', socket?.id);
    console.log('📋 File:', currentFile.name);
    console.log('📋 Records:', currentFile.data.length);
    const strategy = determineUploadStrategy(currentFile.size, currentFile.data.length);
    console.log(`📋 Selected strategy: ${strategy}`);
    console.log(`📋 File: ${currentFile.name}, Records: ${currentFile.data.length}`);


        // ✅ OPTIMISTIC PROGRESS FOR WEB SOCKET
    if (strategy === 'socket') {
      // Start optimistic progress updates
      let optimisticProgress = 0;
      progressIntervalRef.current = setInterval(() => {
        optimisticProgress = Math.min(optimisticProgress + 5, 95); // Max 95% until complete
        setUploadProgress(optimisticProgress);
      }, 500); // Update every 500ms
    }

    if (strategy === 'socket' && socket?.connected) {
      // ✅ WEB SOCKET UPLOAD (for small files)
      console.log('🚀 Using WebSocket for real-time upload');
      
      // Prepare data for WebSocket
      const uploadData = {
        type: 'bulkUpload',
        payload: {
          records: currentFile.data,
          fileName: currentFile.name,
          clientId: socket.id,
          timestamp: Date.now(),
          totalRecords: currentFile.data.length
        }
      };

      // Send via WebSocket
      socket.emit('bulkUpload', uploadData);
      
      setSuccess(`🔄 Real-time upload started via WebSocket. Processing ${currentFile.data.length} records...`);
      
      // Set a timeout for WebSocket fallback
      setTimeout(() => {
        if (uploading) {
          console.log('⚠️ WebSocket upload taking too long, falling back to REST API');
          fallbackToRestApi();
        }
      }, 30000); // 30 second timeout

    } else {
      // ✅ REST API UPLOAD (for large files or no WebSocket)
      console.log('📡 Using REST API for reliable upload');
      await uploadViaRestApi();
    }

  } catch (err) {
    console.error('Upload initialization error:', err);
    handleUploadError(`Upload initialization failed: ${err.message}`);
  }
};

// ✅ REST API UPLOAD FUNCTION
const uploadViaRestApi = async () => {
  try {
    setUploadProgress(10); // Initial progress
    
    const response = await fetch(`${SERVER_URL}/api/bulk-upload`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: currentFile.data,
        fileName: currentFile.name,
        clientId: socket?.id || 'http-client',
        uploadMethod: 'rest'
      })
    });

    setUploadProgress(30); // Request sent
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    setUploadProgress(70); // Response received
    
    console.log('✅ REST API Upload accepted:', result);
    
    if (result.jobId) {
      // Poll for completion (for REST API)
      pollForCompletion(result.jobId);
    } else {
      // Immediate completion
      handleUploadCompletion(result);
    }
    
  } catch (err) {
    handleUploadError(`REST API upload failed: ${err.message}`);
  }
};

// ✅ FALLBACK TO REST API
const fallbackToRestApi = async () => {
  console.log('🔄 Falling back to REST API');
  if (progressIntervalRef.current) {
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }
  await uploadViaRestApi();
};

// ✅ POLL FOR COMPLETION (REST API)
const pollForCompletion = async (jobId: string) => {
  const maxAttempts = 60; // 5 minutes max (5 sec * 60)
  let attempts = 0;
  
  const pollInterval = setInterval(async () => {
    if (attempts >= maxAttempts) {
      clearInterval(pollInterval);
      handleUploadError('Upload timeout: Job took too long to complete');
      return;
    }
    
    attempts++;
    
    try {
      const response = await fetch(`${SERVER_URL}/api/job-status/${jobId}`);
      const result = await response.json();
      
      if (result.status === 'completed') {
        clearInterval(pollInterval);
        setUploadProgress(100);
        handleUploadCompletion(result);
      } else if (result.status === 'failed') {
        clearInterval(pollInterval);
        handleUploadError(result.error || 'Upload failed');
      } else {
        // Update progress based on job status
        const progress = Math.min(70 + Math.round((attempts / maxAttempts) * 25), 95);
        setUploadProgress(progress);
      }
    } catch (err) {
      // Continue polling on error
      console.warn('Poll error:', err);
    }
  }, 5000); // Poll every 5 seconds
};


  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
    if (currentFile?.id === fileId) {
      setCurrentFile(null);
    }
    setError(null);
    setSuccess(null);
    setValidationErrors([]);
    setUploadResult(null);
  };

  const handlePreview = (file: UploadedFile) => {
    setCurrentFile(file);
    setPreviewDialog(true);
  };

  const downloadTemplate = () => {
    // Create template with correct columns
    const templateData = [{
      name: 'John Doe',
      age: 25,
      foods: 'Pizza,Burger,Pasta'
    }];
    
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    
    // Add instructions
    const instructions = [
      ['⚠️ IMPORTANT:'],
      ['1. Keep column names exactly as shown: name, age, foods'],
      ['2. "age" must be a number between 0-150'],
      ['3. "foods" is a comma-separated list of favorite foods'],
      ['4. Do not change the header row'],
      [''],
      ['Example Data:'],
      ['name', 'age', 'foods'],
      ['John Doe', '25', 'Pizza,Burger,Pasta'],
      ['Jane Smith', '30', 'Sushi,Pasta,Salad']
    ];
    
    const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');
    
    XLSX.writeFile(workbook, 'bulk_upload_template.xlsx');
    showSnackbar('Template downloaded', 'success');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ✅ FIXED statsGrid array (added missing comma and fixed syntax)
const statsGrid = [
  {
    title: 'Files Uploaded',
    value: uploadedFiles.length,
    icon: <InsertDriveFileIcon sx={{ color: '#9333EA', fontSize: 40 }} />,
    color: '#F3E8FF',
    description: 'Ready for processing'
  },
  {
    title: 'Total Records',
    value: currentFile?.data.length || 0,
    icon: <DescriptionIcon sx={{ color: '#3B82F6', fontSize: 40 }} />,
    color: '#DBEAFE',
    description: 'In current file'
  },
  {
    title: 'Upload Status',
    value: uploading ? 'Processing...' : 'Ready',
    icon: uploading ? 
      <PlayArrowIcon sx={{ color: '#F59E0B', fontSize: 40 }} /> :
      <CheckCircleIcon sx={{ color: '#10B981', fontSize: 40 }} />,
    color: uploading ? '#FEF3C7' : '#D1FAE5',
    description: uploading ? 'Upload in progress' : 'Ready to upload'
  },
  {
    title: 'Connection',
    value: socket?.connected ? '✅ Connected' : '🔌 Disconnected',
    icon: socket?.connected ? 
      <CloudUploadIcon sx={{ color: '#10B981', fontSize: 40 }} /> :
      <ErrorIcon sx={{ color: '#EF4444', fontSize: 40 }} />,
    color: socket?.connected ? '#D1FAE5' : '#FEE2E2',
    description: socket?.connected ? 'Real-time updates' : 'Using REST API'
  }
];

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
          maxWidth: '1200px',
          borderRadius: 3,
          border: '2px solid #9333EA',
          background: 'white',
          boxShadow: '0 8px 32px rgba(147, 51, 234, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {/* Breadcrumb */}
        <Box sx={{ mb: 2 }}>
          <BreadCrumbNav />
        </Box>

        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ mb: 3 }}>
            <Box sx={{ 
              p: 2, 
              bgcolor: '#F3E8FF', 
              borderRadius: 3,
              boxShadow: '0 4px 12px rgba(147, 51, 234, 0.1)'
            }}>
              <CloudUploadIcon sx={{ fontSize: { xs: 32, sm: 40 }, color: '#9333EA' }} />
            </Box>
            <Box>
              <Typography variant="h4" component="h1" sx={{ 
                fontWeight: 800, 
                color: '#7C3AED',
                fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
                mb: 0.5
              }}>
                Bulk Upload
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Upload multiple records to MongoDB & MySQL databases
              </Typography>
            </Box>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="center">
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadTemplate}
              sx={{ 
                borderColor: '#9333EA',
                color: '#9333EA',
                '&:hover': {
                  borderColor: '#7C3AED',
                  backgroundColor: '#F3E8FF'
                }
              }}
            >
              Download Template
            </Button>
            <Typography variant="caption" color="#6B7280" sx={{ textAlign: 'center' }}>
              Required columns: name, age, foods • Max 10,000 records per file
            </Typography>
          </Stack>
        </Box>

        {/* Stats Grid */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {statsGrid.map((stat, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card sx={{ 
                height: '100%', 
                border: `2px solid ${stat.color}`,
                bgcolor: `${stat.color}20`,
                borderRadius: 3,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
              }}>
                <CardContent sx={{ p: 3, textAlign: 'center' }}>
                  {stat.icon}
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, mt: 1 }}>
                    {stat.title}
                  </Typography>
                  <Typography variant="h2" sx={{ fontWeight: 800, color: '#1F2937' }}>
                    {stat.value}
                  </Typography>
                  <Typography variant="caption" color="#6B7280" sx={{ display: 'block', mt: 1 }}>
                    {stat.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Drop Zone */}
        <Box
          {...getRootProps()}
          sx={{
            border: '3px dashed',
            borderColor: isDragActive ? '#9333EA' : '#D1D5DB',
            borderRadius: 3,
            p: 6,
            textAlign: 'center',
            bgcolor: isDragActive ? '#FAF5FF' : '#F9FAFB',
            cursor: 'pointer',
            transition: 'all 0.3s',
            '&:hover': {
              borderColor: '#9333EA',
              bgcolor: '#FAF5FF'
            }
          }}
        >
          <input {...getInputProps()} />
          <CloudUploadIcon sx={{ fontSize: 48, color: '#9333EA', mb: 2 }} />
          <Typography variant="h5" color="#1F2937" sx={{ mb: 1, fontWeight: 600 }}>
            {isDragActive ? 'Drop the file here' : 'Drag & drop your file here'}
          </Typography>
          <Typography variant="body2" color="#6B7280" sx={{ mb: 3 }}>
            or click to browse
          </Typography>
          <Chip
            label="Excel (.xlsx, .xls) or CSV files"
            variant="outlined"
            sx={{ borderColor: '#9333EA', color: '#9333EA' }}
          />
        </Box>

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
                onClick={() => setError(null)}
              >
                <CloseIcon />
              </IconButton>
            }
          >
            <Typography fontWeight={600}>Error</Typography>
            <Typography variant="body2">{error}</Typography>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert 
            severity="success" 
            icon={<CheckCircleIcon />}
            sx={{ 
              borderRadius: 2,
              alignItems: 'center',
              border: '1px solid #86EFAC'
            }}
          >
            <Typography fontWeight={600}>Success</Typography>
            <Typography variant="body2">{success}</Typography>
          </Alert>
        )}

        {/* Upload Method Indicator */}
        {currentFile && (
          <Alert 
            severity="info" 
            icon={<CloudUploadIcon />}
            sx={{ borderRadius: 2 }}
          >
            <Typography fontWeight={600}>
              Upload Method: {determineUploadStrategy(currentFile.size, currentFile.data.length) === 'socket' ? 'WebSocket' : 'REST API'}
            </Typography>
            <Typography variant="body2">
              {determineUploadStrategy(currentFile.size, currentFile.data.length) === 'socket' 
                ? 'Real-time upload via WebSocket (fast for small files)' 
                : 'Reliable upload via REST API (better for large files)'}
            </Typography>
          </Alert>
        )}

        {/* Upload Result Details */}
        {uploadResult && (
          <Alert 
            severity={uploadResult.failCount > 0 ? "warning" : "success"}
            sx={{ borderRadius: 2 }}
          >
            <Typography fontWeight={600}>
              Upload Complete
            </Typography>
            <Typography variant="body2">
              ✅ {uploadResult.successCount} successful • ❌ {uploadResult.failCount} failed • 📊 {uploadResult.totalRecords} total
            </Typography>
            {uploadResult.errors.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" fontWeight={600}>
                  Errors ({uploadResult.errors.length} shown):
                </Typography>
                {uploadResult.errors.slice(0, 5).map((err, idx) => (
                  <Typography key={idx} variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                    Row {err.row}: {err.error}
                  </Typography>
                ))}
                {uploadResult.errors.length > 5 && (
                  <Typography variant="caption" color="text.secondary">
                    ... and {uploadResult.errors.length - 5} more errors
                  </Typography>
                )}
              </Box>
            )}
          </Alert>
        )}

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937', mb: 2 }}>
              Uploaded Files ({uploadedFiles.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table>
                <TableHead sx={{ bgcolor: '#F9FAFB' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>File Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Size</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Records</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Uploaded</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {uploadedFiles.map((file) => (
                    <TableRow key={file.id} hover>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <InsertDriveFileIcon sx={{ color: '#9333EA' }} />
                          <Typography variant="body2">{file.name}</Typography>
                          {currentFile?.id === file.id && (
                            <Chip label="Selected" size="small" sx={{ bgcolor: '#9333EA', color: 'white' }} />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>{formatFileSize(file.size)}</TableCell>
                      <TableCell>{file.data.length} records</TableCell>
                      <TableCell>
                        {file.uploadedAt.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Tooltip title="Preview">
                            <IconButton size="small" onClick={() => handlePreview(file)}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove">
                            <IconButton size="small" onClick={() => handleRemoveFile(file.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => setCurrentFile(file)}
                            disabled={uploading}
                            sx={{ 
                              bgcolor: currentFile?.id === file.id ? '#7C3AED' : '#9333EA',
                              '&:hover': { bgcolor: '#6B21A8' },
                              '&.Mui-disabled': { bgcolor: '#E5E7EB', color: '#9CA3AF' }
                            }}
                          >
                            Select
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Alert 
            severity="warning"
            sx={{ borderRadius: 2 }}
          >
            <Typography fontWeight={600}>
              {validationErrors.length} Validation Error{validationErrors.length > 1 ? 's' : ''} Found
            </Typography>
            <Box sx={{ mt: 1, maxHeight: 200, overflow: 'auto' }}>
              {validationErrors.slice(0, 10).map((error, index) => (
                <Typography key={index} variant="body2" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
                  Row {error.row}, Column "{error.column}": {error.error}
                </Typography>
              ))}
              {validationErrors.length > 10 && (
                <Typography variant="caption" color="text.secondary">
                  ... and {validationErrors.length - 10} more errors
                </Typography>
              )}
            </Box>
          </Alert>
        )}

        {/* Upload Progress */}
        {/* Upload Progress */}
{uploading && (
  <Alert severity="info" icon={<PlayArrowIcon />}>
    <Typography fontWeight={600}>
      {determineUploadStrategy(currentFile?.size || 0, currentFile?.data.length || 0) === 'socket' 
        ? 'Real-time Upload via WebSocket' 
        : 'Processing via REST API'}
    </Typography>
    <Typography variant="body2">
      Uploading {currentFile?.data.length || 0} records...
      {uploadProgress > 0 && (
        <>
          <br />
          <LinearProgress 
            variant="determinate" 
            value={uploadProgress} 
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            Progress: {uploadProgress}% • 
            Speed: {calculateUploadSpeed(uploadProgress, uploadStartTime)}
          </Typography>
        </>
      )}
    </Typography>
  </Alert>
)}

        {/* Action Buttons */}
        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 4 }}>
<Button
  variant="contained"
  startIcon={uploading ? <PlayArrowIcon /> : <CloudUploadIcon />}
  onClick={handleUploadToServer}
  disabled={!currentFile || uploading || validationErrors.length > 0}
  sx={{ 
    bgcolor: uploading ? '#F59E0B' : '#9333EA',
    px: 4,
    py: 1.5,
    borderRadius: 2,
    fontSize: '1rem',
    '&:hover': { 
      bgcolor: uploading ? '#D97706' : '#7C3AED' 
    },
    '&.Mui-disabled': { bgcolor: '#E5E7EB', color: '#9CA3AF' }
  }}
>
  {uploading ? 'Processing...' : 'Upload to Server'}
</Button>
          
          <Button
            variant="outlined"
            onClick={() => {
              setUploadedFiles([]);
              setCurrentFile(null);
              setError(null);
              setSuccess(null);
              setValidationErrors([]);
              setUploadResult(null);
              setUploadProgress(0);
              setUploading(false);
            }}
            sx={{ 
              borderColor: '#DC2626',
              color: '#DC2626',
              '&:hover': {
                borderColor: '#B91C1C',
                backgroundColor: '#FEF2F2'
              }
            }}
          >
            Clear All
          </Button>
        </Stack>

        {/* Preview Dialog */}
        <Dialog
          open={previewDialog}
          onClose={() => setPreviewDialog(false)}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" spacing={1}>
              <VisibilityIcon />
              <Typography variant="h6">Preview Data ({currentFile?.name})</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            {currentFile && (
              <TableContainer sx={{ maxHeight: 400, mt: 2 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
                      {expectedColumns.map((col) => (
                        <TableCell key={col} sx={{ fontWeight: 600 }}>
                          {col}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {currentFile.previewData.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        {expectedColumns.map((col) => (
                          <TableCell key={col}>
                            {row[col] || '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {currentFile && currentFile.data.length > 5 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                Showing first 5 of {currentFile.data.length} records
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreviewDialog(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* Footer Info */}
        <Box sx={{ 
          mt: 'auto', 
          pt: 3, 
          borderTop: '1px solid #E5E7EB',
          textAlign: 'center'
        }}>
          <Typography variant="body2" color="#6B7280" sx={{ mb: 1 }}>
            <Box component="span" sx={{ color: '#9333EA', fontWeight: 600 }}>
              Auto Strategy:
            </Box>
            {' Small files → WebSocket • Large files → REST API'}
          </Typography>
          <Typography variant="caption" color="#9CA3AF">
            Connected to port 3007 • 
            {socket?.connected ? 'WebSocket ✅' : 'REST API only'} • 
            Current file: {currentFile ? `${formatFileSize(currentFile.size)}, ${currentFile.data.length} records` : 'None'}
          </Typography>
        </Box>
      </Paper>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity} 
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}


export default BulkUpload;