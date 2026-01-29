import express from 'express';
import healthRoutes from './src/routes/healthRoutes.js';

const app = express();
app.use(express.json());
app.use('/', healthRoutes); // Mount at root instead of /health

const port = 3000;
app.listen(port, () => {
  console.log(`Test server running on http://localhost:${port}`);
});