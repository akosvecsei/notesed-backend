const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const Appreport = require('../models/Appreport');

const auth = require('../middlewares/auth');
const authenticateToken = require('../middlewares/auth');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/profile_pics');
  },
  filename: (req, file, cb) => {
      cb(null, file.originalname);
  }
});

const upload = multer({ storage });

const handlebars = require('handlebars');

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: 'noreply@notesed.com',
    pass: 'nyqbyk-pycxup-1Cotcy',
  },
  tls: {
    rejectUnauthorized: false,
  },
});

router.post('/signup', upload.single('profilePicture'), async (req, res) => {
  const { email, firstName, lastName, password, language, region } = req.body;

  if (!email || !firstName || !lastName || !password) {
    return res.status(400).json({ message: 'Please fill in all required fields.' });
  }

  if (firstName.length < 3) {
    return res.status(400).json({ message: 'First name must be at least 3 characters.' });
  }

  if (lastName.length < 3) {
    return res.status(400).json({ message: 'Last name must be at least 3 characters.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      email,
      firstName,
      lastName,
      language,
      region,
      password: hashedPassword,
      profilePicture: req.file ? req.file.filename : ''
    });

    await newUser.save();

    const htmlFilePath = path.join(__dirname, '../utils/registration/registrationEmail_'+ 'en' +'.html');
    const htmlTemplate = fs.readFileSync(htmlFilePath, 'utf-8');
    const template = handlebars.compile(htmlTemplate);

    const replacements = {
      name: firstName
    };

    const htmlContent = template(replacements);

    const mailOptions = {
      from: '"NOTESED" <noreply@notesed.com>',
      to: 'akos@azureh.com',
      subject: "Let's get started ✏️",
      html: htmlContent,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.error('Hiba történt:', error);
      }
      console.log('E-mail elküldve:', info.response);
    });

    if (req.file) {
      const newFileName = `${newUser._id}${path.extname(req.file.originalname)}`;
      const oldPath = path.join('public/uploads/profile_pics', req.file.filename);
      const newPath = path.join('public/uploads/profile_pics', newFileName);
      
      fs.rename(oldPath, newPath, (err) => {
          if (err) {
              console.error('Fájl átnevezési hiba:', err);
          } else {
              newUser.profilePicture = newFileName;
              newUser.save();
          }
      });
  }

    const token = jwt.sign(
        { userId: newUser._id },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
  
      res.status(201).json({
        message: 'User created successfully.',
        token,
        user: {
          ...newUser.toObject(),
        }
      });
  } catch (error) {
    res.status(500).json({ message: 'An error occurred while creating the user.', error });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
      const user = await User.findOne({ email });
      if (!user) {
          return res.status(400).json({ message: 'Invalid email or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
          return res.status(400).json({ message: 'Invalid email or password.' });
      }

      const token = jwt.sign(
          { userId: user._id, email: user.email },
          JWT_SECRET,
          // { expiresIn: '1h' }
      );

      user.lastLogin = new Date();
      await user.save();

      res.status(200).json({
          message: 'Login successful.',
          token,
          user: {
            ...user.toObject()
          }
      });
  } catch (error) {
      console.error('Error during login.', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/delete/:userId', auth, async (req, res) => {
  try {
      const userIdFromToken = req.user.userId;
      const userIdFromParams = req.params.userId;

      if (userIdFromToken !== userIdFromParams) {
          return res.status(403).json({ message: 'You are not authorized to delete this account.' });
      }

      const user = await User.findById(userIdFromParams);
      
      if (!user) {
          return res.status(404).json({ message: 'User not found.' });
      }

      const imagePath = path.join(__dirname, '..', 'public', 'uploads', 'profile_pics', `${userIdFromParams}.jpg`);

      if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
      }

      await Notification.deleteMany({ userId: userIdFromParams });
      await Appreport.deleteMany({ reporter: userIdFromParams });
      await Task.deleteMany({ createdBy: userIdFromParams });
      await User.findByIdAndDelete(userIdFromParams);

      res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/update-name/:userId', auth, async (req, res) => {
  try {
      const { userId } = req.params;
      const { firstName, lastName } = req.body;

      if (req.user.userId !== userId) {
          return res.status(403).json({ message: 'Unauthorized to update this account.' });
      }

      const updateFields = {};
      if (firstName) updateFields.firstName = firstName;
      if (lastName) updateFields.lastName = lastName;

      const updatedUser = await User.findByIdAndUpdate(
          userId,
          updateFields,
          { new: true }
      );

      res.status(200).json({ message: 'Name updated.', user: updatedUser });
  } catch (error) {
      console.error('Error updating name:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/update-email/:userId', auth, async (req, res) => {
  try {
      const { userId } = req.params;
      const { email } = req.body;

      if (req.user.userId !== userId) {
          return res.status(403).json({ message: 'Unauthorized to update this account.' });
      }

      const currentUser = await User.findById(userId);

      if (!currentUser) {
          return res.status(404).json({ message: 'User not found.' });
      }

      if (currentUser.email === email) {
          return res.status(400).json({ message: `This is already your email.` });
      }

      const emailExists = await User.findOne({ email });

      if (emailExists) {
          return res.status(400).json({ message: 'This email is already in use.' });
      }

      currentUser.email = email;
      await currentUser.save();

      res.status(200).json({ message: 'Email updated successfully.', user: currentUser });
  } catch (error) {
      console.error('Error updating email:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});


router.patch('/update-theme/:userId', auth, async (req, res) => {
  try {
      const { userId } = req.params;
      const { theme } = req.body;

      if (req.user.userId !== userId) {
          return res.status(403).json({ message: 'Unauthorized to update this account.' });
      }

      const updatedUser = await User.findByIdAndUpdate(
          userId,
          { theme },
          { new: true }
      );

      res.status(200).json({ message: 'Theme updated.', user: updatedUser });
  } catch (error) {
      console.error('Error updating theme:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/update-language/:userId', auth, async (req, res) => {
  try {
      const { userId } = req.params;
      const { language } = req.body;

      if (req.user.userId !== userId) {
          return res.status(403).json({ message: 'Unauthorized to update this account.' });
      }

      const updatedUser = await User.findByIdAndUpdate(
          userId,
          { language },
          { new: true }
      );

      res.status(200).json({ message: 'Language updated.', user: updatedUser });
  } catch (error) {
      console.error('Error updating language:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/update-region/:userId', auth, async (req, res) => {
  try {
      const { userId } = req.params;
      const { region } = req.body;

      if (req.user.userId !== userId) {
          return res.status(403).json({ message: 'Unauthorized to update this account.' });
      }

      const updatedUser = await User.findByIdAndUpdate(
          userId,
          { region },
          { new: true }
      );

      res.status(200).json({ message: 'Region updated.', user: updatedUser });
  } catch (error) {
      console.error('Error updating language:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/update-notification/:userId', auth, async (req, res) => {
  try {
      const { userId } = req.params;
      const { notification } = req.body;

      if (req.user.userId !== userId) {
          return res.status(403).json({ message: 'Unauthorized to update this account.' });
      }

      const updatedUser = await User.findByIdAndUpdate(
          userId,
          { notification },
          { new: true }
      );

      res.status(200).json({ message: 'Notification settings updated.', user: updatedUser });
  } catch (error) {
      console.error('Error updating notification settings:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/update-status/:userId', auth, async (req, res) => {
  try {
      const { userId } = req.params;
      const { status } = req.body;

      if (req.user.userId !== userId) {
          return res.status(403).json({ message: 'Unauthorized to update this account.' });
      }

      const updatedUser = await User.findByIdAndUpdate(
          userId,
          { status },
          { new: true }
      );

      res.status(200).json({ message: 'Status updated.', user: updatedUser });
  } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/request-password-reset', async (req, res) => {
  try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
          return res.status(404).json({ message: 'User with this email does not exist.' });
      }

      const resetCode = Math.floor(100000 + Math.random() * 900000);

      user.resetCode = resetCode;
      await user.save();

      const htmlFilePath2 = path.join(__dirname, '../utils/resetPassword/resetPasswordEmail_' + 'hu' + '.html');
      const htmlTemplate2 = fs.readFileSync(htmlFilePath2, 'utf-8');
      const template2 = handlebars.compile(htmlTemplate2);

      const passwordResetCodes = {
        "en": "Password Reset Code 🔑",
        "hu": "Jelszó visszaállítási kód 🔑",
        "de": "Passwort zurücksetzen Code 🔑",
        "fr": "Code réinitialisation 🔑",
        "it": "Codice di reset della password 🔑",
        "es": "Código de restablecer 🔑",
        "ja": "パスワードリセットコード 🔑",
        "zh": "密码重置代码 🔑",
        "ar": "رمز إعادة تعيين كلمة المرور 🔑"
      };

      const replacements = {
        name: user.firstName,
        resetCode: resetCode
      };
  
      const htmlContent2 = template2(replacements);

      const mailOptions = {
        from: '"NOTESED" <noreply@notesed.com>',
        to: 'akos@azureh.com',
        subject: passwordResetCodes["hu"],
        html: htmlContent2,
      };
  
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.error('Hiba történt:', error);
        }
        console.log('E-mail elküldve:', info.response);
      });

      res.status(200).json({ message: 'Reset code generated.', resetCode });
  } catch (error) {
      console.error('Error generating reset code:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, resetCode } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User with this email does not exist.' });
    }

    if (user.resetCode !== resetCode) {
      return res.status(400).json({ message: 'Invalid reset code.' });
    }

    res.status(200).json({ message: 'Reset code verified successfully.' });
  } catch (error) {
    console.error('Error verifying reset code:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/set-new-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User with this email does not exist.' });
    }

    if (!user.resetCode) {
      return res.status(400).json({ message: 'Reset code is missing. Please request a new password reset.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetCode = undefined;
    await user.save();

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});


router.patch('/update-password/:userId', auth, async (req, res) => {
  try {
      const { userId } = req.params;
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (req.user.userId !== userId) {
          return res.status(403).json({ message: 'Unauthorized to update this account.' });
      }

      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ message: 'User not found.' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
          return res.status(400).json({ message: 'Incorrect current password.' });
      }

      if (newPassword !== confirmPassword) {
          return res.status(400).json({ message: 'New passwords do not match.' });
      }

      if (newPassword.length < 6) {
          return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      await user.save();

      res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
      console.error('Error updating password:', error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({}, 'firstName lastName email');
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'An error occurred while fetching users.', error });
  }
});

router.post('/check-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.json({ exists: true, message: 'Email already exists.' });
    } else {
      return res.json({ exists: false, message: 'Email is available.' });
    }
  } catch (error) {
    console.error('Error checking email:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/profile/upload/:userId', upload.single('profilePicture'), auth, async (req, res) => {
  const { userId } = req.params;

  try {
      const user = await User.findById(userId);

      if (!user) {
          return res.status(404).json({ message: "User not found." });
      }

      if (user.profilePicture) {
          const oldImagePath = path.join(__dirname, '..', user.profilePicture);
          if (fs.existsSync(oldImagePath)) {
              fs.unlinkSync(oldImagePath);
          }
      }

      if (req.file) {
          user.profilePicture = `${req.file.filename}`;
      }

      await user.save();

      res.status(200).json({ message: "Profile picture uploaded successfully.", profilePicture: user.profilePicture });
  } catch (error) {
      console.error('Error uploading profile picture:', error);
      res.status(500).json({ message: "Error uploading profile picture", error });
  }
});

router.get('/profile/picture/:userId', auth, async (req, res) => {
  const { userId } = req.params;
  try {
      const user = await User.findById(userId);

      if (user && user.profilePicture) {
          res.status(200).json({ profilePicture: user.profilePicture });
      } else {
          res.status(404).json({ 
              message: "Profile picture not found.", 
              userId 
          });
      }
  } catch (error) {
      res.status(500).json({ message: "Error fetching profile picture", error });
  }
});

router.delete('/profile/picture/:userId', auth, async (req, res) => {
  const { userId } = req.params;

  try {
      const user = await User.findById(userId);

      if (!user) {
          return res.status(404).json({ message: "User not found." });
      }


      const imagePath = path.join(__dirname, '..', 'public', 'uploads', 'profile_pics', `${userId}.jpg`);

  
      if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          user.profilePicture = '';
          await user.save(); 
          return res.status(200).json({ message: "Profile picture deleted successfully." });
      } else {
          return res.status(404).json({ message: "Profile picture not found." });
      }
  } catch (error) {
      console.error('Error deleting profile picture:', error);
      res.status(500).json({ message: "Error deleting profile picture", error });
  }
});

router.get('/search', auth, async (req, res) => {
  const { query } = req.query;

  if (!query || query.length < 3) {
    return res.status(400).json({ message: 'Query must be at least 3 characters long.' });
  }

  try {
    const users = await User.find({
      visible: true,
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).select('-password -resetCode');

    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/friends/:userId', authenticateToken, async (req, res) => {

  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate('friends', '-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      friends: user.friends
    });
  } catch (error) {
    console.error('Error retrieving friends:', error);
    res.status(500).json({
      message: 'An error occurred while retrieving the friends.',
      error,
    });
  }
});

router.delete('/friends/:userId/:friendId', authenticateToken, async (req, res) => {
  const { userId, friendId } = req.params;

  try {
    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!friend) {
      return res.status(404).json({ message: 'Friend not found.' });
    }

    const userHasFriend = user.friends.includes(friendId);
    const friendHasUser = friend.friends.includes(userId);

    if (!userHasFriend || !friendHasUser) {
      return res.status(404).json({ message: 'Friendship not found.' });
    }

    user.friends = user.friends.filter(friend => friend.toString() !== friendId);
    friend.friends = friend.friends.filter(friend => friend.toString() !== userId);

    await user.save();
    await friend.save();

    res.status(200).json({
      message: 'Friendship removed successfully for both users.',
    });
  } catch (error) {
    console.error('Error removing friendship:', error);
    res.status(500).json({
      message: 'An error occurred while removing the friendship.',
      error,
    });
  }
});

router.get('/searchFriends/:userId', auth, async (req, res) => {
  const { query } = req.query;
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate('friends', '-password -resetCode');

    if (!user || !user.friends) {
      return res.status(404).json({ message: 'User or friends list not found.' });
    }

    let matchedFriends;

    if (!query || query.trim() === '') {
      matchedFriends = user.friends;
    } else {
      const queryRegex = new RegExp(query.trim().replace(/\s+/g, '\\s+'), 'i');
      matchedFriends = user.friends.filter(friend => 
        queryRegex.test(`${friend.firstName} ${friend.lastName}`) || 
        queryRegex.test(friend.email)
      );
    }

    res.status(200).json(matchedFriends);
  } catch (error) {
    console.error('Error searching friends:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/update-visible/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.userId !== userId) {
      return res.status(403).json({ message: 'Unauthorized to update this account.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { visible: !user.visible },
      { new: true }
    );

    res.status(200).json({ message: 'Visibility toggled.', user: updatedUser });
  } catch (error) {
    console.error('Error toggling visibility:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/user/:userId', auth, async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId, 'firstName lastName');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ firstName: user.firstName, lastName: user.lastName });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/userInfo/:userId', auth, async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


router.post('/users/locations/:userId', auth, async (req, res) => {
  const { userId } = req.params;
  const { name, icon, latitude, longitude } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Missing required fields: name.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const normalizedNewName = name.trim().toLowerCase();
    const locationExists = user.locations?.some(
      (location) => location.name.trim().toLowerCase() === normalizedNewName
    );

    if (locationExists) {
      return res.status(400).json({
        success: false,
        message: 'Location name already exists for this user.',
      });
    }

    const newLocation = { name: name.trim(), icon: icon, latitude, longitude };

    if (!user.locations) {
      user.locations = [];
    }
    user.locations.push(newLocation);

    await user.save();

    res.status(200).json({ success: true, message: 'Location added successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.delete('/users/locations/:userId', auth, async (req, res) => {
  const { userId } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Missing location name.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const normalizedToDelete = name.trim().toLowerCase();
    const locationIndex = user.locations?.findIndex(
      (location) => location.name.trim().toLowerCase() === normalizedToDelete
    );

    if (locationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Location not found for this user.',
      });
    }

    user.locations.splice(locationIndex, 1);

    await user.save();

    res.status(200).json({ success: true, message: 'Location deleted successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.get('/users/locations/:userId', auth, async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const locations = user.locations || [];
    res.status(200).json(locations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.put('/users/locations/:userId/:locationId', auth, async (req, res) => {
  const { userId, locationId } = req.params;
  const { name, icon, latitude, longitude } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const locationIndex = user.locations?.findIndex(
      (location) => location._id.toString() === locationId
    );

    if (locationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Location not found for this user.',
      });
    }

    if (name !== undefined) user.locations[locationIndex].name = name.trim();
    if (icon !== undefined) user.locations[locationIndex].icon = icon;
    if (latitude !== undefined) user.locations[locationIndex].latitude = latitude;
    if (longitude !== undefined) user.locations[locationIndex].longitude = longitude;

    await user.save();

    res.status(200).json({ success: true, message: 'Location updated successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;
