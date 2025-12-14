import { Server } from 'socket.io';
import Redis from 'ioredis';
import formHandler from './formHandler.js';
import MySqlHandler from './MySqlHandler.js';
import MongoHandler from './MongoHandler.js';
import { connectToDB } from '../connections/MongoDB.js';
import { sqlconn } from '../connections/MySqlDB.js';
import 'dotenv/config';


export function setupSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:5173"],
      methods: ["GET", "POST"]
    }, 
   maxHttpBufferSize: 1e8 
  });

  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    
    // Join client to their personal room (for bulk upload completion)
    socket.join(`client-${socket.id}`);
    console.log(`🏠 Client ${socket.id} joined room client-${socket.id}`);
    
    socket.on('registerForBulkUpdates', (data) => {
      socket.join(`client-${socket.id}`);
    });
    
    // Existing handlers
    MongoHandler(socket);
    formHandler(socket);
    MySqlHandler(socket);
    
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });
  });


    const handleBulkUploadViaSocket = async (data, socket) => {
    console.log('🚀 Processing WebSocket bulk upload...');
    console.log(`📊 Records: ${data.records.length}, Client: ${socket.id}`);
    
    const clientId = socket.id;
    const jobId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Send initial progress update
      socket.emit('bulkUploadProgress', {
        clientId,
        jobId,
        processedRecords: 0,
        totalRecords: data.records.length,
        status: 'processing',
        message: 'Starting database insertion...'
      });
      
      // Split records into chunks for batch processing
      const BATCH_SIZE = 100;
      const chunks = [];
      for (let i = 0; i < data.records.length; i += BATCH_SIZE) {
        chunks.push(data.records.slice(i, i + BATCH_SIZE));
      }
      
      let successCount = 0;
      let failCount = 0;
      let errors = [];
      let processedChunks = 0;
      
      // Process each chunk
      for (const chunk of chunks) {
        processedChunks++;
        
        try {
          // Prepare MongoDB documents
          const mongoDocuments = chunk.map(record => ({
            name: record.name,
            age: parseInt(record.age) || 0,
            foods: record.foods, // Note: foods field
            timestamp: new Date()
          }));
          
          // Prepare MySQL records
          const mysqlRecords = chunk.map(record => ({
            name: record.name,
            age: parseInt(record.age) || 0,
            foods: record.foods
          }));
          
          // Insert into MongoDB
          const mongoClient = await connectToDB();
          const mongoDb = mongoClient.db("test");
          const mongoCollection = mongoDb.collection("userschemas");
          
          const mongoResult = await mongoCollection.insertMany(mongoDocuments, {
            ordered: false // Continue on error
          });
          
          await mongoClient.close();
          
          // Insert into MySQL
          const mysqlValues = mysqlRecords.map(record => [
            record.name,
            record.age,
            record.foods
          ]);
          
          const mysqlQuery = `
            INSERT INTO foodpreferences 
            (name, age, foods) 
            VALUES ?
          `;
          
          await sqlconn.query(mysqlQuery, [mysqlValues]);
          
          successCount += chunk.length;
          
        } catch (chunkError) {
          console.error(`❌ Error processing chunk ${processedChunks}:`, chunkError);
          failCount += chunk.length;
          
          // Record errors
          chunk.forEach((record, index) => {
            errors.push({
              row: (processedChunks - 1) * BATCH_SIZE + index + 1,
              error: chunkError.message.substring(0, 200)
            });
          });
        }
        
        // Send progress update
        const progress = Math.round((processedChunks / chunks.length) * 100);
        const processedRecords = processedChunks * BATCH_SIZE;
        
        socket.emit('bulkUploadProgress', {
          clientId,
          jobId,
          processedRecords: Math.min(processedRecords, data.records.length),
          totalRecords: data.records.length,
          progress,
          status: 'processing',
          message: `Processed ${processedChunks}/${chunks.length} chunks`
        });
      }
      
      // Prepare completion result
      const result = {
        success: true,
        jobId,
        clientId,
        successCount,
        failCount,
        totalRecords: data.records.length,
        errors: errors.slice(0, 100), // Limit to 100 errors
        fileName: data.fileName || 'websocket_upload',
        timestamp: new Date().toISOString()
      };
      
      // Send completion via WebSocket
      socket.emit('bulkUploadComplete', result);

       // Also publish to Redis for other services
      const pub = new Redis({ host: process.env.REDISHOST, port: 6379 });
      await pub.publish('bulkUploadComplete', JSON.stringify(result));
      await pub.publish('mongoUpdates', JSON.stringify({ 
        trigger: 'bulk_upload', 
        clientId,
        timestamp: new Date().toISOString()
      }));
      await pub.publish('SqlUpdates', JSON.stringify({ 
        trigger: 'bulk_upload', 
        clientId,
        timestamp: new Date().toISOString()
      }));
      
      await pub.quit();
      
      console.log(`✅ WebSocket upload completed: ${successCount}/${data.records.length} records`);
       } catch (error) {
      console.error('❌ WebSocket bulk upload failed:', error);
      
      const errorResult = {
        success: false,
        jobId: `ws-error-${Date.now()}`,
        clientId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      socket.emit('bulkUploadComplete', errorResult);
    }
  };

  // Redis subscription for completion only
  const sub = new Redis({ host: process.env.REDISHOST, port: 6379 });
  
  sub.subscribe('bulkUploadComplete', 'mongoUpdates', 'SqlUpdates');
  
  console.log('📡 Redis subscribed to: bulkUploadComplete, mongoUpdates, SqlUpdates');
  
  sub.on('message', async (channel, message) => {
    console.log(`\n📡 Redis [${channel}]:`, message.substring(0, 200));
    
    try {
      const payload = JSON.parse(message);
      
      switch(channel) {
        case 'bulkUploadComplete':
          console.log(`🔍 Parsed clientId: "${payload.clientId}",🔍 Success: ${payload.success}, Records: ${payload.totalRecords}`);
          
          if (payload.clientId) {
            const roomName = `client-${payload.clientId}`;
            
            // Check if room exists
            const room = io.sockets.adapter.rooms.get(roomName);
            if (room) {
              console.log(`👥 Clients in room:`, room.size);
            }
            
            // Try to emit to specific client
            if (room) {
              io.to(roomName).emit('bulkUploadComplete', payload);
              console.log(`📤 Emitted to room "${roomName}"`);
            } else {
              console.log(`⚠️ Room "${roomName}" doesn't exist, broadcasting to all`);
              io.emit('bulkUploadComplete', payload);
            }
          } else {
            io.emit('bulkUploadComplete', payload);
          }
          break;
          
        case 'mongoUpdates':
          // Refresh MongoDB data for ALL clients
          try {
            const client = await connectToDB();
            const db = client.db("test");
            const collection = db.collection("userschemas");
            const data = await collection.find({})
              .sort({ _id: -1 })
              .toArray();
            await client.close();

            io.emit('mongoDataResponse', {
              success: true,
              data,
              trigger: payload.trigger || 'bulk_upload',
              timestamp: payload.timestamp || new Date().toISOString()
            });
            console.log(`🔄 Sent mongoDataResponse to all clients (${data.length} records)`);
          } catch (error) {
            io.emit('mongoDataResponse', {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          break;
          
        case 'SqlUpdates':
          // Refresh MySQL data for ALL clients
          try {
            const [rows] = await sqlconn.execute('SELECT * FROM foodpreferences ORDER BY id DESC');
            io.emit('mysqlDataResponse', {
              success: true,
              data: rows,
              trigger: payload.trigger || 'bulk_upload',
              timestamp: payload.timestamp || new Date().toISOString()
            });
            console.log(`🔄 Sent mysqlDataResponse to all clients (${rows.length} records)`);
          } catch (error) {
            console.error('Error fetching MySQL data:', error);
            io.emit('mysqlDataResponse', {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          break;
      }
    } catch (parseError) {
      console.error(`❌ Error parsing Redis message:`, parseError);
    }
  });

  // Log all rooms periodically for debugging
  // setInterval(() => {
  //   const rooms = io.sockets.adapter.rooms;
  //   let clientRooms = 0;
    
  //   for (const [roomName] of rooms.entries()) {
  //     if (roomName.startsWith('client-')) {
  //       clientRooms++;
  //     }
  //   }
    
  //   console.log(`🏠 Room Stats: Total rooms=${rooms.size}, Client rooms=${clientRooms}`);
  // }, 30000); // Every 30 seconds

  return io;
}