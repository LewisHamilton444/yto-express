const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, required: true, unique: true },
  phone:       { type: String, default: '' },
  role:        { type: String, enum: ['super_admin', 'staff', 'hub_receiver'], default: 'staff' },
  password:    { type: String, required: true },
  status:      { type: String, enum: ['Active', 'Deactivated'], default: 'Active' },
  createdDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
});

module.exports = mongoose.model('Account', AccountSchema);