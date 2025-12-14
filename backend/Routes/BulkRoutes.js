import express from 'express';
import { addBulkJob } from '../queues/BulkQueue.js';

const router = express.Router();

// Bulk upload endpoint
router.post('/bulk-upload', async (req, res) => {
  try {
    const { records, fileName = 'bulk-upload', clientId = 'http-client' } = req.body;
    
    console.log(`\n📤 Received bulk upload request:`);
    console.log(`   File: ${fileName}`);
    console.log(`   Client ID: ${clientId}`);
    console.log(`   Records: ${records.length}`);
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No records provided or invalid format'
      });
    }
    
    // ✅ Simplified validation - just check required fields
    const invalidRecords = [];
    records.forEach((record, index) => {
      if (!record.name || record.name.trim() === '' || 
          record.age === undefined || record.age === null ||
          !record.foods || record.foods.trim() === '') {
        invalidRecords.push({
          index,
          record,
          error: 'Missing required fields'
        });
      } else if (isNaN(Number(record.age)) || Number(record.age) < 0 || Number(record.age) > 150) {
        invalidRecords.push({
          index,
          record,
          error: 'Age must be a valid number between 0-150'
        });
      }
    });
    
    if (invalidRecords.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Found ${invalidRecords.length} invalid records`,
        invalidRecords: invalidRecords.slice(0, 5), // Only show first 5 errors
        totalRecords: records.length
      });
    }
    
    // ✅ Add job to queue
    const job = await addBulkJob({
      records,
      fileName,
      clientId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Bulk upload job created: ${job.id} (${records.length} records)`);
    console.log(`📝 Client should listen in room: client-${clientId}`);
    
    // ✅ Simple HTTP response - WebSocket updates will come from worker
    res.status(202).json({
      success: true,
      message: 'Bulk upload accepted for processing',
      jobId: job.id,
      fileName,
      totalRecords: records.length,
      clientId,
      timestamp: new Date().toISOString(),
      note: `Listen for WebSocket event 'bulkUploadComplete' in room client-${clientId}`
    });
    
  } catch (error) {
    console.error('❌ Bulk upload API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Add job status endpoint for polling
router.get('/job-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Import queue here to avoid circular dependencies
    const { bulkQueue } = await import('../queues/BulkQueue.js');
    
    const job = await bulkQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const state = await job.getState();
    const progress = job.progress || 0;
    
    res.json({
      success: true,
      jobId,
      state,
      progress,
      data: job.returnvalue || null,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

// Test endpoint to debug WebSocket
router.post('/test-websocket', (req, res) => {
  const { clientId, message } = req.body;
  
  console.log(`🧪 Test WebSocket called for client: ${clientId}`);
  
  res.json({
    success: true,
    message: 'Test endpoint called',
    clientId,
    note: 'Check server console for Redis/Socket activity'
  });
});

export default router;