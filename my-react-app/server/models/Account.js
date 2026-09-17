const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AccountSchema = new mongoose.Schema({
  adminId:     { type: String, unique: true, sparse: true },
  name:        { type: String, required: true },
  email:       { type: String, required: true, unique: true },
  phone:       { type: String, default: '' },
  role:        { type: String, enum: ['super_admin', 'staff', 'hub_receiver'], default: 'staff' },
  password:    { type: String, required: true },
  status:      { type: String, enum: ['Active', 'Deactivated'], default: 'Active' },
  accountCategory: { type: String, enum: ['REAL', 'DEMO'], default: 'REAL' },
  createdDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
  statusHistory: {
    type: [{
      type:      { type: String, enum: ['registration', 'status_change'], default: 'status_change' },
      status:    { type: String, default: 'Active' },
      reason:    { type: String, default: '' },
      changedAt: { type: Date, default: Date.now },
    }],
    default: [],
  },
});

// Hash password before save if modified
AccountSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
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