const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const FriendRequest = require('../models/FriendRequest');
const authMiddleware = require('../middlewares/auth');

router.post('/send', authMiddleware, async (req, res) => {
    const { receiverId, userId } = req.body;
  
    if (!receiverId) {
      return res.status(400).json({ message: 'Receiver ID is required.' });
    }

    if (!userId) {
      return res.status(400).json({ message: 'Sender ID is required.' });
    }
  
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'Receiver user not found.' });
    }
  
    if (userId === receiverId) {
      return res.status(400).json({ message: 'You cannot send a friend request to yourself.' });
    }
  
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId },
      ],
    });
  
    if (existingRequest) {
      return res.status(400).json({ message: 'Friend request already exists or is in process.' });
    }
  
    try {
      const sender = await User.findById(userId);
      if (!sender) {
        return res.status(404).json({ message: 'Sender user not found.' });
      }

      const newRequest = new FriendRequest({
        sender: userId,
        receiver: receiverId,
      });
  
      await newRequest.save();

      const newNotification = new Notification({
        userId: receiverId,
        type: 'friendRequest',
        message: `${sender.firstName} ${sender.lastName}`,
        description: `wants_to_be_your_friend`,
        sender: userId,
        read: false,
        sendAt: new Date(),
      });
  
      await newNotification.save();
  
      res.status(201).json({
        message: 'Friend request sent successfully.',
      });
    } catch (error) {
      console.error('Error sending friend request:', error);
      res.status(500).json({ message: 'An error occurred while sending the friend request.', error });
    }
  });

  router.post('/check-request', authMiddleware, async (req, res) => {
    const { sender, receiver } = req.body;
  
    if (!sender || !receiver) {
      return res.status(400).json({
        message: 'Both sender and receiver IDs are required.',
      });
    }
  
    try {
      const existingRequest = await FriendRequest.findOne({
        sender,
        receiver,
      });
  
      if (existingRequest) {
        return res.status(200).json({
          message: 'Friend request already exists.',
        });
      }
  
      res.status(200).json({
        message: 'No friend request found.',
      });
    } catch (error) {
      console.error('Error checking friend request:', error);
      res.status(500).json({
        message: 'An error occurred while checking the friend request.',
        error,
      });
    }
  });

  router.get('/requests/:userId', authMiddleware, async (req, res) => {
    const userId = req.params.userId;

    try {
      const friendRequests = await FriendRequest.find({
        receiver: userId,
        status: { $in: ['pending', 'rejected'] }, 
      })
        .populate('sender', 'firstName lastName profilePicture email')
        .exec();
  
      if (!friendRequests || friendRequests.length === 0) {
        return res.status(200).json({
          requests: [],
        });
      }
  
      res.status(200).json({
        requests: friendRequests,
      });
    } catch (error) {
      console.error('Error retrieving friend requests:', error);
      res.status(500).json({
        message: 'An error occurred while retrieving the friend requests.',
        error,
      });
    }
  });
  
  router.post('/reject', authMiddleware, async (req, res) => {
    const { requestId } = req.body;
  
    if (!requestId) {
      return res.status(400).json({ message: 'Request ID is required.' });
    }
  
    try {
      const friendRequest = await FriendRequest.findById(requestId);
  
      if (!friendRequest) {
        return res.status(404).json({ message: 'Friend request not found.' });
      }
  
      if (friendRequest.receiver.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You can only reject friend requests sent to you.' });
      }
  
      if (friendRequest.status === 'rejected') {
        return res.status(400).json({ message: 'Friend request has already been rejected.' });
      }
  
      friendRequest.status = 'rejected';
      await friendRequest.save();
  
      res.status(200).json({
        message: 'Friend request rejected successfully.',
      });
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      res.status(500).json({
        message: 'An error occurred while rejecting the friend request.',
        error,
      });
    }
  });
  
  router.post('/accept', authMiddleware, async (req, res) => {
    const { requestId, userId } = req.body;
  
    if (!requestId) {
      return res.status(400).json({ message: 'Request ID is required.' });
    }
  
    try {
      const friendRequest = await FriendRequest.findById(requestId);
  
      if (!friendRequest) {
        return res.status(404).json({ message: 'Friend request not found.' });
      }
  
      if (friendRequest.receiver.toString() !== userId) {
        return res.status(403).json({ message: 'You can only accept friend requests sent to you.' });
      }
  
      if (friendRequest.status === 'accepted') {
        return res.status(400).json({ message: 'Friend request has already been accepted.' });
      }
  
      friendRequest.status = 'accepted';
      await friendRequest.save();
  
      const senderId = friendRequest.sender;
      const receiverId = friendRequest.receiver;
  
      const sender = await User.findById(senderId);
      const receiver = await User.findById(receiverId);
  
      sender.friends.push(receiverId);
      receiver.friends.push(senderId);
  
      await sender.save();
      await receiver.save();

      const deleteResult = await FriendRequest.deleteOne({ _id: requestId });

      if (deleteResult.deletedCount === 1) {
        return res.status(200).json({
          message: 'Friend request accepted successfully.',
        });
      } else {
        return res.status(500).json({
          message: 'An error occurred while accepting the friend request.',
        });
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      res.status(500).json({
        message: 'An error occurred while accepting the friend request.',
        error,
      });
    }
  });
  
  router.delete('/delete', authMiddleware, async (req, res) => {
    const { requestId, userId } = req.body;
  
    if (!requestId) {
      return res.status(400).json({ message: 'Request ID is required.' });
    }
  
    try {
      const friendRequest = await FriendRequest.findById(requestId);
  
      if (!friendRequest) {
        return res.status(404).json({ message: 'Friend request not found.' });
      }
  
      if (friendRequest.sender.toString() !== userId && friendRequest.receiver.toString() !== userId) {
        return res.status(403).json({ message: 'You can only delete your own friend requests.' });
      }
  
      const deleteResult = await FriendRequest.deleteOne({ _id: requestId });

      if (deleteResult.deletedCount === 1) {
        return res.status(200).json({
          message: 'Friend request deleted successfully.',
        });
      } else {
        return res.status(500).json({
          message: 'An error occurred while deleting the friend request.',
        });
      }

    } catch (error) {
      console.error('Error deleting friend request:', error);
      res.status(500).json({
        message: 'An error occurred while deleting the friend request.',
        error,
      });
    }
  });
  
  

module.exports = router;