import { config } from 'dotenv';
config({ path: '../.env' });
import { connectToDB } from '../connections/MongoDB.js';
import { sqlconn } from '../connections/MySqlDB.js';
import { Worker } from 'bullmq';
import Redis from 'ioredis';

const pub = new Redis({ host: process.env.REDISHOST, port: 6379 });

const worker = new Worker('SagarUserQueue', async job => {
  console.log("Worker logging: ", job.data);
  const { name, age, foods } = job.data;
  try {
    const client = await connectToDB();
    const db = client.db("test");
    const collection = db.collection("userschemas");
    await collection.insertOne(job.data);
    await client.close();

    await sqlconn.execute(
      'INSERT INTO foodpreferences(name,age,foods) values(?,?,?)',
      [name, Number(age), foods]
    );

    // publish update event
    pub.publish('mongoUpdates', JSON.stringify({
      success: true,
      timestamp: new Date().toISOString()
    }));


    pub.publish('SqlUpdates', JSON.stringify({
      success: true,
      timestamp: new Date().toISOString()
    }));
  } catch (e) {
    console.error(e);
    pub.publish('mongoUpdates', JSON.stringify({
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    }));

     pub.publish('SqlUpdates', JSON.stringify({
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    }));
  }
}, { connection: { host: process.env.REDISHOST, port: 6379 } });

worker.on('completed', async (job) => {
	console.log(`${job.id} has been successfully inserted`);
})

worker.on('failed', (job,err) => {
	console.log(job+ " threw a error"+ err);
})

worker.on('stalled', jobid => {
	console.log(` Job: ${jobid} has been stalled `);
})