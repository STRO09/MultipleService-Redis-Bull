import {connectToDB} from './../connections/MongoDB.js';

export default function MongoHandler(socket) {
      socket.on('requestMongoData', async () => {
try {
      // Connect to MongoDB
      const client = await connectToDB();
      console.log('Connected to MongoDB for client:', socket.id);
      
      const db = client.db('test');
      const collection = db.collection('userschemas');
      
      // Fetch all documents
      const data = await collection.find({}).toArray();
      console.log(`Fetched ${data.length} documents for client:`, socket.id);

      // Send response to the specific client
      socket.emit('mongoDataResponse', {
        success: true,
        data: data,
        timestamp: new Date().toISOString(),
        count: data.length,
        message: `Successfully retrieved ${data.length} documents`
      });

      // Close the connection
      await client.close();

    } catch (error) {
      console.error('Error in MongoHandler for client', socket.id, ':', error);
      
      // Send error response
      socket.emit('mongoDataResponse', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        message: 'Failed to fetch MongoDB data'
      });
    }
  });

}