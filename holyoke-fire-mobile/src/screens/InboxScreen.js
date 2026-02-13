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
import {
  getInbox,
  getThreadMessages,
  sendMessage,
  markMessageAsRead,
  deleteMessage,
} from '../services/api';
import { COLORS } from '../utils/constants';
import { Ionicons } from '@expo/vector-icons';

export default function InboxScreen({ user, onRefresh }) {
  const [inbox, setInbox] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [quickReply, setQuickReply] = useState('');
  const [sending, setSending] = useState(false);
  const [readMessages, setReadMessages] = useState([]);

  useEffect(() => {
    loadInbox();
  }, []);

  useEffect(() => {
    if (selectedThread) {
      loadThreadMessages(selectedThread);
    }
  }, [selectedThread]);

  const loadInbox = async () => {
    setLoading(true);
    try {
      const data = await getInbox(user.id);
      setInbox(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading inbox:', error);
      Alert.alert('Error', 'Failed to load messages. Please try again.');
      setInbox([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadThreadMessages = async (threadId) => {
    try {
      const data = await getThreadMessages(threadId, user.id);
      setThreadMessages(Array.isArray(data) ? data : []);
      
      // Mark unread messages as read
      const unreadInThread = data.filter(
        msg => !readMessages.includes(msg.id) && msg.sender_id !== user.id
      );
      
      for (const msg of unreadInThread) {
        await handleMarkAsRead(msg.id);
      }
    } catch (error) {
      console.error('Error loading thread:', error);
      setThreadMessages([]);
    }
  };

  const handleMarkAsRead = async (messageId) => {
    if (readMessages.includes(messageId)) return;
    
    try {
      await markMessageAsRead(user.id, messageId);
      setReadMessages(prev => [...prev, messageId]);
      if (onRefresh) onRefresh(); // Update badge count
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const onRefreshInbox = useCallback(() => {
    setRefreshing(true);
    loadInbox();
    if (onRefresh) onRefresh();
  }, []);

  const handleSendReply = async () => {
    if (!quickReply.trim() || !selectedThread) return;

    const currentThread = inbox.find(m => m.thread_id === selectedThread);
    if (!currentThread) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('senderId', user.id);
      formData.append('to', JSON.stringify([currentThread.sender_id]));
      formData.append(
        'subject',
        currentThread.subject.startsWith('Re: ')
          ? currentThread.subject
          : 'Re: ' + currentThread.subject
      );
      formData.append('body', quickReply);
      formData.append('threadId', selectedThread);
      formData.append('parentMessageId', currentThread.id);

      await sendMessage(formData);
      
      setQuickReply('');
      await loadThreadMessages(selectedThread);
      await loadInbox();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error sending reply:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteThread = async () => {
    const threadToDelete = inbox.find(m => m.thread_id === selectedThread);
    if (!threadToDelete) return;

    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMessage(threadToDelete.id, user.id);
              setSelectedThread(null);
              loadInbox();
              if (onRefresh) onRefresh();
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert('Error', 'Failed to delete conversation.');
            }
          },
        },
      ]
    );
  };

  if (!selectedThread) {
    // Conversation List View
    return (
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.conversationList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefreshInbox}
                tintColor={COLORS.primary}
              />
            }
          >
            {inbox.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="mail-outline" size={64} color={COLORS.gray300} />
                <Text style={styles.emptyText}>No messages yet</Text>
              </View>
            ) : (
              inbox.map(msg => {
                const unread = !readMessages.includes(msg.id) && msg.sender_id !== user.id;
                
                return (
                  <TouchableOpacity
                    key={msg.id}
                    style={[
                      styles.conversationCard,
                      unread && styles.conversationCardUnread,
                    ]}
                    onPress={() => setSelectedThread(msg.thread_id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.conversationHeader}>
                      <View style={styles.conversationTitleContainer}>
                        <Text
                          style={[
                            styles.conversationSubject,
                            unread && styles.conversationSubjectUnread,
                          ]}
                          numberOfLines={1}
                        >
                          {msg.subject}
                        </Text>
                        {/* Removed message count badge - only showing unread dot */}
                      </View>
                      {unread && <View style={styles.unreadDot} />}
                    </View>
                    <Text
                      style={[
                        styles.conversationSender,
                        unread && styles.conversationSenderUnread,
                      ]}
                    >
                      {msg.sender_id === user.id
                        ? msg.participant_names || 'Other participants'
                        : msg.sender_name}
                    </Text>
                    <Text style={styles.conversationDate}>
                      {new Date(msg.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  // Thread Messages View
  const currentThread = inbox.find(m => m.thread_id === selectedThread);
  
  return (
    <View style={styles.container}>
      {/* Thread Header */}
      <View style={styles.threadHeader}>
        <TouchableOpacity
          onPress={() => setSelectedThread(null)}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <View style={styles.threadHeaderText}>
          <Text style={styles.threadSubject} numberOfLines={1}>
            {currentThread?.subject || 'Conversation'}
          </Text>
          <Text style={styles.threadMeta}>
            {threadMessages.length} messages
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleDeleteThread}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={24} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView style={styles.messagesContainer}>
        {threadMessages.map(msg => {
          const isFromMe = msg.sender_id === user.id;
          
          return (
            <View
              key={msg.id}
              style={[
                styles.messageBubbleContainer,
                isFromMe ? styles.messageBubbleContainerRight : styles.messageBubbleContainerLeft,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  isFromMe ? styles.messageBubbleMe : styles.messageBubbleOther,
                ]}
              >
                <View style={styles.messageHeader}>
                  <Text
                    style={[
                      styles.messageSender,
                      isFromMe && styles.messageSenderMe,
                    ]}
                  >
                    {isFromMe ? 'You' : msg.sender_name}
                  </Text>
                  <Text
                    style={[
                      styles.messageTime,
                      isFromMe && styles.messageTimeMe,
                    ]}
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.messageBody,
                    isFromMe && styles.messageBodyMe,
                  ]}
                >
                  {msg.body}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Reply Input */}
      <View style={styles.replyContainer}>
        <TextInput
          style={styles.replyInput}
          placeholder="Type your reply..."
          value={quickReply}
          onChangeText={setQuickReply}
          multiline
          editable={!sending}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!quickReply.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSendReply}
          disabled={!quickReply.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="send" size={20} color="white" />
          )}
        </TouchableOpacity>
      </View>
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
  conversationList: {
    flex: 1,
    padding: 16,
  },
  conversationCard: {
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
  conversationCardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  conversationTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationSubject: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.gray700,
    flex: 1,
  },
  conversationSubjectUnread: {
    fontWeight: '700',
    color: COLORS.gray900,
  },
  messageCountBadge: {
    backgroundColor: COLORS.info,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  messageCountText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
    marginLeft: 8,
  },
  conversationSender: {
    fontSize: 14,
    color: COLORS.gray600,
    marginBottom: 4,
  },
  conversationSenderUnread: {
    fontWeight: '600',
    color: COLORS.gray700,
  },
  conversationDate: {
    fontSize: 12,
    color: COLORS.gray400,
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
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  backButton: {
    marginRight: 12,
  },
  threadHeaderText: {
    flex: 1,
  },
  threadSubject: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  threadMeta: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  deleteButton: {
    marginLeft: 12,
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  messageBubbleContainer: {
    marginBottom: 16,
  },
  messageBubbleContainerLeft: {
    alignItems: 'flex-start',
  },
  messageBubbleContainerRight: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
  },
  messageBubbleMe: {
    backgroundColor: COLORS.primary,
  },
  messageBubbleOther: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  messageSender: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  messageSenderMe: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  messageTime: {
    fontSize: 10,
    color: COLORS.gray400,
    marginLeft: 8,
  },
  messageTimeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  messageBody: {
    fontSize: 14,
    color: COLORS.gray700,
    lineHeight: 20,
  },
  messageBodyMe: {
    color: 'white',
  },
  replyContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  replyInput: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray300,
  },
});