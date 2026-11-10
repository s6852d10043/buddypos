// src/screens/PaymentSettingsScreen.js
import React, { useState, useEffect, useRef } from 'react';
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
  KeyboardAvoidingView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

const COMMON_BANKS = [
  'กสิกรไทย (KBANK)',
  'ไทยพาณิชย์ (SCB)',
  'กรุงเทพ (BBL)',
  'กรุงไทย (KTB)',
  'กรุงศรีฯ (BAY)',
  'ทหารไทยธนชาต (TTB)',
  'ออมสิน (GSB)',
];

export default function PaymentSettingsScreen({ store, onBack }) {
  const restaurantId = store?.restaurantId || store?.id;
  const storeName = store?.restaurantName || store?.name || 'ร้านค้าของคุณ';

  const isMountedRef = useRef(true);
  const isSavingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // PromptPay State
  const [promptpayType, setPromptpayType] = useState('phone'); // 'phone' | 'national_id'
  const [promptpayId, setPromptpayId] = useState('');
  const [promptpayName, setPromptpayName] = useState('');

  // Bank Transfer State
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  // VAT & Service Charge State
  const [vatRate, setVatRate] = useState('0');
  const [serviceChargeRate, setServiceChargeRate] = useState('0');

  useEffect(() => {
    isMountedRef.current = true;
    if (restaurantId) {
      loadSettings();
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

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('restaurants')
        .select(
          'promptpay_id, promptpay_type, promptpay_name, bank_name, bank_account_no, bank_account_name, vat_rate, service_charge_rate'
        )
        .eq('id', restaurantId)
        .single();

      if (error) throw error;

      if (isMountedRef.current && data) {
        setPromptpayId(data.promptpay_id || '');
        setPromptpayType(data.promptpay_type || 'phone');
        setPromptpayName(data.promptpay_name || '');
        setBankName(data.bank_name || '');
        setBankAccountNo(data.bank_account_no || '');
        setBankAccountName(data.bank_account_name || '');
        setVatRate(data.vat_rate !== null && data.vat_rate !== undefined ? String(data.vat_rate) : '0');
        setServiceChargeRate(
          data.service_charge_rate !== null && data.service_charge_rate !== undefined
            ? String(data.service_charge_rate)
            : '0'
        );
      }
    } catch (err) {
      console.warn('Load payment settings error:', err.message);
      if (isMountedRef.current) {
        showNotice('แจ้งเตือน', 'ไม่สามารถโหลดข้อมูลการตั้งค่าได้: ' + err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const cleanNumeric = (val) => (val || '').replace(/[^0-9]/g, '');

  const validateInputs = () => {
    const cleanId = cleanNumeric(promptpayId);
    if (cleanId.length > 0) {
      if (promptpayType === 'phone') {
        if (cleanId.length !== 10 || !cleanId.startsWith('0')) {
          showNotice('ข้อมูลไม่ถูกต้อง', 'หมายเลขพร้อมเพย์เบอร์โทรศัพท์ต้องมี 10 หลักและขึ้นต้นด้วย 0 (เช่น 0812345678)');
          return false;
        }
      } else if (promptpayType === 'national_id') {
        if (cleanId.length !== 13) {
          showNotice('ข้อมูลไม่ถูกต้อง', 'หมายเลขพร้อมเพย์เลขประจำตัวประชาชน/เลขนิติบุคคลต้องมี 13 หลัก');
          return false;
        }
      }
    }

    const numVat = parseFloat(vatRate);
    if (isNaN(numVat) || numVat < 0 || numVat > 100) {
      showNotice('ข้อมูลไม่ถูกต้อง', 'อัตราภาษีมูลค่าเพิ่ม (VAT) ต้องเป็นตัวเลขระหว่าง 0 - 100%');
      return false;
    }

    const numService = parseFloat(serviceChargeRate);
    if (isNaN(numService) || numService < 0 || numService > 100) {
      showNotice('ข้อมูลไม่ถูกต้อง', 'อัตราค่าบริการ (Service Charge) ต้องเป็นตัวเลขระหว่าง 0 - 100%');
      return false;
    }

    return true;
  };

  const handleSaveSettings = async () => {
    if (isSavingRef.current) return;
    if (!validateInputs()) return;

    try {
      isSavingRef.current = true;
      if (isMountedRef.current) setSaving(true);

      const cleanId = cleanNumeric(promptpayId);
      const cleanAccountNo = cleanNumeric(bankAccountNo);
      const numVat = parseFloat(vatRate) || 0;
      const numService = parseFloat(serviceChargeRate) || 0;

      const payload = {
        promptpay_id: cleanId.length > 0 ? cleanId : null,
        promptpay_type: promptpayType,
        promptpay_name: promptpayName.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account_no: cleanAccountNo.length > 0 ? cleanAccountNo : null,
        bank_account_name: bankAccountName.trim() || null,
        vat_rate: numVat,
        service_charge_rate: numService,
      };

      const { error } = await supabase
        .from('restaurants')
        .update(payload)
        .eq('id', restaurantId);

      if (error) throw error;

      if (isMountedRef.current) {
        showNotice('สำเร็จ', 'บันทึกการตั้งค่าการรับเงินเรียบร้อยแล้ว');
      }
    } catch (err) {
      if (isMountedRef.current) {
        showNotice('เกิดข้อผิดพลาด', err.message);
      }
    } finally {
      isSavingRef.current = false;
      if (isMountedRef.current) setSaving(false);
    }
  };

  const formatPromptPayDisplay = () => {
    const clean = cleanNumeric(promptpayId);
    if (!clean) return 'ยังไม่ได้ระบุ';
    if (promptpayType === 'phone' && clean.length === 10) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    if (promptpayType === 'national_id' && clean.length === 13) {
      return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`;
    }
    return clean;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
            <Icon name="chevron-back" size={18} color={colors.primary} />
            <Text style={styles.backBtnText}>ย้อนกลับ</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ตั้งค่าการรับเงิน</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>กำลังโหลดการตั้งค่า...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
            <Icon name="chevron-back" size={18} color={colors.primary} />
            <Text style={styles.backBtnText}>กลับ Dashboard</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>ตั้งค่าการรับเงิน</Text>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          {/* Card: ข้อมูลร้าน */}
          <View style={styles.infoBanner}>
            <Icon name="card-outline" size={24} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.infoBannerTitle}>{storeName}</Text>
              <Text style={styles.infoBannerDesc}>
                ตั้งค่าช่องทางรับเงินเพื่อให้ระบบ POS สร้าง QR Code พร้อมเพย์มาตรฐาน และคำนวณบิลได้ถูกต้อง
              </Text>
            </View>
          </View>

          {/* Section 1: บัญชีพร้อมเพย์ (PromptPay) */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="qr-code-outline" size={20} color={colors.primary} />
              <Text style={styles.cardTitle}>บัญชีพร้อมเพย์ (PromptPay QR)</Text>
            </View>
            <Text style={styles.cardDesc}>
              ข้อมูลนี้จะใช้สร้าง Dynamic QR Code ตามมาตรฐาน EMVCo ให้ลูกค้าสแกนจ่ายผ่านแอปธนาคารได้ทุกธนาคาร
            </Text>

            {/* ประเภทพร้อมเพย์ */}
            <Text style={styles.inputLabel}>ประเภทพร้อมเพย์:</Text>
            <View style={styles.typeSelectorRow}>
              <TouchableOpacity
                style={[styles.typeBtn, promptpayType === 'phone' && styles.typeBtnActive]}
                onPress={() => setPromptpayType('phone')}
                activeOpacity={0.7}
              >
                <Icon
                  name="call-outline"
                  size={16}
                  color={promptpayType === 'phone' ? colors.textOnPrimary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.typeBtnText,
                    promptpayType === 'phone' && styles.typeBtnTextActive,
                  ]}
                >
                  เบอร์โทรศัพท์ (10 หลัก)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeBtn, promptpayType === 'national_id' && styles.typeBtnActive]}
                onPress={() => setPromptpayType('national_id')}
                activeOpacity={0.7}
              >
                <Icon
                  name="id-card-outline"
                  size={16}
                  color={promptpayType === 'national_id' ? colors.textOnPrimary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.typeBtnText,
                    promptpayType === 'national_id' && styles.typeBtnTextActive,
                  ]}
                >
                  บัตร ปชช. / นิติบุคคล (13 หลัก)
                </Text>
              </TouchableOpacity>
            </View>

            {/* ช่องกรอกเลขพร้อมเพย์ */}
            <Text style={styles.inputLabel}>
              {promptpayType === 'phone'
                ? 'เบอร์โทรศัพท์ที่ผูกพร้อมเพย์:'
                : 'เลขประจำตัวประชาชน หรือ เลขประจำตัวผู้เสียภาษี (13 หลัก):'}
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder={promptpayType === 'phone' ? 'ตัวอย่าง: 0812345678' : 'ตัวอย่าง: 1234567890123'}
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              maxLength={promptpayType === 'phone' ? 10 : 13}
              value={promptpayId}
              onChangeText={setPromptpayId}
            />

            {/* ช่องกรอกชื่อบัญชีพร้อมเพย์ */}
            <Text style={styles.inputLabel}>ชื่อบัญชี / ชื่อร้านค้า (สำหรับแสดงบนหน้าจอเช็กบิล):</Text>
            <TextInput
              style={styles.textInput}
              placeholder="ตัวอย่าง: ร้านบัดดี้ คาเฟ่ หรือ นายสมชาย ใจดี"
              placeholderTextColor={colors.textFaint}
              value={promptpayName}
              onChangeText={setPromptpayName}
            />
          </View>

          {/* Section 2: ข้อมูลบัญชีธนาคาร (ทางเลือกเสริม) */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="business-outline" size={20} color={colors.primary} />
              <Text style={styles.cardTitle}>ข้อมูลบัญชีธนาคาร (โอนผ่านเลขบัญชี)</Text>
            </View>
            <Text style={styles.cardDesc}>
              ระบุเพื่อเป็นข้อมูลสำรองกรณีลูกค้าต้องการโอนเงินผ่านเลขที่บัญชีโดยตรง
            </Text>

            {/* ปุ่มลัดเลือกธนาคาร */}
            <Text style={styles.inputLabel}>เลือกธนาคาร:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankChipScroll}>
              {COMMON_BANKS.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.bankChip, bankName === b && styles.bankChipActive]}
                  onPress={() => setBankName(b)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.bankChipText,
                      bankName === b && styles.bankChipTextActive,
                    ]}
                  >
                    {b}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[styles.textInput, { marginTop: spacing.sm }]}
              placeholder="หรือพิมพ์ชื่อธนาคารอื่น ๆ"
              placeholderTextColor={colors.textFaint}
              value={bankName}
              onChangeText={setBankName}
            />

            <Text style={styles.inputLabel}>เลขที่บัญชีธนาคาร:</Text>
            <TextInput
              style={styles.textInput}
              placeholder="ตัวอย่าง: 0123456789 (เฉพาะตัวเลข)"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              value={bankAccountNo}
              onChangeText={setBankAccountNo}
            />

            <Text style={styles.inputLabel}>ชื่อเจ้าของบัญชี:</Text>
            <TextInput
              style={styles.textInput}
              placeholder="ตัวอย่าง: บจก. บัดดี้ฟู้ดส์"
              placeholderTextColor={colors.textFaint}
              value={bankAccountName}
              onChangeText={setBankAccountName}
            />
          </View>

          {/* Section 3: ภาษีและค่าบริการ */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="receipt-outline" size={20} color={colors.primary} />
              <Text style={styles.cardTitle}>ภาษีมูลค่าเพิ่ม & ค่าบริการ (VAT & Service Charge)</Text>
            </View>
            <Text style={styles.cardDesc}>
              ระบบจะคำนวณเพิ่มในยอดรวมของบิลตามอัตราเปอร์เซ็นต์ที่ระบุ (หากไม่ต้องการคิด ให้ใส่ 0)
            </Text>

            <View style={styles.taxRow}>
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={styles.inputLabel}>ภาษีมูลค่าเพิ่ม (VAT %):</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="0 หรือ 7"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="numeric"
                  value={vatRate}
                  onChangeText={setVatRate}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>ค่าบริการ (Service Charge %):</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="0 หรือ 10"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="numeric"
                  value={serviceChargeRate}
                  onChangeText={setServiceChargeRate}
                />
              </View>
            </View>
          </View>

          {/* Section 4: การ์ดแสดงผลพรีวิวตัวอย่าง */}
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>ตัวอย่างข้อมูลชำระเงินที่ลูกค้าจะเห็น</Text>
            <View style={styles.previewContent}>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>พร้อมเพย์:</Text>
                <Text style={styles.previewVal}>{formatPromptPayDisplay()}</Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>ชื่อบัญชี:</Text>
                <Text style={styles.previewVal}>{promptpayName || 'ยังไม่ได้ระบุ'}</Text>
              </View>
              {bankName ? (
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>บัญชีธนาคาร:</Text>
                  <Text style={styles.previewVal}>
                    {bankName} {bankAccountNo ? `(${bankAccountNo})` : ''}
                  </Text>
                </View>
              ) : null}
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>ภาษี & บริการ:</Text>
                <Text style={styles.previewVal}>
                  VAT {vatRate || 0}% | Service {serviceChargeRate || 0}%
                </Text>
              </View>
            </View>
          </View>

          {/* ปุ่มบันทึกข้อมูล */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            activeOpacity={0.8}
            onPress={handleSaveSettings}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <>
                <Icon name="checkmark-circle-outline" size={20} color={colors.textOnPrimary} />
                <Text style={styles.saveBtnText}>บันทึกการตั้งค่า</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: spacing.sm,
  },
  backBtnText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  infoBannerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  infoBannerDesc: {
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    marginTop: 2,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginLeft: spacing.xs,
  },
  cardDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginRight: spacing.xs,
  },
  typeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 4,
  },
  typeBtnTextActive: {
    color: colors.textOnPrimary,
  },
  bankChipScroll: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  bankChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginRight: spacing.xs,
  },
  bankChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  bankChipText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  bankChipTextActive: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  taxRow: {
    flexDirection: 'row',
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
  },
  previewTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: spacing.sm,
  },
  previewContent: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  previewLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  previewVal: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    ...shadow.md,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textOnPrimary,
    marginLeft: spacing.xs,
  },
});
