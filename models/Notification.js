const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.Mixed, 
    required: true,
    validate: {
      validator: function(v) {
        return (
          mongoose.Types.ObjectId.isValid(v) || v === 'system'
        );
      },
      message: props => `${props.value} is not a valid sender!`
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['task', 'reminder', 'shared', 'system', 'friendRequest'],
    required: true
  },
  description: {
    type: String,
    required: false
  },
  message: {
    type: String,
    required: true
  },
  taskID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: false
  },
  read: {
    type: Boolean,
    default: false
  },
  sendAt: {
    type: Date,
    required: true
  },
  isSent: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Notification', notificationSchema);
