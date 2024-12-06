require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportRoutes = require('./routes/reportRoutes');
const friendRequestRoutes = require('./routes/friendrequestRoutes');

// Middleware
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/task', taskRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/friendRequest', friendRequestRoutes);

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/notesed', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('MongoDB connected');
  }).catch((error) => {
    console.error('Database connection error:', error);
  });

// Test Route
app.get('/', (req, res) => {
    res.send('Welcome to the Notesed API!');
});

// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
