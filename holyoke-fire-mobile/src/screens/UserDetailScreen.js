import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { resetPassword, updateUser } from '../services/api';
import { COLORS, ROLE_LABELS } from '../utils/constants';
import { Ionicons } from '@expo/vector-icons';

export default function UserDetailScreen({ route, navigation }) {
  const { user: selectedUser, currentUser } = route.params;
  const [editRoles, setEditRoles] = useState(selectedUser.roles || [selectedUser.role]);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveRole = async () => {
    setSaving(true);
    try {
      const result = await updateUser(
        selectedUser.id,
        selectedUser.email,
        selectedUser.name,
        selectedUser.username,
        editRoles,
        currentUser.id
      );

      if (result.success) {
        Alert.alert('Success', 'User role updated successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        Alert.alert('Error', result.error || 'Failed to update user');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      Alert.alert('Error', 'Failed to update user. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      const result = await resetPassword(selectedUser.id, newPassword, currentUser.id);

      if (result.success) {
        Alert.alert('Success', 'Password reset successfully', [
          {
            text: 'OK',
            onPress: () => {
              setShowPasswordReset(false);
              setNewPassword('');
              setConfirmPassword('');
            },
          },
        ]);
      } else {
        Alert.alert('Error', result.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      Alert.alert('Error', 'Failed to reset password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (showPasswordReset) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerCard}>
            <Ionicons name="key" size={48} color={COLORS.warning} />
            <Text style={styles.headerTitle}>Reset Password</Text>
            <Text style={styles.headerSubtitle}>{selectedUser.name}</Text>
            <Text style={styles.headerMeta}>@{selectedUser.username}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>New Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={!saving}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={!saving}
            />
          </View>

          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color={COLORS.error} />
              <Text style={styles.errorText}>Passwords do not match</Text>
            </View>
          )}

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => {
                setShowPasswordReset(false);
                setNewPassword('');
                setConfirmPassword('');
              }}
              disabled={saving}
            >
              <Text style={styles.buttonTextSecondary}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonPrimary,
                (!newPassword || !confirmPassword || newPassword !== confirmPassword || saving) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleResetPassword}
              disabled={!newPassword || !confirmPassword || newPassword !== confirmPassword || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.buttonText}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* User Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {selectedUser.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={20} color={COLORS.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{selectedUser.name}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Ionicons name="at-outline" size={20} color={COLORS.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Username</Text>
              <Text style={styles.infoValue}>{selectedUser.username}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={20} color={COLORS.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{selectedUser.email}</Text>
            </View>
          </View>
        </View>

        {/* Current Role Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Role</Text>
          <View style={styles.currentRoleCard}>
            <Ionicons name="shield-checkmark" size={24} color={COLORS.primary} />
            <Text style={styles.currentRoleText}>
              {selectedUser.roles?.map(r => ROLE_LABELS[r]).join(', ') || ROLE_LABELS[selectedUser.role]}
            </Text>
          </View>
        </View>

        {/* Change Role Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Role</Text>
          <View style={styles.roleGrid}>
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <TouchableOpacity
                key={role}
                style={[
                  styles.roleCard,
                  editRoles[0] === role && styles.roleCardSelected,
                ]}
                onPress={() => setEditRoles([role])}
              >
                <Text
                  style={[
                    styles.roleCardText,
                    editRoles[0] === role && styles.roleCardTextSelected,
                  ]}
                >
                  {label}
                </Text>
                {editRoles[0] === role && (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => setShowPasswordReset(true)}
          >
            <Ionicons name="key-outline" size={22} color={COLORS.warning} />
            <Text style={styles.resetButtonText}>Reset Password</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.warning} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSaveRole}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="save-outline" size={22} color="white" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Add extra padding at bottom for safe scrolling */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray900,
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
    marginTop: 8,
  },
  headerMeta: {
    fontSize: 14,
    color: COLORS.gray600,
    marginTop: 4,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '600',
    color: 'white',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.gray500,
    marginBottom: 4,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    color: COLORS.gray900,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.gray200,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: 12,
  },
  currentRoleCard: {
    backgroundColor: COLORS.primary + '15',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currentRoleText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    flex: 1,
  },
  roleGrid: {
    gap: 8,
  },
  roleCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gray200,
  },
  roleCardSelected: {
    backgroundColor: COLORS.primary + '15',
    borderColor: COLORS.primary,
  },
  roleCardText: {
    fontSize: 15,
    color: COLORS.gray700,
    fontWeight: '500',
  },
  roleCardTextSelected: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: COLORS.warning + '15',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: COLORS.warning,
    marginBottom: 12,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.warning,
    flex: 1,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.error + '15',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '500',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: COLORS.primary,
  },
  buttonSecondary: {
    backgroundColor: COLORS.gray200,
  },
  buttonDisabled: {
    backgroundColor: COLORS.gray300,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: COLORS.gray700,
    fontSize: 16,
    fontWeight: '600',
  },
});