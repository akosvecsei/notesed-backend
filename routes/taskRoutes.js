const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const authMiddleware = require("../middlewares/auth");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");

router.post("/create/:userId", authMiddleware, async (req, res) => {
  const { title, content, dueDate, priority, tags, assignedUsers, location, time } = req.body;
  const { userId } = req.params;

  if (!title) {
    return res.status(400).json({ message: "Title is required." });
  }

  if (priority && (priority < 1 || priority > 5)) {
    return res
      .status(400)
      .json({ message: "Priority must be between 1 and 5." });
  }

  try {

    const newTaskData = {
      title,
      content,
      dueDate,
      priority,
      tags,
      createdBy: req.user.userId,
    };

    if (Array.isArray(assignedUsers) && assignedUsers.length > 0) {
      const assignedUsersWithStatus = assignedUsers.map((userId) => ({
        user: userId,
        completed: false,
      }));
      newTaskData.assignedUsers = assignedUsersWithStatus;
    }

    if (location?.latitude && location?.longitude) {
      newTaskData.location = {
        latitude: location.latitude,
        longitude: location.longitude,
      };
    }

    if (time?.time) {
      newTaskData.time = {
        time: time.time,
        alarmed: time.alarmed
      };
    }

    const newTask = new Task(newTaskData);
    await newTask.save();

    if (assignedUsers && assignedUsers.length > 0) {
      let { firstName } = req.user;

      if (!firstName) {
        try {
          const { ObjectId } = require("mongoose").Types;

          const validUserId = ObjectId.isValid(userId)
            ? new ObjectId(userId)
            : userId;

          const user = await User.findById(validUserId);

          if (user) {
            firstName = user.firstName;
          }
        } catch (error) {
          return res
            .status(500)
            .json({ message: "User data not found", error });
        }
      }

      const notifications = assignedUsers.map((userId) => ({
        userId,
        type: "shared",
        message: `${firstName} added you to task.`,
        description: `See "${title}" among your tasks.`,
        taskID: newTask._id,
        sender: req.user.userId,
        read: false,
        sendAt: new Date(),
      }));

      await Notification.insertMany(notifications);
    }

    res.status(201).json({
      message: "Task created successfully.",
      task: newTask,
    });
  } catch (error) {
    console.error("Error creating task:", error);
    res
      .status(500)
      .json({ message: "An error occurred while creating the task.", error });
  }
});

router.get("/tasks", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const tasks = await Task.find({
      $or: [{ createdBy: userId }, { 'assignedUsers.user': userId }],
    })
    .populate({
      path: "assignedUsers.user",
      select: "-password",
    })
    .sort({ dueDate: -1 });

    res.status(200).json(tasks);
  } catch (error) {
    console.error("Error retrieving tasks:", error);
    res
      .status(500)
      .json({ message: "An error occurred while retrieving tasks.", error });
  }
});

router.get("/tasks/by-date", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.query;

    if (!date) {
      return res
        .status(400)
        .json({ message: "Date is required in the query parameter." });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      return res
        .status(400)
        .json({ message: "Invalid date format. Use YYYY-MM-DD format." });
    }

    const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));

    const tasks = await Task.find({
      $or: [{ createdBy: userId }, { 'assignedUsers.user': userId }],
      dueDate: { $gte: startOfDay, $lte: endOfDay },
    })
    .populate({
      path: "assignedUsers.user",
      select: "-password -friends -locations",
    })
    .sort({ priority: 1 });

    res.status(200).json(tasks);
  } catch (error) {
    console.error("Error retrieving tasks by date:", error);
    res
      .status(500)
      .json({
        message: "An error occurred while retrieving tasks by date.",
        error,
      });
  }
});

router.get("/tasksToday", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const tasks = await Task.find({
      $or: [{ createdBy: userId }, { 'assignedUsers.user': userId }],
      dueDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    }).populate({
      path: "assignedUsers.user",
      select: "-password -locations -friends",
    });

    tasks.sort((a, b) => {
      if (a.completed === b.completed) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return a.completed - b.completed;
    });

    res.status(200).json(tasks);
  } catch (error) {
    console.error("Error retrieving tasks:", error);
    res
      .status(500)
      .json({ message: "An error occurred while retrieving tasks.", error });
  }
});

router.delete("/delete/:taskId", authMiddleware, async (req, res) => {
  const { taskId } = req.params;

  try {
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (task.createdBy.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You do not have permission to delete this task." });
    }

    await Task.findByIdAndDelete(taskId);

    res.status(200).json({ message: "Task deleted successfully." });
  } catch (error) {
    console.error("Error deleting task:", error);
    res
      .status(500)
      .json({ message: "An error occurred while deleting the task.", error });
  }
});

