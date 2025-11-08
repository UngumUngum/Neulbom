import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import supabase from '../lib/supabase';
import useAuth from '../hooks/useAuth';

export default function ActivityDetailScreen({ navigation, route }) {
  const { user } = useAuth();
  const initialActivity = route?.params?.activity ?? null;
  const onDeleted = route?.params?.onDeleted;
  const onUpdated = route?.params?.onUpdated;
  const [activity, setActivity] = useState(initialActivity);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [editingCommentProcessing, setEditingCommentProcessing] = useState(false);

  useEffect(() => {
    setActivity(route?.params?.activity ?? null);
  }, [route?.params?.activity]);

  const canManage =
    !!user?.id &&
    !!activity?.caregiver_id &&
    user.id === activity.caregiver_id;

  const refreshActivity = useCallback(async () => {
    if (!activity?.id) {
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notes')
        .select(
          'id, created_at, details, meal, ai_note, tags, photos, ward_id, caregiver_id',
        )
        .eq('id', activity.id)
        .single();

      if (error) {
        throw error;
      }

      setActivity(data ?? null);
      if (typeof onUpdated === 'function') {
        await onUpdated();
      }
    } catch (error) {
      console.error(error);
      Alert.alert('불러오기 오류', error?.message ?? '활동일지를 새로고침하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activity?.id, onUpdated]);

  const performDelete = useCallback(async () => {
    if (!activity?.id) return;

    try {
      setLoading(true);

      const { error: commentDeleteError } = await supabase
        .from('comments')
        .delete()
        .eq('note_id', activity.id);
      if (commentDeleteError) {
        throw commentDeleteError;
      }

      const { error: noteDeleteError } = await supabase
        .from('notes')
        .delete()
        .eq('id', activity.id);
      if (noteDeleteError) {
        throw noteDeleteError;
      }

      if (typeof onDeleted === 'function') {
        await onDeleted();
      }
      navigation.goBack();
      Alert.alert('삭제 완료', '활동일지가 삭제되었습니다.');
    } catch (error) {
      console.error(error);
      Alert.alert('삭제 실패', error?.message ?? '활동일지를 삭제하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activity?.id, navigation, onDeleted]);

  const fetchComments = useCallback(async () => {
    if (!activity?.id) {
      setComments([]);
      return;
    }

    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, text, created_at, user_id, user:users!comments_user_id_fkey(id, name, role)',
        )
        .eq('note_id', activity.id)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      setComments(data ?? []);
    } catch (error) {
      console.error(error);
      Alert.alert('댓글 불러오기 실패', error?.message ?? '댓글을 불러오지 못했습니다.');
    } finally {
      setCommentsLoading(false);
    }
  }, [activity?.id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmitComment = useCallback(async () => {
    const trimmed = commentInput.trim();
    if (!trimmed) {
      Alert.alert('입력 확인', '댓글 내용을 입력해 주세요.');
      return;
    }
    if (!activity?.id || !user?.id) {
      Alert.alert('작성 불가', '댓글을 작성할 수 있는 권한이 없습니다.');
      return;
    }

    setPostingComment(true);
    try {
      const { error } = await supabase.from('comments').insert({
        note_id: activity.id,
        user_id: user.id,
        text: trimmed,
      });

      if (error) {
        throw error;
      }

      setCommentInput('');
      await fetchComments();
    } catch (error) {
      console.error(error);
      Alert.alert('등록 실패', error?.message ?? '댓글을 등록하지 못했습니다.');
    } finally {
      setPostingComment(false);
    }
  }, [activity?.id, user?.id, commentInput, fetchComments]);

  const handleDelete = useCallback(() => {
    if (!activity?.id || !canManage) {
      return;
    }

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm('활동일지를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.')
          : false;
      if (confirmed) {
        performDelete();
      }
      return;
    }

    Alert.alert('활동일지 삭제', '삭제된 활동일지는 복구할 수 없습니다. 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          performDelete();
        },
      },
    ]);
  }, [activity?.id, canManage, performDelete]);

  const handleEdit = useCallback(() => {
    if (!activity?.id || !canManage) {
      return;
    }

    navigation.navigate('ActivityForm', {
      noteId: activity.id,
      onCompleted: async () => {
        await refreshActivity();
      },
    });
  }, [activity?.id, canManage, navigation, refreshActivity]);

  const createdAtText = useMemo(
    () =>
      activity?.created_at
        ? new Date(activity.created_at).toLocaleString()
        : '-',
    [activity?.created_at],
  );
  const tags = Array.isArray(activity?.tags) ? activity.tags : [];
  const photos = Array.isArray(activity?.photos) ? activity.photos : [];

  if (!activity) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>활동일지 데이터를 불러올 수 없습니다.</Text>
      </View>
    );
  }

  const canComment = Boolean(user?.id);
  const commentButtonDisabled = postingComment || !commentInput.trim();
  const handleStartEdit = useCallback((comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingCommentId(null);
    setEditingCommentText('');
  }, []);

  const handleSubmitEdit = useCallback(async () => {
    const trimmed = editingCommentText.trim();
    if (!editingCommentId || !trimmed) {
      Alert.alert('입력 확인', '댓글 내용을 입력해 주세요.');
      return;
    }

    setEditingCommentProcessing(true);
    try {
      const { error } = await supabase
        .from('comments')
        .update({ text: trimmed })
        .eq('id', editingCommentId)
        .eq('user_id', user?.id ?? '');

      if (error) {
        throw error;
      }

      await fetchComments();
      handleCancelEdit();
    } catch (error) {
      console.error(error);
      Alert.alert('수정 실패', error?.message ?? '댓글을 수정하지 못했습니다.');
    } finally {
      setEditingCommentProcessing(false);
    }
  }, [editingCommentId, editingCommentText, fetchComments, handleCancelEdit, user?.id]);

  const handleDeleteComment = useCallback(
    async (comment) => {
      if (!comment?.id) return;

      const confirmDelete =
        Platform.OS === 'web'
          ? typeof window !== 'undefined'
            ? window.confirm('댓글을 삭제하시겠습니까?')
            : false
          : await new Promise((resolve) => {
              Alert.alert('댓글 삭제', '댓글을 삭제하시겠습니까?', [
                { text: '취소', style: 'cancel', onPress: () => resolve(false) },
                { text: '삭제', style: 'destructive', onPress: () => resolve(true) },
              ]);
            });

      if (!confirmDelete) {
        return;
      }

      try {
        const { error } = await supabase
          .from('comments')
          .delete()
          .eq('id', comment.id)
          .eq('user_id', user?.id ?? '');

        if (error) {
          throw error;
        }

        await fetchComments();
      } catch (error) {
        console.error(error);
        Alert.alert('삭제 실패', error?.message ?? '댓글을 삭제하지 못했습니다.');
      }
    },
    [fetchComments, user?.id],
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {canManage ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, loading && styles.actionButtonDisabled]}
              onPress={handleEdit}
              disabled={loading}
            >
              <Text style={styles.actionButtonText}>활동일지 수정</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.actionDeleteButton,
                loading && styles.actionButtonDisabled,
              ]}
              onPress={handleDelete}
              disabled={loading}
            >
              <Text style={[styles.actionButtonText, styles.actionDeleteText]}>
                활동일지 삭제
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.label}>작성일</Text>
          <Text style={styles.value}>{createdAtText}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>식단</Text>
          <Text style={styles.value}>{activity.meal?.trim() || '기록된 식단 없음'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>태그</Text>
          <Text style={styles.value}>
            {tags.length > 0 ? tags.join(', ') : '선택된 태그가 없습니다.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>AI 활동일지</Text>
          <Text style={styles.value}>{activity.ai_note?.trim() || '내용이 없습니다.'}</Text>
        </View>

        {photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>사진</Text>
            <View style={styles.photoGrid}>
              {photos.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photo} />
              ))}
            </View>
          </View>
        )}

        <View style={styles.commentSection}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentTitle}>댓글</Text>
            <TouchableOpacity onPress={fetchComments} disabled={commentsLoading}>
              <Text style={styles.commentRefresh}>
                {commentsLoading ? '새로고침 중...' : '새로고침'}
              </Text>
            </TouchableOpacity>
          </View>

          {commentsLoading ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : comments.length === 0 ? (
            <Text style={styles.commentEmpty}>아직 댓글이 없습니다.</Text>
          ) : (
            comments.map((comment) => {
              const authorName =
                comment?.user?.name?.trim() ||
                (comment?.user?.role === 'guardian' ? '보호자' : '돌봄자');
              const createdAt = comment?.created_at
                ? new Date(comment.created_at).toLocaleString()
                : '';
              const mine = user?.id && comment.user_id === user.id;
              const isEditing = editingCommentId === comment.id;
              return (
                <View key={comment.id} style={styles.commentItem}>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentAuthor}>{authorName}</Text>
                    <View style={styles.commentMetaRight}>
                      {!!createdAt && <Text style={styles.commentTime}>{createdAt}</Text>}
                      {mine ? (
                        <View style={styles.commentActions}>
                          {isEditing ? (
                            <>
                              <TouchableOpacity
                                onPress={handleSubmitEdit}
                                disabled={editingCommentProcessing}
                              >
                                <Text style={styles.commentActionText}>
                                  {editingCommentProcessing ? '저장 중...' : '저장'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={handleCancelEdit} disabled={editingCommentProcessing}>
                                <Text style={styles.commentActionText}>취소</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity onPress={() => handleStartEdit(comment)}>
                                <Text style={styles.commentActionText}>수정</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleDeleteComment(comment)}>
                                <Text style={[styles.commentActionText, styles.commentDeleteText]}>
                                  삭제
                                </Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {isEditing ? (
                    <TextInput
                      style={[styles.commentInput, styles.commentEditInput]}
                      value={editingCommentText}
                      onChangeText={setEditingCommentText}
                      multiline
                      editable={!editingCommentProcessing}
                    />
                  ) : (
                    <Text style={styles.commentText}>{comment.text}</Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {canComment ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
          <View style={styles.commentComposer}>
            <TextInput
              style={styles.commentInput}
              placeholder="댓글을 입력해 주세요"
              value={commentInput}
              onChangeText={setCommentInput}
              editable={!postingComment}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.commentSubmit,
                commentButtonDisabled && styles.commentSubmitDisabled,
              ]}
              onPress={handleSubmitComment}
              disabled={commentButtonDisabled}
            >
              <Text style={styles.commentSubmitText}>
                {postingComment ? '등록 중...' : '등록'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 24,
    paddingBottom: 160,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  actionDeleteButton: {
    backgroundColor: '#fee2e2',
  },
  actionDeleteText: {
    color: '#b91c1c',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    color: '#0f172a',
    lineHeight: 22,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  commentSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 20,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  commentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  commentRefresh: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  commentEmpty: {
    fontSize: 14,
    color: '#64748b',
    paddingVertical: 8,
  },
  commentItem: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  commentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  commentMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  commentTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  commentText: {
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 20,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 12,
  },
  commentActionText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  commentDeleteText: {
    color: '#b91c1c',
  },
  commentEditInput: {
    minHeight: 80,
  },
  commentComposer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    minHeight: 60,
  },
  commentSubmit: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  commentSubmitDisabled: {
    backgroundColor: '#93c5fd',
  },
  commentSubmitText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
  },
});

