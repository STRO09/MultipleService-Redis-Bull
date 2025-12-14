import {sqlconn} from './../connections/MySqlDB.js';

export default function MySqlHandler(socket) {
	    socket.on('requestMySQLData', async () => {
      try {
        console.log('Fetching MySQL data...');

        const [rows] = await sqlconn.execute('SELECT * FROM foodpreferences');

        socket.emit('mysqlDataResponse', {
          success: true,
          data: rows,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error fetching MySQL data:', error);
        socket.emit('mysqlDataResponse', {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
}