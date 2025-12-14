import {Queue} from 'bullmq';
import 'dotenv/config';

const queue = new Queue("SagarUserQueue", {connection: {host : process.env.REDISHOST , port: 6379} });

export async function addJob(data) {
	await queue.add('userdata', data, {removeOnComplete: 15});
}