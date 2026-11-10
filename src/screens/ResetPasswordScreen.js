// ResetPasswordScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { supabase } from "../lib/supabase";
import Icon from "../theme/Icon";
import { colors, spacing, radius, fontSize, shadow } from "../theme";

const getResetErrorMessageTH = (error) => {
  if (!error || !error.message) return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
  const msg = error.message.toLowerCase();

  if (msg.includes("different from the old password") || msg.includes("same_password")) {
    return "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิมที่คุณเคยใช้";
  }
  if (msg.includes("password should be at least")) {
    return "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร";
  }
  if (msg.includes("session missing") || msg.includes("expired") || msg.includes("invalid")) {
    return "ลิงก์รีเซ็ตรหัสผ่านหมดอายุแล้ว กรุณากดขอลิงก์ใหม่อีกครั้ง";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "มีการทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
  }
  return error.message;
};

export default function ResetPasswordScreen({ onComplete }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // 'new' | 'confirm' | null
  const [loading, setLoading] = useState(false);

  const confirmRef = useRef(null);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showAlert = (title, message, onPress) => {
    if (!isMountedRef.current) return;
    if (Platform.OS === "web") {
      alert(`${title}\n\n${message}`);
      if (onPress) onPress();
    } else {
      Alert.alert(title, message, [
        { text: "ตกลง", onPress: () => onPress && onPress() },
      ]);
    }
  };

  const handleUpdatePassword = async () => {
    if (isSubmittingRef.current) return;
    if (!newPassword || !confirmPassword) {
      return showAlert("กรุณากรอกข้อมูล", "กรุณากรอกรหัสผ่านใหม่ให้ครบถ้วน");
    }
    if (newPassword.length < 6) {
      return showAlert(
        "รหัสผ่านสั้นเกินไป",
        "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร"
      );
    }
    if (newPassword !== confirmPassword) {
      return showAlert("รหัสผ่านไม่ตรงกัน", "กรุณาตรวจสอบรหัสผ่านใหม่อีกครั้ง");
    }

    try {
      isSubmittingRef.current = true;
      if (isMountedRef.current) setLoading(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      showAlert(
        "สำเร็จ",
        "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่",
        () => onComplete && onComplete()
      );
    } catch (error) {
      showAlert("เกิดข้อผิดพลาด", getResetErrorMessageTH(error));
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const isNewFocused = focusedField === "new";
  const isConfirmFocused = focusedField === "confirm";

  return (
    <View style={styles.root}>
      {/* ปุ่มยกเลิกมุมซ้ายบน */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topLeftBackBtn}
          onPress={() => onComplete && onComplete()}
          activeOpacity={0.75}
        >
          <Icon name="chevron-back" size={18} color={colors.textSecondary} />
          <Text style={styles.topLeftBackText}>กลับไปหน้าเข้าสู่ระบบ</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollCenter}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          {/* ส่วนหัวโลโก้เหมือนหน้า LoginScreen */}
          <View style={styles.brandHeader}>
            <View style={styles.brandLogoBox}>
              <Icon name="restaurant-outline" size={36} color="#FFFFFF" />
            </View>
            <Text style={styles.brandTitle}>BuddyPOS</Text>
            <Text style={styles.brandSub}>ตั้งรหัสผ่านใหม่สำหรับบัญชีเจ้าของร้าน</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.headerBox}>
              <Text style={styles.title}>ตั้งรหัสผ่านใหม่</Text>
              <Text style={styles.subtitle}>
                กำหนดรหัสผ่านใหม่ที่มีความยาวอย่างน้อย 6 ตัวอักษร
              </Text>
            </View>

            <View style={styles.formWrap}>
              {/* ช่องรหัสผ่านใหม่ */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, isNewFocused && styles.fieldLabelFocused]}>
                  รหัสผ่านใหม่
                </Text>
                <View style={[styles.inputBox, isNewFocused && styles.inputBoxFocused]}>
                  <View style={[styles.iconBadge, isNewFocused && styles.iconBadgeFocused]}>
                    <Icon
                      name="lock-closed-outline"
                      size={18}
                      color={isNewFocused ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    placeholderTextColor={colors.textFaint}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    onFocus={() => setFocusedField("new")}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showPassword}
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                  />
                  <TouchableOpacity
                    style={styles.eyeTouch}
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                  >
                    <Icon
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={showPassword ? colors.primary : colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* ช่องยืนยันรหัสผ่านใหม่ */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, isConfirmFocused && styles.fieldLabelFocused]}>
                  ยืนยันรหัสผ่านใหม่
                </Text>
                <View style={[styles.inputBox, isConfirmFocused && styles.inputBoxFocused]}>
                  <View style={[styles.iconBadge, isConfirmFocused && styles.iconBadgeFocused]}>
                    <Icon
                      name="shield-checkmark-outline"
                      size={18}
                      color={isConfirmFocused ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <TextInput
                    ref={confirmRef}
                    style={styles.textInput}
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                    placeholderTextColor={colors.textFaint}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleUpdatePassword}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleUpdatePassword}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>บันทึกรหัสผ่านใหม่</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    width: "100%",
    paddingHorizontal: spacing.xl,
    paddingTop: 16,
    paddingBottom: 4,
    alignItems: "flex-start",
  },
  topLeftBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 10,
    paddingRight: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    ...shadow.sm,
  },
  topLeftBackText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginLeft: 4,
  },
  container: {
    flex: 1,
  },
  scrollCenter: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: 8,
    paddingBottom: 48,
  },
  inner: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  brandHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  brandLogoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    ...shadow.raised,
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  brandSub: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: "center",
  },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 26,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  headerBox: {
    alignItems: "center",
    marginBottom: 22,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  formWrap: {
    width: "100%",
  },
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 8,
  },
  fieldLabelFocused: {
    color: colors.primary,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  inputBoxFocused: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.primary,
    ...Platform.select({
      web: {
        boxShadow: "0 0 0 3px rgba(5, 150, 105, 0.12)",
      },
      default: {},
    }),
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.borderLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  iconBadgeFocused: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  textInput: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      },
      default: {},
    }),
  },
  eyeTouch: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  submitBtn: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    ...shadow.sm,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