router.patch("/update-title/:taskId", authMiddleware, async (req, res) => {
  const { taskId } = req.params;
  const { title } = req.body;

  try {
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (task.createdBy.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You do not have permission to update this task." });
    }

    task.title = title;
    await task.save();

    res.status(200).json({ message: "Task title updated successfully.", task });
  } catch (error) {
    console.error("Error updating task title:", error);
    res
      .status(500)
      .json({
        message: "An error occurred while updating the task title.",
        error,
      });
  }
});

router.patch("/update-content/:taskId", authMiddleware, async (req, res) => {
  const { taskId } = req.params;
  const { content } = req.body;

  try {
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    const userCanUpdate =
      task.createdBy.toString() === req.user.userId ||
      task.assignedUsers.includes(req.user.userId);

    if (!userCanUpdate) {
      return res
        .status(403)
        .json({
          message: "You do not have permission to update this content.",
        });
    }

    task.content = content;
    await task.save();

    res
      .status(200)
      .json({ message: "Task content updated successfully.", task });
  } catch (error) {
    console.error("Error updating task content:", error);
    res
      .status(500)
      .json({
        message: "An error occurred while updating the task content.",
        error,
      });
  }
});

router.patch("/update-priority/:taskId", authMiddleware, async (req, res) => {
  const { taskId } = req.params;
  const { priority } = req.body;

  try {
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (task.createdBy.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You do not have permission to update this task." });
    }

    if (priority < 1 || priority > 9) {
      return res
        .status(400)
        .json({ message: "Priority must be between 1 and 9." });
    }

    task.priority = priority;
    await task.save();

    res
      .status(200)
      .json({ message: "Task priority updated successfully.", task });
  } catch (error) {
    console.error("Error updating task priority:", error);
    res
      .status(500)
      .json({
        message: "An error occurred while updating the task priority.",
        error,
      });
  }
});

router.patch("/update-dueDate/:taskId", authMiddleware, async (req, res) => {
  const { taskId } = req.params;
  const { dueDate } = req.body;

  try {
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (task.createdBy.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You do not have permission to update this task." });
    }

    task.dueDate = dueDate;
    await task.save();

    res
      .status(200)
      .json({ message: "Task due date updated successfully.", task });
  } catch (error) {
    console.error("Error updating task due date:", error);
    res
      .status(500)
      .json({
        message: "An error occurred while updating the task due date.",
        error,
      });
  }
});

router.patch("/update-tags/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { tags } = req.body;

  if (!Array.isArray(tags)) {
    return res
      .status(400)
      .json({ message: "Tags must be an array of strings." });
  }

  try {
    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (task.createdBy.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this task." });
    }

    task.tags.push(...tags);
    await task.save();

    res.status(200).json({ message: "Tags updated successfully.", task });
  } catch (error) {
    console.error("Error updating tags:", error);
    res.status(500).json({ message: "Server error." });
  }
});

router.patch("/update-assignedUsers/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { assignedUsers } = req.body;

  if (!Array.isArray(assignedUsers)) {
    return res
      .status(400)
      .json({ message: "Assigned users must be an array of user IDs." });
  }

  try {
    const task = await Task.findById(id).populate("assignedUsers");

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (task.createdBy.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this task." });
    }

    task.assignedUsers = assignedUsers;
    await task.save();

    res
      .status(200)
      .json({ message: "Assigned users updated successfully.", task });
  } catch (error) {
    console.error("Error updating assigned users:", error);
    res.status(500).json({ message: "Server error." });
  }
});

