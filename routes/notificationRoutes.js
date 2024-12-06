const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const authMiddleware = require('../middlewares/auth');

router.post('/create', authMiddleware, async (req, res) => {
    const { userId, type, message, taskID, sender } = req.body;

    if (!userId || !type || !message || !sender) {
      return res.status(400).json({ message: 'Please fill in all required fields.' });
    }
  
    try {
      const newNotification = new Notification({
        userId,
        type,
        message,
        taskID,
        sender,
        read: false,
        sendAt: new Date(),
      });
  
      await newNotification.save();
  
      res.status(201).json({
        message: 'Notification created successfully.',
        notification: newNotification
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({ message: 'An error occurred while creating the notification.', error });
    }
});

router.delete('/delete/:id', authMiddleware, async (req, res) => {
    const notificationId = req.params.id;
  
    try {
      const notification = await Notification.findById(notificationId);
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found.' });
      }
  
      if (notification.userId.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'You do not have permission to delete this notification.' });
      }
  
      await Notification.findByIdAndDelete(notificationId);
  
      res.status(200).json({ message: 'Notification deleted successfully.' });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ message: 'Server error.' });
    }
});

router.get('/notifications', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
  
    try {
      const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });

      res.status(200).json({
        notifications
      });
    } catch (error) {
      console.error('Error retrieving notifications:', error);
      res.status(500).json({ message: 'An error occurred while retrieving notifications.', error });
    }
});

router.patch('/update-read/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;

    try {
        const notification = await Notification.findById(id);
        
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found.' });
        }

        if (notification.userId.toString() !== req.user.userId) {
            return res.status(403).json({ message: 'You are not authorized to update this notification.' });
        }

        notification.read = true;
        await notification.save();

        res.status(200).json({ message: 'Notification read status updated.', notification });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

router.delete('/delete-all/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    if (req.user.userId !== userId) {
      return res.status(403).json({ message: 'You do not have permission to delete notifications for this user.' });
    }

    const deleteResult = await Notification.deleteMany({ userId });

    res.status(200).json({
      message: 'All notifications deleted successfully.',
      deletedCount: deleteResult.deletedCount
    });
  } catch (error) {
    console.error('Error deleting notifications:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});


module.exports = router;
