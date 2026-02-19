import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
  Image,
} from 'react-native';
import { getFiles, deleteFile, downloadFile, uploadFile } from '../services/fileApi';
import { COLORS } from '../utils/constants';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

const CATEGORIES = [
  { id: 'all', label: 'All Files' },
  { id: 'general', label: 'General' },
  { id: 'training', label: 'Training' },
  { id: 'sops', label: 'SOPs' },
  { id: 'forms', label: 'Forms' },
];

export default function FilesScreen({ user }) {
  const [files, setFiles] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadCategory, setUploadCategory] = useState('general');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [selectedCategory]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const data = await getFiles(user.id, selectedCategory);
      setFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading files:', error);
      Alert.alert('Error', 'Failed to load files. Please try again.');
      setFiles([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFiles();
  }, [selectedCategory]);

  const handleDownload = async (fileId, fileName) => {
    try {
      const url = downloadFile(fileId);
      const supported = await Linking.canOpenURL(url);
      
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this file type');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      Alert.alert('Error', 'Failed to download file');
    }
  };

  const handleDelete = async (fileId, fileName) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${fileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFile(fileId, user.id);
              loadFiles();
              Alert.alert('Success', 'File deleted');
            } catch (error) {
              console.error('Error deleting file:', error);
              Alert.alert('Error', 'Failed to delete file');
            }
          },
        },
      ]
    );
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleUpload = async () => {
    if (!uploadTitle.trim() || !selectedFile) {
      Alert.alert('Error', 'Please provide a title and select a file');
      return;
    }

    setUploading(true);
    try {
      await uploadFile(
        user.id,
        uploadTitle,
        uploadDescription,
        uploadCategory,
        selectedFile.uri,
        selectedFile.name,
        selectedFile.mimeType || 'application/octet-stream'
      );

      Alert.alert('Success', 'File uploaded successfully');
      setShowUploadModal(false);
      setUploadTitle('');
      setUploadDescription('');
      setUploadCategory('general');
      setSelectedFile(null);
      loadFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
      Alert.alert('Error', 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };
  
  const isImageFile = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image';
    if (['pdf'].includes(ext)) return 'document-text';
    if (['doc', 'docx'].includes(ext)) return 'document';
    if (['xls', 'xlsx'].includes(ext)) return 'stats-chart';
    if (['zip', 'rar'].includes(ext)) return 'archive';
    return 'document-outline';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const isAdmin = user.role === 'admin' || user.role === 'super_user' || 
                  user.roles?.includes('admin') || user.roles?.includes('super_user');

  return (
    <View style={styles.container}>
      {/* Upload Button */}
      {isAdmin && (
        <View style={styles.uploadButtonContainer}>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => setShowUploadModal(true)}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="white" />
            <Text style={styles.uploadButtonText}>Upload File</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Category Tabs */}
      <View style={styles.categoryTabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryTabs}
          contentContainerStyle={styles.categoryTabsContent}
        >
          {CATEGORIES.map(category => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.tab,
                selectedCategory === category.id && styles.tabActive,
              ]}
              onPress={() => setSelectedCategory(category.id)}
            >
              <Text
                style={[
                  styles.tabText,
                  selectedCategory === category.id && styles.tabTextActive,
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Files List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.filesList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {files.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={64} color={COLORS.gray300} />
              <Text style={styles.emptyText}>No files</Text>
            </View>
          ) : (
            files.map(file => (
              <View key={file.id} style={styles.fileCard}>
                <View style={styles.fileHeader}>
                  <View style={styles.fileIconContainer}>
                    {isImageFile(file.original_filename) ? (
                      <Image
                        source={{ uri: downloadFile(file.id) }}
                        style={styles.thumbnail}
                      />
                    ) : (
                      <Ionicons
                        name={getFileIcon(file.original_filename)}
                        size={32}
                        color={COLORS.primary}
                      />
                    )}
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileTitle}>{file.title}</Text>
                    <Text style={styles.fileName}>{file.original_filename}</Text>
                    {file.description && (
                      <Text style={styles.fileDescription} numberOfLines={2}>
                        {file.description}
                      </Text>
                    )}
                    <View style={styles.fileMeta}>
                      <Text style={styles.fileSize}>{formatFileSize(file.file_size)}</Text>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{file.category}</Text>
                      </View>
                    </View>
                    <Text style={styles.fileUploader}>
                      By {file.uploaded_by_name} • {new Date(file.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.fileActions}>
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() => handleDownload(file.id, file.original_filename)}
                  >
                    <Ionicons name="download-outline" size={20} color="white" />
                    <Text style={styles.downloadButtonText}>Download</Text>
                  </TouchableOpacity>
                  
                  {(isAdmin || file.uploaded_by === user.id) && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDelete(file.id, file.title)}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload File</Text>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray700} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={uploadTitle}
                onChangeText={setUploadTitle}
                placeholder="Enter file title"
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={uploadDescription}
                onChangeText={setUploadDescription}
                placeholder="Enter description (optional)"
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>Category *</Text>
              <View style={styles.pickerContainer}>
                {['general', 'training', 'sops', 'forms'].map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryOption,
                      uploadCategory === cat && styles.categoryOptionActive,
                    ]}
                    onPress={() => setUploadCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        uploadCategory === cat && styles.categoryOptionTextActive,
                      ]}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>File *</Text>
              <TouchableOpacity style={styles.filePickerButton} onPress={pickDocument}>
                <Ionicons name="document-attach-outline" size={20} color={COLORS.primary} />
                <Text style={styles.filePickerText}>
                  {selectedFile ? selectedFile.name : 'Choose File'}
                </Text>
              </TouchableOpacity>

              {selectedFile && (
                <View style={styles.selectedFileInfo}>
                  <Text style={styles.selectedFileName}>{selectedFile.name}</Text>
                  <Text style={styles.selectedFileSize}>
                    {formatFileSize(selectedFile.size)}
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowUploadModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, uploading && styles.submitButtonDisabled]}
                onPress={handleUpload}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.submitButtonText}>Upload</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  uploadButtonContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  categoryTabsContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  categoryTabs: {
    flexGrow: 0,
  },
  categoryTabsContent: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    color: COLORS.gray500,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  filesList: {
    flex: 1,
    padding: 16,
  },
  fileCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fileHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  fileIconContainer: {
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: 4,
  },
  fileName: {
    fontSize: 12,
    color: COLORS.gray500,
    marginBottom: 4,
  },
  fileDescription: {
    fontSize: 14,
    color: COLORS.gray600,
    marginBottom: 8,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: COLORS.gray500,
    marginRight: 8,
  },
  categoryBadge: {
    backgroundColor: COLORS.gray100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    color: COLORS.gray700,
    fontWeight: '500',
  },
  fileUploader: {
    fontSize: 11,
    color: COLORS.gray400,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.info,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  downloadButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  deleteButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.gray100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.gray400,
    marginTop: 16,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  modalBody: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray300,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    backgroundColor: 'white',
  },
  categoryOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryOptionText: {
    fontSize: 14,
    color: COLORS.gray700,
  },
  categoryOptionTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  filePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    borderRadius: 8,
    backgroundColor: COLORS.gray50,
  },
  filePickerText: {
    fontSize: 14,
    color: COLORS.gray700,
    marginLeft: 8,
  },
  selectedFileInfo: {
    marginTop: 8,
    padding: 12,
    backgroundColor: COLORS.gray50,
    borderRadius: 8,
  },
  selectedFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  selectedFileSize: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  
});