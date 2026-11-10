import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import Icon from '../theme/Icon';
import { colors, spacing, radius, fontSize, shadow } from '../theme';

export default function QRScannerModal({ visible, onClose, onScanSuccess }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const scannedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      setScanned(false);

      const getCameraPermissions = async () => {
        try {
          const { status } = await Camera.requestCameraPermissionsAsync();
          if (isMountedRef.current) {
            setHasPermission(status === 'granted');
          }
        } catch (err) {
          console.warn('Camera permission error:', err);
          if (isMountedRef.current) {
            setHasPermission(false);
          }
        }
      };

      getCameraPermissions();
    } else {
      scannedRef.current = false;
      setScanned(false);
    }
  }, [visible]);

  const handleBarcodeScanned = ({ data }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    if (isMountedRef.current) {
      setScanned(true);
    }
    if (onScanSuccess) {
      onScanSuccess(data);
    }
    if (onClose) {
      onClose();
    }
  };

  if (!visible) return null;

  if (hasPermission === null) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.permissionText, { marginTop: 16 }]}>กำลังเปิดใช้งานกล้อง...</Text>
        </View>
      </Modal>
    );
  }

  if (hasPermission === false) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.centerContainer}>
          <View style={styles.permissionCard}>
            <View style={styles.permissionIcon}>
              <Icon name="camera-outline" size={32} color={colors.textFaint} />
            </View>
            <Text style={styles.permissionText}>ต้องอนุญาตให้เข้าถึงกล้องเพื่อสแกน QR Code</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>ปิดหน้าต่าง</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.scanText}>สแกน QR Code ประจำโต๊ะ</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Icon name="close" size={18} color={colors.textOnPrimary} />
            <Text style={styles.closeBtnText}>ยกเลิก</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    ...shadow.card,
  },
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  permissionText: {
    color: colors.text,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  primaryBtn: {
    height: 46,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  scanFrame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
  },
  scanText: { color: colors.textOnPrimary, fontSize: fontSize.lg, fontWeight: '700', marginTop: spacing.xl },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    marginTop: 30,
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  closeBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700', marginLeft: 6 },
});
