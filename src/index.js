import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';

import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.js';
import routes from './routes/index.js';
import appointmentsRouter from './controllers/appointments.controller.js';
import './cron/reminderJob.js'; 

// Load environment variables
dotenv.config();

// Initialize app
const app = express();
const port = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
app.use('/api', routes);
app.use('/appointments', appointmentsRouter); // Place before error handling


app.use(errorHandler);


app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

export default app;
