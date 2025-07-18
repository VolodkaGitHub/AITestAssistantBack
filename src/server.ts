import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupServices } from './service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}));
app.use(express.json());

setupServices(app, BASE_URL);

app.listen(PORT, () => {
  console.log(`Server is running at ${BASE_URL}`);
});