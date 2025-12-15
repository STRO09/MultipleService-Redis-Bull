import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { setupSocketServer } from './sockets/socket.js';
import 'dotenv/config';
import bulkRoute from './Routes/BulkRoutes.js';
import singleRoute from './Routes/SingleRoute.js';
const PORT = process.env.PORT || 3007;

const app = express();
const server = createServer(app);

// Setup Socket.io BEFORE middleware
const io = setupSocketServer(server);

// Make io available to routes via app.locals
app.locals.io = io;

// Middleware
app.use(cors({
  origin: [process.env.FRONTENDURL],
  methods: ["POST", "GET"]
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', bulkRoute);
app.use('/api', singleRoute);

server.listen(PORT, () => {
  console.log(`\n🚀 Server is listening on port ${PORT}`);
});