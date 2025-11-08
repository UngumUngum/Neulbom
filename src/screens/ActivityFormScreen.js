import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import * as ImagePicker from 'expo-image-picker';
import supabase from '../lib/supabase';
import { generateWarmCareNote } from '../lib/openai';
import useAuth from '../hooks/useAuth';

const STORAGE_BUCKET = 'care-photos';
const ACTIVITY_TAGS = ['산책', '놀이', '미술', '독서', '수면'];
const HEALTH_TAGS = ['식사', '양호', '미열', '기침', '투약'];

export default function ActivityFormScreen({ navigation, route }) {
  const { user } = useAuth();
  const [wards, setWards] = useState([]);
  const [selectedWardId, setSelectedWardId] = useState(null);
  const [detailsDraft, setDetailsDraft] = useState('');
  const [meal, setMeal] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedActivityTag, setSelectedActivityTag] = useState(null);
  const [selectedHealthTag, setSelectedHealthTag] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);

  const noteId = route?.params?.noteId ?? null;
  const onCompleted = route?.params?.onCompleted;
  const isEditMode = Boolean(noteId);
  const preferredWardRef = useRef(null);

  const createPhotoItem = useCallback((uri, remote = false) => {
    const prefix = remote ? 'remote' : 'local';
    return {
      id: `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`,
      uri,
      remote,
    };
  }, []);

  const hasPhotos = useMemo(() => photos.length > 0, [photos]);
  const selectedTags = useMemo(
    () => [selectedActivityTag, selectedHealthTag].filter(Boolean),
    [selectedActivityTag, selectedHealthTag],
  );

  useEffect(() => {
    const fetchWards = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('wards')
        .select('id, name')
        .eq('caregiver_id', user.id)
        .order('name', { ascending: true });

      if (error) {
        console.error(error);
        Alert.alert('오류', '대상자를 불러오지 못했습니다.');
        return;
      }

      setWards(data ?? []);
      if (data && data.length > 0) {
        setSelectedWardId((prev) => {
          const preferred = preferredWardRef.current;
          if (preferred && data.some((ward) => ward.id === preferred)) {
            preferredWardRef.current = null;
            return preferred;
          }
          if (prev && data.some((ward) => ward.id === prev)) {
            return prev;
          }
          return data[0].id;
        });
      }
    };

    fetchWards();
  }, [user?.id]);

  useEffect(() => {
    if (!isEditMode || !noteId || !user?.id) {
      return;
    }

    let isActive = true;
    const loadNote = async () => {
      setLoadingNote(true);
      try {
        const { data, error } = await supabase
          .from('notes')
          .select(
            'id, ward_id, caregiver_id, ai_note, details, meal, tags, photos',
          )
          .eq('id', noteId)
          .single();

        if (error) {
          throw error;
        }

        if (!isActive) return;

        if (data?.caregiver_id && data.caregiver_id !== user.id) {
          Alert.alert('권한 없음', '해당 활동일지를 수정할 권한이 없습니다.');
          navigation.goBack();
          return;
        }

        preferredWardRef.current = data?.ward_id ?? null;
        setSelectedWardId(data?.ward_id ?? null);
        setAiNote(data?.ai_note ?? data?.details ?? '');
        setDetailsDraft(data?.details ?? data?.ai_note ?? '');
        setMeal(data?.meal ?? '');
        const tagsArray = Array.isArray(data?.tags) ? data.tags : [];
        setSelectedActivityTag(
          ACTIVITY_TAGS.find((tag) => tagsArray.includes(tag)) ?? null,
        );
        setSelectedHealthTag(HEALTH_TAGS.find((tag) => tagsArray.includes(tag)) ?? null);
        setPhotos(
          Array.isArray(data?.photos)
            ? data.photos.map((uri) => ({ ...createPhotoItem(uri, true), uri }))
            : [],
        );
      } catch (error) {
        console.error(error);
        if (!isActive) return;
        Alert.alert(
          '불러오기 실패',
          error?.message ?? '활동일지를 불러오는 중 문제가 발생했습니다.',
          [
            {
              text: '확인',
              onPress: () => {
                navigation.goBack();
              },
            },
          ],
        );
      } finally {
        if (isActive) {
          setLoadingNote(false);
        }
      }
    };

    loadNote();

    return () => {
      isActive = false;
    };
  }, [isEditMode, noteId, user?.id, navigation, createPhotoItem]);

  const requestLibraryPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진을 선택하려면 사진 라이브러리 접근 권한이 필요합니다.');
      return false;
    }
    return true;
  }, []);

  const handlePickImage = useCallback(async () => {
    const granted = await requestLibraryPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });

    if (!result.canceled) {
      const selected = result.assets.map((asset) => createPhotoItem(asset.uri, false));
      setPhotos((prev) => [...prev, ...selected]);
    }
  }, [requestLibraryPermission, createPhotoItem]);

  const removePhoto = useCallback((targetId) => {
    setPhotos((prev) => prev.filter((photo) => photo.id !== targetId));
  }, []);

  const uploadPhotoAsync = useCallback(
    async (uri) => {
      const cleanUri = uri?.split('?')[0] ?? '';
      const extMatch = cleanUri.match(/\.([a-zA-Z0-9]{2,4})$/);

      let contentType;
      let arrayBuffer;

      try {
        const response = await fetch(uri);
        contentType = response.headers.get('content-type') || 'image/jpeg';
        arrayBuffer = await response.arrayBuffer();
      } catch (error) {
        console.error('사진을 불러오는 중 오류가 발생했습니다.', error);
        throw new Error('사진을 불러오지 못했습니다. 다시 시도해 주세요.');
      }

      const fileExtFromMime = contentType.split('/').pop();
      const fileExt = extMatch?.[1]?.toLowerCase() || fileExtFromMime || 'jpg';
      const fileName = `${selectedWardId ?? user?.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, arrayBuffer, {
          contentType,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
      return data.publicUrl;
    },
    [selectedWardId, user?.id],
  );

  const handleGenerateAiNote = useCallback(async () => {
    setAiLoading(true);
    try {
      const formatted = await generateWarmCareNote({
        content: aiNote,
        meal,
        tags: selectedTags,
      });

      setAiNote(formatted);
    } catch (error) {
      console.error(error);
      Alert.alert('AI 작성 실패', error.message ?? 'AI 요청 중 문제가 발생했습니다.');
    } finally {
      setAiLoading(false);
    }
  }, [aiNote, meal, selectedTags]);

  const handleSubmit = useCallback(async () => {
    if (!selectedWardId) {
      Alert.alert('입력 확인', '활동 대상자를 선택해 주세요.');
      return;
    }
    if (!aiNote.trim()) {
      Alert.alert('입력 확인', 'AI 노트를 작성하거나 직접 입력해 주세요.');
      return;
    }
    if (!user?.id) {
      Alert.alert('인증 오류', '로그인이 필요한 기능입니다.');
      return;
    }
    if (!selectedActivityTag || !selectedHealthTag) {
      Alert.alert('입력 확인', '활동 태그와 건강 태그를 각각 한 개씩 선택해 주세요.');
      return;
    }

    setSaving(true);

    try {
      const existingPhotoUrls = photos.filter((photo) => photo.remote).map((photo) => photo.uri);
      const newPhotos = photos.filter((photo) => !photo.remote);
      const uploadedUrls = [...existingPhotoUrls];

      for (const photo of newPhotos) {
        const url = await uploadPhotoAsync(photo.uri);
        uploadedUrls.push(url);
      }

      let error;
      if (isEditMode && noteId) {
        ({ error } = await supabase
          .from('notes')
          .update({
            ward_id: selectedWardId,
            details: aiNote,
            meal: meal || null,
            ai_note: aiNote,
            tags: selectedTags,
            photos: uploadedUrls,
          })
          .eq('id', noteId));
      } else {
        ({ error } = await supabase.from('notes').insert({
          ward_id: selectedWardId,
          caregiver_id: user.id,
          details: aiNote,
          meal: meal || null,
          ai_note: aiNote,
          tags: selectedTags,
          photos: uploadedUrls,
        }));
      }

      if (error) {
        throw error;
      }

      Alert.alert(
        isEditMode ? '수정 완료' : '등록 완료',
        isEditMode ? '활동일지가 수정되었습니다.' : '활동일지가 성공적으로 저장되었습니다.',
      );
      if (typeof onCompleted === 'function') {
        await onCompleted();
      }
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert(
        isEditMode ? '수정 실패' : '등록 실패',
        error.message ?? '업로드 중 문제가 발생했습니다.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    selectedWardId,
    aiNote,
    meal,
    selectedTags,
    photos,
    uploadPhotoAsync,
    user,
    navigation,
    onCompleted,
    isEditMode,
    noteId,
    selectedActivityTag,
    selectedHealthTag,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>돌봄 대상자</Text>
          {wards.length === 0 ? (
            <Text style={styles.emptyGuide}>연결된 대상자가 없습니다. 먼저 대상을 등록하세요.</Text>
          ) : (
            <View style={styles.wardList}>
              {wards.map((ward) => (
                <TouchableOpacity
                  key={ward.id}
                  style={[styles.wardChip, selectedWardId === ward.id && styles.wardChipActive]}
                  onPress={() => setSelectedWardId(ward.id)}
                  disabled={saving || aiLoading}
                >
                  <Text
                    style={[styles.wardChipText, selectedWardId === ward.id && styles.wardChipTextActive]}
                  >
                    {ward.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>사진</Text>
          <TouchableOpacity
            style={styles.addPhotoButton}
            onPress={handlePickImage}
            disabled={saving || aiLoading || loadingNote}
          >
            <Text style={styles.addPhotoText}>사진 추가하기</Text>
          </TouchableOpacity>

          {hasPhotos ? (
            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <View key={photo.id} style={styles.photoWrapper}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.removeBadge}
                    onPress={() => removePhoto(photo.id)}
                    disabled={saving || aiLoading || loadingNote}
                  >
                    <Text style={styles.removeBadgeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.photoGuide}>활동 사진을 최대 5장까지 첨부할 수 있습니다.</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>식단 (선택)</Text>
          <TextInput
            style={[styles.input, styles.multilineSmall]}
            placeholder="제공된 식단이 있다면 기록해 주세요"
            value={meal}
            onChangeText={setMeal}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            editable={!saving && !loadingNote}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>AI 활동일지</Text>
          <TextInput
            style={[styles.input, styles.multilineLarge]}
            placeholder="AI가 작성한 내용을 확인하고 필요하면 수정하세요"
            value={aiNote}
            onChangeText={setAiNote}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            editable={!saving && !loadingNote}
          />
        </View>

        <TouchableOpacity
          style={[styles.aiButton, (aiLoading || !aiNote.trim()) && styles.aiButtonDisabled]}
          onPress={handleGenerateAiNote}
          disabled={aiLoading || !aiNote.trim() || loadingNote}
        >
          <Text style={styles.aiButtonText}>{aiLoading ? 'AI 작성 중...' : 'AI로 활동일지 생성'}</Text>
        </TouchableOpacity>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>태그</Text>
          <Text style={styles.tagGuide}>활동 태그와 건강 태그를 각각 한 개씩 선택해 주세요.</Text>

          <Text style={styles.tagSubLabel}>활동 태그</Text>
          <View style={styles.tagGrid}>
            {ACTIVITY_TAGS.map((tag, index) => {
              const active = selectedActivityTag === tag;
              return (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.tagChip,
                    active && styles.tagChipActive,
                    (index + 1) % 5 !== 0 && styles.tagChipSpacing,
                  ]}
                  onPress={() =>
                    setSelectedActivityTag((prev) => (prev === tag ? null : tag))
                  }
                  disabled={saving || aiLoading || loadingNote}
                >
                  <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.tagSubLabel}>건강 태그</Text>
          <View style={styles.tagGrid}>
            {HEALTH_TAGS.map((tag, index) => {
              const active = selectedHealthTag === tag;
              return (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.tagChip,
                    active && styles.tagChipActive,
                    (index + 1) % 5 !== 0 && styles.tagChipSpacing,
                  ]}
                  onPress={() =>
                    setSelectedHealthTag((prev) => (prev === tag ? null : tag))
                  }
                  disabled={saving || aiLoading || loadingNote}
                >
                  <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            (saving || aiLoading || loadingNote) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={saving || aiLoading || loadingNote}
        >
          <Text style={styles.submitText}>
            {saving
              ? isEditMode
                ? '수정 중...'
                : '업로드 중...'
              : isEditMode
              ? '활동일지 수정'
              : '활동일지 저장'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    padding: 24,
    paddingBottom: 40,
  },
  fieldGroup: {
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptyGuide: {
    fontSize: 13,
    color: '#64748b',
  },
  wardList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  wardChip: {
    borderWidth: 1,
    borderColor: '#cbd5f0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8faff',
  },
  wardChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  wardChipText: {
    color: '#475569',
    fontWeight: '600',
  },
  wardChipTextActive: {
    color: '#1d4ed8',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#f8fafc',
  },
  multiline: {
    minHeight: 160,
  },
  multilineSmall: {
    minHeight: 96,
  },
  multilineLarge: {
    minHeight: 200,
  },
  aiButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  aiButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  aiButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  addPhotoButton: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  addPhotoText: {
    color: '#4338ca',
    fontWeight: '600',
  },
  photoGuide: {
    color: '#64748b',
    fontSize: 13,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoWrapper: {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  tagGuide: {
    color: '#64748b',
    fontSize: 13,
    marginBottom: 8,
  },
  tagSubLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 12,
    marginBottom: 8,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagChip: {
    flexBasis: '18%',
    minWidth: 70,
    borderWidth: 1,
    borderColor: '#d4d4f7',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f3f4ff',
    alignItems: 'center',
    marginBottom: 10,
  },
  tagChipSpacing: {
    marginRight: 8,
  },
  tagChipActive: {
    borderColor: '#4338ca',
    backgroundColor: '#e0e7ff',
  },
  tagChipText: {
    color: '#6366f1',
    fontWeight: '600',
  },
  tagChipTextActive: {
    color: '#312e81',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

