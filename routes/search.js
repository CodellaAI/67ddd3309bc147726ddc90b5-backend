
const express = require('express');
const router = express.Router();
const Tweet = require('../models/Tweet');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// @route   GET api/search/tweets
// @desc    Search tweets
// @access  Public
router.get('/tweets', async (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    const tweets = await Tweet.find({
      content: { $regex: query, $options: 'i' },
      replyTo: { $exists: false } // Exclude replies
    })
    .populate('user', '_id name username profilePicture isVerified')
    .populate({
      path: 'retweetData',
      populate: {
        path: 'user',
        select: '_id name username profilePicture isVerified'
      }
    })
    .sort({ createdAt: -1 })
    .limit(20);
    
    // Check if requesting user has liked or retweeted
    let tweetsWithUserInteraction = tweets;
    
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        tweetsWithUserInteraction = tweets.map(tweet => {
          const isLiked = tweet.likes.includes(decoded.id);
          const isRetweeted = tweet.retweets.includes(decoded.id);
          
          return {
            ...tweet.toObject(),
            isLiked,
            isRetweeted
          };
        });
      } catch (err) {
        // Invalid token, but we'll still return the tweets
        console.error('Token verification error:', err.message);
      }
    }
    
    res.json(tweetsWithUserInteraction);
  } catch (error) {
    console.error('Search tweets error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/search/users
// @desc    Search users
// @access  Public
router.get('/users', async (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } }
      ]
    })
    .select('_id name username profilePicture bio isVerified followers')
    .limit(20);
    
    // Check if requesting user is following these users
    let usersWithFollowStatus = users;
    
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id);
        
        if (currentUser) {
          usersWithFollowStatus = users.map(user => {
            const isFollowing = currentUser.following.includes(user._id);
            
            return {
              ...user.toObject(),
              isFollowing
            };
          });
        }
      } catch (err) {
        // Invalid token, but we'll still return the users
        console.error('Token verification error:', err.message);
      }
    }
    
    res.json(usersWithFollowStatus);
  } catch (error) {
    console.error('Search users error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
