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
  TextInput,
  Modal,
  Image,
  Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  API_URL,
  getBulletinsByCategory,
  markBulletinAsRead,
  deleteBulletin,
  getBulletinPermissions,
  getBulletinAttachments,
  postBulletin,
} from '../services/api';
import { CATEGORIES, COLORS, ROLE_LABELS } from '../utils/constants';
import { Ionicons } from '@expo/vector-icons';

export default function BulletinsScreen({ user, onLogout }) {
  const [selectedCategory, setSelectedCategory] = useState('west-wing');
  const [bulletins, setBulletins] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [readBulletins, setReadBulletins] = useState([]);
  const [allBulletins, setAllBulletins] = useState([]);
  const [bulletinSearch, setBulletinSearch] = useState('');
  const [showPostModal, setShowPostModal] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postCategory, setPostCategory] = useState(selectedCategory);
  const [postFiles, setPostFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [viewingBulletin, setViewingBulletin] = useState(null);

  useEffect(() => {
    loadBulletins();
    loadPermissions();
    loadReadStatus();
    loadAllBulletins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  const loadReadStatus = async () => {
    try {
      const axios = require('axios');
      const response = await axios.default.get(`${API_URL}/read-status/${user.id}`);
      setReadBulletins(response.data.bulletins || []);
    } catch (error) {
      console.error('Error loading read status:', error);
    }
  };

  const loadAllBulletins = async () => {
    try {
      const axios = require('axios');
      const response = await axios.default.get(`${API_URL}/bulletins/all?userId=${user.id}`);
      setAllBulletins(response.data || []);
    } catch (error) {
      console.error('Error loading all bulletins:', error);
    }
  };

  const loadBulletins = async () => {
    setLoading(true);
    try {
      const data = await getBulletinsByCategory(selectedCategory, user.id);
      const bulletinsArray = Array.isArray(data) ? data : [];

      // Fetch attachments for each bulletin
      const bulletinsWithAttachments = await Promise.all(
        bulletinsArray.map(async (bulletin) => {
          try {
            const attachments = await getBulletinAttachments(bulletin.id);
            return { ...bulletin, attachments: Array.isArray(attachments) ? attachments : [] };
          } catch (error) {
            console.error(`Error loading attachments for bulletin ${bulletin.id}:`, error);
            return { ...bulletin, attachments: [] };
          }
        })
      );

      setBulletins(bulletinsWithAttachments);
    } catch (error) {
      console.error('Error loading bulletins:', error);
      Alert.alert('Error', 'Failed to load bulletins. Please try again.');
      setBulletins([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const perms = await getBulletinPermissions(selectedCategory, user.id);
      setPermissions(perms || {});
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadBulletins();
    loadReadStatus();
    loadAllBulletins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  const handleMarkAsRead = async (bulletinId) => {
    if (readBulletins.includes(bulletinId)) return;

    try {
      await markBulletinAsRead(user.id, bulletinId);
      setReadBulletins((prev) => [...prev, bulletinId]);
      loadAllBulletins();
    } catch (error) {
      console.error('Error marking bulletin as read:', error);
    }
  };

  const handleDeleteBulletin = async (bulletinId) => {
    Alert.alert('Delete Bulletin', 'Are you sure you want to delete this bulletin?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBulletin(bulletinId, user.id);
            loadBulletins();
          } catch (error) {
            console.error('Error deleting bulletin:', error);
            Alert.alert('Error', 'Failed to delete bulletin.');
          }
        },
      },
    ]);
  };

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    setBulletinSearch('');
  };

  const handlePickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        setPostFiles((prev) => [...prev, ...result.assets]);
      }
    } catch (error) {
      console.error('Error picking files:', error);
      Alert.alert('Error', 'Failed to pick files');
    }
  };

  const handleRemoveFile = (index) => {
    setPostFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePostBulletin = async () => {
    if (!postTitle.trim() || !postBody.trim()) {
      Alert.alert('Error', 'Please fill in title and body');
      return;
    }

    setPosting(true);
    try {
      await postBulletin(user.id, postTitle, postBody, postCategory, postFiles);

      Alert.alert('Success', 'Bulletin posted successfully!');
      setShowPostModal(false);
      setPostTitle('');
      setPostBody('');
      setPostCategory(selectedCategory);
      setPostFiles([]);
      loadBulletins();
      loadAllBulletins();
    } catch (error) {
      console.error('Error posting bulletin:', error);
      Alert.alert('Error', 'Failed to post bulletin. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const filteredBulletins = bulletins.filter((b) => {
    if (!bulletinSearch) return true;
    const query = bulletinSearch.toLowerCase();
    return (
      (b.title || '').toLowerCase().includes(query) ||
      (b.body || '').toLowerCase().includes(query) ||
      (b.author_name || '').toLowerCase().includes(query)
    );
  });

  return (
    <View style={styles.container}>
      {/* User Header with Logout */}
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userRole}>
            {user.roles?.map((r) => ROLE_LABELS[r]).join(', ') || ROLE_LABELS[user.role]}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: onLogout },
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={24} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search-outline" size={18} color={COLORS.gray400} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search bulletins..."
            placeholderTextColor={COLORS.gray400}
            value={bulletinSearch}
            onChangeText={setBulletinSearch}
          />
          {bulletinSearch.length > 0 && (
            <TouchableOpacity onPress={() => setBulletinSearch('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.gray400} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Post Bulletin Button */}
      {(permissions.canPost || user.role === 'admin' || user.role === 'super_user') && (
        <View style={styles.postButtonContainer}>
          <TouchableOpacity
            style={styles.postButton}
            onPress={() => {
              setPostCategory(selectedCategory);
              setShowPostModal(true);
            }}
          >
            <Ionicons name="add-circle" size={20} color="white" />
            <Text style={styles.postButtonText}>Post Bulletin</Text>
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
          {CATEGORIES.map((category) => {
            const hasUnread = allBulletins.some((b) => b.category === category.id && !readBulletins.includes(b.id));

            return (
              <TouchableOpacity
                key={category.id}
                style={[styles.tab, selectedCategory === category.id && styles.tabActive]}
                onPress={() => handleCategoryChange(category.id)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.tabText, selectedCategory === category.id && styles.tabTextActive]}>
                    {category.label}
                  </Text>
                  {hasUnread && <View style={styles.categoryUnreadDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Bulletins List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.bulletinsList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {filteredBulletins.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color={COLORS.gray300} />
              <Text style={styles.emptyText}>{bulletinSearch ? 'No results found' : 'No bulletins'}</Text>
            </View>
          ) : (
            filteredBulletins.map((bulletin, index) => (
              <TouchableOpacity
                key={bulletin.id}
                style={[
                  styles.bulletinCard,
                  index % 2 === 1 && styles.bulletinCardAlt,
                  !readBulletins.includes(bulletin.id) && styles.bulletinCardUnread,
                ]}
                onPress={() => {
                  try {
                    handleMarkAsRead(bulletin.id);
                    setViewingBulletin(bulletin);
                  } catch (error) {
                    Alert.alert('Error', 'Failed to open bulletin: ' + error.message);
                  }
                }}
              >
                <View style={styles.bulletinHeader}>
                  <View style={styles.bulletinTitleContainer}>
                    <Text style={styles.bulletinTitle}>{bulletin.title}</Text>
                    {!readBulletins.includes(bulletin.id) && <View style={styles.unreadDot} />}
                  </View>
                  {(permissions.canDelete || bulletin.author_id === user.id) && (
                    <TouchableOpacity onPress={() => handleDeleteBulletin(bulletin.id)} style={styles.deleteButton}>
                      <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.bulletinMeta}>
                  By {bulletin.author_name} on {new Date(bulletin.created_at).toLocaleDateString()}
                </Text>

                <Text style={styles.bulletinBody} numberOfLines={5}>
                  {bulletin.body}
                </Text>

                {bulletin.attachments && bulletin.attachments.length > 0 && (
                  <View style={styles.attachmentsContainer}>
                    <View style={styles.attachmentsHeader}>
                      <Ionicons name="attach" size={16} color={COLORS.primary} />
                      <Text style={styles.attachmentsTitle}>
                        {bulletin.attachments.length} Attachment{bulletin.attachments.length > 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* Post Bulletin Modal */}
      <Modal visible={showPostModal} animationType="slide" transparent={false} onRequestClose={() => setShowPostModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Post Bulletin</Text>
            <TouchableOpacity onPress={() => setShowPostModal(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={28} color={COLORS.gray600} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Category Selector */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.categorySelector}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categorySelectorButton, postCategory === cat.id && styles.categorySelectorButtonActive]}
                    onPress={() => setPostCategory(cat.id)}
                  >
                    <Text style={[styles.categorySelectorText, postCategory === cat.id && styles.categorySelectorTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Title Input */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter bulletin title"
                placeholderTextColor={COLORS.gray400}
                value={postTitle}
                onChangeText={setPostTitle}
              />
            </View>

            {/* Body Input */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Content</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Enter bulletin content"
                placeholderTextColor={COLORS.gray400}
                value={postBody}
                onChangeText={setPostBody}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
              />
            </View>

            {/* File Attachments */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Attachments</Text>
              <TouchableOpacity style={styles.filePickerButton} onPress={handlePickFiles}>
                <Ionicons name="attach" size={20} color={COLORS.primary} />
                <Text style={styles.filePickerText}>Attach Files</Text>
              </TouchableOpacity>

              {postFiles.length > 0 && (
                <View style={styles.filesList}>
                  {postFiles.map((file, index) => (
                    <View key={index} style={styles.fileItem}>
                      <View style={styles.fileInfo}>
                        <Ionicons name="document" size={20} color={COLORS.gray600} />
                        <Text style={styles.fileName} numberOfLines={1}>
                          {file.name}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveFile(index)}>
                        <Ionicons name="close-circle" size={20} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Modal Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setShowPostModal(false)}>
              <Text style={styles.modalButtonTextCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonPost]} onPress={handlePostBulletin} disabled={posting}>
              {posting ? <ActivityIndicator color="white" /> : <Text style={styles.modalButtonTextPost}>Post</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* View Bulletin Modal */}
      <Modal visible={viewingBulletin !== null} animationType="slide" transparent={false} onRequestClose={() => setViewingBulletin(null)}>
        {viewingBulletin && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={2}>
                  {viewingBulletin.title}
                </Text>
                <Text style={styles.bulletinMetaModal}>
                  By {viewingBulletin.author_name} on {new Date(viewingBulletin.created_at).toLocaleDateString()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewingBulletin(null)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={28} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.bulletinBodyFull}>{viewingBulletin.body}</Text>

              {Array.isArray(viewingBulletin.attachments) && viewingBulletin.attachments.length > 0 && (
                <View style={styles.attachmentsSectionFull}>
                  <View style={styles.attachmentsSectionHeader}>
                    <Ionicons name="attach" size={20} color={COLORS.primary} />
                    <Text style={styles.attachmentsSectionTitle}>Attachments ({viewingBulletin.attachments.length})</Text>
                  </View>

                  {viewingBulletin.attachments.map((attachment, idx) => {
                    if (!attachment) return null;

                    const name = attachment.original_filename || attachment.filename || '';
                    if (!name) return null;

                    const isImage = attachment.mime_type?.startsWith('image/') ||
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
                    const isPDF = attachment.mime_type === 'application/pdf' ||
                        /\.pdf$/i.test(name);

                    const fileUrl =
                      API_URL && viewingBulletin?.id && attachment?.id
                        ? `${API_URL}/bulletins/${viewingBulletin.id}/attachments/${attachment.id}`
                        : null;

                    return (
                      <View key={idx} style={styles.attachmentViewContainer}>
                        <View style={styles.attachmentViewHeader}>
                          <Ionicons
                            name={isImage ? 'image' : isPDF ? 'document-text' : 'document'}
                            size={18}
                            color={COLORS.gray600}
                          />
                          <Text style={styles.attachmentViewName}>{name}</Text>
                        </View>

                        {isImage ? (
                          fileUrl ? (
                            <Image
                              source={{ uri: fileUrl }}
                              style={styles.attachmentImage}
                              resizeMode="contain"
                              onError={(e) => Alert.alert('Image Error', JSON.stringify(e.nativeEvent))}
                            />
                          ) : (
                            <Text style={{ color: COLORS.error }}>Image unavailable</Text>
                          )
                        ) : (
                          <TouchableOpacity
                            style={styles.downloadButton}
                            onPress={() => {
                              if (!fileUrl) {
                                Alert.alert('Error', 'Invalid file URL');
                                return;
                              }
                              Linking.openURL(fileUrl).catch((err) =>
                                Alert.alert('Error', 'Could not open file: ' + err.message)
                              );
                            }}
                          >
                            <Ionicons name="download-outline" size={20} color={COLORS.primary} />
                            <Text style={styles.downloadButtonText}>Download File</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: 2,
  },
  userRole: {
    fontSize: 12,
    color: COLORS.gray500,
  },
  logoutButton: {
    padding: 8,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.gray900,
    padding: 0,
  },
  postButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  postButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  postButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
  categoryUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
    marginLeft: 6,
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
  bulletinsList: {
    flex: 1,
    padding: 16,
  },
  bulletinCard: {
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
  bulletinCardAlt: {
    backgroundColor: '#eff6ff',
  },
  bulletinCardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  bulletinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bulletinTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletinTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
    marginLeft: 8,
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  bulletinMeta: {
    fontSize: 12,
    color: COLORS.gray500,
    marginBottom: 12,
  },
  bulletinBody: {
    fontSize: 14,
    color: COLORS.gray700,
    lineHeight: 20,
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
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: 8,
  },
  categorySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categorySelectorButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.gray100,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  categorySelectorButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categorySelectorText: {
    fontSize: 13,
    color: COLORS.gray700,
    fontWeight: '500',
  },
  categorySelectorTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: COLORS.gray900,
  },
  textAreaInput: {
    minHeight: 120,
  },
  filePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  filePickerText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  filesList: {
    marginTop: 12,
    gap: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    color: COLORS.gray700,
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: COLORS.gray300,
  },
  modalButtonPost: {
    backgroundColor: COLORS.primary,
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  modalButtonTextPost: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  attachmentsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  attachmentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  attachmentsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  bulletinMetaModal: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 4,
  },
  bulletinBodyFull: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.gray900,
    marginBottom: 20,
  },
  attachmentsSectionFull: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  attachmentsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  attachmentsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  attachmentViewContainer: {
    marginBottom: 20,
    backgroundColor: COLORS.gray50,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  attachmentViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  attachmentViewName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray700,
    flex: 1,
  },
  attachmentImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    backgroundColor: COLORS.gray100,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  downloadButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
});