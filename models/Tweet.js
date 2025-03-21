
const mongoose = require('mongoose');

const TweetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 280
  },
  image: {
    type: String
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  retweets: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  retweetData: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tweet'
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tweet'
  },
  pinned: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for comments count
TweetSchema.virtual('commentCount', {
  ref: 'Tweet',
  localField: '_id',
  foreignField: 'replyTo',
  count: true
});

// Virtual for comments
TweetSchema.virtual('comments', {
  ref: 'Tweet',
  localField: '_id',
  foreignField: 'replyTo'
});

module.exports = mongoose.model('Tweet', TweetSchema);
