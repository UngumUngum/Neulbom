import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

const GENDER_OPTIONS = [
  { value: 'male', label: '남' },
  { value: 'female', label: '여' },
];

export default function WardFormScreen({ navigation, route }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState(null);
  const [guardians, setGuardians] = useState([]);
  const [selectedGuardianId, setSelectedGuardianId] = useState(null);
  const [loadingGuardians, setLoadingGuardians] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingWard, setLoadingWard] = useState(false);
  const [wardAffiliation, setWardAffiliation] = useState(
    user?.user_metadata?.affiliation?.trim() || null,
  );
  const [wardOwnerId, setWardOwnerId] = useState(user?.id ?? null);

  const caregiverAffiliation = user?.user_metadata?.affiliation?.trim() || '';
  const wardId = route?.params?.wardId ?? null;
  const isEdit = Boolean(wardId);
  const preferredGuardianRef = useRef(null);
  const onCompleted = route?.params?.onCompleted;

  const effectiveAffiliation = useMemo(
    () => caregiverAffiliation || wardAffiliation || '',
    [caregiverAffiliation, wardAffiliation],
  );

  const birthdateValid = useMemo(() => /^\d{4}-\d{2}-\d{2}$/.test(birthdate.trim()), [birthdate]);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? '피보호자 수정' : '피보호자 등록' });
  }, [navigation, isEdit]);

  const fetchGuardians = useCallback(async () => {
    if (!effectiveAffiliation) {
      setGuardians([]);
      setSelectedGuardianId(null);
      setLoadingGuardians(false);
      return;
    }

    setLoadingGuardians(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'guardian')
        .eq('affiliation', effectiveAffiliation)
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      const guardiansData = data ?? [];
      setGuardians(guardiansData);
      setSelectedGuardianId((prev) => {
        const preferred = preferredGuardianRef.current;
        if (preferred && guardiansData.some((guardian) => guardian.id === preferred)) {
          preferredGuardianRef.current = null;
          return preferred;
        }

        if (prev && guardiansData.some((guardian) => guardian.id === prev)) {
          return prev;
        }
        return guardiansData?.[0]?.id ?? null;
      });
    } catch (error) {
      console.error(error);
      Alert.alert(
        '보호자 불러오기 실패',
        error?.message ?? '보호자 목록을 불러오는 중 문제가 발생했습니다.',
      );
      setGuardians([]);
      setSelectedGuardianId(null);
    } finally {
      setLoadingGuardians(false);
    }
  }, [effectiveAffiliation]);

  useEffect(() => {
    fetchGuardians();
  }, [fetchGuardians]);

  useEffect(() => {
    if (!isEdit || !wardId || !user?.id) {
      return;
    }

    let isActive = true;
    const loadWard = async () => {
      setLoadingWard(true);
      try {
        const { data, error } = await supabase
          .from('wards')
          .select('id, name, birth_date, gender, guardian_id, affiliation, caregiver_id')
          .eq('id', wardId)
          .single();

        if (error) {
          throw error;
        }
        if (!isActive) return;

        if (data?.caregiver_id && data.caregiver_id !== user?.id) {
          throw new Error('해당 피보호자를 수정할 권한이 없습니다.');
        }

        setName(data?.name ?? '');
        setBirthdate(data?.birth_date ?? '');
        setGender(data?.gender ?? null);
        setSelectedGuardianId(data?.guardian_id ?? null);
        preferredGuardianRef.current = data?.guardian_id ?? null;
        setWardAffiliation(data?.affiliation ?? null);
        setWardOwnerId(data?.caregiver_id ?? null);
      } catch (error) {
        console.error(error);
        if (!isActive) return;
        Alert.alert(
          '불러오기 실패',
          error?.message ?? '피보호자 정보를 불러오는 중 문제가 발생했습니다.',
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
          setLoadingWard(false);
        }
      }
    };

    loadWard();

    return () => {
      isActive = false;
    };
  }, [isEdit, wardId, navigation, user?.id]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedBirthdate = birthdate.trim();

    if (!trimmedName) {
      Alert.alert('입력 확인', '피보호자의 이름을 입력해 주세요.');
      return;
    }
    if (!birthdateValid) {
      Alert.alert('입력 확인', '생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }
    if (!gender) {
      Alert.alert('입력 확인', '성별을 선택해 주세요.');
      return;
    }
    if (!selectedGuardianId) {
      Alert.alert('입력 확인', '연결할 보호자를 선택해 주세요.');
      return;
    }
    if (!effectiveAffiliation) {
      Alert.alert('설정 필요', '돌봄자 소속 정보가 없습니다. 프로필 정보를 확인해 주세요.');
      return;
    }
    if (!user?.id) {
      Alert.alert('인증 오류', '로그인이 필요한 기능입니다.');
      return;
    }
    if (isEdit && wardOwnerId && wardOwnerId !== user?.id) {
      Alert.alert('권한 없음', '해당 피보호자를 수정할 권한이 없습니다.');
      return;
    }

    setSaving(true);
    try {
      let error;
      if (isEdit && wardId) {
        ({ error } = await supabase
          .from('wards')
          .update({
            name: trimmedName,
            birth_date: trimmedBirthdate,
            gender,
            affiliation: effectiveAffiliation,
            guardian_id: selectedGuardianId,
          })
          .eq('id', wardId));
      } else {
        ({ error } = await supabase.from('wards').insert({
          name: trimmedName,
          birth_date: trimmedBirthdate,
          gender,
          affiliation: effectiveAffiliation,
          guardian_id: selectedGuardianId,
          caregiver_id: user.id,
        }));
      }

      if (error) {
        throw error;
      }

      if (typeof onCompleted === 'function') {
        await onCompleted();
      }
      navigation.goBack();
      Alert.alert(isEdit ? '수정 완료' : '등록 완료', isEdit ? '피보호자 정보가 수정되었습니다.' : '피보호자가 성공적으로 등록되었습니다.');
    } catch (error) {
      console.error(error);
      Alert.alert('등록 실패', error?.message ?? '피보호자를 등록하는 중 문제가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }, [
    birthdateValid,
    effectiveAffiliation,
    gender,
    name,
    birthdate,
    navigation,
    selectedGuardianId,
    user?.id,
    isEdit,
    wardId,
    onCompleted,
  ]);

  const performDelete = useCallback(async () => {
    setSaving(true);
    try {
      const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('id')
        .eq('ward_id', wardId);

      if (notesError) {
        throw notesError;
      }

      const noteIds = (notes ?? []).map((note) => note.id);

      if (noteIds.length > 0) {
        const { error: commentDeleteError } = await supabase
          .from('comments')
          .delete()
          .in('note_id', noteIds);
        if (commentDeleteError) {
          throw commentDeleteError;
        }

        const { error: noteDeleteError } = await supabase
          .from('notes')
          .delete()
          .in('id', noteIds);
        if (noteDeleteError) {
          throw noteDeleteError;
        }
      }

      const { error: wardDeleteError } = await supabase
        .from('wards')
        .delete()
        .eq('id', wardId);
      if (wardDeleteError) {
        throw wardDeleteError;
      }
      if (typeof onCompleted === 'function') {
        await onCompleted();
      }
      navigation.goBack();
      Alert.alert('삭제 완료', '피보호자가 삭제되었습니다.');
    } catch (error) {
      console.error(error);
      Alert.alert('삭제 실패', error?.message ?? '피보호자를 삭제하는 중 문제가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }, [wardId, onCompleted, navigation]);

  const handleDelete = useCallback(() => {
    if (!isEdit || !wardId || saving) {
      return;
    }
    if (!user?.id) {
      Alert.alert('인증 오류', '로그인이 필요한 기능입니다.');
      return;
    }
    if (wardOwnerId && wardOwnerId !== user?.id) {
      Alert.alert('권한 없음', '해당 피보호자를 삭제할 권한이 없습니다.');
      return;
    }

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm('삭제된 피보호자는 복구할 수 없습니다. 삭제하시겠습니까?')
          : false;
      if (confirmed) {
        performDelete();
      }
      return;
    }

    Alert.alert(
      '피보호자 삭제',
      '삭제된 피보호자는 복구할 수 없습니다. 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            performDelete();
          },
        },
      ],
    );
  }, [isEdit, wardId, saving, user?.id, wardOwnerId, performDelete]);

  const formDisabled = saving || loadingWard;
  const submitLabel = isEdit ? '피보호자 수정' : '피보호자 등록';
  const submitLoadingLabel = isEdit ? '수정 중...' : '등록 중...';

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>피보호자 이름</Text>
          <TextInput
            style={styles.input}
            placeholder="이름을 입력해 주세요"
            value={name}
            onChangeText={setName}
            editable={!formDisabled}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>생년월일</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={birthdate}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            onChangeText={setBirthdate}
            editable={!formDisabled}
          />
          {!birthdateValid && birthdate.length > 0 ? (
            <Text style={styles.helperText}>예) 2015-09-01 과 같은 형식으로 입력해 주세요.</Text>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>성별</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((option) => {
              const active = gender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.genderChip, active && styles.genderChipActive]}
                  onPress={() => setGender(option.value)}
                  disabled={formDisabled}
                >
                  <Text style={[styles.genderText, active && styles.genderTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>연결할 보호자</Text>
          {!effectiveAffiliation ? (
            <Text style={styles.helperText}>
              돌봄자 소속 정보가 없습니다. 계정 정보를 확인해 주세요.
            </Text>
          ) : loadingGuardians ? (
            <View style={styles.loadingGuardians}>
              <ActivityIndicator size="small" color="#4f46e5" />
              <Text style={styles.loadingText}>보호자를 불러오는 중입니다...</Text>
            </View>
          ) : guardians.length === 0 ? (
            <Text style={styles.helperText}>
              같은 소속의 보호자가 없습니다. 보호자 계정 등록 후 다시 시도해 주세요.
            </Text>
          ) : (
            <View style={styles.guardianGrid}>
              {guardians.map((guardian) => {
                const active = guardian.id === selectedGuardianId;
                return (
                  <TouchableOpacity
                    key={guardian.id}
                    style={[styles.guardianChip, active && styles.guardianChipActive]}
                    onPress={() => setSelectedGuardianId(guardian.id)}
                    disabled={formDisabled}
                  >
                    <Text style={[styles.guardianText, active && styles.guardianTextActive]}>
                      {guardian.name?.trim() || guardian.email || '이름 없음'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, formDisabled && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={formDisabled}
        >
          <Text style={styles.submitText}>{saving ? submitLoadingLabel : submitLabel}</Text>
        </TouchableOpacity>

        {isEdit ? (
          <TouchableOpacity
            style={[styles.deleteButton, formDisabled && styles.deleteButtonDisabled]}
            onPress={handleDelete}
            disabled={formDisabled}
          >
            <Text style={styles.deleteButtonText}>피보호자 삭제</Text>
          </TouchableOpacity>
        ) : null}
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
    marginBottom: 10,
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
  helperText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#f3f4ff',
    borderWidth: 1,
    borderColor: '#d4d4f7',
  },
  genderChipActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#4338ca',
  },
  genderText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6366f1',
  },
  genderTextActive: {
    color: '#312e81',
  },
  loadingGuardians: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#475569',
  },
  guardianGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  guardianChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5f0',
  },
  guardianChipActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  guardianText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  guardianTextActive: {
    color: '#1d4ed8',
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
  deleteButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  deleteButtonDisabled: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
  },
  deleteButtonText: {
    color: '#b91c1c',
    fontSize: 15,
    fontWeight: '700',
  },
});


