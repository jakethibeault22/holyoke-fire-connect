import axios from 'axios';
import { API_URL } from './api';

export const getFiles = async (userId, category = 'all') => {
  const url = category === 'all' 
    ? `${API_URL}/files?userId=${userId}`
    : `${API_URL}/files?userId=${userId}&category=${category}`;
  
  const response = await axios.get(url);
  return response.data;
};

export const uploadFile = async (userId, title, description, category, fileUri, fileName, fileType) => {
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('title', title);
  formData.append('description', description);
  formData.append('category', category);
  formData.append('file', {
    uri: fileUri,
    name: fileName,
    type: fileType
  });

  const response = await axios.post(`${API_URL}/files`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const deleteFile = async (fileId, userId) => {
  const response = await axios.delete(`${API_URL}/files/${fileId}`, {
    data: { userId }
  });
  return response.data;
};

export const downloadFile = async (fileId) => {
  return `${API_URL}/files/${fileId}/download`;
};