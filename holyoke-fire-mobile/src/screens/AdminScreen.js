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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getUsers,
  getPendingUsers,
  approveUser,
  rejectUser,
  getPasswordResetRequests,
  approvePasswordReset,
  rejectPasswordReset,
} from '../services/api';
import { COLORS, ROLE_LABELS } from '../utils/constants';
import { Ionicons } from '@expo/vector-icons';

export default function AdminScreen({ user, navigation, onLogout, onRefresh }) {
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [passwordResetRequests, setPasswordResetRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [approvingUser, setApprovingUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('firefighter');
  const [resettingPassword, setResettingPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadUsers(), loadPendingUsers(), loadPasswordResetRequests()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      const activeUsers = Array.isArray(data)
        ? data.filter(u => u.status === 'active')
        : [];
      setUsers(activeUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users. Please try again.');
      setUsers([]);
    }
  };

  const loadPendingUsers = async () => {
    try {
      const data = await getPendingUsers(user.id);
      setPendingUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading pending users:', error);
      setPendingUsers([]);
    }
  };

  const loadPasswordResetRequests = async () => {
    try {
      const data = await getPasswordResetRequests(user.id);
      setPasswordResetRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading password reset requests:', error);
      setPasswordResetRequests([]);
    }
  };

  const onRefreshData = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const handleApprove = async () => {
    if (!approvingUser) return;

    try {
      const result = await approveUser(approvingUser.id, selectedRole, user.id);

      if (result.success) {
        Alert.alert('Success', 'User approved successfully');
        setApprovingUser(null);
        setSelectedRole('firefighter');
        loadData();
        if (onRefresh) onRefresh();
      } else {
        Alert.alert('Error', result.error || 'Failed to approve user');
      }
    } catch (error) {
      console.error('Error approving user:', error);
      Alert.alert('Error', 'Failed to approve user. Please try again.');
    }
  };

  const handleReject = async (userId) => {
    Alert.alert(
      'Reject User',
      'Are you sure you want to reject this user registration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await rejectUser(userId, user.id);
              if (result.success) {
                Alert.alert('Success', 'User registration rejected');
                loadData();
                if (onRefresh) onRefresh();
              } else {
                Alert.alert('Error', result.error || 'Failed to reject user');
              }
            } catch (error) {
              console.error('Error rejecting user:', error);
              Alert.alert('Error', 'Failed to reject user. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleApprovePasswordReset = async () => {
    if (!resettingPassword || !newPassword) {
      Alert.alert('Error', 'Please enter a new password');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    try {
      const result = await approvePasswordReset(resettingPassword.id, newPassword, user.id);

      if (result.success) {
        Alert.alert('Success', 'Password reset approved. User will be prompted to change their password on next login.');
        setResettingPassword(null);
        setNewPassword('');
        loadData();
        if (onRefresh) onRefresh();
      } else {
        Alert.alert('Error', result.error || 'Failed to approve password reset');
      }
    } catch (error) {
      console.error('Error approving password reset:', error);
      Alert.alert('Error', 'Failed to approve password reset. Please try again.');
    }
  };

  const handleRejectPasswordReset = async (requestId) => {
    Alert.alert(
      'Reject Password Reset',
      'Are you sure you want to reject this password reset request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await rejectPasswordReset(requestId, user.id);
              if (result.success) {
                Alert.alert('Success', 'Password reset request rejected');
                loadData();
                if (onRefresh) onRefresh();
              } else {
                Alert.alert('Error', result.error || 'Failed to reject request');
              }
            } catch (error) {
              console.error('Error rejecting password reset:', error);
              Alert.alert('Error', 'Failed to reject request. Please try again.');
            }
          },
        },
      ]
    );
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query)
    );
  });

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefreshData}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Password Reset Requests */}
        {passwordResetRequests.length > 0 && (
          <View style={styles.pendingSection}>
            <View style={styles.pendingHeader}>
              <Ionicons name="key" size={24} color={COLORS.warning} />
              <Text style={styles.pendingTitle}>
                Password Reset Requests ({passwordResetRequests.length})
              </Text>
            </View>
            <Text style={styles.pendingSubtitle}>
              Review and approve password reset requests
            </Text>

            <View style={styles.pendingList}>
              {passwordResetRequests.map(request => (
                <View key={request.id} style={styles.pendingCard}>
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingName}>{request.name}</Text>
                    <Text style={styles.pendingUsername}>@{request.username}</Text>
                    <Text style={styles.pendingEmail}>{request.email}</Text>
                    <Text style={styles.pendingDate}>
                      Requested {new Date(request.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      style={styles.approveButton}
                      onPress={() => setResettingPassword(request)}
                    >
                      <Ionicons name="key" size={20} color="white" />
                      <Text style={styles.approveButtonText}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => handleRejectPasswordReset(request.id)}
                    >
                      <Ionicons name="close-circle" size={20} color="white" />
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Pending Approvals */}
        {pendingUsers.length > 0 && (
          <View style={styles.pendingSection}>
            <View style={styles.pendingHeader}>
              <Ionicons name="person-add" size={24} color={COLORS.warning} />
              <Text style={styles.pendingTitle}>
                Pending Approvals ({pendingUsers.length})
              </Text>
            </View>
            <Text style={styles.pendingSubtitle}>
              Review and approve new user registrations
            </Text>

            <View style={styles.pendingList}>
              {pendingUsers.map(u => (
                <View key={u.id} style={styles.pendingCard}>
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingName}>{u.name}</Text>
                    <Text style={styles.pendingUsername}>@{u.username}</Text>
                    <Text style={styles.pendingEmail}>{u.email}</Text>
                  </View>
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      style={styles.approveButton}
                      onPress={() => setApprovingUser(u)}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="white" />
                      <Text style={styles.approveButtonText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => handleReject(u.id)}
                    >
                      <Ionicons name="close-circle" size={20} color="white" />
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Users Section */}
        <View style={styles.usersSection}>
          <View style={styles.usersSectionHeader}>
            <View style={styles.usersHeaderLeft}>
              <Ionicons name="people" size={24} color={COLORS.primary} />
              <Text style={styles.usersTitle}>Users</Text>
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
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {/* User List */}
          <View style={styles.userList}>
            {filteredUsers.length === 0 ? (
              <Text style={styles.emptyText}>No users found</Text>
            ) : (
              filteredUsers.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.userCard}
                  onPress={() => navigation.navigate('UserDetail', { user: u, currentUser: user })}
                  activeOpacity={0.7}
                >
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {u.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{u.name}</Text>
                    <Text style={styles.userUsername}>@{u.username}</Text>
                    <Text style={styles.userEmail}>{u.email}</Text>
                  </View>
                  <View style={styles.userRole}>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>
                        {u.roles?.map(r => ROLE_LABELS[r]).join(', ') || ROLE_LABELS[u.role]}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Approve Modal */}
      {approvingUser && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Approve User</Text>
              <TouchableOpacity onPress={() => setApprovingUser(null)}>
                <Ionicons name="close" size={28} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Approve <Text style={styles.modalUserName}>{approvingUser.name}</Text> and assign a role:
            </Text>

            <View style={styles.roleList}>
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleOption,
                    selectedRole === role && styles.roleOptionSelected,
                  ]}
                  onPress={() => setSelectedRole(role)}
                >
                  <Text
                    style={[
                      styles.roleOptionText,
                      selectedRole === role && styles.roleOptionTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                  {selectedRole === role && (
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={() => setApprovingUser(null)}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={handleApprove}
              >
                <Text style={styles.modalButtonPrimaryText}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Password Reset Modal */}
      {resettingPassword && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={() => {
                setResettingPassword(null);
                setNewPassword('');
              }}>
                <Ionicons name="close" size={28} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Set new password for <Text style={styles.modalUserName}>{resettingPassword.name}</Text>:
            </Text>

            <View style={styles.passwordInputContainer}>
              <Text style={styles.inputLabel}>New Password</Text>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter new password (min 6 characters)"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
              />
              {newPassword && newPassword.length < 6 && (
                <Text style={styles.passwordHint}>Password must be at least 6 characters</Text>
              )}
            </View>

            <Text style={styles.passwordNote}>
              Note: User will be required to change this password on their next login.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={() => {
                  setResettingPassword(null);
                  setNewPassword('');
                }}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButtonPrimary,
                  (!newPassword || newPassword.length < 6) && styles.modalButtonDisabled
                ]}
                onPress={handleApprovePasswordReset}
                disabled={!newPassword || newPassword.length < 6}
              >
                <Text style={styles.modalButtonPrimaryText}>Reset Password</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  pendingSection: {
    backgroundColor: '#fef3c7',
    padding: 16,
    marginBottom: 2,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pendingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  pendingSubtitle: {
    fontSize: 14,
    color: COLORS.gray700,
    marginBottom: 16,
  },
  pendingList: {
    gap: 12,
  },
  pendingCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  pendingInfo: {
    marginBottom: 12,
  },
  pendingName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: 4,
  },
  pendingUsername: {
    fontSize: 14,
    color: COLORS.gray600,
    marginBottom: 2,
  },
  pendingEmail: {
    fontSize: 12,
    color: COLORS.gray500,
  },
  pendingDate: {
    fontSize: 11,
    color: COLORS.gray400,
    marginTop: 4,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  approveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  rejectButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  usersSection: {
    backgroundColor: 'white',
    padding: 16,
  },
  usersSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  usersHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usersTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.error + '15',
    borderRadius: 8,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.error,
  },
  searchInput: {
    backgroundColor: COLORS.gray100,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  userList: {
    gap: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: 'white',
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
  userUsername: {
    fontSize: 13,
    color: COLORS.gray600,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 11,
    color: COLORS.gray500,
  },
  userRole: {
    alignItems: 'flex-end',
    gap: 4,
  },
  roleBadge: {
    backgroundColor: COLORS.primary + '20',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.gray400,
    fontSize: 14,
    paddingVertical: 32,
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
    padding: 16,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.gray700,
    marginBottom: 16,
  },
  modalUserName: {
    fontWeight: '600',
    color: COLORS.gray900,
  },
  roleList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  roleOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: COLORS.gray50,
  },
  roleOptionSelected: {
    backgroundColor: COLORS.primary + '20',
  },
  roleOptionText: {
    fontSize: 14,
    color: COLORS.gray700,
    fontWeight: '500',
  },
  roleOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonSecondary: {
    flex: 1,
    backgroundColor: COLORS.gray200,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  modalButtonPrimary: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  modalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  modalButtonDisabled: {
    backgroundColor: COLORS.gray300,
  },
  passwordInputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: 8,
  },
  passwordInput: {
    backgroundColor: COLORS.gray100,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  passwordHint: {
    fontSize: 12,
    color: COLORS.warning,
    marginTop: 4,
  },
  passwordNote: {
    fontSize: 12,
    color: COLORS.gray600,
    fontStyle: 'italic',
    marginBottom: 16,
    textAlign: 'center',
  },
});