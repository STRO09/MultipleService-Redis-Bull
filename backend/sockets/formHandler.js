import {addJob} from '../queues/JobQueue.js';

export default function formHandler (socket) {
	    socket.on('formSubmit', async (formData) => {
      console.log('Form data received:', formData);
      console.log(formData);
      try {
        await addJob(formData);
      } catch (e) {
        console.log(e);
      }
    });
}