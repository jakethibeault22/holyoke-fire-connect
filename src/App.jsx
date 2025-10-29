import { useState, useEffect, useRef } from "react";
import { Inbox, Megaphone, Send, PlusCircle, Trash2, X, LogOut, Paperclip, Download, Users, Edit, CheckCircle, XCircle, UserPlus, FileText, File } from "lucide-react";

function Card({ children, className = "", onClick }) {
  return (
    <div 
      className={`rounded-xl shadow p-2 ${className}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : {}}
    >
      {children}
    </div>
  );
}

function CardContent({ children, className = "" }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

function Button({ children, className = "", variant, ...props }) {
  let base = "px-3 py-2 rounded font-semibold transition";
  let style = "bg-red-700 text-white hover:bg-red-800";
  if (variant === "secondary") style = "bg-white text-red-800 hover:bg-gray-100";
  else if (variant === "ghost") style = "bg-transparent hover:bg-red-700/20 text-white";
  return (
    <button className={`${base} ${style} ${className}`} {...props}>
      {children}
    </button>
  );
}

const ROLE_LABELS = {
  'firefighter': 'Firefighter',
  'repair_division': 'Repair Division',
  'alarm_division': 'Alarm Division',
  'officer': 'Officer',
  'prevention': 'Prevention',
  'repair_division_supervisor': 'Repair Division Supervisor',
  'training': 'Training',
  'prevention_captain': 'Prevention Captain',
  'alarm_supervisor': 'Alarm Supervisor',
  'fire_commissioner': 'Fire Commissioner',
  'deputy': 'Deputy',
  'xo': 'XO',
  'chief': 'Chief',
  'admin': 'Admin',
  'super_user': 'Super User',
};

export default function App() {
  const [user, setUser] = useState(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  
  const [regEmail, setRegEmail] = useState("");
  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState(false);
  
  const [view, setView] = useState("bulletins");
  const [bulletins, setBulletins] = useState([]);
  const [allBulletins, setAllBulletins] = useState([]);
  const [bulletinAttachments, setBulletinAttachments] = useState({});
  const [bulletinCategory, setBulletinCategory] = useState("west-wing");
  const [selectedBulletinCategory, setSelectedBulletinCategory] = useState("west-wing");
  const [bulletinPermissions, setBulletinPermissions] = useState({});
  const [inbox, setInbox] = useState([]);
  const [messageAttachments, setMessageAttachments] = useState({});
  const [sent, setSent] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [showBulletinForm, setShowBulletinForm] = useState(false);
  
  const [bulletinTitle, setBulletinTitle] = useState("");
  const [bulletinBody, setBulletinBody] = useState("");
  const [bulletinFiles, setBulletinFiles] = useState([]);
  
  const [messageTo, setMessageTo] = useState([]);
  const [messageToRoles, setMessageToRoles] = useState([]);
  const [messageRecipientSearch, setMessageRecipientSearch] = useState("");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageFiles, setMessageFiles] = useState([]);
  const [readBulletins, setReadBulletins] = useState([]);
  const [readMessages, setReadMessages] = useState([]);
  const [expandedThreads, setExpandedThreads] = useState([]);
  const [threadMessages, setThreadMessages] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [quickReply, setQuickReply] = useState("");
  const [quickReplyFiles, setQuickReplyFiles] = useState([]);

  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRoles, setNewUserRoles] = useState(["firefighter"]);
  const [resetPasswordUserId, setResetPasswordUserId] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [approvingUser, setApprovingUser] = useState(null);
  const [assignedRole, setAssignedRole] = useState("firefighter");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    if (user) {
      fetchAllBulletins();
      fetchBulletins('west-wing');
      fetchBulletinPermissions('west-wing');
      fetchInbox();
      fetchSent();
      fetchUsers();
      fetchReadStatus();
      if (user.role === 'admin') {
        fetchPendingUsers();
      }
    }
  }, [user]);
  
  // Save user to localStorage whenever user changes
useEffect(() => {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  }
}, [user]);

// Load user and view from localStorage when app starts
useEffect(() => {
  const savedUser = localStorage.getItem('user');
  const savedView = localStorage.getItem('currentView');
  
  if (savedUser) {
    const parsedUser = JSON.parse(savedUser);
    setUser(parsedUser);
    
    // Set view after user is set
    if (savedView) {
      setView(savedView);
    }
  }
}, []); // Empty dependency array - only runs once on mount

// Save view whenever it changes (keep this one)
useEffect(() => {
  if (user && view) {
    localStorage.setItem('currentView', view);
  }
}, [view, user]);

// Load saved view when user logs in
useEffect(() => {
  if (user) {
    const savedView = localStorage.getItem('currentView');
    if (savedView) {
      setView(savedView);
    }
  }
}, [user]);

useEffect(() => {
  if (messagesEndRef.current) {
    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }
}, [threadMessages, selectedThread]);

// Auto-mark messages as read when viewing a thread
// Update this useEffect to be less aggressive
useEffect(() => {
  // Only auto-mark if we have a selected thread AND the thread messages are loaded
  if (!user || !selectedThread || !threadMessages[selectedThread] || view !== 'inbox') return;
  
  const unreadInThread = threadMessages[selectedThread].filter(
    msg => !readMessages.includes(msg.id) && msg.sender_id !== user.id
  );
  
  // Mark all unread messages in this thread as read
  unreadInThread.forEach(msg => {
    markMessageAsRead(msg.id);
  });
}, [selectedThread, threadMessages, user?.id]); // REMOVED readMessages from dependencies

  const fetchAllBulletins = async () => {
    try {
      const res = await fetch(`/api/bulletins/all?userId=${user.id}`);
      const data = await res.json();
      setAllBulletins(data);
    } catch (err) {
      console.error('Error fetching all bulletins:', err);
    }
  };
  
  
  // Add this useEffect to poll for new messages every 10 seconds
useEffect(() => {
  if (!user) return;
  
  const interval = setInterval(() => {
    fetchInbox();
  }, 10000); // Poll every 10 seconds
  
  return () => clearInterval(interval);
}, [user]);

  const fetchReadStatus = async () => {
    try {
      const res = await fetch(`/api/read-status/${user.id}`);
      const data = await res.json();
      setReadBulletins(data.bulletins || []);
      setReadMessages(data.messages || []);
    } catch (err) {
      console.error('Error fetching read status:', err);
    }
  };

 const markBulletinAsRead = async (bulletinId) => {
  
  if (readBulletins.includes(bulletinId)) {
    return;
  }
  
  try {
    const res = await fetch('/api/bulletins/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, bulletinId })
    });

    
    setReadBulletins(prev => [...prev, bulletinId]);
    fetchAllBulletins();
  } catch (err) {
    console.error('Error marking bulletin as read:', err);
  }
};

  const markMessageAsRead = async (messageId) => {
    if (readMessages.includes(messageId)) return;
    
    try {
      await fetch('/api/messages/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, messageId })
      });
      setReadMessages(prev => [...prev, messageId]);
    } catch (err) {
      console.error('Error marking message as read:', err);
    }
  };

  const handleLogin = async () => {
    setLoginError("");
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      
      if (data.success) {
        setUser(data.user);
        setLoginUsername("");
        setLoginPassword("");
      } else {
        setLoginError(data.error || "Invalid username or password");
      }
    } catch (err) {
      setLoginError("Login failed. Please try again.");
    }
  };

  const handleRegister = async () => {
    setRegError("");
    
    if (!regEmail || !regName || !regUsername || !regPassword || !regConfirmPassword) {
      setRegError("All fields are required");
      return;
    }
    
    if (regPassword !== regConfirmPassword) {
      setRegError("Passwords do not match");
      return;
    }
    
    if (regPassword.length < 6) {
      setRegError("Password must be at least 6 characters");
      return;
    }
    
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          name: regName,
          username: regUsername,
          password: regPassword
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setRegSuccess(true);
        setRegEmail("");
        setRegName("");
        setRegUsername("");
        setRegPassword("");
        setRegConfirmPassword("");
      } else {
        setRegError(data.error || "Registration failed");
      }
    } catch (err) {
      setRegError("Registration failed. Please try again.");
    }
  };

const handleLogout = () => {
  setUser(null);
  localStorage.removeItem('user');
  localStorage.removeItem('currentView');  // ADD THIS LINE
  setView("bulletins");
};

  const fetchPendingUsers = async () => {
    try {
      const res = await fetch(`/api/admin/pending-users?requestingUserId=${user.id}`);
      const data = await res.json();
      setPendingUsers(data);
    } catch (err) {
      console.error('Error fetching pending users:', err);
    }
  };

  const handleApproveUser = async () => {
    if (!approvingUser || !assignedRole) return;
    
    try {
      const res = await fetch(`/api/admin/approve-user/${approvingUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedRole: assignedRole,
          requestingUserId: user.id
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setApprovingUser(null);
        setAssignedRole("firefighter");
        fetchPendingUsers();
        fetchUsers();
        alert('User approved successfully');
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Error approving user:', err);
      alert('Failed to approve user');
    }
  };

  const handleRejectUser = async (userId) => {
    if (!confirm('Reject this user registration?')) return;
    
    try {
      const res = await fetch(`/api/admin/reject-user/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestingUserId: user.id
        })
      });
      const data = await res.json();
      
      if (data.success) {
        fetchPendingUsers();
        alert('User registration rejected');
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Error rejecting user:', err);
      alert('Failed to reject user');
    }
  };

const fetchBulletins = async (category = 'west-wing') => {
  try {
    const url = `/api/bulletins/category/${category}?userId=${user.id}`;
    console.log('Fetching URL:', url);
    
    const res = await fetch(url);
    console.log('Response status:', res.status);
    
    const data = await res.json();
    console.log('Data received:', data);
    console.log('Data length:', data.length);
    
    setBulletins(data);
    
    data.forEach(bulletin => fetchBulletinAttachments(bulletin.id));
  } catch (err) {
    console.error('Error fetching bulletins:', err);
  }
};

  const fetchBulletinPermissions = async (category) => {
    try {
      const res = await fetch(`/api/bulletins/permissions/${category}?userId=${user.id}`);
      const data = await res.json();
      setBulletinPermissions(data);
    } catch (err) {
      console.error('Error fetching permissions:', err);
    }
  };

  const fetchBulletinAttachments = async (bulletinId) => {
    try {
      const res = await fetch(`/api/bulletins/${bulletinId}/attachments`);
      const data = await res.json();
      setBulletinAttachments(prev => ({ ...prev, [bulletinId]: data }));
    } catch (err) {
      console.error('Error fetching bulletin attachments:', err);
    }
  };

const fetchInbox = async () => {
  try {
    const res = await fetch(`/api/messages/inbox/${user.id}`);
    const data = await res.json();
    setInbox(data);
    
    data.forEach(msg => fetchMessageAttachments(msg.id));
  } catch (err) {
    console.error('Error fetching inbox:', err);
  }
};

  const fetchMessageAttachments = async (messageId) => {
    try {
      const res = await fetch(`/api/messages/${messageId}/attachments`);
      const data = await res.json();
      setMessageAttachments(prev => ({ ...prev, [messageId]: data }));
    } catch (err) {
      console.error('Error fetching message attachments:', err);
    }
  };
  
const fetchThreadMessages = async (threadId, forceRefresh = false) => {
  if (threadMessages[threadId] && !forceRefresh) return;
  
  try {
    const res = await fetch(`/api/messages/thread/${threadId}?userId=${user.id}`);
    const data = await res.json();
    setThreadMessages(prev => ({ ...prev, [threadId]: data }));
    
    data.forEach(msg => fetchMessageAttachments(msg.id));
  } catch (err) {
    console.error('Error fetching thread messages:', err);
  }
};

const toggleThread = (threadId) => {
  if (expandedThreads.includes(threadId)) {
    setExpandedThreads(prev => prev.filter(id => id !== threadId));
  } else {
    setExpandedThreads(prev => [...prev, threadId]);
    fetchThreadMessages(threadId);
  }
};

  const fetchSent = async () => {
    try {
      const res = await fetch(`/api/messages/sent/${user.id}`);
      const data = await res.json();
      setSent(data);
    } catch (err) {
      console.error('Error fetching sent:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(data.filter(u => u.status === 'active'));
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };
  
const handlePostBulletin = async () => {
  if (!bulletinTitle.trim() || !bulletinBody.trim()) return;

  try {
    const formData = new FormData();
    formData.append('title', bulletinTitle);
    formData.append('body', bulletinBody);
    formData.append('category', bulletinCategory);
    formData.append('userId', user.id);
    
    bulletinFiles.forEach(file => {
      formData.append('files', file);
    });

    const res = await fetch('/api/bulletins', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    
    if (data.success) {
      setBulletinTitle("");
      setBulletinBody("");
      setBulletinFiles([]);
      setShowBulletinForm(false);
      fetchBulletins(selectedBulletinCategory);
      fetchAllBulletins();
    } else if (data.error) {
      // Removed alert, silently handle error or show inline error message
      console.error('Error posting bulletin:', data.error);
    }
  } catch (err) {
    console.error('Error posting bulletin:', err);
  }
};

  const handleDeleteBulletin = async (bulletinId) => {
    if (!confirm('Delete this bulletin?')) return;

    try {
      const res = await fetch(`/api/bulletins/${bulletinId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await res.json();
      
      if (data.success) {
        fetchBulletins(selectedBulletinCategory);
        fetchAllBulletins();
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Error deleting bulletin:', err);
    }
  };

const handleDeleteMessage = async (messageId) => {
  if (!confirm('Delete this conversation?')) return;

  try {
    const res = await fetch(`/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    const data = await res.json();
    
    if (data.success) {
      setSelectedThread(null);
      fetchInbox();
    } else {
      alert('Failed to delete conversation');
    }
  } catch (err) {
    console.error('Error deleting message:', err);
  }
};

const handleSendMessage = async () => {
  let allRecipients = [...messageTo];
  
  for (const role of messageToRoles) {
    try {
      const res = await fetch(`/api/users/by-role/${role}`);
      const roleUsers = await res.json();
      const roleUserIds = roleUsers.map(u => u.id);
      allRecipients = [...allRecipients, ...roleUserIds];
    } catch (err) {
      console.error(`Error fetching users for role ${role}:`, err);
    }
  }
  
  allRecipients = [...new Set(allRecipients)];
  
  if (allRecipients.length === 0 || !messageSubject.trim() || !messageBody.trim()) return;

  try {
    const formData = new FormData();
    formData.append('senderId', user.id);
    formData.append('to', JSON.stringify(allRecipients));
    formData.append('subject', messageSubject);
    formData.append('body', messageBody);
    
    if (replyingTo) {
      formData.append('threadId', replyingTo.thread_id || replyingTo.id);
      formData.append('parentMessageId', replyingTo.id);
    }
    
    messageFiles.forEach(file => {
      formData.append('files', file);
    });

    const res = await fetch('/api/messages', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    
    if (data.success) {
      const currentThreadId = replyingTo?.thread_id || replyingTo?.id;
      
      setMessageTo([]);
      setMessageToRoles([]);
      setMessageRecipientSearch("");
      setMessageSubject("");
      setMessageBody("");
      setMessageFiles([]);
      setReplyingTo(null);
      
      fetchInbox();
      
      if (currentThreadId) {
        setThreadMessages(prev => {
          const updated = {...prev};
          delete updated[currentThreadId];
          return updated;
        });
        fetchThreadMessages(currentThreadId);
      }
    }
  } catch (err) {
    console.error('Error sending message:', err);
  }
};

const handleQuickReply = async () => {
  if (!quickReply.trim() || !selectedThread) return;
  
  const currentThread = inbox.find(m => m.thread_id === selectedThread);
  if (!currentThread) return;
  
  try {
    const formData = new FormData();
    formData.append('senderId', user.id);
    formData.append('to', JSON.stringify([currentThread.sender_id]));
    formData.append('subject', currentThread.subject.startsWith('Re: ') ? currentThread.subject : 'Re: ' + currentThread.subject);
    formData.append('body', quickReply);
    formData.append('threadId', selectedThread);
    formData.append('parentMessageId', currentThread.id);
    
    quickReplyFiles.forEach(file => {
      formData.append('files', file);
    });

    const res = await fetch('/api/messages', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    
    if (data.success) {
      setQuickReply("");
      setQuickReplyFiles([]);
      
      // Clear cache and refetch
      setThreadMessages(prev => {
        const updated = {...prev};
        delete updated[selectedThread];
        return updated;
      });
      
      setTimeout(() => {
        fetchThreadMessages(selectedThread, true);
        fetchInbox();
      }, 200);
    }
  } catch (err) {
    console.error('Error sending reply:', err);
  }
};

const toggleRecipient = (userId) => {
  setMessageTo(prev => 
    prev.includes(userId) 
      ? prev.filter(id => id !== userId)
      : [...prev, userId]
  );
};

const toggleRole = (role) => {
  setMessageToRoles(prev =>
    prev.includes(role)
      ? prev.filter(r => r !== role)
      : [...prev, role]
  );
};

const selectAllRecipients = () => {
  const filteredUsers = users.filter(u => {
    if (!messageRecipientSearch) return true;
    const query = messageRecipientSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query) ||
      (u.roles && u.roles.some(r => ROLE_LABELS[r]?.toLowerCase().includes(query)))
    );
  });
  setMessageTo(filteredUsers.map(u => u.id));
};

const clearAllRecipients = () => {
  setMessageTo([]);
  setMessageToRoles([]);
};

const handleBulletinFileChange = (e) => {
  const files = Array.from(e.target.files);
  setBulletinFiles(prev => [...prev, ...files]);
};

const handleMessageFileChange = (e) => {
  const files = Array.from(e.target.files);
  setMessageFiles(prev => [...prev, ...files]);
};

const removeBulletinFile = (index) => {
  setBulletinFiles(prev => prev.filter((_, i) => i !== index));
};

const removeMessageFile = (index) => {
  setMessageFiles(prev => prev.filter((_, i) => i !== index));
};

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: editingUser.email,
          name: editingUser.name,
          username: editingUser.username,
          roles: editingUser.roles,
          requestingUserId: user.id
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setEditingUser(null);
        fetchUsers();
        alert('User updated successfully');
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Error updating user:', err);
      alert('Failed to update user');
    }
  };

  const toggleUserRole = (role) => {
    if (editingUser) {
      const currentRoles = editingUser.roles || [editingUser.role];
      const newRoles = currentRoles.includes(role)
        ? currentRoles.filter(r => r !== role)
        : [...currentRoles, role];
      
      if (newRoles.length === 0) {
        alert('User must have at least one role');
        return;
      }
      
      setEditingUser({...editingUser, roles: newRoles});
    }
  };

  const toggleNewUserRole = (role) => {
    const newRoles = newUserRoles.includes(role)
      ? newUserRoles.filter(r => r !== role)
      : [...newUserRoles, role];
    
    if (newRoles.length === 0) {
      alert('User must have at least one role');
      return;
    }
    
    setNewUserRoles(newRoles);
  };

const handleDeleteUser = async (userId) => {
  
  if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestingUserId: user.id })
    });
    const data = await res.json();
    
    
    if (data.success) {
      fetchUsers();
      alert('User deleted successfully');
    } else if (data.error) {
      alert(data.error);
    }
  } catch (err) {
    console.error('Error deleting user:', err);
    alert('Failed to delete user');
  }
};

  const handleResetPassword = async () => {
    if (!resetPasswordValue.trim()) {
      alert('Please enter a new password');
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${resetPasswordUserId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: resetPasswordValue,
          requestingUserId: user.id
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setResetPasswordUserId(null);
        setResetPasswordValue("");
        alert('Password reset successfully');
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Error resetting password:', err);
      alert('Failed to reset password');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const isImageFile = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext);
  };

  const isPDFFile = (filename) => {
    return filename.toLowerCase().endsWith('.pdf');
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['doc', 'docx'].includes(ext)) return <FileText className="h-5 w-5 text-blue-600" />;
    if (['xls', 'xlsx'].includes(ext)) return <FileText className="h-5 w-5 text-green-600" />;
    if (['ppt', 'pptx'].includes(ext)) return <FileText className="h-5 w-5 text-orange-600" />;
    if (['zip', 'rar', '7z'].includes(ext)) return <File className="h-5 w-5 text-yellow-600" />;
    return <File className="h-5 w-5 text-gray-600" />;
  };

  const handleCategoryChange = (category) => {
    setSelectedBulletinCategory(category);
    fetchBulletins(category);
    fetchBulletinPermissions(category);
  };

  const hasUnreadInCategory = (category) => {
    return allBulletins.some(b => 
      b.category === category && !readBulletins.includes(b.id)
    );
  };
  
if (!user) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 px-4">
      <div className="flex items-center gap-8 max-w-6xl">
        {/* Left Image */}
        <div className="hidden lg:block">
          <img 
            src="/seal.png" 
            alt="Fire Department Left" 
            className="w-96 h-auto rounded-lg"
          />
        </div>

        {/* Login Card */}
        <Card className="w-96 bg-white">
          <CardContent className="bg-white">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-red-800">Holyoke Fire Connect</h1>
              <p className="text-gray-600 mt-2">Fire Department Communications</p>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full p-3 border rounded"
              />
              <input
                type="password"
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full p-3 border rounded"
              />
              {loginError && (
                <p className="text-red-600 text-sm">{loginError}</p>
              )}
              <Button onClick={handleLogin} className="w-full bg-red-800 text-white hover:bg-red-900">
                Login
              </Button>
              <button
                onClick={() => setShowRegistration(true)}
                className="w-full text-sm text-gray-600 hover:text-gray-800 flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                New User? Register Here
              </button>
              
              <div className="mt-6 pt-4 border-t border-gray-300">
                <p className="text-xs font-semibold text-gray-700 mb-2">Test Accounts:</p>
                <div className="space-y-1 text-xs text-gray-600">
                  <p><span className="font-medium">Admin:</span> admin / admin123</p>
                  <p><span className="font-medium">Chief:</span> chief / chief123</p>
                  <p><span className="font-medium">Officer:</span> officer / officer123</p>
                  <p><span className="font-medium">Firefighter:</span> firefighter / fire123</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Image */}
        <div className="hidden lg:block">
          <img 
            src="/patch.png" 
            alt="Fire Department Right" 
            className="w-96 h-auto rounded-lg"
          />
        </div>
      </div>
	  
	  {/* Copyright footer */}
    <div className="fixed bottom-2 right-4 text-xs text-gray-400">
      © Jake Thibeault 2025
    </div>

      {/* Registration Modal */}
      {showRegistration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-white">
            <CardContent className="bg-white">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-red-800">User Registration</h1>
                  <p className="text-gray-600 text-sm">Holyoke Fire Connect</p>
                </div>
                <button onClick={() => {
                  setShowRegistration(false);
                  setRegSuccess(false);
                  setRegError("");
                }}>
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              {regSuccess ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded p-4 text-center">
                    <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
                    <p className="text-green-800 font-semibold">Registration Submitted!</p>
                    <p className="text-sm text-gray-600 mt-2">
                      Your account is pending admin approval. You'll be able to log in once an administrator approves your registration.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setShowRegistration(false);
                      setRegSuccess(false);
                    }}
                    className="w-full bg-red-800 text-white hover:bg-red-900"
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    type="email"
                    placeholder="Email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full p-3 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full p-3 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Username"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full p-3 border rounded"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full p-3 border rounded"
                  />
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleRegister()}
                    className="w-full p-3 border rounded"
                  />
                  {regError && (
                    <p className="text-red-600 text-sm">{regError}</p>
                  )}
                  <Button
                    onClick={handleRegister}
                    className="w-full bg-red-800 text-white hover:bg-red-900"
                  >
                    Register
                  </Button>
                  <button
                    onClick={() => {
                      setShowRegistration(false);
                      setRegError("");
                    }}
                    className="w-full text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

  // MAIN APP - This should be the final return of the component
  const canPostBulletins = bulletinPermissions.canPost;
  const canDeleteBulletins = bulletinPermissions.canDelete;

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-red-800 text-white min-h-screen p-6 flex flex-col">
        <div className="mb-12">
          <h1 className="text-xl font-bold">Holyoke Fire Connect</h1>
        </div>
        
        <nav className="flex-1 flex flex-col justify-start space-y-1">
          <button
  onClick={() => setView("bulletins")}
  className={`w-full flex items-center gap-3 px-2 py-3 transition relative text-left ${
    view === "bulletins" ? "text-white" : "text-gray-300 hover:text-white"
  }`}
>
  <Megaphone className="h-5 w-5" />
  <span className="text-base">Bulletins</span>
  {allBulletins.filter(b => !readBulletins.includes(b.id)).length > 0 && (
    <span className="ml-auto bg-yellow-400 text-red-800 text-xs rounded-full px-2 py-0.5">
      {allBulletins.filter(b => !readBulletins.includes(b.id)).length}
    </span>
  )}
</button>
          
          <button
  onClick={() => setView("inbox")}
  className={`w-full flex items-center gap-3 px-2 py-3 transition relative text-left ${
    view === "inbox" ? "text-white" : "text-gray-300 hover:text-white"
  }`}
>
  <Inbox className="h-5 w-5" />
  <span className="text-base">Inbox</span>
  {inbox.filter(msg => !readMessages.includes(msg.id) && msg.sender_id !== user.id).length > 0 && (
    <span className="ml-auto bg-yellow-400 text-red-800 text-xs rounded-full px-2 py-0.5">
      {inbox.filter(msg => !readMessages.includes(msg.id) && msg.sender_id !== user.id).length}
    </span>
  )}
</button>
          

<button
  onClick={() => setView("compose")}
  className={`w-full flex items-center gap-3 px-2 py-3 rounded transition text-left ${
    view === "compose" ? "text-white bg-red-700" : "text-gray-300 hover:text-white hover:bg-red-700"
  }`}
>
  <PlusCircle className="h-5 w-5" />
  <span className="text-lg">New Message</span>
</button>

{user.role === 'admin' && (
  <div className="mt-4">
    <button
      onClick={() => setView("users")}
      className={`w-full text-white rounded px-3 py-3 flex items-center gap-3 hover:bg-red-700 transition relative ${
        view === "users" ? "bg-red-700" : ""
      }`}
    >
      <Users className="h-5 w-5" />
      <span className="text-base font-medium">Admin Panel</span>
      {pendingUsers.length > 0 && (
        <span className="ml-auto bg-red-600 text-white text-xs rounded-full px-2 py-0.5">
          {pendingUsers.length}
        </span>
      )}
    </button>
  </div>
)}
</nav>
        
        <div className="mt-auto pt-6 border-t border-red-700">
  <div className="mb-4">
    <p className="text-xs text-red-200">
      {user.roles && user.roles.length > 0 
        ? user.roles.map(r => ROLE_LABELS[r]).join(', ')
        : ROLE_LABELS[user.role] || user.role}
    </p>
    <p className="text-sm font-medium text-white">{user.name}</p>
  </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-2 py-2 text-red-100 hover:text-white transition text-left"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-lg">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-auto">
        {view === "bulletins" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleCategoryChange('west-wing')}
                  className={`px-4 py-2 rounded ${
                    selectedBulletinCategory === 'west-wing'
                      ? 'bg-red-700 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  Chiefs
                  {hasUnreadInCategory('west-wing') && (
                    <span className="ml-2 inline-block h-2 w-2 bg-yellow-400 rounded-full"></span>
                  )}
                </button>
                <button
                  onClick={() => handleCategoryChange('training')}
                  className={`px-4 py-2 rounded ${
                    selectedBulletinCategory === 'training'
                      ? 'bg-red-700 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  Training
                  {hasUnreadInCategory('training') && (
                    <span className="ml-2 inline-block h-2 w-2 bg-yellow-400 rounded-full"></span>
                  )}
                </button>
				<button
                  onClick={() => handleCategoryChange('fire-prevention')}
                  className={`px-4 py-2 rounded ${
                    selectedBulletinCategory === 'fire-prevention'
                      ? 'bg-red-700 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  Fire Prevention
                  {hasUnreadInCategory('fire-prevention') && (
                    <span className="ml-2 inline-block h-2 w-2 bg-yellow-400 rounded-full"></span>
                  )}
                </button>
                <button
                  onClick={() => handleCategoryChange('repair-division')}
                  className={`px-4 py-2 rounded ${
                    selectedBulletinCategory === 'repair-division'
                      ? 'bg-red-700 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  Repair Division
                  {hasUnreadInCategory('repair-division') && (
                    <span className="ml-2 inline-block h-2 w-2 bg-yellow-400 rounded-full"></span>
                  )}
                </button>
                <button
                  onClick={() => handleCategoryChange('alarm-division')}
                  className={`px-4 py-2 rounded ${
                    selectedBulletinCategory === 'alarm-division'
                      ? 'bg-red-700 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  Alarm Division
                  {hasUnreadInCategory('alarm-division') && (
                    <span className="ml-2 inline-block h-2 w-2 bg-yellow-400 rounded-full"></span>
                  )}
                </button>
				<button
                  onClick={() => handleCategoryChange('commissioners')}
                  className={`px-4 py-2 rounded ${
                    selectedBulletinCategory === 'commissioners'
                      ? 'bg-red-700 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  Commissioners
                  {hasUnreadInCategory('commissioners') && (
                    <span className="ml-2 inline-block h-2 w-2 bg-yellow-400 rounded-full"></span>
                  )}
                </button>
              </div>

              {(bulletinPermissions.canPost || user.role === 'admin') && (
                <Button onClick={() => {
  setBulletinCategory(selectedBulletinCategory);
  setShowBulletinForm(true);
}}>
  <PlusCircle className="h-4 w-4 mr-2" />
  Post Bulletin
</Button>
              )}
            </div>

            {showBulletinForm && (
              <Card>
                <CardContent>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">New Bulletin</h3>
                    <button onClick={() => setShowBulletinForm(false)}>
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <select
  value={bulletinCategory}
  onChange={(e) => setBulletinCategory(e.target.value)}
  className="w-full p-2 border rounded"
>
  <option value="west-wing">Chiefs</option>
  <option value="training">Training</option>
  <option value="fire_prevention">Fire Prevention</option>
  <option value="repair_division">Repair Division</option>
  <option value="alarm-division">Alarm Division</option>
  <option value="commissioners">Commissioners</option>
</select>
                    <input
                      type="text"
                      placeholder="Title"
                      value={bulletinTitle}
                      onChange={(e) => setBulletinTitle(e.target.value)}
                      className="w-full p-2 border rounded"
                    />
                    <textarea
                      placeholder="Content"
                      value={bulletinBody}
                      onChange={(e) => setBulletinBody(e.target.value)}
                      rows={6}
                      className="w-full p-2 border rounded"
                    />
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Paperclip className="h-4 w-4" />
                        <span>Attach Files</span>
                        <input
                          type="file"
                          multiple
                          onChange={handleBulletinFileChange}
                          className="hidden"
                        />
                      </label>
                      {bulletinFiles.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {bulletinFiles.map((file, i) => (
                            <div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                              <span className="text-sm">{file.name}</span>
                              <button onClick={() => removeBulletinFile(i)}>
                                <X className="h-4 w-4 text-red-600" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button onClick={handlePostBulletin} className="w-full">
                      Post
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {bulletins.length === 0 ? (
                <Card>
                  <CardContent>
                    <p className="text-gray-500 text-center">No bulletins</p>
                  </CardContent>
                </Card>
              ) : (
                bulletins.map((b, index) => (
  <Card 
    key={b.id} 
    className={`cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50'} ${!readBulletins.includes(b.id) ? 'border-l-4 border-l-yellow-400' : ''}`}
    onClick={() => markBulletinAsRead(b.id)}
  >
    <CardContent>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-lg font-semibold">{b.title}</h3>
          <p className="text-sm text-gray-600">
            By {b.author_name} on {new Date(b.created_at).toLocaleDateString()}
          </p>
        </div>
        {(bulletinPermissions.canDelete || user.role === 'admin' || b.author_id === user.id) && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteBulletin(b.id);
            }}
          >
            <Trash2 className="h-5 w-5 text-red-600" />
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap">{b.body}</p>
      {bulletinAttachments[b.id]?.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-sm font-semibold mb-2">Attachments:</p>
          <div className="space-y-3">
            {bulletinAttachments[b.id].map(att => (
              <div key={att.id}>
                {isImageFile(att.filename) ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {getFileIcon(att.filename)}
                      <span className="text-sm font-medium">{att.filename}</span>
                      
                      <a  href={`/api/bulletins/${b.id}/attachments/${att.id}`}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto"
                      >
                        <Download className="h-6 w-6 text-blue-600 hover:text-blue-800" />
                      </a>
                    </div>
                    <img
                      src={`/api/bulletins/${b.id}/attachments/${att.id}`}
                      alt={att.filename}
                      className="max-w-full h-auto rounded border"
                      style={{ maxHeight: '400px' }}
                    />
                  </div>
                ) : isPDFFile(att.filename) ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {getFileIcon(att.filename)}
                      <span className="text-sm font-medium">{att.filename}</span>
                      
                     <a   href={`/api/bulletins/${b.id}/attachments/${att.id}`}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto"
                      >
                        <Download className="h-6 w-6 text-blue-600 hover:text-blue-800" />
                      </a>
                    </div>
                    <iframe
                      src={`/api/bulletins/${b.id}/attachments/${att.id}`}
                      className="w-full border rounded"
                      style={{ height: '500px' }}
                      title={att.filename}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {getFileIcon(att.filename)}
                    
                     <a href={`/api/bulletins/${b.id}/attachments/${att.id}`}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {att.filename}
                    </a>
                    <Download className="h-6 w-6" />
                  </div>
                )}
              </div>
          ))}
        </div>
      </div>
    )}
  </CardContent>
</Card>
))
              )}
            </div>
          </div>
        )}

        {view === "inbox" && (
          <div className="flex h-[calc(100vh-8rem)] gap-4">
    <div className="w-1/3 bg-white rounded-lg shadow overflow-hidden flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold">Messages</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {inbox.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No messages</div>
        ) : (
          inbox.map(msg => {
            const isActive = selectedThread === msg.thread_id;
            const unread = !readMessages.includes(msg.id);
            
            return (
              <div
                key={msg.id}
                onClick={() => {
                  setSelectedThread(msg.thread_id);
                  fetchThreadMessages(msg.thread_id);
                  if (unread) markMessageAsRead(msg.id);
                }}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  isActive ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                } ${unread ? 'bg-blue-50' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-sm">{msg.subject}</h3>
                  {msg.message_count > 1 && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      {msg.message_count}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{msg.sender_name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(msg.created_at).toLocaleDateString()}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>

    <div className="flex-1 bg-white rounded-lg shadow flex flex-col">
      {selectedThread ? (
        <>
          <div className="p-4 border-b flex justify-between items-center">
  <div>
    <h3 className="font-semibold">
      {threadMessages[selectedThread]?.[0]?.subject || 'Conversation'}
    </h3>
    <p className="text-sm text-gray-500">
      {threadMessages[selectedThread]?.length || 0} messages
    </p>
    <p className="text-xs text-gray-400 mt-1">
      Participants: {[...new Set(threadMessages[selectedThread]?.map(m => m.sender_name))].join(', ')}
    </p>
  </div>
  <button
    onClick={() => {
      const threadToDelete = inbox.find(m => m.thread_id === selectedThread);
      if (threadToDelete) handleDeleteMessage(threadToDelete.id);
    }}
    className="text-red-600 hover:text-red-800"
  >
    <Trash2 className="h-5 w-5" />
  </button>
</div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {threadMessages[selectedThread]?.map((msg) => {
              const isFromMe = msg.sender_id === user.id;
              
              return (
                <div
                  key={msg.id}
                  className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      isFromMe
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">
                        {isFromMe ? 'You' : msg.sender_name}
                      </span>
                      <span className={`text-xs ${isFromMe ? 'text-blue-100' : 'text-gray-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-base">{msg.body}</p>
                    
                    {messageAttachments[msg.id]?.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {messageAttachments[msg.id].map(att => (
                          <div key={att.id} className="text-xs">
                            
                            <a  href={`/api/messages/${msg.id}/attachments/${att.id}`}
                              download
                              className={`flex items-center gap-1 ${
                                isFromMe ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:underline'
                              }`}
                            >
                              <Download className="h-3 w-3" />
                              {att.filename}
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
			<div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t bg-white">
            <div className="space-y-2">
              <textarea
                value={quickReply}
                onChange={(e) => setQuickReply(e.target.value)}
                placeholder="Type your message..."
                rows={3}
                className="w-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleQuickReply();
                  }
                }}
              />
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                  <Paperclip className="h-4 w-4" />
                  <span>Attach</span>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setQuickReplyFiles(Array.from(e.target.files))}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={handleQuickReply}
                  disabled={!quickReply.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Send
                </button>
              </div>
              {quickReplyFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {quickReplyFiles.map((file, i) => (
                    <div key={i} className="bg-gray-100 px-2 py-1 rounded text-xs flex items-center gap-1">
                      {file.name}
                      <button onClick={() => setQuickReplyFiles(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Inbox className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>Select a conversation to start messaging</p>
          </div>
        </div>
      )}
    </div>
  </div>
)}

        {view === "compose" && (
  <div className="flex h-[calc(100vh-8rem)] gap-4">
    {/* Left sidebar - Recipient selection */}
    <div className="w-1/3 bg-white rounded-lg shadow overflow-hidden flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold mb-4">New Message</h2>
        
        {/* Role selection */}
        <div className="mb-4">
  <p className="text-sm font-medium mb-2">Send to Roles:</p>
  <div className="flex flex-wrap gap-2">
    {Object.entries(ROLE_LABELS)
      .sort((a, b) => a[1].localeCompare(b[1]))  // Add this line to sort by label
      .map(([role, label]) => (
        <button
          key={role}
          onClick={() => toggleRole(role)}
          className={`px-3 py-1 rounded text-sm ${
            messageToRoles.includes(role)
              ? 'bg-red-700 text-white'
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          {label}
        </button>
      ))}
  </div>
</div>

        {/* Individual user search */}
        <div>
          <p className="text-sm font-medium mb-2">Or select individuals:</p>
          <input
            type="text"
            placeholder="Search users..."
            value={messageRecipientSearch}
            onChange={(e) => setMessageRecipientSearch(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          
          {/* Show users only when searching */}
          {messageRecipientSearch && (
            <div className="border rounded max-h-60 overflow-y-auto">
              {users
                .filter(u => {
                  const query = messageRecipientSearch.toLowerCase();
                  return (
                    u.name.toLowerCase().includes(query) ||
                    u.username.toLowerCase().includes(query) ||
                    (u.roles && u.roles.some(r => ROLE_LABELS[r]?.toLowerCase().includes(query)))
                  );
                })
                .map(u => (
                  <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={messageTo.includes(u.id)}
                      onChange={() => toggleRecipient(u.id)}
                    />
                    <span className="text-sm">
                      {u.name} ({u.username})
                      {u.roles && u.roles.length > 0 && (
                        <span className="text-gray-500 text-xs ml-1">
                          - {u.roles.map(r => ROLE_LABELS[r]).join(', ')}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
            </div>
          )}
        </div>

        {/* Selected count */}
 {/* Selected recipients display */}
<div className="mt-3 p-3 bg-gray-50 rounded border">
  <p className="text-sm font-semibold mb-2">Selected Recipients:</p>
  
  {messageToRoles.length > 0 && (
    <div className="mb-2">
      <p className="text-xs font-medium text-gray-600 mb-1">Roles:</p>
      <div className="flex flex-wrap gap-1">
        {messageToRoles.map(role => (
          <span key={role} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded flex items-center gap-1">
            {ROLE_LABELS[role]}
            <button 
              onClick={() => toggleRole(role)}
              className="hover:bg-red-200 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )}
  
  {messageTo.length > 0 && (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">Individuals ({messageTo.length}):</p>
      <div className="flex flex-wrap gap-1">
        {messageTo.map(userId => {
          const user = users.find(u => u.id === userId);
          return user ? (
            <span key={userId} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1">
              {user.name}
              <button 
                onClick={() => toggleRecipient(userId)}
                className="hover:bg-blue-200 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null;
        })}
      </div>
    </div>
  )}
  
  {messageTo.length === 0 && messageToRoles.length === 0 && (
    <p className="text-sm text-gray-500 italic">No recipients selected</p>
  )}
</div>
      </div>
    </div>

    {/* Right side - Message composition */}
    <div className="flex-1 bg-white rounded-lg shadow flex flex-col">
      <div className="p-4 border-b">
        <input
          type="text"
          placeholder="Subject"
          value={messageSubject}
          onChange={(e) => setMessageSubject(e.target.value)}
          className="w-full p-3 border rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 p-4 bg-gray-50">
        <textarea
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          placeholder="Type your message..."
          className="w-full h-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="p-4 border-t bg-white">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 hover:text-gray-800">
              <Paperclip className="h-4 w-4" />
              <span>Attach Files</span>
              <input
                type="file"
                multiple
                onChange={handleMessageFileChange}
                className="hidden"
              />
            </label>
            <button
              onClick={handleSendMessage}
              disabled={!messageSubject.trim() || !messageBody.trim() || (messageTo.length === 0 && messageToRoles.length === 0)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send Message
            </button>
          </div>
          {messageFiles.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {messageFiles.map((file, i) => (
                <div key={i} className="bg-gray-100 px-2 py-1 rounded text-xs flex items-center gap-1">
                  {file.name}
                  <button onClick={() => removeMessageFile(i)}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)}

        {view === "sent" && (
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">Sent Messages</h2>
            {sent.length === 0 ? (
              <Card>
                <CardContent>
                  <p className="text-gray-500 text-center">No sent messages</p>
                </CardContent>
              </Card>
            ) : (
              sent.map(msg => (
                <Card key={msg.id}>
                  <CardContent>
                    <h3 className="text-lg font-semibold">{msg.subject}</h3>
                    <p className="text-sm text-gray-600 mb-2">
                      Sent on {new Date(msg.created_at).toLocaleDateString()}
                    </p>
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {view === "users" && user.role === 'admin' && (
  <div className="flex h-[calc(100vh-8rem)] gap-4">
    {/* Left sidebar - User search and pending approvals */}
<div className="w-1/3 bg-white rounded-lg shadow overflow-hidden flex flex-col">
  <div className="p-4 border-b">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold">User Management</h2>
      <button
        onClick={() => setShowCreateUserForm(true)}
        className="bg-red-700 text-white px-4 py-2 rounded font-semibold transition flex items-center gap-2 hover:bg-red-800"
      >
        <PlusCircle className="h-4 w-4" />
        New User
      </button>
    </div>
    
    {/* Pending Approvals Section */}
    {pendingUsers.length > 0 && (
      <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
        <div className="flex items-center gap-2 mb-2">
          <UserPlus className="h-4 w-4 text-yellow-600" />
          <p className="text-sm font-semibold text-yellow-800">
            Pending Approvals ({pendingUsers.length})
          </p>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {pendingUsers.map(u => (
            <div key={u.id} className="bg-white p-2 rounded border border-yellow-300">
              <p className="font-medium text-sm">{u.name}</p>
              <p className="text-xs text-gray-600">{u.username}</p>
              <div className="flex gap-1 mt-2">
                <button
                  onClick={() => setApprovingUser(u)}
                  className="flex-1 bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 flex items-center justify-center gap-1"
                >
                  <CheckCircle className="h-3 w-3" />
                  Approve
                </button>
                <button
                  onClick={() => handleRejectUser(u.id)}
                  className="flex-1 bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 flex items-center justify-center gap-1"
                >
                  <XCircle className="h-3 w-3" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* User Search */}
    <div>
      <p className="text-sm font-medium mb-2">Filter Users:</p>
      <input
        type="text"
        placeholder="Type to filter users..."
        value={userSearchQuery}
        onChange={(e) => setUserSearchQuery(e.target.value)}
        className="w-full p-2 border rounded"
      />
    </div>
  </div>

  {/* User List - Always show all users, filter when typing */}
  <div className="flex-1 overflow-y-auto">
    <div className="p-2">
      {users
        .filter(u => {
          if (!userSearchQuery) return true; // Show all if no search
          const query = userSearchQuery.toLowerCase();
          return (
            u.name.toLowerCase().includes(query) ||
            u.username.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query)
          );
        })
        .map(u => (
          <div
            key={u.id}
            onClick={() => setEditingUser({...u, roles: u.roles || [u.role]})}
            className="p-3 border-b hover:bg-gray-50 cursor-pointer"
          >
            <p className="font-medium text-sm">{u.name}</p>
            <p className="text-xs text-gray-600">{u.username}</p>
            <p className="text-xs text-gray-500 mt-1">
              {u.roles && u.roles.length > 0 
                ? u.roles.map(r => ROLE_LABELS[r]).join(', ')
                : ROLE_LABELS[u.role] || u.role}
            </p>
          </div>
        ))}
    </div>
  </div>
</div>

    {/* Right side - User details/edit */}
<div className="flex-1 bg-white rounded-lg shadow flex flex-col">
  {editingUser ? (
    <>
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold">Edit User</h3>
          <button onClick={() => setEditingUser(null)}>
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={editingUser.email}
              onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Full Name</label>
            <input
              type="text"
              value={editingUser.name}
              onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              value={editingUser.username}
              onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Role</label>
            <div className="space-y-2">
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <label key={role} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                  <input
                    type="radio"
                    name="editUserRole"
                    checked={(editingUser.roles?.[0] || editingUser.role) === role}
                    onChange={() => setEditingUser({...editingUser, role: role, roles: [role]})}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

          <div className="p-4 border-t bg-gray-50">
            <div className="flex gap-2">
              <Button 
                onClick={async () => {
                  if (!editingUser) return;

                  try {
                    const res = await fetch(`/api/admin/users/${editingUser.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        email: editingUser.email,
                        name: editingUser.name,
                        username: editingUser.username,
                        roles: editingUser.roles,
                        requestingUserId: user.id
                      })
                    });
                    const data = await res.json();
                    
                    if (data.success) {
                      setEditingUser(null);
                      fetchUsers();
                      alert('User updated successfully');
                    } else if (data.error) {
                      alert(data.error);
                    }
                  } catch (err) {
                    console.error('Error updating user:', err);
                    alert('Failed to update user');
                  }
                }}
                className="flex-1"
              >
                Save Changes
              </Button>
              <button
                onClick={() => {
                  const userId = editingUser.id;
                  setResetPasswordUserId(userId);
                }}
                className="flex-1 px-3 py-2 rounded bg-yellow-600 text-white hover:bg-yellow-700 font-semibold transition"
              >
                Reset Password
              </button>
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to delete ${editingUser.name}? This action cannot be undone.`)) {
                    const userId = editingUser.id;
                    setEditingUser(null);
                    handleDeleteUser(userId);
                  }
                }}
                className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 flex items-center justify-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>Search and select a user to edit</p>
          </div>
        </div>
      )}
    </div>

    {/* Modals */}
    {approvingUser && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <Card className="w-full max-w-md bg-white">
      <CardContent className="bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Approve User</h3>
              <button onClick={() => setApprovingUser(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4">
              Approve <strong>{approvingUser.name}</strong> and assign a role:
            </p>
            <select
              value={assignedRole}
              onChange={(e) => setAssignedRole(e.target.value)}
              className="w-full p-2 border rounded mb-4"
            >
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <option key={role} value={role}>{label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button onClick={handleApproveUser} className="flex-1">
                Approve
              </Button>
              <Button variant="secondary" onClick={() => setApprovingUser(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )}

    {showCreateUserForm && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <Card className="w-full max-w-md bg-white">
      <CardContent className="bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Create New User</h3>
          <button onClick={() => setShowCreateUserForm(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Full Name"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Username"
            value={newUserUsername}
            onChange={(e) => setNewUserUsername(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <input
            type="password"
            placeholder="Password"
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <div>
            <p className="text-sm font-medium mb-2">Role:</p>
            <div className="space-y-2">
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <label key={role} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                  <input
                    type="radio"
                    name="newUserRole"
                    checked={newUserRoles[0] === role}
                    onChange={() => setNewUserRoles([role])}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <Button 
            onClick={async () => {
              if (!newUserEmail.trim() || !newUserName.trim() || !newUserUsername.trim() || !newUserPassword.trim()) {
                alert('Please fill in all fields');
                return;
              }

              try {
                const res = await fetch('/api/admin/users', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: newUserEmail,
                    name: newUserName,
                    username: newUserUsername,
                    password: newUserPassword,
                    roles: newUserRoles,
                    requestingUserId: user.id
                  })
                });
                const data = await res.json();
                
                if (data.success) {
                  setNewUserEmail("");
                  setNewUserName("");
                  setNewUserUsername("");
                  setNewUserPassword("");
                  setNewUserRoles(["firefighter"]);
                  setShowCreateUserForm(false);
                  fetchUsers();
                  alert('User created successfully');
                } else if (data.error) {
                  alert(data.error);
                }
              } catch (err) {
                console.error('Error creating user:', err);
                alert('Failed to create user');
              }
            }}
            className="w-full"
          >
            Create User
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
)}

    {resetPasswordUserId && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <Card className="w-full max-w-md bg-white">
      <CardContent className="bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Reset Password</h3>
              <button onClick={() => {
                setResetPasswordUserId(null);
                setResetPasswordValue("");
              }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="New Password"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                className="w-full p-2 border rounded"
              />
              <div className="flex gap-2">
                <Button onClick={handleResetPassword} className="flex-1">
                  Reset Password
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    setResetPasswordUserId(null);
                    setResetPasswordValue("");
                  }} 
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )}
  </div>
)}
      </div>
      
      {/* Copyright footer */}
      <div className="fixed bottom-2 right-4 text-xs text-gray-400">
        © Jake Thibeault 2025
      </div>
    </div>
  );
}