router.patch("/update-completed/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;

  if (typeof completed !== "boolean") {
    return res
      .status(400)
      .json({ message: "Completed must be a boolean value (true or false)." });
  }

  try {
    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (
      task.createdBy.toString() !== req.user.userId &&
      !task.assignedUsers.includes(req.user.userId)
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this task." });
    }

    task.completed = completed;
    await task.save();

    res
      .status(200)
      .json({ message: "Task completion status updated successfully.", task });
  } catch (error) {
    console.error("Error updating task completion status:", error);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/search", authMiddleware, async (req, res) => {
  const { query, userId } = req.query;

  if (!query || query.length < 3) {
    return res
      .status(400)
      .json({ message: "Query must be at least 3 characters long." });
  }

  try {
    const tasks = await Task.find({
      $and: [
        {
          $or: [
            { createdBy: new mongoose.Types.ObjectId(userId) },
            { assignedUsers: new mongoose.Types.ObjectId(userId) },
          ],
        },
        {
          $or: [
            { title: { $regex: query, $options: "i" } },
            { content: { $regex: query, $options: "i" } },
            { tags: { $regex: query, $options: "i" } },
          ],
        },
      ],
    })
    .populate({
      path: "assignedUsers.user",
      select: "-password -friends -locations",
    })
    .lean();

    res.json(tasks);
  } catch (error) {
    console.error("Error searching tasks:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/remove-assigned-user/:taskId/:userId", authMiddleware, async (req, res) => {
    const { taskId, userId } = req.params;

    try {
      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found." });
      }

      if (!Array.isArray(task.assignedUsers)) {
        return res
          .status(400)
          .json({ message: "No assigned users to remove from." });
      }

      const userIndex = task.assignedUsers.indexOf(userId);
      if (userIndex === -1) {
        return res
          .status(400)
          .json({ message: "User is not assigned to this task." });
      }

      task.assignedUsers.splice(userIndex, 1);

      await task.save();

      res.status(200).json({
        message: "User removed from assigned users successfully.",
        task,
      });
    } catch (error) {
      console.error("Error removing user from task:", error);
      res
        .status(500)
        .json({
          message: "An error occurred while removing the user from the task.",
          error,
        });
    }
  }
);

router.get('/task/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Task ID" });
  }

  try {
    const task = await Task.findById(id)
      .populate({
        path: "assignedUsers.user",
        select: "-password -friends -locations",
      })
      .lean();

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/update-assigned-completed/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;

  if (typeof completed !== "boolean") {
    return res
      .status(400)
      .json({ message: "Completed must be a boolean value (true or false)." });
  }

  try {
    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    const assignedUser = task.assignedUsers.find(
      (user) => user.user.toString() === req.user.userId
    );

    if (!assignedUser) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this task." });
    }

    assignedUser.completed = completed;

    await task.save();

    res.status(200).json({
      message: "Task completion status updated successfully for the assigned user.",
      task,
    });
  } catch (error) {
    console.error("Error updating assigned user's task completion status:", error);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/update/:taskId", authMiddleware, async (req, res) => {
  const { taskId } = req.params;
  const {
    title,
    content,
    dueDate,
    priority,
    tags,
    completed,
    assignedUsers,
    location,
    time,
  } = req.body;

  try {
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (title !== undefined) task.title = title;
    if (content !== undefined) task.content = content;
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (priority !== undefined) {
      if (priority < 1 || priority > 5) {
        return res
          .status(400)
          .json({ message: "Priority must be between 1 and 5." });
      }
      task.priority = priority;
    }
    if (tags !== undefined) task.tags = tags;
    task.completed = false;

    if (assignedUsers !== undefined) {
      task.assignedUsers = assignedUsers.map((userId) => ({
        user: userId,
        completed: false,
      }));
    }

    if (location?.latitude !== undefined && location?.longitude !== undefined) {
      task.location = {
        latitude: location.latitude,
        longitude: location.longitude,
      };
    }

    if (time?.time !== undefined) {
      task.time = {
        time: time.time,
        alarmed: time.alarmed || false,
      };
    }

    const updatedTask = await task.save();

    res.status(200).json({
      message: "Task updated successfully.",
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({
      message: "An error occurred while updating the task.",
      error,
    });
  }
});

router.post("/initialize", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await Task.updateMany(
      {
        completed: false,
        dueDate: { $lt: today },
        $or: [
          { createdBy: userId },
          { "assignedUsers.user": userId },
        ],
      },
      { $set: { dueDate: today, priority: 1 } }
    );

    res.status(200).json({
      message: `${result.modifiedCount} tasks updated.`,
    });
  } catch (error) {
    console.error("Error initializing tasks:", error);
    res.status(500).json({ message: "An error occurred during initialization.", error });
  }
});

router.post("/cleanup", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await Task.deleteMany({
      tags: "quickReminderTag",
      completed: true,
      dueDate: { $gte: yesterday, $lt: today },
      $or: [
        { createdBy: userId },
        { "assignedUsers.user": userId },
      ],
    });

    res.status(200).json({
      message: `${result.deletedCount} quick reminders deleted.`,
    });
  } catch (error) {
    console.error("Error cleaning up quick reminders:", error);
    res.status(500).json({ message: "An error occurred during cleanup.", error });
  }
});

module.exports = router;
