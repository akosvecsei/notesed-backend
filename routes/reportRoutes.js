const express = require('express');
const router = express.Router();
const AppReport = require('../models/Appreport');
const authMiddleware = require('../middlewares/auth');

router.post('/create', authMiddleware, async (req, res) => {
  const { title, description } = req.body;
  
  if (!title || title.trim() === '') {
    return res.status(400).json({ message: 'Title is required and cannot be empty.' });
  }
  
  if (!description || description.trim() === '') {
    return res.status(400).json({ message: 'Description is required and cannot be empty.' });
  }

  if (description.length < 10 || description.length > 1000) {
    return res.status(400).json({ message: 'Description must be between 10 and 1000 characters.' });
  }

  try {
    const newReport = new AppReport({
      reporter: req.user.userId,
      title,
      description
    });

    await newReport.save();

    res.status(201).json({
      message: 'Report created successfully.',
      report: newReport
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ message: 'An error occurred while creating the report.', error });
  }
});

router.get('/reports', authMiddleware, async (req, res) => {
  try {
    const reports = await AppReport.find({ reporter: req.user.userId });

    res.status(200).json(reports);
  } catch (error) {
    console.error('Error retrieving reports:', error);
    res.status(500).json({ message: 'An error occurred while retrieving reports.', error });
  }
});

module.exports = router;
