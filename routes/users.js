
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');
const User = require('../models/User');
const Tweet = require('../models/Tweet');

// @route   GET api/users/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    res.json(req.user);
  } catch (error) {
    console.error('Get current user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/:username
// @desc    Get user by username
// @access  Public
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password')
      .populate('followers', '_id name username profilePicture')
      .populate('following', '_id name username profilePicture');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get tweet count
    const tweetCount = await Tweet.countDocuments({ 
      user: user._id,
      replyTo: { $exists: false } // Exclude replies
    });
    
    // Check if requesting user is following this user
    let isFollowing = false;
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id);
        
        if (currentUser) {
          isFollowing = currentUser.following.includes(user._id);
        }
      } catch (err) {
        // Invalid token, but we'll still return the user data
        console.error('Token verification error:', err.message);
      }
    }
    
    res.json({
      ...user.toObject(),
      tweets: tweetCount,
      isFollowing
    });
  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
  const { name, bio, location, website } = req.body;
  
  // Build profile object
  const profileFields = {};
  if (name) profileFields.name = name;
  if (bio) profileFields.bio = bio;
  if (location) profileFields.location = location;
  if (website) profileFields.website = website;
  
  try {
    let user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update user
    user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: profileFields },
      { new: true }
    ).select('-password');
    
    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/users/profile-picture
// @desc    Upload profile picture
// @access  Private
router.post('/profile-picture', [auth, upload.single('image')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image' });
    }
    
    // Upload to cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'chirp/profile_pictures',
      width: 400,
      crop: 'fill'
    });
    
    // Update user profile picture
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePicture: result.secure_url },
      { new: true }
    ).select('-password');
    
    res.json(user);
  } catch (error) {
    console.error('Upload profile picture error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/users/cover-photo
// @desc    Upload cover photo
// @access  Private
router.post('/cover-photo', [auth, upload.single('image')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image' });
    }
    
    // Upload to cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'chirp/cover_photos',
      width: 1500,
      height: 500,
      crop: 'fill'
    });
    
    // Update user cover photo
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { coverPhoto: result.secure_url },
      { new: true }
    ).select('-password');
    
    res.json(user);
  } catch (error) {
    console.error('Upload cover photo error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/users/:id/follow
// @desc    Follow/unfollow a user
// @access  Private
router.post('/:id/follow', auth, async (req, res) => {
  try {
    if (req.params.id === req.user.id.toString()) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }
    
    const userToFollow = await User.findById(req.params.id);
    
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentUser = await User.findById(req.user.id);
    
    // Check if already following
    const isFollowing = currentUser.following.includes(req.params.id);
    
    if (isFollowing) {
      // Unfollow
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { following: req.params.id }
      });
      
      await User.findByIdAndUpdate(req.params.id, {
        $pull: { followers: req.user.id }
      });
      
      res.json({ message: 'User unfollowed' });
    } else {
      // Follow
      await User.findByIdAndUpdate(req.user.id, {
        $addToSet: { following: req.params.id }
      });
      
      await User.findByIdAndUpdate(req.params.id, {
        $addToSet: { followers: req.user.id }
      });
      
      res.json({ message: 'User followed' });
    }
  } catch (error) {
    console.error('Follow user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/:id/followers
// @desc    Get user followers
// @access  Public
router.get('/:id/followers', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('followers')
      .populate('followers', '_id name username profilePicture bio');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user.followers);
  } catch (error) {
    console.error('Get followers error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/:id/following
// @desc    Get users that the user is following
// @access  Public
router.get('/:id/following', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('following')
      .populate('following', '_id name username profilePicture bio');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user.following);
  } catch (error) {
    console.error('Get following error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/suggested
// @desc    Get suggested users to follow
// @access  Private
router.get('/suggested', auth, async (req, res) => {
  try {
    // Get users that the current user is not following
    // Limit to 5 users
    const users = await User.find({
      _id: { $ne: req.user.id, $nin: req.user.following }
    })
    .select('_id name username profilePicture bio')
    .limit(5);
    
    // Add isFollowing field (should be false for all)
    const usersWithFollowStatus = users.map(user => ({
      ...user.toObject(),
      isFollowing: false
    }));
    
    res.json(usersWithFollowStatus);
  } catch (error) {
    console.error('Get suggested users error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
