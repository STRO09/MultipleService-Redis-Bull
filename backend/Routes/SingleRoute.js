import express from 'express';
import {addJob} from '../queues/JobQueue.js';


const router = express.Router();


router.post('/FormUpload', async (req,res)=> {

	const formData = req.body;
	try {
	 	console.log('Form data received:', formData);
      	console.log(formData);
        await addJob(formData);

        res.status(200).json({ 
      		success: true, 
      		message: 'Job added to queue successfully'
    	});
    } 
    catch (e) {
        console.log(e);
      }

});

export default router;