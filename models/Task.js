const mongoose = require('mongoose');

const assignedUserSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  }
});

const locationSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  }
});

const timeSchema = new mongoose.Schema({
  time: {
    type: String,
    required: true
  },
  alarmed: {
    type: Boolean,
    required: false,
    default: false
  }
});

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    default: '',
    trim: true
  },
  dueDate: {
    type: Date,
    default: Date.now()
  },
  priority: {
    type: Number,
    min: 1,
    max: 5,
    default: 5
  },
  tags: {
    type: String,
    default: ""
  },
  completed: {
    type: Boolean,
    default: false
  },
  assignedUsers: [assignedUserSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  location: {
    type: locationSchema,
    required: false
  },
  time: {
    type: timeSchema,
    required: false
  }
});

taskSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Task', taskSchema);
