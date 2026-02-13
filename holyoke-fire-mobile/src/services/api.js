import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// IMPORTANT: Update this to your actual Render.com URL
export const API_URL = 'https://holyoke-fire-connect.onrender.com/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Store user session
export const storeUser = async (user) => {
  try {
    await SecureStore.setItemAsync('user', JSON.stringify(user));
  } catch (error) {
    console.error('Error storing user:', error);
  }
};

export const getStoredUser = async () => {
  try {
    const user = await SecureStore.getItemAsync('user');
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error('Error getting stored user:', error);
    return null;
  }
};

export const clearUser = async () => {
  try {
    await SecureStore.deleteItemAsync('user');
  } catch (error) {
    console.error('Error clearing user:', error);
  }
};

// Auth API calls
export const login = async (username, password) => {
  const response = await api.post('/login', { username, password });
  return response.data;
};

export const register = async (email, name, username, password) => {
  const response = await api.post('/register', { email, name, username, password });
  return response.data;
};

// Bulletins API calls
export const getBulletinsByCategory = async (category, userId) => {
  const response = await api.get(`/bulletins/category/${category}?userId=${userId}`);
  return response.data;
};

export const getAllBulletins = async (userId) => {
  const response = await api.get(`/bulletins/all?userId=${userId}`);
  return response.data;
};

export const getBulletinPermissions = async (category, userId) => {
  const response = await api.get(`/bulletins/permissions/${category}?userId=${userId}`);
  return response.data;
};

export const postBulletin = async (formData) => {
  const response = await api.post('/bulletins', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const deleteBulletin = async (bulletinId, userId) => {
  const response = await api.delete(`/bulletins/${bulletinId}`, {
    data: { userId },
  });
  return response.data;
};

export const markBulletinAsRead = async (userId, bulletinId) => {
  const response = await api.post('/bulletins/mark-read', {
    userId,
    bulletinId,
  });
  return response.data;
};

// Messages API calls
export const getInbox = async (userId) => {
  const response = await api.get(`/messages/inbox/${userId}`);
  return response.data;
};

export const getThreadMessages = async (threadId, userId) => {
  const response = await api.get(`/messages/thread/${threadId}?userId=${userId}`);
  return response.data;
};

export const sendMessage = async (formData) => {
  const response = await api.post('/messages', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const deleteMessage = async (messageId, userId) => {
  const response = await api.delete(`/messages/${messageId}`, {
    data: { userId },
  });
  return response.data;
};

export const markMessageAsRead = async (userId, messageId) => {
  const response = await api.post('/messages/mark-read', {
    userId,
    messageId,
  });
  return response.data;
};

export const getReadStatus = async (userId) => {
  const response = await api.get(`/read-status/${userId}`);
  return response.data;
};

// Users API calls
export const getUsers = async () => {
  const response = await api.get('/users');
  return response.data;
};

export const getPendingUsers = async (requestingUserId) => {
  const response = await api.get(`/admin/pending-users?requestingUserId=${requestingUserId}`);
  return response.data;
};

export const approveUser = async (userId, assignedRole, requestingUserId) => {
  const response = await api.post(`/admin/approve-user/${userId}`, {
    assignedRole,
    requestingUserId,
  });
  return response.data;
};

export const rejectUser = async (userId, requestingUserId) => {
  const response = await api.post(`/admin/reject-user/${userId}`, {
    requestingUserId,
  });
  return response.data;
};

// Forgot password
export const forgotPassword = async (username) => {
  const response = await axios.post(`${API_URL}/request-password-reset`, { username });
  return response.data;
};

// Get password reset requests (Admin)
export const getPasswordResetRequests = async (requestingUserId) => {
  const response = await axios.get(`${API_URL}/admin/password-reset-requests`, {
    params: { requestingUserId }
  });
  return response.data;
};

// Approve password reset
export const approvePasswordReset = async (requestId, newPassword, requestingUserId) => {
  const response = await axios.post(`${API_URL}/admin/password-reset-requests/${requestId}/approve`, {
    newPassword,
    requestingUserId,
  });
  return response.data;
};

// Reject password reset
export const rejectPasswordReset = async (requestId, requestingUserId) => {
  const response = await axios.post(`${API_URL}/admin/password-reset-requests/${requestId}/reject`, {
    requestingUserId,
  });
  return response.data;
};

// Change own password (after forced reset)
export const changeOwnPassword = async (userId, oldPassword, newPassword) => {
  const response = await axios.post(`${API_URL}/change-password`, {
    userId,
    oldPassword,
    newPassword
  });
  return response.data;
};

export const resetPassword = async (userId, newPassword, requestingUserId) => {
  const response = await api.post(`/admin/users/${userId}/reset-password`, {
    newPassword,
    requestingUserId,
  });
  return response.data;
};

export const updateUser = async (userId, email, name, username, roles, requestingUserId) => {
  const response = await api.put(`/admin/users/${userId}`, {
    email,
    name,
    username,
    roles,
    requestingUserId,
  });
  return response.data;
};

export default api;