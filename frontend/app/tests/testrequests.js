import {io} from 'socket.io-client';
const socket = io('http://10.10.15.140:3007');

for (let i = 11; i < 100; i++) {
  socket.emit('formSubmit', { name: `User${i}`, age: `${i}`, foods: 'veg'  });
}
