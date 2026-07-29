// AuthContext.jsx
// Wrap your entire app with this. Provides currentUser and role-based access anywhere.

import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);

  const login  = (user) => setCurrentUser(user);
  const logout = ()     => setCurrentUser(null);

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// ── Role permission map ────────────────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  super_admin: [
    'dashboard', 'manage_sellers', 'manage_parcels',
    'manage_riders', 'gps_parcel', 'manage_accounts',
    'settings', 'notifications',
  ],
  staff: [
    'dashboard', 'manage_sellers', 'manage_parcels',
    'manage_riders', 'notifications',
  ],
  hub_receiver: [
    'dashboard', 'manage_parcels', 'notifications',
  ],
};

export const hasPermission = (role, page) => {
  return ROLE_PERMISSIONS[role]?.includes(page) ?? false;
};