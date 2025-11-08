import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../lib/supabase';
import useAuth from '../hooks/useAuth';

export default function MainScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [wards, setWards] = useState([]);
  const [selectedWardId, setSelectedWardId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const isCaregiver = user?.user_metadata?.role === 'caregiver';

  const fetchWards = useCallback(async () => {
    if (!user?.id) return;

    try {
      const filters = [`caregiver_id.eq.${user.id}`];
      filters.push(`guardian_id.eq.${user.id}`);

      const { data, error } = await supabase
        .from('wards')
        .select('id, name')
        .or(filters.join(','))
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      setWards(data ?? []);
      setSelectedWardId((prev) => {
        if (prev && (data ?? []).some((ward) => ward.id === prev)) {
          return prev;
        }
        return data?.[0]?.id ?? null;
      });
    } catch (error) {
      console.error(error);
      Alert.alert(
        '대상 불러오기 실패',
        error?.message ?? '돌봄 대상을 불러오는 중 문제가 발생했습니다.',
      );
      setWards([]);
      setSelectedWardId(null);
    }
  }, [user?.id]);

  const fetchNotes = useCallback(async () => {
    if (!user?.id || !selectedWardId) {
      setNotes([]);
      return;
    }

    setLoading(true);
    try {
        const { data, error } = await supabase
          .from('notes')
          .select('id, created_at, details, meal, ai_note, tags, photos, ward_id, caregiver_id')
        .eq('ward_id', selectedWardId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }
      setNotes(data ?? []);
    } catch (error) {
      console.error(error);
      Alert.alert(
        '목록 불러오기 실패',
        error?.message ?? '활동일지를 불러오는 중 문제가 발생했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedWardId]);

  useFocusEffect(
    useCallback(() => {
      fetchWards();
    }, [fetchWards]),
  );

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      Alert.alert('로그아웃 실패', error.message);
    }
  };

  const renderItem = ({ item }) => {
    const preview = item.ai_note || item.details || '';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('ActivityDetail', {
            activity: item,
            onDeleted: fetchNotes,
            onUpdated: fetchNotes,
          })
        }
      >
        <Text style={styles.cardTitle}>활동일지</Text>
        <Text style={styles.cardMeta}>
          {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
        </Text>
        <Text numberOfLines={3} style={styles.cardContent}>
          {preview ? preview.trim() : '내용이 없습니다.'}
        </Text>
      </TouchableOpacity>
    );
  };

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>안녕하세요,</Text>
          <Text style={styles.name}>{user?.user_metadata?.name ?? '보호자'}님</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.logoutButton}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notes}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.wardSelector}>
            <Text style={styles.wardLabel}>돌봄 대상자</Text>
            {wards.length === 0 ? (
              <Text style={styles.wardEmpty}>연결된 대상자가 없습니다.</Text>
            ) : (
              <View style={styles.wardList}>
                {wards.map((ward) => {
                  const active = selectedWardId === ward.id;
                  return (
                    <TouchableOpacity
                      key={ward.id}
                      style={[styles.wardChip, active && styles.wardChipActive]}
                      onPress={() => setSelectedWardId(ward.id)}
                      disabled={loading}
                    >
                      <Text style={[styles.wardChipText, active && styles.wardChipTextActive]}>
                        {ward.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {isCaregiver ? (
              <TouchableOpacity
                style={[
                  styles.addWardButton,
                  loading && styles.addWardButtonDisabled,
                ]}
                onPress={() => navigation.navigate('WardForm', { onCompleted: fetchWards })}
                disabled={loading}
              >
                <Text style={styles.addWardButtonText}>피보호자 등록하기</Text>
              </TouchableOpacity>
            ) : null}

            {isCaregiver && selectedWardId ? (
              <View style={styles.wardActions}>
                <TouchableOpacity
                  style={styles.wardActionButton}
                  onPress={() =>
                    navigation.navigate('WardForm', {
                      wardId: selectedWardId,
                      onCompleted: fetchWards,
                    })
                  }
                  disabled={loading}
                >
                  <Text style={styles.wardActionText}>피보호자 수정</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>등록된 활동일지가 없습니다.</Text>
            <Text style={styles.emptyDescription}>
              {isCaregiver
                ? '아래 버튼을 눌러 새로운 활동일지를 추가해 보세요.'
                : '돌봄자가 활동일지를 등록하면 이곳에서 확인할 수 있습니다.'}
            </Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotes} />}
      />

      {isCaregiver ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('ActivityForm', { onCompleted: fetchNotes })}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcome: {
    fontSize: 16,
    color: '#64748b',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
  },
  logoutText: {
    color: '#334155',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  wardSelector: {
    marginBottom: 20,
  },
  wardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  wardEmpty: {
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
  addWardButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#4f46e5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addWardButtonDisabled: {
    backgroundColor: '#a5b4fc',
  },
  addWardButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  wardActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  wardActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  wardActionText: {
    color: '#1e293b',
    fontWeight: '600',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  cardMeta: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  cardContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  emptyState: {
    marginTop: 80,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 32,
    marginBottom: 4,
  },
});

