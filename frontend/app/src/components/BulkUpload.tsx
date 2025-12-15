// Key fixes:
// 1. ✅ Auto-dismiss success/error alerts after 5 seconds
// 2. ✅ Removed pollForCompletion - conflicts with WebSocket
// 3. ✅ Simplified upload flow - REST API + WebSocket notification only

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [socket, setSocket] = useState<any>(null);
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [uploadStartTime, setUploadStartTime] = useState<number>(0);
  const SERVER_URL = import.meta.env.VITE_SERVER_URL;

  const expectedColumns = ['name', 'age', 'foods'];

  // ✅ Auto-dismiss timers
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ WebSocket connection - ONLY for notifications
  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected:', newSocket.id);
      setSocket(newSocket);
    });

    // ✅ Main completion handler
    newSocket.on('bulkUploadComplete', (data) => {
      console.log('🎉 Upload completed:', data);
      handleUploadCompletion(data);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // ✅ Auto-dismiss success messages
  useEffect(() => {
    if (success) {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = setTimeout(() => {
        setSuccess(null);
      }, 5000); // Clear after 5 seconds
    }
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, [success]);

  // ✅ Auto-dismiss error messages
  useEffect(() => {
    if (error) {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
      errorTimerRef.current = setTimeout(() => {
        setError(null);
      }, 8000); // Clear after 8 seconds (longer for errors)
    }
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, [error]);

  const handleUploadCompletion = (data) => {
    console.log('🔄 Processing upload completion...');
    setUploading(false);
    setUploadProgress(100);

    if (data.success) {
      setSuccess(`✅ Upload completed: ${data.successCount}/${data.totalRecords} records inserted`);
      
      setUploadResult({
        jobId: data.jobId,
        successCount: data.successCount,
        failCount: data.failCount,
        totalRecords: data.totalRecords,
        errors: data.errors || []
      });

      // Auto-clear file after 3 seconds
      setTimeout(() => {
        if (currentFile) {
          setCurrentFile(null);
          setUploadedFiles([]);
        }
      }, 3000);
    } else {
      setError(`❌ Upload failed: ${data.error || 'Unknown error'}`);
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setSnackbar({ open: true, message, severity });
  };

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

          // Validate columns
          const firstRow = jsonData[0];
          const fileColumns = Object.keys(firstRow);
          const missingColumns = expectedColumns.filter(col => !fileColumns.includes(col));
          
          if (missingColumns.length > 0) {
            setError(`Missing required columns: ${missingColumns.join(', ')}`);
            return;
          }

          // Validate data
          const errors: ValidationError[] = [];
          jsonData.forEach((row: any, index: number) => {
            const age = row.age;
            if (age === undefined || age === null || age === '') {
              errors.push({ row: index + 2, column: 'age', error: 'Age is required' });
            } else if (isNaN(Number(age)) || Number(age) < 0 || Number(age) > 150) {
              errors.push({ row: index + 2, column: 'age', error: 'Age must be 0-150' });
            }

            expectedColumns.forEach(field => {
              if (!row[field] && row[field] !== 0) {
                errors.push({ row: index + 2, column: field, error: `${field} is required` });
              } else if (typeof row[field] === 'string' && row[field].trim() === '') {
                errors.push({ row: index + 2, column: field, error: `${field} cannot be empty` });
              }
            });
          });

          if (errors.length > 0) {
            setValidationErrors(errors);
            setError(`Found ${errors.length} validation errors`);
            return;
          }

          const newFile: UploadedFile = {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            data: jsonData,
            previewData: jsonData.slice(0, 5),
            uploadedAt: new Date()
          };

          setUploadedFiles(prev => [...prev, newFile]);
          setCurrentFile(newFile);
          setSuccess(`✅ Loaded ${jsonData.length} records from ${file.name}`);

        } catch (err) {
          setError(`Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      };

      reader.onerror = () => setError('Error reading file');

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

  // ✅ SIMPLIFIED: Always use REST API, wait for WebSocket notification
  const handleUploadToServer = async () => {
    if (!currentFile || currentFile.data.length === 0) {
      setError('No data to upload');
      return;
    }

    setUploading(true);
    setUploadStartTime(Date.now());
    setUploadProgress(10);
    setError(null);
    setSuccess(null);
    setUploadResult(null);

    try {
      console.log('📤 Uploading via REST API...');
      console.log(`📋 File: ${currentFile.name}, Records: ${currentFile.data.length}`);

      const response = await fetch(`http://${SERVER_URL}/api/bulk-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: currentFile.data,
          fileName: currentFile.name,
          clientId: socket?.id || 'http-client'
        })
      });

      setUploadProgress(30);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setUploadProgress(50);

      console.log('✅ Upload accepted:', result);
      setSuccess(`🔄 Processing ${result.totalRecords} records. Job ID: ${result.jobId}`);

      // ✅ Simulate progress while waiting for WebSocket
      let simulatedProgress = 50;
      const progressInterval = setInterval(() => {
        simulatedProgress = Math.min(simulatedProgress + 5, 95);
        setUploadProgress(simulatedProgress);
      }, 1000);

      // ✅ Clear interval after 60 seconds (WebSocket should trigger before this)
      setTimeout(() => {
        clearInterval(progressInterval);
        if (uploading) {
          // If still uploading after 60s, something went wrong
          setUploading(false);
          setError('Upload is taking longer than expected. Please check the dashboard for results.');
        }
      }, 60000);

    } catch (err) {
      console.error('Upload error:', err);
      setUploading(false);
      setUploadProgress(0);
      setError(`Upload failed: ${err.message}`);
    }
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
    const templateData = [{
      name: 'John Doe',
      age: 25,
      foods: 'Pizza,Burger,Pasta'
    }];
    
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    
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
      description: socket?.connected ? 'Real-time updates' : 'Check connection'
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
        <Box sx={{ mb: 2 }}>
          <BreadCrumbNav />
        </Box>

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

        {/* ✅ Auto-dismiss after 8 seconds */}
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

        {/* ✅ Auto-dismiss after 5 seconds */}
        {success && (
          <Alert 
            severity="success" 
            icon={<CheckCircleIcon />}
            sx={{ 
              borderRadius: 2,
              alignItems: 'center',
              border: '1px solid #86EFAC'
            }}
            action={
              <IconButton 
                size="small" 
                onClick={() => setSuccess(null)}
              >
                <CloseIcon />
              </IconButton>
            }
          >
            <Typography fontWeight={600}>Success</Typography>
            <Typography variant="body2">{success}</Typography>
          </Alert>
        )}

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
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

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

        {uploading && (
          <Alert severity="info" icon={<PlayArrowIcon />}>
            <Typography fontWeight={600}>
              Processing via REST API
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

        <Box sx={{ 
          mt: 'auto', 
          pt: 3, 
          borderTop: '1px solid #E5E7EB',
          textAlign: 'center'
        }}>
          <Typography variant="body2" color="#6B7280" sx={{ mb: 1 }}>
            <Box component="span" sx={{ color: '#9333EA', fontWeight: 600 }}>
              Upload Method:
            </Box>
            {' REST API for all file sizes'}
          </Typography>
          <Typography variant="caption" color="#9CA3AF">
            Connected to port 3007 • 
            {socket?.connected ? 'WebSocket ✅' : 'REST API only'} • 
            Current file: {currentFile ? `${formatFileSize(currentFile.size)}, ${currentFile.data.length} records` : 'None'}
          </Typography>
        </Box>
      </Paper>

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