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
} from 'react-native';
import { getBulletinsByCategory, markBulletinAsRead, deleteBulletin, getBulletinPermissions } from '../services/api';
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

  useEffect(() => {
    loadBulletins();
    loadPermissions();
    loadReadStatus();
    loadAllBulletins();
  }, [selectedCategory]);

  const loadReadStatus = async () => {
    try {
      const axios = require('axios');
      const { API_URL } = require('../services/api');
      const response = await axios.default.get(`${API_URL}/read-status/${user.id}`);
      setReadBulletins(response.data.bulletins || []);
    } catch (error) {
      console.error('Error loading read status:', error);
    }
  };

  const loadAllBulletins = async () => {
    try {
      const axios = require('axios');
      const { API_URL } = require('../services/api');
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
      setBulletins(Array.isArray(data) ? data : []);
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
      setPermissions(perms);
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadBulletins();
    loadReadStatus();
    loadAllBulletins();
  }, [selectedCategory]);

  const handleMarkAsRead = async (bulletinId) => {
    if (readBulletins.includes(bulletinId)) return;
    
    try {
      await markBulletinAsRead(user.id, bulletinId);
      setReadBulletins(prev => [...prev, bulletinId]);
      // Refresh all bulletins to update indicators
      loadAllBulletins();
    } catch (error) {
      console.error('Error marking bulletin as read:', error);
    }
  };

  const handleDeleteBulletin = async (bulletinId) => {
    Alert.alert(
      'Delete Bulletin',
      'Are you sure you want to delete this bulletin?',
      [
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
      ]
    );
  };

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
  };

  return (
    <View style={styles.container}>
      {/* User Header with Logout */}
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userRole}>
            {user.roles?.map(r => ROLE_LABELS[r]).join(', ') || ROLE_LABELS[user.role]}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            Alert.alert(
              'Logout',
              'Are you sure you want to logout?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Logout',
                  style: 'destructive',
                  onPress: onLogout,
                },
              ]
            );
          }}
        >
          <Ionicons name="log-out-outline" size={24} color={COLORS.error} />
        </TouchableOpacity>
      </View>
      
      {/* Category Tabs */}
      <View style={styles.categoryTabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryTabs}
          contentContainerStyle={styles.categoryTabsContent}
        >
        {CATEGORIES.map(category => {
          const hasUnread = allBulletins.some(
            b => b.category === category.id && !readBulletins.includes(b.id)
          );
          
          return (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.tab,
                selectedCategory === category.id && styles.tabActive,
              ]}
              onPress={() => handleCategoryChange(category.id)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={[
                    styles.tabText,
                    selectedCategory === category.id && styles.tabTextActive,
                  ]}
                >
                  {category.label}
                </Text>
                {hasUnread && (
                  <View style={styles.categoryUnreadDot} />
                )}
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
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {bulletins.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color={COLORS.gray300} />
              <Text style={styles.emptyText}>No bulletins</Text>
            </View>
          ) : (
            bulletins.map((bulletin, index) => (
              <TouchableOpacity
                key={bulletin.id}
                style={[
                  styles.bulletinCard,
                  index % 2 === 1 && styles.bulletinCardAlt,
                  !readBulletins.includes(bulletin.id) && styles.bulletinCardUnread,
                ]}
                onPress={() => handleMarkAsRead(bulletin.id)}
                activeOpacity={0.7}
              >
                <View style={styles.bulletinHeader}>
                  <View style={styles.bulletinTitleContainer}>
                    <Text style={styles.bulletinTitle}>{bulletin.title}</Text>
                    {!readBulletins.includes(bulletin.id) && (
                      <View style={styles.unreadDot} />
                    )}
                  </View>
                  {(permissions.canDelete || bulletin.author_id === user.id) && (
                    <TouchableOpacity
                      onPress={() => handleDeleteBulletin(bulletin.id)}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.bulletinMeta}>
                  By {bulletin.author_name} on{' '}
                  {new Date(bulletin.created_at).toLocaleDateString()}
                </Text>
                <Text style={styles.bulletinBody} numberOfLines={5}>
                  {bulletin.body}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
  tabsContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  categoryUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
    marginLeft: 6,
  },
  tabsContent: {
    paddingHorizontal: 8,
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
  categoryUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
    marginLeft: 6,
  },
});