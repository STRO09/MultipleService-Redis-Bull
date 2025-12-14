import {MongoClient} from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
  override: true
});


export async function connectToDB() {
	const client = new MongoClient(process.env.MONGOCONNECTIONURL);
	try {
		await client.connect();
		console.log("Mongo Client connected");
	}
	catch(e) {
		console.error("Error while connecting to mongo", e);
		throw e;
	}
	return client;
}