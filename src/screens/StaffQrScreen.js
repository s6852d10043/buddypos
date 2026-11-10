// src/screens/StaffQrScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

const createRandomToken = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return (
    Math.random().toString(36).substring(2, 12) +
    '-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).substring(2, 10)
  );
};

export default function StaffQrScreen({ store, onBack }) {
  const restaurantId = store?.id || store?.restaurantId;
  const [restaurantName, setRestaurantName] = useState(
    store?.name || store?.restaurantName || 'ร้านค้าของคุณ'
  );
  const [storeLogoUrl, setStoreLogoUrl] = useState(store?.image_url || null);

  const buildStaffLink = (token) => {
    const baseUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://buddypos-beta.vercel.app';
    return `${baseUrl}?store_id=${restaurantId || ''}&staff_token=${token}`;
  };

  const [staffToken, setStaffToken] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [qrRef, setQrRef] = useState(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  // Synchronous locks & lifecycle guards
  const isMountedRef = useRef(true);
  const isRegeneratingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchCurrentStaffToken();
  }, [restaurantId]);

  // ดึง staff_token และ image_url ปัจจุบันของร้านจากฐานข้อมูล
  const fetchCurrentStaffToken = async () => {
    if (!restaurantId) {
      if (isMountedRef.current) setLoadingToken(false);
      return;
    }
    try {
      setLoadingToken(true);
      const { data, error } = await supabase
        .from('restaurants')
        .select('name, image_url, staff_token')
        .eq('id', restaurantId)
        .maybeSingle();

      if (error) throw error;
      if (!isMountedRef.current) return;

      if (data?.name) setRestaurantName(data.name);
      if (data?.image_url !== undefined) setStoreLogoUrl(data.image_url || null);

      let activeToken = data?.staff_token;
      if (!activeToken) {
        activeToken = createRandomToken();
        await supabase
          .from('restaurants')
          .update({ staff_token: activeToken })
          .eq('id', restaurantId);
      }

      if (!isMountedRef.current) return;
      setStaffToken(activeToken);
      setQrUrl(buildStaffLink(activeToken));
    } catch (err) {
      console.error('Fetch staff token error:', err);
      if (isMountedRef.current) {
        const fallbackToken = createRandomToken();
        setStaffToken(fallbackToken);
        setQrUrl(buildStaffLink(fallbackToken));
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingToken(false);
      }
    }
  };

  // 1. ฟังก์ชันคัดลอกลิงก์ไปยัง Clipboard
  const handleCopyLink = async () => {
    if (!qrUrl) return;

    try {
      if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(qrUrl);
      } else {
        await Clipboard.setStringAsync(qrUrl);
      }

      const msg = 'คัดลอกลิงก์ QR Code เรียบร้อยแล้ว!';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('สำเร็จ', msg);
    } catch (error) {
      console.error('Copy Error:', error);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถคัดลอกลิงก์ได้');
    }
  };

  // Helper โหลดรูปภาพบน Web Canvas
  const loadWebImage = (src) =>
    new Promise((resolve) => {
      if (!src || typeof window === 'undefined') return resolve(null);
      const img = new window.Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  // 2. ฟังก์ชันสร้างรูปภาพที่มีข้อความ + รูปร้าน + QR Code รวมกัน (Canvas)
  const generateCombinedImageBase64 = async (qrBase64) => {
    if (Platform.OS !== 'web' && typeof document === 'undefined') {
      return `data:image/png;base64,${qrBase64}`;
    }

    const qrImg = await loadWebImage(`data:image/png;base64,${qrBase64}`);
    const logoImg = storeLogoUrl ? await loadWebImage(storeLogoUrl) : null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const padding = 40;
    const qrSize = 280;
    const headerHeight = 110;

    canvas.width = qrSize + padding * 2;
    canvas.height = qrSize + headerHeight + padding * 2;

    // พื้นหลังสีขาว
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // หัวข้อและชื่อร้าน
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 21px Prompt, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QR Code เข้าใช้งานพนักงาน', canvas.width / 2, padding + 26);

    ctx.fillStyle = '#475569';
    ctx.font = '16px Prompt, sans-serif';
    ctx.fillText(`ร้าน: ${restaurantName}`, canvas.width / 2, padding + 58);

    // กรอบ QR Code
    const qrX = padding;
    const qrY = padding + headerHeight - 16;
    const boxSize = qrSize;
    const boxRadius = 16;

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(qrX, qrY, boxSize, boxSize, boxRadius);
    ctx.stroke();

    if (qrImg) {
      ctx.drawImage(qrImg, qrX + 12, qrY + 12, boxSize - 24, boxSize - 24);
    }

    // วาดโลโก้ร้านตรงกลาง QR (เมื่อร้านมีรูปภาพ)
    if (logoImg) {
      const centerLogoSize = 54;
      const centerBoxSize = centerLogoSize + 10;
      const centerX = qrX + (boxSize - centerBoxSize) / 2;
      const centerY = qrY + (boxSize - centerBoxSize) / 2;

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(centerX, centerY, centerBoxSize, centerBoxSize, 14);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(centerX + 5, centerY + 5, centerLogoSize, centerLogoSize, 10);
      ctx.clip();
      ctx.drawImage(logoImg, centerX + 5, centerY + 5, centerLogoSize, centerLogoSize);
      ctx.restore();
    }

    return canvas.toDataURL('image/png');
  };

  // 3. ฟังก์ชันยืนยันเปลี่ยน QR Code และอัปเดตลงฐานข้อมูลทันที
  const confirmRegenerateQR = async () => {
    if (isRegeneratingRef.current) return;

    try {
      isRegeneratingRef.current = true;
      setRegenerating(true);
      const newToken = createRandomToken();

      const { error } = await supabase
        .from('restaurants')
        .update({ staff_token: newToken })
        .eq('id', restaurantId);

      if (error) throw error;

      if (isMountedRef.current) {
        setStaffToken(newToken);
        setQrUrl(buildStaffLink(newToken));
        setConfirmModalVisible(false);
      }

      const msg =
        'สร้างลิงก์และ QR Code พนักงานชุดใหม่เรียบร้อยแล้ว!\n(QR Code ชุดเดิมถูกยกเลิก และพนักงานที่เปิดจอค้างไว้จะต้องสแกนใหม่)';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('สำเร็จ', msg);
    } catch (err) {
      console.error('Regenerate staff QR error:', err);
      const errMsg = err.message || 'ไม่สามารถเปลี่ยน QR Code ได้';
      if (Platform.OS === 'web') alert(errMsg);
      else Alert.alert('เกิดข้อผิดพลาด', errMsg);
    } finally {
      isRegeneratingRef.current = false;
      if (isMountedRef.current) {
        setRegenerating(false);
      }
    }
  };

  // 4. ฟังก์ชันดาวน์โหลด/บันทึกรูป
  const handleDownloadQR = () => {
    if (!qrRef) return;

    qrRef.toDataURL(async (dataURL) => {
      const finalImageBase64 = await generateCombinedImageBase64(dataURL);

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = finalImageBase64;
        link.download = `QR_Staff_${restaurantName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        try {
          await Sharing.shareAsync(finalImageBase64, {
            mimeType: 'image/png',
            dialogTitle: `บันทึก QR พนักงาน - ${restaurantName}`,
          });
        } catch (error) {
          console.error('Save QR Error:', error);
          Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกรูปภาพได้');
        }
      }
    });
  };

  // 5. ฟังก์ชันสั่งพิมพ์รูป
  const handlePrintQR = () => {
    if (!qrRef) return;

    qrRef.toDataURL(async (dataURL) => {
      const finalImageBase64 = await generateCombinedImageBase64(dataURL);

      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <html>
            <head>
              <title>พิมพ์ QR Code - ${restaurantName}</title>
              <style>
                body {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background-color: #ffffff;
                }
                img {
                  max-width: 90%;
                  height: auto;
                }
              </style>
            </head>
            <body>
              <img src="${finalImageBase64}" />
              <script>
                window.onload = function() {
                  window.print();
                  window.close();
                }
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        handleDownloadQR();
      }
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Icon name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>กลับหน้าแดชบอร์ด</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>QR พนักงาน</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.storeBadgeWrap}>
            <Icon name="qr-code-outline" size={14} color={colors.primary} />
            <Text style={styles.storeBadge}>พนักงาน / Staff Access</Text>
          </View>

          <Text style={styles.mainTitle}>QR Code เข้าใช้งานพนักงาน</Text>
          <Text style={styles.subTitle}>ร้าน: {restaurantName}</Text>

          {/* กรอบแสดง QR Code */}
          <View style={styles.qrContainer}>
            {loadingToken ? (
              <View style={styles.qrLoadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <View style={styles.qrInnerWrap}>
                <QRCode
                  value={qrUrl || 'https://buddypos.com'}
                  size={220}
                  ecl="H"
                  color={colors.primaryDeep}
                  backgroundColor={colors.surface}
                  getRef={(c) => setQrRef(c)}
                />
                {storeLogoUrl && (
                  <View style={styles.qrCenterLogoBadge}>
                    <Image source={{ uri: storeLogoUrl }} style={styles.qrCenterLogoImg} />
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ปุ่มสร้าง ลิงก์ & QR ใหม่ */}
          <TouchableOpacity
            style={styles.generateBtn}
            onPress={() => setConfirmModalVisible(true)}
            disabled={loadingToken || regenerating}
            activeOpacity={0.8}
          >
            <Icon name="refresh-outline" size={16} color={colors.primary} />
            <Text style={styles.generateBtnText}>สร้างลิงก์ & QR Code ใหม่</Text>
          </TouchableOpacity>

          {/* ช่องแสดง ลิงก์ / URL + ปุ่มคัดลอก */}
          <View style={styles.inputBox}>
            <View style={styles.inputHeaderRow}>
              <View style={styles.inputLabelRow}>
                <Icon name="link-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.inputLabel}>ลิงก์ QR Code ปัจจุบัน:</Text>
              </View>
              <TouchableOpacity onPress={handleCopyLink} style={styles.copyBtnHeader} activeOpacity={0.7}>
                <Icon name="copy-outline" size={14} color={colors.primary} />
                <Text style={styles.copyLinkBtnText}>คัดลอกลิงก์</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              value={qrUrl}
              editable={false}
              placeholder="กำลังโหลดลิงก์..."
              placeholderTextColor={colors.textFaint}
              multiline
            />
          </View>

          {/* ปุ่ม Action (บันทึกรูป & พิมพ์) */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btn, styles.downloadBtn]}
              onPress={handleDownloadQR}
              disabled={loadingToken}
              activeOpacity={0.85}
            >
              <Icon name="download-outline" size={18} color={colors.textOnPrimary} />
              <Text style={styles.btnText}>บันทึกรูป QR</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.printBtn]}
              onPress={handlePrintQR}
              disabled={loadingToken}
              activeOpacity={0.85}
            >
              <Icon name="print-outline" size={18} color={colors.textOnPrimary} />
              <Text style={styles.btnText}>พิมพ์เอกสาร</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* คำแนะนำการใช้งาน */}
        <View style={styles.instructionCard}>
          <View style={styles.instructionTitleRow}>
            <Icon name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.instructionTitle}>วิธีการใช้งาน</Text>
          </View>
          <Text style={styles.instructionText}>
            1. กดปุ่ม "คัดลอกลิงก์" เพื่อส่งลิงก์เข้าใช้งานให้พนักงานโดยตรง
          </Text>
          <Text style={styles.instructionText}>
            2. กดปุ่ม "สร้างลิงก์ & QR Code ใหม่" เมื่อต้องการยกเลิกทางเข้าเดิม (พนักงานทุกคนจะถูกตัดออกจากระบบและต้องสแกนใหม่)
          </Text>
          <Text style={styles.instructionText}>
            3. กดปุ่ม "บันทึกรูป QR" รูปภาพที่ได้จะมีหัวข้อ ชื่อร้านค้า และโลโก้ร้าน (ถ้าร้านมีรูป) รวมอยู่ด้วย
          </Text>
        </View>
      </ScrollView>

      {/* โมดอลยืนยันการเปลี่ยน QR Code พนักงานใหม่ */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Icon name="refresh-outline" size={28} color={colors.warning} />
            </View>
            <Text style={styles.modalTitle}>ยืนยันการเปลี่ยน QR Code ใหม่</Text>
            <Text style={styles.modalDesc}>
              เมื่อสร้าง QR Code ชุดใหม่ ลิงก์และ QR Code ชุดเดิมจะไม่สามารถใช้งานได้อีก และพนักงานที่เข้าสู่ระบบไว้แล้วจะถูกให้ออกจากระบบเพื่อสแกนใหม่ทั้งหมด
            </Text>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setConfirmModalVisible(false)}
                disabled={regenerating}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmRegenerateQR}
                disabled={regenerating}
                activeOpacity={0.85}
              >
                {regenerating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>ยืนยันเปลี่ยน QR</Text>
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
    backgroundColor: colors.bg,
  },
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
  backBtnText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: fontSize.md,
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  container: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  logoModeBar: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 8,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoModeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 6,
    textAlign: 'center',
  },
  logoModeTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  logoModeTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoModeTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  logoModeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  logoModeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topStoreLogo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storeBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  storeBadge: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginLeft: 6,
  },
  mainTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  subTitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  qrContainer: {
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  qrInnerWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCenterLogoBadge: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  qrCenterLogoImg: {
    width: 44,
    height: 44,
    borderRadius: 9,
  },
  qrLoadingBox: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
  },
  generateBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: fontSize.sm + 1,
    marginLeft: 6,
  },
  inputBox: {
    width: '100%',
    backgroundColor: colors.bg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: 4,
  },
  copyBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  copyLinkBtnText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
    marginLeft: 4,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    padding: 10,
    fontSize: fontSize.sm,
    color: colors.text,
    maxHeight: 70,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  btn: {
    flex: 0.48,
    flexDirection: 'row',
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtn: {
    backgroundColor: colors.primary,
  },
  printBtn: {
    backgroundColor: colors.info,
  },
  btnText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginLeft: 6,
  },
  instructionCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.infoBorder,
  },
  instructionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  instructionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.info,
    marginLeft: 6,
  },
  instructionText: {
    fontSize: fontSize.sm + 1,
    color: colors.info,
    lineHeight: 20,
    marginBottom: 4,
  },

  /* Modal ยืนยัน */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...shadow.raised,
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.warningSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
    lineHeight: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
