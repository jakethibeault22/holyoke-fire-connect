import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { getUsers, sendMessage } from '../services/api';
import { COLORS, ROLE_LABELS } from '../utils/constants';
import { Ionicons } from '@expo/vector-icons';

export default function ComposeScreen({ user, navigation }) {
  const [users, setUsers] = useState([]);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      const activeUsers = Array.isArray(data) 
        ? data.filter(u => u.status === 'active' && u.id !== user.id)
        : [];
      setUsers(activeUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users. Please try again.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleRecipient = (userId) => {
    setSelectedRecipients(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAll = () => {
    const filteredUserIds = filteredUsers.map(u => u.id);
    setSelectedRecipients(filteredUserIds);
  };

  const clearAll = () => {
    setSelectedRecipients([]);
  };

  const handleSend = async () => {
    if (selectedRecipients.length === 0) {
      Alert.alert('Error', 'Please select at least one recipient');
      return;
    }
    if (!subject.trim()) {
      Alert.alert('Error', 'Please enter a subject');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('senderId', user.id);
      formData.append('to', JSON.stringify(selectedRecipients));
      formData.append('subject', subject);
      formData.append('body', body);

      const result = await sendMessage(formData);
      
      if (result.success) {
        Alert.alert('Success', 'Message sent successfully!', [
          {
            text: 'OK',
            onPress: () => {
              setSelectedRecipients([]);
              setSubject('');
              setBody('');
              setSearchQuery('');
              // Navigate to Inbox
              navigation.navigate('Inbox');
            },
          },
        ]);
      } else {
        Alert.alert('Error', 'Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query) ||
      (u.roles && u.roles.some(r => ROLE_LABELS[r]?.toLowerCase().includes(query)))
    );
  });

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Recipients Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recipients</Text>
            <View style={styles.sectionActions}>
              <TouchableOpacity onPress={selectAll} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearAll} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search */}
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {/* Selected Recipients */}
          {selectedRecipients.length > 0 && (
            <View style={styles.selectedContainer}>
              <Text style={styles.selectedLabel}>
                Selected ({selectedRecipients.length})
              </Text>
              <View style={styles.selectedChips}>
                {selectedRecipients.map(userId => {
                  const selectedUser = users.find(u => u.id === userId);
                  return selectedUser ? (
                    <View key={userId} style={styles.chip}>
                      <Text style={styles.chipText}>{selectedUser.name}</Text>
                      <TouchableOpacity onPress={() => toggleRecipient(userId)}>
                        <Ionicons name="close-circle" size={18} color={COLORS.gray500} />
                      </TouchableOpacity>
                    </View>
                  ) : null;
                })}
              </View>
            </View>
          )}

          {/* User List - Only show when searching */}
          {searchQuery.trim() !== '' && (
            loading ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
            ) : (
              <View style={styles.userList}>
                {filteredUsers.length === 0 ? (
                  <Text style={styles.emptyText}>No users found</Text>
                ) : (
                  filteredUsers.map(u => (
                    <TouchableOpacity
                      key={u.id}
                      style={[
                        styles.userItem,
                        selectedRecipients.includes(u.id) && styles.userItemSelected,
                      ]}
                      onPress={() => toggleRecipient(u.id)}
                    >
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{u.name}</Text>
                        <Text style={styles.userMeta}>
                          {u.username} • {u.roles?.map(r => ROLE_LABELS[r]).join(', ') || ROLE_LABELS[u.role]}
                        </Text>
                      </View>
                      {selectedRecipients.includes(u.id) && (
                        <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )
          )}
        </View>

        {/* Subject */}
        <View style={styles.section}>
          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter subject..."
            value={subject}
            onChangeText={setSubject}
            editable={!sending}
          />
        </View>

        {/* Message Body */}
        <View style={styles.section}>
          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Type your message..."
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            editable={!sending}
          />
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="send" size={20} color="white" />
              <Text style={styles.sendButtonText}>Send Message</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.gray100,
    borderRadius: 6,
  },
  actionButtonText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: COLORS.gray100,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  selectedContainer: {
    marginBottom: 12,
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: 8,
  },
  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  chipText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  userList: {
    maxHeight: 300,
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: COLORS.gray50,
  },
  userItemSelected: {
    backgroundColor: COLORS.primary + '20',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: 2,
  },
  userMeta: {
    fontSize: 12,
    color: COLORS.gray500,
  },
  loader: {
    marginVertical: 32,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.gray400,
    fontSize: 14,
    paddingVertical: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.gray100,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 120,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    margin: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray300,
  },
  sendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});