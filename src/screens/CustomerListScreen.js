// src/screens/CustomerListScreen.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function CustomerListScreen({ store, onBack }) {
  const restaurantId = store?.restaurantId || store?.id;
  const storeName = store?.restaurantName || store?.name || 'ร้านค้าของคุณ';

  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal เพิ่ม/แก้ไขชื่อสมาชิก
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    if (restaurantId) {
      fetchStoreCustomers();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [restaurantId]);

  const showNotice = (title, msg) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const formatPhone = (raw) => {
    const clean = (raw || '').replace(/[^0-9]/g, '');
    if (clean.length === 10) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return clean || '-';
  };

  const fetchStoreCustomers = async () => {
    try {
      setLoading(true);

      // 1. ดึงออเดอร์ที่ชำระเงินแล้วของร้านนี้ที่มีการผูกสมาชิก
      const { data: orderRows, error: orderErr } = await supabase
        .from('orders')
        .select('id, total_amount, created_at, customer_id, customer_phone, customer_name')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'paid')
        .not('customer_id', 'is', null)
        .order('created_at', { ascending: false });

      if (orderErr) throw orderErr;

      // สรุปยอดซื้อและจำนวนครั้งเฉพาะของร้านนี้แยกตาม customer_id
      const storeStatsMap = {};
      const customerIds = new Set();

      (orderRows || []).forEach((ord) => {
        const cid = ord.customer_id;
        if (!cid) return;
        customerIds.add(cid);
        if (!storeStatsMap[cid]) {
          storeStatsMap[cid] = {
            storeSpent: 0,
            storeVisits: 0,
            lastStoreVisitAt: ord.created_at,
          };
        }
        storeStatsMap[cid].storeSpent += Number(ord.total_amount) || 0;
        storeStatsMap[cid].storeVisits += 1;
      });

      // 2. ดึงรายชื่อสมาชิกทั้งหมดจากตาราง customers (Global Members)
      const { data: allMembers, error: memErr } = await supabase
        .from('customers')
        .select('*')
        .order('last_visit_at', { ascending: false, nullsFirst: false });

      if (memErr) throw memErr;

      if (isMountedRef.current) {
        const merged = (allMembers || []).map((m) => {
          const st = storeStatsMap[m.id] || {
            storeSpent: 0,
            storeVisits: 0,
            lastStoreVisitAt: null,
          };
          return {
            ...m,
            storeSpent: st.storeSpent,
            storeVisits: st.storeVisits,
            lastStoreVisitAt: st.lastStoreVisitAt,
            hasVisitedStore: st.storeVisits > 0,
          };
        });

        // เรียงคนที่เคยมาทานร้านนี้และมียอดซื้อสูงสุดขึ้นก่อน
        merged.sort((a, b) => {
          if (b.storeSpent !== a.storeSpent) return b.storeSpent - a.storeSpent;
          return (Number(b.total_spent) || 0) - (Number(a.total_spent) || 0);
        });

        setCustomers(merged);
      }
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลสมาชิกได้: ' + err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    const cleanQ = q.replace(/[^0-9]/g, '');
    return customers.filter((c) => {
      const matchName = (c.name || '').toLowerCase().includes(q);
      const matchPhone = cleanQ.length > 0 && (c.phone || '').includes(cleanQ);
      return matchName || matchPhone;
    });
  }, [customers, searchQuery]);

  const summaryStats = useMemo(() => {
    let storeMemberCount = 0;
    let totalStoreRevenueFromMembers = 0;
    let totalStoreVisits = 0;

    customers.forEach((c) => {
      if (c.storeVisits > 0) {
        storeMemberCount += 1;
        totalStoreRevenueFromMembers += Number(c.storeSpent) || 0;
        totalStoreVisits += Number(c.storeVisits) || 0;
      }
    });

    return {
      totalGlobalMembers: customers.length,
      storeMemberCount,
      totalStoreRevenueFromMembers,
      totalStoreVisits,
    };
  }, [customers]);

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setPhoneInput('');
    setNameInput('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (cust) => {
    setEditingCustomer(cust);
    setPhoneInput(cust.phone || '');
    setNameInput(cust.name || '');
    setModalVisible(true);
  };

  const handleSaveCustomer = async () => {
    if (isSubmittingRef.current) return;

    const cleanPhone = phoneInput.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10 || !cleanPhone.startsWith('0')) {
      showNotice('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกเบอร์โทรศัพท์มือถือ 10 หลัก (ขึ้นต้นด้วย 0)');
      return;
    }

    const cleanName = nameInput.trim() || 'ลูกค้าสมาชิก';

    try {
      isSubmittingRef.current = true;
      if (isMountedRef.current) setSaving(true);

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({ name: cleanName, phone: cleanPhone })
          .eq('id', editingCustomer.id);

        if (error) throw error;
      } else {
        // ตรวจสอบว่ามีเบอร์นี้อยู่แล้วหรือไม่
        const { data: existing } = await supabase
          .from('customers')
          .select('id, name, phone')
          .eq('phone', cleanPhone)
          .maybeSingle();

        if (existing) {
          showNotice('มีเบอร์นี้ในระบบแล้ว', `เบอร์ ${formatPhone(cleanPhone)} เป็นสมาชิกอยู่แล้วในชื่อ "${existing.name}"`);
          return;
        }

        const { error } = await supabase
          .from('customers')
          .insert([{ phone: cleanPhone, name: cleanName }]);

        if (error) throw error;
      }

      if (isMountedRef.current) {
        setModalVisible(false);
        showNotice('สำเร็จ', editingCustomer ? 'อัปเดตข้อมูลสมาชิกเรียบร้อยแล้ว' : 'ลงทะเบียนสมาชิกใหม่เรียบร้อยแล้ว');
      }
      await fetchStoreCustomers();
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', err.message);
      }
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Icon name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>กลับ Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>สมาชิกและประวัติลูกค้า</Text>
        <TouchableOpacity style={styles.addBtnHeader} onPress={handleOpenAddModal} activeOpacity={0.7}>
          <Icon name="person-add-outline" size={16} color={colors.textOnPrimary} />
          <Text style={styles.addBtnHeaderText}>เพิ่มสมาชิก</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Banner ข้อมูลระบบ Global Member */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerIconBox}>
            <Icon name="people-outline" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.bannerTitle}>ระบบสมาชิกกลาง (Global Member) • {storeName}</Text>
            <Text style={styles.bannerDesc}>
              ลูกค้าใช้เบอร์โทรศัพท์เดียวสะสมประวัติการมาทานและยอดซื้อร่วมกันได้ทุกร้านในระบบ
            </Text>
          </View>
        </View>

        {/* การ์ดสรุปสถิติสมาชิกของร้าน */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ลูกค้าสมาชิกของร้านนี้</Text>
            <Text style={styles.statVal}>{summaryStats.storeMemberCount} คน</Text>
            <Text style={styles.statSub}>จากระบบกลาง {summaryStats.totalGlobalMembers} คน</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ยอดซื้อจากสมาชิก (ร้านนี้)</Text>
            <Text style={[styles.statVal, { color: colors.primary }]}>
              ฿{summaryStats.totalStoreRevenueFromMembers.toFixed(0)}
            </Text>
            <Text style={styles.statSub}>รวม {summaryStats.totalStoreVisits} ครั้งที่มาทาน</Text>
          </View>
        </View>

        {/* ช่องค้นหาสมาชิก */}
        <View style={styles.searchBar}>
          <Icon name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาด้วยเบอร์โทรศัพท์ หรือ ชื่อลูกค้า..."
            placeholderTextColor={colors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* รายการสมาชิก */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>กำลังโหลดรายชื่อสมาชิก...</Text>
          </View>
        ) : filteredCustomers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="people-circle-outline" size={48} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>ยังไม่มีรายการสมาชิกที่ตรงกับการค้นหา</Text>
            <Text style={styles.emptyDesc}>
              คุณสามารถกดปุ่ม "เพิ่มสมาชิก" ด้านบน หรือสมัครให้ลูกค้าตอนเช็กบิลที่หน้าแคชเชียร์ได้ทันที
            </Text>
          </View>
        ) : (
          filteredCustomers.map((cust) => (
            <View key={cust.id} style={styles.customerCard}>
              <View style={styles.customerCardTop}>
                <View style={styles.avatarCircle}>
                  <Icon name="person-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.customerName}>{cust.name}</Text>
                    {cust.hasVisitedStore && (
                      <View style={styles.visitedBadge}>
                        <Text style={styles.visitedBadgeText}>ลูกค้าประจำร้านนี้</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.phoneRow}>
                    <Icon name="call-outline" size={13} color={colors.textSecondary} />
                    <Text style={styles.customerPhone}>{formatPhone(cust.phone)}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={() => handleOpenEditModal(cust)}
                >
                  <Icon name="create-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.statsSplitBox}>
                <View style={styles.statsCol}>
                  <Text style={styles.statsColTitle}>ประวัติเฉพาะที่ร้านนี้</Text>
                  <Text style={styles.statsColHighlight}>
                    ฿{Number(cust.storeSpent || 0).toFixed(2)} ({cust.storeVisits || 0} ครั้ง)
                  </Text>
                </View>
                <View style={styles.statsColDivider} />
                <View style={styles.statsCol}>
                  <Text style={styles.statsColTitle}>ประวัติรวมทุกร้าน (Global)</Text>
                  <Text style={styles.statsColSecondary}>
                    ฿{Number(cust.total_spent || 0).toFixed(2)} ({cust.visit_count || 0} ครั้ง)
                  </Text>
                </View>
              </View>

              {cust.last_visit_at && (
                <Text style={styles.lastVisitText}>
                  ใช้บริการล่าสุดเมื่อ: {new Date(cust.last_visit_at).toLocaleString('th-TH')}
                </Text>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal เพิ่ม/แก้ไขสมาชิก */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingCustomer ? 'แก้ไขข้อมูลสมาชิก' : 'ลงทะเบียนสมาชิกใหม่ (Global Member)'}
            </Text>
            <Text style={styles.modalSubtitle}>
              ใช้เบอร์โทรศัพท์ 10 หลักเพื่อบันทึกประวัติยอดซื้อและจำนวนครั้งที่มาใช้บริการ
            </Text>

            <Text style={styles.inputLabel}>เบอร์โทรศัพท์ (10 หลัก):</Text>
            <TextInput
              style={styles.textInput}
              placeholder="เช่น 0812345678"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              maxLength={10}
              value={phoneInput}
              onChangeText={setPhoneInput}
            />

            <Text style={styles.inputLabel}>ชื่อลูกค้า:</Text>
            <TextInput
              style={styles.textInput}
              placeholder="เช่น คุณสมชาย"
              placeholderTextColor={colors.textFaint}
              value={nameInput}
              onChangeText={setNameInput}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                disabled={saving}
                onPress={handleSaveCustomer}
              >
                {saving ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.modalSaveBtnText}>บันทึกข้อมูล</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  backBtnText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  addBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  addBtnHeaderText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginLeft: 4,
  },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.md,
  },
  bannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  bannerDesc: {
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    marginTop: 2,
    lineHeight: 17,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statVal: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    marginVertical: 4,
  },
  statSub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  customerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  customerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  customerName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  visitedBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  visitedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  customerPhone: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginLeft: 4,
    fontWeight: '600',
  },
  editIconBtn: {
    padding: 6,
  },
  statsSplitBox: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsCol: {
    flex: 1,
  },
  statsColDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  statsColTitle: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  statsColHighlight: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  statsColSecondary: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  lastVisitText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.md,
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
});
