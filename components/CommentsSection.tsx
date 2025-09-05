import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import auth from '@react-native-firebase/auth';
import {
  addComment,
  deleteComment,
  subscribeToComments,
  Comment,
} from '../services/commentService';

interface CommentsSectionProps {
  mealId: string;
  onUserPress?: (userId: string, userName: string, userPhoto: string) => void;
  scrollViewRef?: React.RefObject<ScrollView>;
}

const CommentsSection: React.FC<CommentsSectionProps> = ({
  mealId,
  onUserPress,
  scrollViewRef,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [currentUser, setCurrentUser] = useState(auth().currentUser);

  useEffect(() => {
    // Subscribe to comments
    const unsubscribe = subscribeToComments(
      mealId,
      (updatedComments) => {
        setComments(updatedComments);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading comments:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [mealId]);

  const handleAddComment = async () => {
    if (!currentUser) {
      Alert.alert('Sign In Required', 'You must be signed in to comment');
      return;
    }

    if (!newComment.trim()) {
      return;
    }

    setPosting(true);
    const result = await addComment(mealId, newComment);
    
    if (result.success) {
      setNewComment('');
    } else {
      Alert.alert('Error', result.message);
    }
    
    setPosting(false);
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteComment(mealId, commentId);
            if (!result.success) {
              Alert.alert('Error', result.message);
            }
          },
        },
      ]
    );
  };

  const formatTimeAgo = (timestamp: any): string => {
    if (!timestamp) return 'just now';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  const renderComment = ({ item }: { item: Comment }) => {
    const isOwnComment = currentUser?.uid === item.userId;
    
    return (
      <View style={styles.commentItem}>
        <TouchableOpacity
          onPress={() => onUserPress?.(item.userId, item.userName, item.userPhoto)}
        >
          {item.userPhoto ? (
            <Image source={{ uri: item.userPhoto }} style={styles.userAvatar} />
          ) : (
            <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
              <Icon name="person" size={20} color="#999" />
            </View>
          )}
        </TouchableOpacity>
        
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <TouchableOpacity
              onPress={() => onUserPress?.(item.userId, item.userName, item.userPhoto)}
            >
              <Text style={styles.userName}>{item.userName}</Text>
            </TouchableOpacity>
            <Text style={styles.timestamp}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
          
          <Text style={styles.commentText}>{item.text}</Text>
          
          {isOwnComment && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteComment(item.id)}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#1a2b49" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Comments</Text>
        {comments.length > 0 && (
          <Text style={styles.commentCount}>({comments.length})</Text>
        )}
      </View>

      {comments.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No comments yet</Text>
          <Text style={styles.emptySubtext}>Be the first to comment!</Text>
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderComment}
          style={styles.commentsList}
          scrollEnabled={false}
        />
      )}

      {currentUser ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            value={newComment}
            onChangeText={setNewComment}
            multiline
            maxLength={500}
            editable={!posting}
            onFocus={() => {
              // Auto-scroll to show the input when focused
              if (scrollViewRef?.current) {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 300);
              }
            }}
          />
          <TouchableOpacity
            style={[
              styles.postButton,
              (!newComment.trim() || posting) && styles.postButtonDisabled,
            ]}
            onPress={handleAddComment}
            disabled={!newComment.trim() || posting}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.arrowText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.signInPrompt}>
          <Text style={styles.signInText}>Sign in to comment</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a2b49',
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  commentCount: {
    fontSize: 16,
    color: '#666',
    marginLeft: 8,
    fontFamily: 'Inter-Regular',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    fontFamily: 'Inter-Regular',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
  commentsList: {
    maxHeight: 300,
    paddingHorizontal: 16,
  },
  commentItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a2b49',
    marginRight: 8,
    fontFamily: 'NunitoSans-VariableFont_YTLC,opsz,wdth,wght',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'Inter-Regular',
  },
  commentText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontFamily: 'Inter-Regular',
  },
  deleteButton: {
    marginTop: 4,
  },
  deleteButtonText: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'Inter-Regular',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  postButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a2b49',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postButtonDisabled: {
    backgroundColor: '#ccc',
  },
  signInPrompt: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  signInText: {
    fontSize: 14,
    color: '#999',
    fontFamily: 'Inter-Regular',
  },
  arrowText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default CommentsSection;