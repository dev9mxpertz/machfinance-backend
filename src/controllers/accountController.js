const { User } = require('../models');

async function getAccount(req, res) {
  res.json(req.user.toJSON());
}

async function updateContact(req, res) {
  const { email, mobile } = req.valid.body;
  if (email) req.user.email = email;
  if (mobile) req.user.mobile = mobile;
  await req.user.save();
  const fresh = await User.findById(req.user._id);
  res.json(fresh.toJSON());
}

module.exports = { getAccount, updateContact };
