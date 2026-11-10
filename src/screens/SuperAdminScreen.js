// src/screens/SuperAdminScreen.js
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

export default function SuperAdminScreen({ session, onExitAdminMode, onLogout }) {
  const currentUserId = session?.user?.id;
  const currentUserEmail = session?.user?.email || '-';

  const isMountedRef = useRef(true);
  const isActionLockedRef = useRef(false);

  const [checkingRole, setCheckingRole] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // แท็บหลัก: 'stores' | 'owners' | 'customers'
  const [activeTab, setActiveTab] = useState('stores');

  // ข้อมูลระบบ
  const [stores, setStores] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tableCountMap, setTableCountMap] = useState({});
  const [storeRevenueMap, setStoreRevenueMap] = useState({});

  // ตัวกรองและค้นหา
  const [searchQuery, setSearchQuery] = useState('');
  const [storeStatusFilter, setStoreStatusFilter] = useState('all'); // 'all' | 'active' | 'suspended'

  // Modal เพิ่ม/แก้ไขสมาชิกกลาง
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [custPhone, setCustPhone] = useState('');
  const [custName, setCustName] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    verifySuperAdminAndLoad();
    return () => {
      isMountedRef.current = false;
    };
  }, [currentUserId]);

  const showNotice = (title, msg) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const confirmAction = (title, msg, onConfirm) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, msg, [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ยืนยัน', style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  const formatPhone = (raw) => {
    const clean = (raw || '').replace(/[^0-9]/g, '');
    if (clean.length === 10) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return clean || '-';
  };

  const verifySuperAdminAndLoad = async () => {
    if (!currentUserId) {
      if (isMountedRef.current) {
        setIsAuthorized(false);
        setCheckingRole(false);
      }
      return;
    }

    try {
      setCheckingRole(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('id', currentUserId)
        .maybeSingle();

      if (error) throw error;

      const authorized = data?.role === 'super_admin';
      if (isMountedRef.current) {
        setIsAuthorized(authorized);
        setCheckingRole(false);
      }

      if (authorized) {
        await fetchAllPlatformData();
      }
    } catch (err) {
      if (isMountedRef.current) {
        setIsAuthorized(false);
        setCheckingRole(false);
      }
    }
  };

  const fetchAllPlatformData = async () => {
    try {
      if (isMountedRef.current) setLoadingData(true);

      const [restRes, profRes, custRes, tblRes, ordRes] = await Promise.all([
        supabase.from('restaurants').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('*').order('total_spent', { ascending: false }),
        supabase.from('tables').select('id, restaurant_id'),
        supabase.from('orders').select('id, restaurant_id, total_amount, status').eq('status', 'paid'),
      ]);

      if (restRes.error) throw restRes.error;
      if (profRes.error) throw profRes.error;
      if (custRes.error) throw custRes.error;

      // นับจำนวนโต๊ะต่อร้าน
      const tMap = {};
      (tblRes.data || []).forEach((t) => {
        const rid = t.restaurant_id;
        if (rid) tMap[rid] = (tMap[rid] || 0) + 1;
      });

      // รวมยอดขายและจำนวนบิลต่อร้าน (ไม่นับบิลย่อยที่ถูกรวมยอดเป็น 0 บาท)
      const rMap = {};
      (ordRes.data || []).forEach((o) => {
        const rid = o.restaurant_id;
        if (!rid) return;
        const amt = Number(o.total_amount) || 0;
        if (amt <= 0) return;
        if (!rMap[rid]) rMap[rid] = { revenue: 0, orderCount: 0 };
        rMap[rid].revenue += amt;
        rMap[rid].orderCount += 1;
      });

      if (isMountedRef.current) {
        setStores(restRes.data || []);
        setProfiles(profRes.data || []);
        setCustomers(custRes.data || []);
        setTableCountMap(tMap);
        setStoreRevenueMap(rMap);
      }
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลระบบกลางได้: ' + err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingData(false);
      }
    }
  };

  // สถิติภาพรวมทั้งแพลตฟอร์ม
  const platformStats = useMemo(() => {
    const totalStores = stores.length;
    const activeStores = stores.filter((s) => (s.status || 'active') === 'active').length;
    const suspendedStores = totalStores - activeStores;
    const totalOwners = profiles.length;
    const totalMembers = customers.length;

    let totalRevenue = 0;
    let totalPaidOrders = 0;
    Object.values(storeRevenueMap).forEach((v) => {
      totalRevenue += v.revenue;
      totalPaidOrders += v.orderCount;
    });

    return {
      totalStores,
      activeStores,
      suspendedStores,
      totalOwners,
      totalMembers,
      totalRevenue,
      totalPaidOrders,
    };
  }, [stores, profiles, customers, storeRevenueMap]);

  // -------------------------------------------------------------
  // Actions: จัดการร้านค้า (Suspend / Activate / Delete)
  // -------------------------------------------------------------
  const handleToggleStoreStatus = async (storeItem) => {
    if (isActionLockedRef.current) return;
    const currentStatus = storeItem.status || 'active';
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const actionLabel = nextStatus === 'suspended' ? 'ระงับการใช้งาน' : 'เปิดใช้งานปกติ';

    confirmAction(
      `ยืนยัน${actionLabel}`,
      `คุณต้องการเปลี่ยนสถานะร้าน "${storeItem.name}" เป็น "${actionLabel}" ใช่หรือไม่?`,
      async () => {
        try {
          isActionLockedRef.current = true;
          const { error } = await supabase
            .from('restaurants')
            .update({ status: nextStatus })
            .eq('id', storeItem.id);

          if (error) throw error;
          await fetchAllPlatformData();
          showNotice('สำเร็จ', `อัปเดตสถานะร้าน "${storeItem.name}" เป็น ${actionLabel} เรียบร้อยแล้ว`);
        } catch (err) {
          showNotice('เกิดข้อผิดพลาด', err.message);
        } finally {
          isActionLockedRef.current = false;
        }
      }
    );
  };

  const handleDeleteStore = (storeItem) => {
    if (isActionLockedRef.current) return;
    confirmAction(
      'ยืนยันการลบร้านค้าถาวร',
      `คุณต้องการลบร้าน "${storeItem.name}" และข้อมูลที่เกี่ยวข้องทั้งหมดใช่หรือไม่?`,
      async () => {
        try {
          isActionLockedRef.current = true;
          const { error } = await supabase.from('restaurants').delete().eq('id', storeItem.id);
          if (error) throw error;
          await fetchAllPlatformData();
          showNotice('สำเร็จ', `ลบร้าน "${storeItem.name}" เรียบร้อยแล้ว`);
        } catch (err) {
          showNotice('เกิดข้อผิดพลาด', err.message);
        } finally {
          isActionLockedRef.current = false;
        }
      }
    );
  };

  // -------------------------------------------------------------
  // Actions: จัดการบัญชี Owner & สิทธิ์แอดมิน
  // -------------------------------------------------------------
  const handleSetAllOwnerStoresStatus = (ownerProfile, targetStatus) => {
    if (isActionLockedRef.current) return;
    const actionLabel = targetStatus === 'suspended' ? 'ระงับทุกร้านค้า' : 'เปิดใช้งานทุกร้านค้า';

    confirmAction(
      `ยืนยัน${actionLabel}`,
      `ต้องการ${actionLabel}ของบัญชี "${ownerProfile.email}" ใช่หรือไม่?`,
      async () => {
        try {
          isActionLockedRef.current = true;
          const { error } = await supabase
            .from('restaurants')
            .update({ status: targetStatus })
            .eq('owner_id', ownerProfile.id);

          if (error) throw error;
          await fetchAllPlatformData();
          showNotice('สำเร็จ', `${actionLabel}ของ ${ownerProfile.email} เรียบร้อยแล้ว`);
        } catch (err) {
          showNotice('เกิดข้อผิดพลาด', err.message);
        } finally {
          isActionLockedRef.current = false;
        }
      }
    );
  };

  const handleToggleUserRole = (ownerProfile) => {
    if (isActionLockedRef.current) return;
    if (ownerProfile.id === currentUserId) {
      showNotice('ไม่สามารถดำเนินการได้', 'คุณไม่สามารถถอดสิทธิ์ Super Admin ของบัญชีที่คุณกำลังใช้งานอยู่ได้');
      return;
    }

    const nextRole = ownerProfile.role === 'super_admin' ? 'owner' : 'super_admin';
    const roleLabel = nextRole === 'super_admin' ? 'Super Admin (ผู้ดูแลระบบสูงสุด)' : 'Owner (เจ้าของร้านทั่วไป)';

    confirmAction(
      'ยืนยันการเปลี่ยนสิทธิ์',
      `ต้องการเปลี่ยนสิทธิ์ของ "${ownerProfile.email}" เป็น "${roleLabel}" ใช่หรือไม่?`,
      async () => {
        try {
          isActionLockedRef.current = true;
          const { error } = await supabase
            .from('profiles')
            .update({ role: nextRole, updated_at: new Date().toISOString() })
            .eq('id', ownerProfile.id);

          if (error) throw error;
          await fetchAllPlatformData();
          showNotice('สำเร็จ', `อัปเดตสิทธิ์ของ ${ownerProfile.email} เรียบร้อยแล้ว`);
        } catch (err) {
          showNotice('เกิดข้อผิดพลาด', err.message);
        } finally {
          isActionLockedRef.current = false;
        }
      }
    );
  };

  // -------------------------------------------------------------
  // Actions: จัดการสมาชิกกลาง (Global Members)
  // -------------------------------------------------------------
  const handleOpenCustomerModal = (cust = null) => {
    setEditingCustomer(cust);
    setCustPhone(cust?.phone || '');
    setCustName(cust?.name || '');
    setCustomerModalVisible(true);
  };

  const handleSaveCustomer = async () => {
    if (isActionLockedRef.current) return;
    const cleanPhone = custPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10 || !cleanPhone.startsWith('0')) {
      showNotice('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุเบอร์โทรศัพท์ 10 หลัก (ขึ้นต้นด้วย 0)');
      return;
    }
    const cleanName = custName.trim() || 'ลูกค้าสมาชิก';

    try {
      isActionLockedRef.current = true;
      if (isMountedRef.current) setSavingCustomer(true);

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({ phone: cleanPhone, name: cleanName })
          .eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([{ phone: cleanPhone, name: cleanName }]);
        if (error) throw error;
      }

      if (isMountedRef.current) {
        setCustomerModalVisible(false);
      }
      await fetchAllPlatformData();
      showNotice('สำเร็จ', 'บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว');
    } catch (err) {
      showNotice('เกิดข้อผิดพลาด', err.message);
    } finally {
      isActionLockedRef.current = false;
      if (isMountedRef.current) setSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = (cust) => {
    if (isActionLockedRef.current) return;
    confirmAction(
      'ยืนยันการลบสมาชิก',
      `ต้องการลบสมาชิก "${cust.name}" (${formatPhone(cust.phone)}) ออกจากระบบกลางใช่หรือไม่?`,
      async () => {
        try {
          isActionLockedRef.current = true;
          const { error } = await supabase.from('customers').delete().eq('id', cust.id);
          if (error) throw error;
          await fetchAllPlatformData();
          showNotice('สำเร็จ', 'ลบข้อมูลสมาชิกเรียบร้อยแล้ว');
        } catch (err) {
          showNotice('เกิดข้อผิดพลาด', err.message);
        } finally {
          isActionLockedRef.current = false;
        }
      }
    );
  };

  // รายการที่ผ่านตัวกรองในแต่ละแท็บ
  const filteredStores = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stores.filter((s) => {
      const st = s.status || 'active';
      if (storeStatusFilter !== 'all' && st !== storeStatusFilter) return false;
      if (!q) return true;
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.owner_email || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q)
      );
    });
  }, [stores, searchQuery, storeStatusFilter]);

  const filteredOwners = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return profiles
      .map((p) => {
        const ownerStores = stores.filter((s) => s.owner_id === p.id);
        const suspendedCount = ownerStores.filter((s) => s.status === 'suspended').length;
        return {
          ...p,
          ownerStores,
          storeCount: ownerStores.length,
          suspendedCount,
        };
      })
      .filter((p) => {
        if (!q) return true;
        return (
          (p.email || '').toLowerCase().includes(q) ||
          (p.id || '').toLowerCase().includes(q)
        );
      });
  }, [profiles, stores, searchQuery]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanQ = q.replace(/[^0-9]/g, '');
    return customers.filter((c) => {
      if (!q) return true;
      const matchName = (c.name || '').toLowerCase().includes(q);
      const matchPhone = cleanQ.length > 0 && (c.phone || '').includes(cleanQ);
      return matchName || matchPhone;
    });
  }, [customers, searchQuery]);

  // -------------------------------------------------------------
  // Render: กำลังตรวจสอบสิทธิ์
  // -------------------------------------------------------------
  if (checkingRole) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>กำลังตรวจสอบสิทธิ์ Super Admin...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // Render: ไม่มีสิทธิ์เข้าถึง (Access Denied)
  // -------------------------------------------------------------
  if (!isAuthorized) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <View style={styles.deniedCard}>
            <View style={styles.deniedIconCircle}>
              <Icon name="shield-outline" size={36} color={colors.danger} />
            </View>
            <Text style={styles.deniedTitle}>ไม่มีสิทธิ์เข้าถึงระบบแอดมินกลาง</Text>
            <Text style={styles.deniedDesc}>
              บัญชีปัจจุบันของคุณ ({currentUserEmail}) ไม่ได้มีสถานะเป็น Super Admin
            </Text>

            <TouchableOpacity style={styles.primaryActionBtn} onPress={onLogout}>
              <Icon name="log-out-outline" size={18} color={colors.textOnPrimary} />
              <Text style={styles.primaryActionBtnText}>ออกจากระบบเพื่อเปลี่ยนบัญชีแอดมิน</Text>
            </TouchableOpacity>

            {onExitAdminMode && (
              <TouchableOpacity style={styles.secondaryActionBtn} onPress={onExitAdminMode}>
                <Text style={styles.secondaryActionBtnText}>กลับสู่หน้าใช้งานระบบปกติ</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // Render: หน้าต่างควบคุมหลักของ Super Admin
  // -------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.adminShieldBadge}>
            <Icon name="shield-checkmark" size={18} color={colors.textOnPrimary} />
          </View>
          <View style={{ marginLeft: spacing.sm }}>
            <Text style={styles.headerTitle}>Super Admin Console</Text>
            <Text style={styles.headerSub}>{currentUserEmail}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={fetchAllPlatformData}
            disabled={loadingData}
          >
            <Icon name="refresh-outline" size={18} color={colors.primary} />
          </TouchableOpacity>

          {onExitAdminMode && (
            <TouchableOpacity style={styles.exitModeBtn} onPress={onExitAdminMode}>
              <Icon name="storefront-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.exitModeBtnText}>หน้าปกติ</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Icon name="log-out-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* การ์ดสรุปสถิติทั้งแพลตฟอร์ม */}
        <View style={styles.overviewGrid}>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>ร้านค้าทั้งหมด</Text>
            <Text style={styles.overviewVal}>{platformStats.totalStores} ร้าน</Text>
            <Text style={styles.overviewSub}>
              ปกติ {platformStats.activeStores} • ระงับ {platformStats.suspendedStores}
            </Text>
          </View>

          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>บัญชีผู้ใช้ (Owners)</Text>
            <Text style={styles.overviewVal}>{platformStats.totalOwners} บัญชี</Text>
            <Text style={styles.overviewSub}>ในระบบทั้งหมด</Text>
          </View>

          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>สมาชิก (Global)</Text>
            <Text style={styles.overviewVal}>{platformStats.totalMembers} คน</Text>
            <Text style={styles.overviewSub}>ใช้ร่วมกันทุกร้าน</Text>
          </View>

          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>ยอดขายรวมทั้งระบบ</Text>
            <Text style={[styles.overviewVal, { color: colors.primary }]}>
              ฿{platformStats.totalRevenue.toFixed(0)}
            </Text>
            <Text style={styles.overviewSub}>จาก {platformStats.totalPaidOrders} บิลที่ชำระแล้ว</Text>
          </View>
        </View>

        {/* แท็บเมนูการจัดการ */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'stores' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('stores');
              setSearchQuery('');
            }}
          >
            <Icon
              name="storefront-outline"
              size={16}
              color={activeTab === 'stores' ? colors.textOnPrimary : colors.textSecondary}
            />
            <Text style={[styles.tabBtnText, activeTab === 'stores' && styles.tabBtnTextActive]}>
              ร้านค้า ({stores.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'owners' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('owners');
              setSearchQuery('');
            }}
          >
            <Icon
              name="person-circle-outline"
              size={16}
              color={activeTab === 'owners' ? colors.textOnPrimary : colors.textSecondary}
            />
            <Text style={[styles.tabBtnText, activeTab === 'owners' && styles.tabBtnTextActive]}>
              บัญชี Owner ({profiles.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'customers' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('customers');
              setSearchQuery('');
            }}
          >
            <Icon
              name="people-outline"
              size={16}
              color={activeTab === 'customers' ? colors.textOnPrimary : colors.textSecondary}
            />
            <Text style={[styles.tabBtnText, activeTab === 'customers' && styles.tabBtnTextActive]}>
              สมาชิก ({customers.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ช่องค้นหา */}
        <View style={styles.searchBarRow}>
          <View style={styles.searchBar}>
            <Icon name="search-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={
                activeTab === 'stores'
                  ? 'ค้นหาชื่อร้าน, อีเมล Owner, หรือ ID ร้าน...'
                  : activeTab === 'owners'
                  ? 'ค้นหาด้วยอีเมลบัญชีผู้ใช้...'
                  : 'ค้นหาสมาชิกด้วยเบอร์โทร หรือ ชื่อ...'
              }
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

          {activeTab === 'customers' && (
            <TouchableOpacity
              style={styles.addMemberBtn}
              onPress={() => handleOpenCustomerModal(null)}
            >
              <Icon name="person-add-outline" size={16} color={colors.textOnPrimary} />
              <Text style={styles.addMemberBtnText}>เพิ่มสมาชิก</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ตัวกรองสถานะร้านค้า (เฉพาะแท็บ stores) */}
        {activeTab === 'stores' && (
          <View style={styles.filterChipRow}>
            {[
              { key: 'all', label: 'ทั้งหมด' },
              { key: 'active', label: 'เปิดใช้งานปกติ' },
              { key: 'suspended', label: 'ถูกระงับการใช้งาน' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  storeStatusFilter === f.key && styles.filterChipActive,
                ]}
                onPress={() => setStoreStatusFilter(f.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    storeStatusFilter === f.key && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loadingData ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>กำลังอัปเดตข้อมูล...</Text>
          </View>
        ) : activeTab === 'stores' ? (
          /* ========================================================= */
          /* TAB 1: จัดการร้านค้าทั้งหมด */
          /* ========================================================= */
          filteredStores.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>ไม่พบข้อมูลร้านค้าที่ค้นหา</Text>
            </View>
          ) : (
            filteredStores.map((st) => {
              const isSuspended = st.status === 'suspended';
              const tblCount = tableCountMap[st.id] || 0;
              const revObj = storeRevenueMap[st.id] || { revenue: 0, orderCount: 0 };

              return (
                <View key={st.id} style={styles.itemCard}>
                  <View style={styles.itemHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleBadgeRow}>
                        <Text style={styles.itemTitle}>{st.name}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            isSuspended ? styles.statusBadgeSuspended : styles.statusBadgeActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isSuspended
                                ? styles.statusBadgeTextSuspended
                                : styles.statusBadgeTextActive,
                            ]}
                          >
                            {isSuspended ? 'ถูกระงับการใช้งาน' : 'เปิดใช้งานปกติ'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.itemMetaText}>
                        เจ้าของร้าน (Owner): {st.owner_email || st.owner_id}
                      </Text>
                      <Text style={styles.itemSubId}>ID: {st.id}</Text>
                    </View>
                  </View>

                  <View style={styles.metricsStrip}>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>จำนวนโต๊ะ</Text>
                      <Text style={styles.metricVal}>{tblCount} โต๊ะ</Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>บิลที่ชำระแล้ว</Text>
                      <Text style={styles.metricVal}>{revObj.orderCount} บิล</Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>ยอดขายสะสม</Text>
                      <Text style={[styles.metricVal, { color: colors.primary }]}>
                        ฿{revObj.revenue.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardActionRow}>
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        isSuspended ? styles.actionBtnActivate : styles.actionBtnSuspend,
                      ]}
                      onPress={() => handleToggleStoreStatus(st)}
                    >
                      <Icon
                        name={isSuspended ? 'checkmark-circle-outline' : 'ban-outline'}
                        size={16}
                        color={isSuspended ? colors.primaryDeep : colors.warning}
                      />
                      <Text
                        style={[
                          styles.actionBtnText,
                          { color: isSuspended ? colors.primaryDeep : colors.warning },
                        ]}
                      >
                        {isSuspended ? 'ปลดระงับ / เปิดใช้งานร้าน' : 'ระงับการใช้งานร้านค้า'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteIconBtn}
                      onPress={() => handleDeleteStore(st)}
                    >
                      <Icon name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )
        ) : activeTab === 'owners' ? (
          /* ========================================================= */
          /* TAB 2: จัดการบัญชี Owner & สิทธิ์ */
          /* ========================================================= */
          filteredOwners.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>ไม่พบบัญชีผู้ใช้ที่ค้นหา</Text>
            </View>
          ) : (
            filteredOwners.map((prof) => {
              const isSuper = prof.role === 'super_admin';
              return (
                <View key={prof.id} style={styles.itemCard}>
                  <View style={styles.titleBadgeRow}>
                    <Text style={styles.itemTitle}>{prof.email}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        isSuper ? styles.statusBadgeAdmin : styles.statusBadgeOwner,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isSuper ? { color: colors.primaryDeep } : { color: colors.textSecondary },
                        ]}
                      >
                        {isSuper ? 'Super Admin' : 'Store Owner'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.itemMetaText}>
                    จำนวนร้านค้าในความดูแล: {prof.storeCount} ร้าน
                    {prof.suspendedCount > 0 ? ` (ถูกระงับ ${prof.suspendedCount} ร้าน)` : ''}
                  </Text>

                  {prof.ownerStores.length > 0 && (
                    <View style={styles.ownerStoresList}>
                      {prof.ownerStores.map((os) => (
                        <Text key={os.id} style={styles.ownerStoreChip}>
                          • {os.name} ({os.status === 'suspended' ? 'ระงับ' : 'ปกติ'})
                        </Text>
                      ))}
                    </View>
                  )}

                  <View style={styles.cardActionRow}>
                    {prof.storeCount > 0 && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnSuspend]}
                          onPress={() => handleSetAllOwnerStoresStatus(prof, 'suspended')}
                        >
                          <Text style={[styles.actionBtnText, { color: colors.warning }]}>
                            ระงับทุกร้านของบัญชีนี้
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnActivate]}
                          onPress={() => handleSetAllOwnerStoresStatus(prof, 'active')}
                        >
                          <Text style={[styles.actionBtnText, { color: colors.primaryDeep }]}>
                            เปิดใช้งานทุกร้าน
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {prof.id !== currentUserId && (
                      <TouchableOpacity
                        style={styles.roleSwitchBtn}
                        onPress={() => handleToggleUserRole(prof)}
                      >
                        <Icon name="key-outline" size={14} color={colors.textSecondary} />
                        <Text style={styles.roleSwitchBtnText}>
                          {isSuper ? 'ปรับเป็น Owner' : 'ตั้งเป็นแอดมิน'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )
        ) : (
          /* ========================================================= */
          /* TAB 3: จัดการสมาชิกกลาง (Global Members) */
          /* ========================================================= */
          filteredCustomers.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>ยังไม่มีข้อมูลสมาชิกในระบบ</Text>
            </View>
          ) : (
            filteredCustomers.map((cust) => (
              <View key={cust.id} style={styles.itemCard}>
                <View style={styles.itemHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{cust.name}</Text>
                    <Text style={styles.itemMetaText}>เบอร์โทร: {formatPhone(cust.phone)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.headerIconBtn}
                    onPress={() => handleOpenCustomerModal(cust)}
                  >
                    <Icon name="create-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteIconBtn}
                    onPress={() => handleDeleteCustomer(cust)}
                  >
                    <Icon name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>

                <View style={styles.metricsStrip}>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>จำนวนครั้งที่มาทานรวม</Text>
                    <Text style={styles.metricVal}>{cust.visit_count || 0} ครั้ง</Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>ยอดใช้จ่ายสะสมรวมทุกร้าน</Text>
                    <Text style={[styles.metricVal, { color: colors.primary }]}>
                      ฿{Number(cust.total_spent || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* Modal เพิ่ม/แก้ไขสมาชิกกลาง */}
      <Modal visible={customerModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingCustomer ? 'แก้ไขข้อมูลสมาชิกกลาง' : 'เพิ่มสมาชิกใหม่ (Global Member)'}
            </Text>

            <Text style={styles.inputLabel}>เบอร์โทรศัพท์ (10 หลัก):</Text>
            <TextInput
              style={styles.textInput}
              placeholder="เช่น 0812345678"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              maxLength={10}
              value={custPhone}
              onChangeText={setCustPhone}
            />

            <Text style={styles.inputLabel}>ชื่อลูกค้า:</Text>
            <TextInput
              style={styles.textInput}
              placeholder="เช่น คุณสมชาย"
              placeholderTextColor={colors.textFaint}
              value={custName}
              onChangeText={setCustName}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCustomerModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                disabled={savingCustomer}
                onPress={handleSaveCustomer}
              >
                {savingCustomer ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.modalSaveBtnText}>บันทึก</Text>
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
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  deniedCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.md,
  },
  deniedIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  deniedTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  deniedDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
    gap: 6,
  },
  primaryActionBtnText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    marginTop: spacing.sm,
    paddingVertical: 10,
  },
  secondaryActionBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminShieldBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.text,
  },
  headerSub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  exitModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  exitModeBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  logoutBtn: {
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  overviewCard: {
    flexGrow: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  overviewVal: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    marginVertical: 2,
  },
  overviewSub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.textOnPrimary,
  },
  searchBarRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: 4,
  },
  addMemberBtnText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  itemMetaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  itemSubId: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusBadgeActive: {
    backgroundColor: colors.primarySoft,
  },
  statusBadgeSuspended: {
    backgroundColor: colors.dangerSoft,
  },
  statusBadgeAdmin: {
    backgroundColor: colors.primarySoft,
  },
  statusBadgeOwner: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextActive: {
    color: colors.primaryDark,
  },
  statusBadgeTextSuspended: {
    color: colors.danger,
  },
  metricsStrip: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  metricVal: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  ownerStoresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  ownerStoreChip: {
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    gap: 6,
    borderWidth: 1,
  },
  actionBtnSuspend: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  actionBtnActivate: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  actionBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  deleteIconBtn: {
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  roleSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  roleSwitchBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
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
    marginBottom: spacing.xs,
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
