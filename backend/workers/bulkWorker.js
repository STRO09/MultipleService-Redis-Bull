import { connectToDB } from '../connections/MongoDB.js';
import { sqlconn } from '../connections/MySqlDB.js';
import { Worker } from 'bullmq';
import Redis from 'ioredis';

const pub = new Redis({ host: process.env.REDISHOST, port: 6379 });

const bulkWorker = new Worker('SagarBulkQueue', async job => {
  const { records, clientId, fileName } = job.data;
  
  console.log(`\n🚀 Processing ${records.length} records for client: ${clientId}`);
  console.log(`📁 File: ${fileName}, Job ID: ${job.id}`);
  
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  const totalRecords = records.length;
  
  // ✅ OPTIMIZATION: Single MongoDB connection for entire job
  let mongoClient = null;
  
  try {
    // Connect ONCE at the beginning
    mongoClient = await connectToDB();
    const db = mongoClient.db("test");
    const collection = db.collection("userschemas");
    
    console.log(`✅ MongoDB connected for job ${job.id}`);
    
    // ✅ FAST BATCH INSERT - Process in large chunks
    const BATCH_SIZE = 1000; // Larger batches = faster
    
    for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);
      
      console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} records)`);
      
      try {
        // ✅ MongoDB bulk insert
        await collection.insertMany(batch, { ordered: false });
        
        // ✅ MySQL bulk insert
        const values = batch.map(r => [r.name, Number(r.age), r.foods]);
        const placeholders = batch.map(() => '(?, ?, ?)').join(', ');
        
        await sqlconn.execute(
          `INSERT INTO foodpreferences(name, age, foods) VALUES ${placeholders}`,
          values.flat()
        );
        
        successCount += batch.length;
        
      } catch (batchError) {
        console.error(`❌ Batch ${batchNum} error:`, batchError.message);
        
        // ✅ Fallback: Try individual inserts for failed batch
        for (let j = 0; j < batch.length; j++) {
          try {
            const record = batch[j];
            await collection.insertOne(record);
            await sqlconn.execute(
              'INSERT INTO foodpreferences(name, age, foods) VALUES (?, ?, ?)',
              [record.name, Number(record.age), record.foods]
            );
            successCount++;
          } catch (recordError) {
            failCount++;
            errors.push({ row: i + j + 1, error: recordError.message });
          }
        }
      }
    }
    
    // ✅ Final result
    const result = {
      jobId: job.id,
      clientId,
      fileName,
      totalRecords,
      successCount,
      failCount,
      errors: errors.slice(0, 10),
      success: failCount === 0,
      timestamp: new Date().toISOString()
    };
    
    console.log(`\n✅ Job ${job.id} completed:`);
    console.log(`   Success: ${successCount}, Failed: ${failCount}`);
    
    // ✅ Publish completion to Redis (Socket.IO will forward to client)
    await pub.publish('bulkUploadComplete', JSON.stringify(result));
    
    // ✅ Trigger dashboard updates
    await pub.publish('mongoUpdates', JSON.stringify({
      success: true,
      trigger: 'bulk_upload',
      jobId: job.id,
      recordsInserted: successCount,
      timestamp: new Date().toISOString()
    }));
    
    await pub.publish('SqlUpdates', JSON.stringify({
      success: true,
      trigger: 'bulk_upload',
      jobId: job.id,
      recordsInserted: successCount,
      timestamp: new Date().toISOString()
    }));
    
    console.log(`✅ Redis notifications sent`);
    
    return result;
    
  } catch (error) {
    console.error(`\n💥 Job ${job.id} failed:`, error);
    
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
    throw error;
    
  } finally {
    // ✅ ALWAYS close MongoDB connection
    if (mongoClient) {
      await mongoClient.close();
      console.log(`✅ MongoDB connection closed for job ${job.id}`);
    }
  }
}, {
  connection: { host: process.env.REDISHOST, port: 6379 },
  concurrency: 3, // Process 3 jobs simultaneously
  stalledInterval: 120000,
  lockDuration: 120000
});

bulkWorker.on('completed', (job, result) => {
  console.log(`\n🎉 Job ${job.id} completed: ${result.successCount}/${result.totalRecords} records`);
});

bulkWorker.on('failed', (job, err) => {
  console.error(`\n💥 Job ${job.id} failed:`, err.message);
});

console.log('✅ Bulk upload worker started (Optimized - Fast mode)');