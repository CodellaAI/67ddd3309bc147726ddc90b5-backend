
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');
const Tweet = require('../models/Tweet');
const User = require('../models/User');

// @route   GET api/tweets
// @desc    Get timeline tweets
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get IDs of users that the current user is following
    const following = req.user.following;
    following.push(req.user.id); // Include own tweets
    
    // Get tweets from followed users and own tweets
    const tweets = await Tweet.find({
      user: { $in: following },
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
    .skip(skip)
    .limit(limit);
    
    // Add isLiked and isRetweeted fields
    const tweetsWithUserInteraction = tweets.map(tweet => {
      const isLiked = tweet.likes.includes(req.user.id);
      const isRetweeted = tweet.retweets.includes(req.user.id);
      
      return {
        ...tweet.toObject(),
        isLiked,
        isRetweeted
      };
    });
    
    res.json(tweetsWithUserInteraction);
  } catch (error) {
    console.error('Get timeline tweets error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/tweets
// @desc    Create a tweet
// @access  Private
router.post('/', [auth, upload.single('image')], async (req, res) => {
  try {
    const { content, replyTo } = req.body;
    
    if (!content && !req.file) {
      return res.status(400).json({ message: 'Tweet content is required' });
    }
    
    let imageUrl = '';
    
    if (req.file) {
      // Upload to cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'chirp/tweets'
      });
      imageUrl = result.secure_url;
    }
    
    const tweetData = {
      user: req.user.id,
      content: content || '',
      image: imageUrl
    };
    
    // If replying to a tweet
    if (replyTo) {
      const parentTweet = await Tweet.findById(replyTo);
      
      if (!parentTweet) {
        return res.status(404).json({ message: 'Tweet to reply to not found' });
      }
      
      tweetData.replyTo = replyTo;
    }
    
    const tweet = new Tweet(tweetData);
    await tweet.save();
    
    // Populate user data
    await tweet.populate('user', '_id name username profilePicture isVerified');
    
    // If it's a reply, populate parent tweet data
    if (replyTo) {
      await tweet.populate({
        path: 'replyTo',
        populate: {
          path: 'user',
          select: '_id name username profilePicture isVerified'
        }
      });
    }
    
    res.json({
      ...tweet.toObject(),
      isLiked: false,
      isRetweeted: false
    });
  } catch (error) {
    console.error('Create tweet error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/tweets/:id
// @desc    Get a tweet by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id)
      .populate('user', '_id name username profilePicture isVerified')
      .populate({
        path: 'retweetData',
        populate: {
          path: 'user',
          select: '_id name username profilePicture isVerified'
        }
      })
      .populate({
        path: 'replyTo',
        populate: {
          path: 'user',
          select: '_id name username profilePicture isVerified'
        }
      });
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if requesting user has liked or retweeted
    let isLiked = false;
    let isRetweeted = false;
    
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        isLiked = tweet.likes.includes(decoded.id);
        isRetweeted = tweet.retweets.includes(decoded.id);
      } catch (err) {
        // Invalid token, but we'll still return the tweet
        console.error('Token verification error:', err.message);
      }
    }
    
    res.json({
      ...tweet.toObject(),
      isLiked,
      isRetweeted
    });
  } catch (error) {
    console.error('Get tweet error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE api/tweets/:id
// @desc    Delete a tweet
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if user owns the tweet
    if (tweet.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    
    await tweet.deleteOne();
    
    // Delete all replies to this tweet
    await Tweet.deleteMany({ replyTo: req.params.id });
    
    res.json({ message: 'Tweet deleted' });
  } catch (error) {
    console.error('Delete tweet error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/tweets/:id/like
// @desc    Like/unlike a tweet
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if user has already liked the tweet
    const isLiked = tweet.likes.includes(req.user.id);
    
    if (isLiked) {
      // Unlike
      await Tweet.findByIdAndUpdate(req.params.id, {
        $pull: { likes: req.user.id }
      });
      
      res.json({ message: 'Tweet unliked' });
    } else {
      // Like
      await Tweet.findByIdAndUpdate(req.params.id, {
        $addToSet: { likes: req.user.id }
      });
      
      res.json({ message: 'Tweet liked' });
    }
  } catch (error) {
    console.error('Like tweet error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/tweets/:id/retweet
// @desc    Retweet/unretweet a tweet
// @access  Private
router.post('/:id/retweet', auth, async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    
    // Check if user has already retweeted the tweet
    const isRetweeted = tweet.retweets.includes(req.user.id);
    
    if (isRetweeted) {
      // Unretweet
      await Tweet.findByIdAndUpdate(req.params.id, {
        $pull: { retweets: req.user.id }
      });
      
      // Delete the retweet
      await Tweet.deleteOne({
        user: req.user.id,
        retweetData: req.params.id
      });
      
      res.json({ message: 'Tweet unretweeted' });
    } else {
      // Retweet
      await Tweet.findByIdAndUpdate(req.params.id, {
        $addToSet: { retweets: req.user.id }
      });
      
      // Create a retweet
      const retweet = new Tweet({
        user: req.user.id,
        retweetData: req.params.id
      });
      
      await retweet.save();
      
      res.json({ message: 'Tweet retweeted' });
    }
  } catch (error) {
    console.error('Retweet error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/tweets/:id/comments
// @desc    Get comments for a tweet
// @access  Public
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await Tweet.find({ replyTo: req.params.id })
      .populate('user', '_id name username profilePicture isVerified')
      .sort({ createdAt: -1 });
    
    // Check if requesting user has liked or retweeted
    let commentsWithUserInteraction = comments;
    
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        commentsWithUserInteraction = comments.map(comment => {
          const isLiked = comment.likes.includes(decoded.id);
          const isRetweeted = comment.retweets.includes(decoded.id);
          
          return {
            ...comment.toObject(),
            isLiked,
            isRetweeted
          };
        });
      } catch (err) {
        // Invalid token, but we'll still return the comments
        console.error('Token verification error:', err.message);
      }
    }
    
    res.json(commentsWithUserInteraction);
  } catch (error) {
    console.error('Get comments error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/tweets/user/:userId
// @desc    Get tweets by user
// @access  Public
router.get('/user/:userId', async (req, res) => {
  try {
    const tweets = await Tweet.find({
      user: req.params.userId,
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
    .sort({ createdAt: -1 });
    
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
    console.error('Get user tweets error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
