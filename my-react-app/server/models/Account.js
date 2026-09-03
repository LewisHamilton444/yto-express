const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AccountSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, required: true, unique: true },
  phone:       { type: String, default: '' },
  role:        { type: String, enum: ['super_admin', 'staff', 'hub_receiver'], default: 'staff' },
  password:    { type: String, required: true },
  status:      { type: String, enum: ['Active', 'Deactivated'], default: 'Active' },
  accountCategory: { type: String, enum: ['REAL', 'DEMO'], default: 'REAL' },
  createdDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
});

// Hash password before save if modified
AccountSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password with bcrypt (supports legacy plaintext migration)
AccountSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  // If stored password is a bcrypt hash
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return await bcrypt.compare(candidatePassword, this.password);
  }
  // Plaintext legacy fallback (match, then upgrade)
  if (this.password === candidatePassword) {
    // Upgrade to bcrypt hash
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(candidatePassword, salt);
    await this.save();
    return true;
  }
  return false;
};

module.exports = mongoose.model('Account', AccountSchema);