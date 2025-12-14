import { connectToDB } from '../connections/MongoDB.js';
import { sqlconn } from '../connections/MySqlDB.js';
import { Worker } from 'bullmq';
import Redis from 'ioredis';

// Redis client for simple pub/sub on completion
const pub = new Redis({ host: process.env.REDISHOST, port: 6379 });

const bulkWorker = new Worker('SagarBulkQueue', async job => {
  const { records, clientId, fileName } = job.data;
  
  console.log(`\n🚀 BulkWorker processing ${records.length} records for client: ${clientId}`);
  console.log(`📁 File: ${fileName}, Job ID: ${job.id}`);
  
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  const totalRecords = records.length;
  
  // ✅ SINGLE MongoDB connection for entire job
  let mongoClient = null;
  
  try {
    // ✅ Connect ONCE at the beginning
    mongoClient = await connectToDB();
    const db = mongoClient.db("test");
    const collection = db.collection("userschemas");
    
    console.log(`✅ MongoDB connected for job ${job.id}`);
    
    // Use bulk inserts for maximum speed - NO progress updates
    const BATCH_SIZE = 500; // Larger batch = faster
    
    // Process ALL records without progress updates
    for (let batchStart = 0; batchStart < totalRecords; batchStart += BATCH_SIZE) {
      const batch = records.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
      
      console.log(`📦 Processing batch ${batchNumber}/${Math.ceil(totalRecords / BATCH_SIZE)}`);
      
      try {
        // MongoDB BULK insert
        const insertResult = await collection.insertMany(batch, { ordered: false });
        successCount += insertResult.insertedCount;
        
        // MySQL BULK insert
        const values = batch.map(record => [record.name, Number(record.age), record.foods]);
        const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
        const flattenedValues = values.flat();
        
        await sqlconn.execute(
          `INSERT INTO foodpreferences(name, age, foods) VALUES ${placeholders}`,
          flattenedValues
        );
        
        successCount += batch.length;
        
      } catch (batchError) {
        console.error(`❌ Batch ${batchNumber} failed:`, batchError.message);
        failCount += batch.length;
        
        // Fallback: try individual inserts
        for (let i = 0; i < batch.length; i++) {
          try {
            const record = batch[i];
            
            await collection.insertOne(record);
            
            await sqlconn.execute(
              'INSERT INTO foodpreferences(name, age, foods) VALUES (?, ?, ?)',
              [record.name, Number(record.age), record.foods]
            );
            
            successCount++;
            failCount--;
            
          } catch (recordError) {
            errors.push({
              row: batchStart + i + 1,
              error: recordError.message
            });
          }
        }
      }
    }
    
    // Final result
    const result = {
      jobId: job.id,
      clientId,
      fileName,
      totalRecords,
      successCount: Math.floor(successCount / 2), // Divide by 2 because we counted twice
      failCount,
      errors: errors.slice(0, 10), // Limit error details
      success: failCount === 0,
      timestamp: new Date().toISOString()
    };
    
    console.log(`\n✅ Bulk job ${job.id} completed:`);
    console.log(`   Success: ${result.successCount}, Failed: ${result.failCount}`);
    console.log(`   Client: ${clientId}, File: ${fileName}`);
    
    // ✅ SINGLE PUBLISH on completion (not progress)
    console.log(`📤 Publishing to Redis channel 'bulkUploadComplete'...`);
    await pub.publish('bulkUploadComplete', JSON.stringify(result));
    console.log(`✅ Published to Redis`);
    
    // ✅ Trigger dashboard updates
    await pub.publish('mongoUpdates', JSON.stringify({
      success: true,
      trigger: 'bulk_upload',
      jobId: job.id,
      recordsInserted: result.successCount,
      timestamp: new Date().toISOString()
    }));
    
    await pub.publish('SqlUpdates', JSON.stringify({
      success: true,
      trigger: 'bulk_upload',
      jobId: job.id,
      recordsInserted: result.successCount,
      timestamp: new Date().toISOString()
    }));
    
    console.log(`✅ Dashboard updates triggered`);
    
    return result;
    
  } catch (error) {
    console.error(`\n💥 Bulk job ${job.id} failed:`, error);
    
    // Publish error
    const errorResult = {
      jobId: job.id,
      clientId,
      fileName,
      error: error.message,
      success: false,
      timestamp: new Date().toISOString()
    };
    
    await pub.publish('bulkUploadComplete', JSON.stringify(errorResult));
    console.log(`📤 Published error to Redis`);
    
    throw error;
    
  } finally {
    // ✅ ALWAYS close MongoDB connection
    if (mongoClient) {
      try {
        await mongoClient.close();
        console.log(`✅ MongoDB connection closed for job ${job.id}`);
      } catch (closeError) {
        console.error('Error closing MongoDB connection:', closeError);
      }
    }
  }
}, {
  connection: { host: process.env.REDISHOST, port: 6379 },
  concurrency: 2,
  stalledInterval: 120000,
  lockDuration: 120000
});

// Worker events for logging
bulkWorker.on('completed', (job, result) => {
  console.log(`\n🎉 Bulk job ${job.id} completed successfully`);
  console.log(`   Result:`, result);
});

bulkWorker.on('failed', (job, err) => {
  console.error(`\n💥 Bulk job ${job.id} failed:`, err);
});

console.log('✅ Bulk upload worker started (No progress tracking - Fast mode)');