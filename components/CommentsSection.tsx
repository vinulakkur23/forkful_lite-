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
// Import theme
import { colors, typography, spacing, shadows } from '../themes';

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
    backgroundColor: colors.white,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentCount: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptySubtext: {
    ...typography.bodyMedium,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  commentsList: {
    maxHeight: 300,
    paddingHorizontal: spacing.md,
  },
  commentItem: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: spacing.sm,
  },
  avatarPlaceholder: {
    backgroundColor: colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  userName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: spacing.xs,
  },
  timestamp: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  commentText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  deleteButton: {
    marginTop: spacing.xs,
  },
  deleteButtonText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.lightGray,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    maxHeight: 100,
    ...typography.bodyMedium,
  },
  postButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.warmTaupe,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postButtonDisabled: {
    backgroundColor: colors.mediumGray,
  },
  signInPrompt: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
  },
  signInText: {
    ...typography.bodyMedium,
    color: colors.textTertiary,
  },
  arrowText: {
    fontSize: 18,
    color: colors.white,
    fontWeight: 'bold',
  },
});

export default CommentsSection;