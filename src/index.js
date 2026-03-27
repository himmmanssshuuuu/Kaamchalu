const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// Routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const workerRoutes = require('./routes/workers');
app.use('/api/workers', workerRoutes);

const jobRoutes = require('./routes/jobs');
app.use('/api/jobs', jobRoutes);

const bookingRoutes = require('./routes/bookings');
app.use('/api/bookings', bookingRoutes);

const ratingRoutes = require('./routes/ratings');
app.use('/api/ratings', ratingRoutes);

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

const notificationRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
