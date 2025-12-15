import { Server } from 'socket.io';
import Redis from 'ioredis';
import MySqlHandler from './MySqlHandler.js';
import MongoHandler from './MongoHandler.js';
import { connectToDB } from '../connections/MongoDB.js';
import { sqlconn } from '../connections/MySqlDB.js';
import 'dotenv/config';

export function setupSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:5173", "http://10.10.15.140:5176"],
      methods: ["GET", "POST"],
      credentials: true
    }, 
    maxHttpBufferSize: 1e8 
  });

  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    
    // ✅ Join client to their personal room
    socket.join(`client-${socket.id}`);
    console.log(`🏠 Client ${socket.id} joined room: client-${socket.id}`);
    
    // ✅ Keep existing handlers for dashboard
    MongoHandler(socket);
    MySqlHandler(socket);
    
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });
  });

  // ✅ Redis subscription - receive completion notifications from worker
  const sub = new Redis({ host: process.env.REDISHOST, port: 6379 });
  
  sub.subscribe('bulkUploadComplete', 'mongoUpdates', 'SqlUpdates');
  
  console.log('📡 Redis subscribed to: bulkUploadComplete, mongoUpdates, SqlUpdates');
  
  sub.on('message', async (channel, message) => {
    console.log(`\n📡 Redis [${channel}]:`, message.substring(0, 200));
    
    try {
      const payload = JSON.parse(message);
      
      switch(channel) {
        case 'bulkUploadComplete':
          console.log(`🔍 Job completed: ${payload.jobId}`);
          console.log(`🔍 Client: ${payload.clientId}, Success: ${payload.success}`);
          
          if (payload.clientId) {
            const roomName = `client-${payload.clientId}`;
            const room = io.sockets.adapter.rooms.get(roomName);
            
            if (room) {
              // ✅ Send to specific client
              io.to(roomName).emit('bulkUploadComplete', payload);
              console.log(`📤 Emitted to room: ${roomName} (${room.size} clients)`);
            } else {
              // ✅ Fallback: broadcast to all
              console.log(`⚠️ Room ${roomName} not found, broadcasting to all`);
              io.emit('bulkUploadComplete', payload);
            }
          } else {
            io.emit('bulkUploadComplete', payload);
          }
          break;
          
        case 'mongoUpdates':
          // ✅ Refresh MongoDB data for ALL clients
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
            console.log(`🔄 Sent mongoDataResponse (${data.length} records)`);
          } catch (error) {
            io.emit('mongoDataResponse', {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          break;
          
        case 'SqlUpdates':
          // ✅ Refresh MySQL data for ALL clients
          try {
            const [rows] = await sqlconn.execute('SELECT * FROM foodpreferences ORDER BY id DESC');
            io.emit('mysqlDataResponse', {
              success: true,
              data: rows,
              trigger: payload.trigger || 'bulk_upload',
              timestamp: payload.timestamp || new Date().toISOString()
            });
            console.log(`🔄 Sent mysqlDataResponse (${rows.length} records)`);
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

  return io;
}