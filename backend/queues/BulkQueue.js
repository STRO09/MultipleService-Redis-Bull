import { Queue } from 'bullmq';

const bulkQueue = new Queue("SagarBulkQueue", {
  connection: { host: process.env.REDISHOST, port: 6379 },
  defaultJobOptions: {
    removeOnComplete: 15,
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

export async function addBulkJob(data) {
  const job = await bulkQueue.add('bulkdata', data, {
    removeOnComplete: 15,
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    jobId: `bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  });
  
  console.log(`📝 Job added to queue: ${job.id}`);
  return job;
}

// Export queue for job status endpoint
export { bulkQueue };