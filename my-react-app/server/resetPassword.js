// One-time admin password reset.
// Usage: node resetPassword.js <email> <newPassword>
//
// Hashes the password exactly once and writes it with the raw collection, so
// the Account model's pre('save') hook does not hash it a second time.
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.error('Usage: node resetPassword.js <email> <newPassword>');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in server/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const result = await mongoose.connection.collection('accounts').updateOne(
      { email: email.toLowerCase().trim() },
      { $set: { password: hash } }
    );
    if (result.matchedCount === 0) {
      console.log(`No account found for ${email}`);
      process.exitCode = 1;
    } else {
      console.log(`Password reset for ${email}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
