// src/screens/StoreDashboard.js
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import TableManagementScreen from './TableManagementScreen';
import MenuManagementScreen from './MenuManagementScreen';
import StaffQrScreen from './StaffQrScreen'; // 1. Import หน้า QR พนักงานเข้ามาใช้งาน
import SalesReportScreen from './SalesReportScreen'; // 2. Import หน้ารายงานยอดขาย
import PaymentSettingsScreen from './PaymentSettingsScreen'; // 3. Import หน้าตั้งค่าการรับเงิน
import CustomerListScreen from './CustomerListScreen'; // 4. Import หน้าจัดการสมาชิกและประวัติลูกค้า
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function StoreDashboard({ store, session, onBack, initialView = 'dashboard', onViewChange }) {
  const [currentView, setCurrentViewState] = useState(initialView || 'dashboard');

  const setCurrentView = (view) => {
    setCurrentViewState(view);
    if (onViewChange) {
      onViewChange(view);
    }
  };

  const restaurantId = store?.restaurantId || store?.id;
  const restaurantName = store?.restaurantName || store?.name || 'ร้านค้าของคุณ';

  if (currentView === 'tables') {
    return (
      <TableManagementScreen
        store={store}
        onBack={() => setCurrentView('dashboard')}
      />
    );
  }

  if (currentView === 'menu') {
    return (
      <MenuManagementScreen
        store={store}
        onBack={() => setCurrentView('dashboard')}
      />
    );
  }

  // แสดงหน้า StaffQrScreen เมื่อเปลี่ยน state เป็น 'staff_qr'
  if (currentView === 'staff_qr') {
    return (
      <StaffQrScreen
        store={store}
        onBack={() => setCurrentView('dashboard')}
      />
    );
  }

  // แสดงหน้ารายงานยอดขาย เมื่อเปลี่ยน state เป็น 'reports'
  if (currentView === 'reports') {
    return (
      <SalesReportScreen
        store={store}
        onBack={() => setCurrentView('dashboard')}
      />
    );
  }

  // แสดงหน้าตั้งค่าการรับเงิน เมื่อเปลี่ยน state เป็น 'payment'
  if (currentView === 'payment') {
    return (
      <PaymentSettingsScreen
        store={store}
        onBack={() => setCurrentView('dashboard')}
      />
    );
  }

  // แสดงหน้าจัดการสมาชิกและประวัติลูกค้า เมื่อเปลี่ยน state เป็น 'customers'
  if (currentView === 'customers') {
    return (
      <CustomerListScreen
        store={store}
        onBack={() => setCurrentView('dashboard')}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Icon name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>กลับหน้าเลือกร้าน</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{restaurantName}</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Banner ข้อมูลร้าน */}
        <View style={styles.storeCard}>
          <View style={styles.storeBadgeRow}>
            <Icon name="storefront-outline" size={14} color={colors.primaryBorder} />
            <Text style={styles.storeBadge}>โหมดจัดการร้านค้า</Text>
          </View>
          <Text style={styles.storeTitle}>{restaurantName}</Text>
          <Text style={styles.storeSubtext}>ID ร้านค้า: {restaurantId}</Text>
        </View>

        {/* เมนูจัดการระบบต่าง ๆ */}
        <Text style={styles.sectionTitle}>เมนูการจัดการ</Text>
        
        <View style={styles.gridContainer}>
          <TouchableOpacity 
            style={styles.menuCard}
            activeOpacity={0.7}
            onPress={() => setCurrentView('tables')}
          >
            <View style={styles.menuIconWrap}>
              <Icon name="grid-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.menuTitle}>จัดการโต๊ะ</Text>
            <Text style={styles.menuDesc}>เพิ่ม/แก้ไข/ลบ ผังโต๊ะในร้าน</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuCard}
            activeOpacity={0.7}
            onPress={() => setCurrentView('menu')}
          >
            <View style={styles.menuIconWrap}>
              <Icon name="restaurant-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.menuTitle}>เมนูอาหาร</Text>
            <Text style={styles.menuDesc}>ตั้งค่ารายการอาหารและราคา</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuCard}
            activeOpacity={0.7}
            onPress={() => setCurrentView('staff_qr')}
          >
            <View style={styles.menuIconWrap}>
              <Icon name="qr-code-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.menuTitle}>QR พนักงาน</Text>
            <Text style={styles.menuDesc}>ออก QR สแกนสำหรับพนักงาน</Text>
          </TouchableOpacity>

          {/* ปุ่มเปิดรายงานยอดขาย */}
          <TouchableOpacity 
            style={styles.menuCard}
            activeOpacity={0.7}
            onPress={() => setCurrentView('reports')}
          >
            <View style={styles.menuIconWrap}>
              <Icon name="bar-chart-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.menuTitle}>รายงานยอดขาย</Text>
            <Text style={styles.menuDesc}>ดูสถิติและสรุปยอดขาย</Text>
          </TouchableOpacity>

          {/* ปุ่มเปิดตั้งค่าการรับเงิน */}
          <TouchableOpacity 
            style={styles.menuCard}
            activeOpacity={0.7}
            onPress={() => setCurrentView('payment')}
          >
            <View style={styles.menuIconWrap}>
              <Icon name="card-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.menuTitle}>ตั้งค่าการรับเงิน</Text>
            <Text style={styles.menuDesc}>พร้อมเพย์ บัญชีธนาคาร และภาษี</Text>
          </TouchableOpacity>

          {/* ปุ่มเปิดระบบสมาชิกและประวัติลูกค้า */}
          <TouchableOpacity 
            style={styles.menuCard}
            activeOpacity={0.7}
            onPress={() => setCurrentView('customers')}
          >
            <View style={styles.menuIconWrap}>
              <Icon name="people-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.menuTitle}>สมาชิกของร้าน</Text>
            <Text style={styles.menuDesc}>ประวัติยอดซื้อและจำนวนครั้งลูกค้า</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
  },
  backBtnText: { color: colors.primary, fontWeight: '600', fontSize: fontSize.md, marginLeft: 2 },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, maxWidth: '50%' },
  container: { padding: spacing.xl },
  storeCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
    ...shadow.raised,
  },
  storeBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  storeBadge: { color: colors.primaryBorder, fontSize: fontSize.sm, fontWeight: '600', marginLeft: 6 },
  storeTitle: { color: colors.textOnPrimary, fontSize: fontSize.xl + 2, fontWeight: '700', marginBottom: 4 },
  storeSubtext: { color: colors.successSoft, fontSize: fontSize.sm },
  sectionTitle: { fontSize: fontSize.lg + 2, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  menuCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  menuIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  menuTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: 4 },
  menuDesc: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 17 },
});
