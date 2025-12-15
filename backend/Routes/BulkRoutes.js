import express from 'express';
import { addBulkJob } from '../queues/BulkQueue.js';

const router = express.Router();

// ✅ SINGLE bulk upload endpoint - handles ALL file sizes
router.post('/bulk-upload', async (req, res) => {
  try {
    const { records, fileName = 'bulk-upload', clientId = 'http-client' } = req.body;
    
    console.log(`\n📤 Received bulk upload request:`);
    console.log(`   File: ${fileName}`);
    console.log(`   Client ID: ${clientId}`);
    console.log(`   Records: ${records.length}`);
    
    // Validation
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No records provided or invalid format'
      });
    }
    
    // Quick validation
    const invalidRecords = [];
    records.forEach((record, index) => {
      if (!record.name || record.name.trim() === '' || 
          record.age === undefined || record.age === null ||
          !record.foods || record.foods.trim() === '') {
        invalidRecords.push({ index, error: 'Missing required fields' });
      } else if (isNaN(Number(record.age)) || Number(record.age) < 0 || Number(record.age) > 150) {
        invalidRecords.push({ index, error: 'Invalid age' });
      }
    });
    
    if (invalidRecords.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Found ${invalidRecords.length} invalid records`,
        invalidRecords: invalidRecords.slice(0, 5),
        totalRecords: records.length
      });
    }
    
    // ✅ Add job to queue (async processing)
    const job = await addBulkJob({
      records,
      fileName,
      clientId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Bulk upload job created: ${job.id} (${records.length} records)`);
    console.log(`📝 Client will receive notification via WebSocket in room: client-${clientId}`);
    
    // ✅ Return immediately - worker will process asynchronously
    res.status(202).json({
      success: true,
      message: 'Bulk upload accepted for processing',
      jobId: job.id,
      fileName,
      totalRecords: records.length,
      clientId,
      timestamp: new Date().toISOString()
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

export default router;