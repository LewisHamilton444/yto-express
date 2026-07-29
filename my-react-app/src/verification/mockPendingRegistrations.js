// Mock data simulating registrations submitted from the mobile app,
// awaiting admin review on the web portal.

export const initialPendingSellers = [
  {
    id: 'SH-20260720-00001',
    type: 'seller',
    fullName: 'Maria Santos',
    contactNumber: '+63 917 123 4567',
    email: 'maria.santos@example.com',
    governmentId: { type: 'PhilSys ID', number: '1234-5678-9012' },
    address: '123 Rizal St, Barangay Poblacion, Quezon City, Metro Manila',
    businessName: 'Santos Fresh Produce',
    businessType: 'Grocery & Fresh Goods',
    submittedAt: '2026-07-20T09:14:00+08:00',
    documents: [
      { label: 'Government ID (Front)', fileName: 'philsys_front.jpg' },
      { label: 'Government ID (Back)', fileName: 'philsys_back.jpg' },
      { label: 'Proof of Address', fileName: 'utility_bill.pdf' },
    ],
    status: 'Pending',
  },
  {
    id: 'SH-20260721-00002',
    type: 'seller',
    fullName: 'Ramon Torres',
    contactNumber: '+63 920 445 8890',
    email: 'ramon.torres@example.com',
    governmentId: { type: 'Driver’s License', number: 'N02-88-113456' },
    address: '78 Aguinaldo Hwy, Barangay Zapote, Bacoor, Cavite',
    businessName: 'Torres Hardware & Tools',
    businessType: 'Hardware & Construction',
    submittedAt: '2026-07-21T14:02:00+08:00',
    documents: [
      { label: 'Government ID (Front)', fileName: 'license_front.jpg' },
      { label: 'DTI Registration', fileName: 'dti_cert.pdf' },
    ],
    status: 'Pending',
  },
  {
    id: 'SH-20260722-00003',
    type: 'seller',
    fullName: 'Angelica Reyes',
    contactNumber: '+63 908 771 2200',
    email: 'angelica.reyes@example.com',
    governmentId: { type: 'Passport', number: 'P1234567A' },
    address: '15 Jacinto St, Barangay Dila, Santa Rosa, Laguna',
    businessName: 'Angel’s Boutique',
    businessType: 'Apparel & Accessories',
    submittedAt: '2026-07-22T11:47:00+08:00',
    documents: [
      { label: 'Government ID', fileName: 'passport_scan.jpg' },
      { label: 'Proof of Address', fileName: 'barangay_cert.pdf' },
    ],
    status: 'Pending',
  },
];

export const initialPendingRiders = [
  {
    id: 'RD-20260719-00001',
    type: 'rider',
    fullName: 'Juan Dela Cruz',
    contactNumber: '+63 918 555 2211',
    email: 'juan.delacruz@example.com',
    governmentId: { type: 'Driver’s License', number: 'N01-23-456789' },
    address: '45 Mabini Ave, Barangay San Isidro, Pasig City',
    vehicle: { type: 'Motorcycle', plate: 'NBC 1234', model: 'Honda Click 125i' },
    submittedAt: '2026-07-19T16:30:00+08:00',
    documents: [
      { label: 'Driver’s License (Front)', fileName: 'dl_front.jpg' },
      { label: 'Driver’s License (Back)', fileName: 'dl_back.jpg' },
      { label: 'OR/CR', fileName: 'or_cr.pdf' },
    ],
    status: 'Pending',
  },
  {
    id: 'RD-20260721-00002',
    type: 'rider',
    fullName: 'Michael Bautista',
    contactNumber: '+63 906 334 7789',
    email: 'michael.bautista@example.com',
    governmentId: { type: 'PhilSys ID', number: '5566-7788-9900' },
    address: '9 Molino Blvd, Barangay Molino IV, Bacoor, Cavite',
    vehicle: { type: 'Bicycle', plate: '—', model: 'Fixed Gear' },
    submittedAt: '2026-07-21T08:05:00+08:00',
    documents: [
      { label: 'Government ID', fileName: 'philsys_id.jpg' },
    ],
    status: 'Pending',
  },
  {
    id: 'RD-20260722-00003',
    type: 'rider',
    fullName: 'Cristina Ramos',
    contactNumber: '+63 917 662 4410',
    email: 'cristina.ramos@example.com',
    governmentId: { type: 'Driver’s License', number: 'N05-77-902341' },
    address: '212 Ortigas Ave, Barangay Ugong, Pasig City',
    vehicle: { type: 'Van', plate: 'ABC 5567', model: 'Toyota HiAce' },
    submittedAt: '2026-07-22T13:18:00+08:00',
    documents: [
      { label: 'Driver’s License', fileName: 'dl_scan.jpg' },
      { label: 'OR/CR', fileName: 'van_or_cr.pdf' },
      { label: 'NBI Clearance', fileName: 'nbi_clearance.pdf' },
    ],
    status: 'Pending',
  },
];

export const generateCredentials = (fullName) => {
  const parts = fullName.trim().split(/\s+/);
  const first = (parts[0] || 'user').toLowerCase();
  const lastInitial = (parts[parts.length - 1] || '')[0]?.toLowerCase() || '';
  const randomDigits = Math.floor(100 + Math.random() * 900);
  const username = `${first}${lastInitial}${randomDigits}`;

  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  return { username, password };
};

// The Contact Number is only WHERE the SMS gets delivered — the username is
// its own generated value, not the phone number/email itself.
export const buildSmsMessage = ({ username, password }) =>
  `Welcome to YTO Express! Your account has been approved. Your login credentials — Username: ${username} | Temp Password: ${password}. Please change your password after logging in.`;
