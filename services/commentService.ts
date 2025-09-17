import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import inAppNotificationService from './inAppNotificationService';

export interface Comment {
  id: string;
  mealId: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: any; // Firestore timestamp
}

/**
 * Add a comment to a meal
 */
export const addComment = async (
  mealId: string,
  text: string
): Promise<{ success: boolean; message: string; comment?: Comment }> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      return { success: false, message: 'Must be signed in to comment' };
    }

    if (!text.trim()) {
      return { success: false, message: 'Comment cannot be empty' };
    }

    // Get user data from Firestore for better profile info
    const userDoc = await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .get();
    
    const userData = userDoc.data();
    const displayName = userData?.displayName || currentUser.displayName || 'Anonymous';
    const photoURL = userData?.photoURL || currentUser.photoURL || '';

    const commentData = {
      mealId,
      userId: currentUser.uid,
      userName: displayName,
      userPhoto: photoURL,
      text: text.trim(),
      createdAt: firestore.FieldValue.serverTimestamp(),
    };

    // Add comment to the meal's comments subcollection
    const commentRef = await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .collection('comments')
      .add(commentData);

    // Also update the comment count on the meal document
    await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .update({
        commentCount: firestore.FieldValue.increment(1),
        lastCommentAt: firestore.FieldValue.serverTimestamp(),
      });

    // Get meal document to create notification for meal owner
    const mealDoc = await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .get();
    
    const mealData = mealDoc.data();
    if (mealData && mealData.userId !== currentUser.uid) {
      // Create notification for meal owner
      await inAppNotificationService.createNotification(
        mealData.userId,
        'comment',
        {
          fromUser: {
            id: currentUser.uid,
            name: displayName,
            photo: photoURL,
          },
          mealId,
          mealName: mealData.mealName || mealData.restaurantName || 'meal',
          commentId: commentRef.id,
          commentText: text.trim(),
        }
      );
    }

    return {
      success: true,
      message: 'Comment added',
      comment: {
        id: commentRef.id,
        ...commentData,
        createdAt: new Date(),
      } as Comment,
    };
  } catch (error) {
    console.error('Error adding comment:', error);
    return { success: false, message: 'Failed to add comment' };
  }
};

/**
 * Delete a comment (only by the comment author)
 */
export const deleteComment = async (
  mealId: string,
  commentId: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      return { success: false, message: 'Not authenticated' };
    }

    // Get the comment to verify ownership
    const commentDoc = await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .collection('comments')
      .doc(commentId)
      .get();

    if (!commentDoc.exists) {
      return { success: false, message: 'Comment not found' };
    }

    const commentData = commentDoc.data();
    if (commentData?.userId !== currentUser.uid) {
      return { success: false, message: 'Can only delete your own comments' };
    }

    // Delete the comment
    await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .collection('comments')
      .doc(commentId)
      .delete();

    // Update the comment count
    await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .update({
        commentCount: firestore.FieldValue.increment(-1),
      });

    return { success: true, message: 'Comment deleted' };
  } catch (error) {
    console.error('Error deleting comment:', error);
    return { success: false, message: 'Failed to delete comment' };
  }
};

/**
 * Get comments for a meal
 */
export const getComments = async (
  mealId: string,
  limit: number = 50
): Promise<Comment[]> => {
  try {
    const commentsSnapshot = await firestore()
      .collection('mealEntries')
      .doc(mealId)
      .collection('comments')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return commentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Comment[];
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
};

/**
 * Subscribe to real-time comment updates
 */
export const subscribeToComments = (
  mealId: string,
  onUpdate: (comments: Comment[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const unsubscribe = firestore()
    .collection('mealEntries')
    .doc(mealId)
    .collection('comments')
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      snapshot => {
        const comments = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Comment[];
        onUpdate(comments);
      },
      error => {
        console.error('Error listening to comments:', error);
        if (onError) onError(error);
      }
    );

  return unsubscribe;
};