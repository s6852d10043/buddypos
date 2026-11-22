// LoginScreen.js
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
  Image,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { supabase } from "../lib/supabase";
import Icon from "../theme/Icon";
import { colors, spacing, radius, fontSize, shadow } from "../theme";

WebBrowser.maybeCompleteAuthSession();

const isValidEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());

const getErrorMessageTH = (error) => {
  if (!error || !error.message) return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";

  const msg = error.message.toLowerCase();

  if (msg.includes("invalid login credentials")) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบใหม่อีกครั้ง";
  }
  if (
    msg.includes("user already registered") ||
    msg.includes("already exists")
  ) {
    return "อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น หรือกดเข้าสู่ระบบ";
  }
  if (msg.includes("email not confirmed")) {
    return "กรุณายืนยันตัวตนผ่านลิงก์ในอีเมลของคุณก่อนเข้าสู่ระบบ";
  }
  if (msg.includes("password should be at least")) {
    return "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร";
  }
  if (
    msg.includes("unable to validate email address") ||
    msg.includes("invalid email")
  ) {
    return "รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีเมลของคุณ";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "มีการทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
  }
  if (
    msg.includes("network request failed") ||
    msg.includes("fetch failed")
  ) {
    return "ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาเช็กการเชื่อมต่อ";
  }

  return error.message;
};

export default function LoginScreen({ role, onLoginSuccess, onBack }) {
  const [mode, setMode] = useState("login"); // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // 'email' | 'password' | 'confirm' | null
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showAlert = (title, message) => {
    if (!isMountedRef.current) return;
    if (Platform.OS === "web") {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // สลับโหมดพร้อมล้างรหัสผ่านที่ค้างอยู่
  const switchMode = (nextMode) => {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setFocusedField(null);
  };

  const handleLogin = async () => {
    if (isSubmittingRef.current) return;
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      return showAlert(
        "กรุณากรอกข้อมูล",
        "กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน"
      );
    }
    if (!isValidEmail(cleanEmail)) {
      return showAlert(
        "รูปแบบอีเมลไม่ถูกต้อง",
        "กรุณาตรวจสอบรูปแบบอีเมลของคุณ เช่น name@example.com"
      );
    }
    try {
      isSubmittingRef.current = true;
      if (isMountedRef.current) setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;
      if (onLoginSuccess && data.user) {
        onLoginSuccess(data.user);
      }
    } catch (error) {
      showAlert("เข้าสู่ระบบไม่สำเร็จ", getErrorMessageTH(error));
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleGoogleLogin = async () => {
    if (isSubmittingRef.current) return;
    try {
      isSubmittingRef.current = true;
      if (isMountedRef.current) setGoogleLoading(true);

      if (Platform.OS === "web") {
        const googleClientId =
          "557162360041-01pdm14s1kg25pl4qbc4o0qo2lde58o4.apps.googleusercontent.com";
        const isOriginSupported =
          window.location.origin === "https://buddypos-beta.vercel.app" ||
          window.location.origin === "http://localhost:8081";

        if (isOriginSupported && window.crypto?.subtle) {
          const rawBytes = new Uint8Array(16);
          window.crypto.getRandomValues(rawBytes);
          const rawNonce = Array.from(rawBytes, (b) => b.toString(16).padStart(2, "0")).join("");
          const hashBuf = await window.crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(rawNonce)
          );
          const hashedNonce = Array.from(new Uint8Array(hashBuf), (b) =>
            b.toString(16).padStart(2, "0")
          ).join("");

          localStorage.setItem("buddypos_google_nonce", rawNonce);
          if (role === "super_admin") {
            localStorage.setItem("buddypos_google_admin", "1");
          } else {
            localStorage.removeItem("buddypos_google_admin");
          }

          const redirectUri =
            role === "super_admin"
              ? `${window.location.origin}/admin`
              : window.location.origin;

          const googleAuthUrl =
            `https://accounts.google.com/o/oauth2/v2/auth` +
            `?client_id=${encodeURIComponent(googleClientId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=id_token` +
            `&scope=${encodeURIComponent("openid email profile")}` +
            `&nonce=${encodeURIComponent(hashedNonce)}` +
            `&prompt=select_account`;

          window.location.assign(googleAuthUrl);
          return;
        }

        const isWebAdminPath =
          window.location.pathname === "/admin" ||
          window.location.pathname.startsWith("/admin/");
        const targetRedirect =
          role === "super_admin"
            ? isWebAdminPath
              ? `${window.location.origin}/admin`
              : `${window.location.origin}${window.location.pathname}?mode=admin`
            : window.location.origin;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: targetRedirect,
            queryParams: { prompt: "select_account" },
          },
        });
        if (error) throw error;
      } else {
        const redirectUrl = AuthSession.makeRedirectUri({
          scheme: "buddypos",
          path: "auth/callback",
        });

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        });

        if (error) throw error;
        if (!data?.url) throw new Error("ไม่สามารถดึง Authentication URL ได้");

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl,
          { showInRecents: true }
        );

        if (result.type === "success" && result.url) {
          const resUrl = result.url;

          const getParam = (url, param) => {
            const match = url.match(new RegExp(`[#?&]${param}=([^&]*)`));
            return match ? decodeURIComponent(match[1]) : null;
          };

          const accessToken = getParam(resUrl, "access_token");
          const refreshToken = getParam(resUrl, "refresh_token");
          const authCode = getParam(resUrl, "code");

          if (accessToken && refreshToken) {
            const { data: sessionData, error: sessionError } =
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

            if (sessionError) throw sessionError;

            if (onLoginSuccess && sessionData.user) {
              return onLoginSuccess(sessionData.user);
            }
          } else if (authCode) {
            const { data: sessionData, error: sessionError } =
              await supabase.auth.exchangeCodeForSession(authCode);

            if (sessionError) throw sessionError;

            if (onLoginSuccess && sessionData?.user) {
              return onLoginSuccess(sessionData.user);
            }
          }
        }

        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession?.session?.user && onLoginSuccess) {
          return onLoginSuccess(currentSession.session.user);
        }
      }
    } catch (error) {
      console.error("Google Auth Error:", error);
      showAlert("Google Auth Error", getErrorMessageTH(error));
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setGoogleLoading(false);
      }
    }
  };

  const handleRegister = async () => {
    if (isSubmittingRef.current) return;
    const cleanEmail = email.trim();

    if (!cleanEmail || !password || !confirmPassword) {
      return showAlert(
        "กรุณากรอกข้อมูล",
        "กรุณากรอกข้อมูลให้ครบทุกช่อง"
      );
    }
    if (!isValidEmail(cleanEmail)) {
      return showAlert(
        "รูปแบบอีเมลไม่ถูกต้อง",
        "กรุณาตรวจสอบรูปแบบอีเมลของคุณ เช่น name@example.com"
      );
    }
    if (password.length < 6) {
      return showAlert(
        "รหัสผ่านสั้นเกินไป",
        "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร"
      );
    }
    if (password !== confirmPassword) {
      return showAlert(
        "รหัสผ่านไม่ตรงกัน",
        "กรุณาตรวจสอบการยืนยันรหัสผ่านใหม่อีกครั้ง"
      );
    }

    try {
      isSubmittingRef.current = true;
      if (isMountedRef.current) setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
      });

      if (error) throw error;

      // กรณีอีเมลนี้เคยสมัครไว้แล้ว (Supabase คืน identities เป็นอาเรย์ว่าง)
      if (
        data?.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        showAlert(
          "อีเมลนี้ถูกใช้งานแล้ว",
          "อีเมลนี้มีบัญชีอยู่ในระบบแล้ว กรุณากดเข้าสู่ระบบ หรือเข้าสู่ระบบด้วย Google"
        );
        if (isMountedRef.current) switchMode("login");
        return;
      }

      // กรณีปิด Confirm Email ไว้ ระบบจะได้ session และเข้าสู่ระบบให้อัตโนมัติ
      if (data?.session && data?.user) {
        if (onLoginSuccess) onLoginSuccess(data.user);
        return;
      }

      if (data?.user) {
        showAlert(
          "ลงทะเบียนสำเร็จ!",
          "ระบบได้สร้างบัญชีของคุณแล้ว หากยังเข้าสู่ระบบไม่ได้ กรุณาตรวจสอบลิงก์ยืนยันตัวตนในอีเมลของคุณ"
        );
        if (isMountedRef.current) switchMode("login");
      }
    } catch (error) {
      showAlert("ลงทะเบียนไม่สำเร็จ", getErrorMessageTH(error));
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleForgotPassword = async () => {
    if (isSubmittingRef.current) return;
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      return showAlert(
        "กรุณากรอก Email",
        "ระบุ Email เพื่อรับลิงก์สำหรับตั้งรหัสผ่านใหม่"
      );
    }
    if (!isValidEmail(cleanEmail)) {
      return showAlert(
        "รูปแบบอีเมลไม่ถูกต้อง",
        "กรุณาตรวจสอบรูปแบบอีเมลของคุณ เช่น name@example.com"
      );
    }

    try {
      isSubmittingRef.current = true;
      if (isMountedRef.current) setLoading(true);

      let redirectUrl = "";
      if (Platform.OS === "web") {
        redirectUrl = window.location.origin;
      } else {
        redirectUrl = AuthSession.makeRedirectUri({
          scheme: "buddypos",
          path: "auth/callback",
        });
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        {
          redirectTo: redirectUrl,
        }
      );

      if (error) throw error;

      showAlert(
        "ส่งอีเมลสำเร็จ",
        "ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยัง Email ของคุณแล้ว กรุณาตรวจสอบกล่องข้อความ"
      );
      if (isMountedRef.current) switchMode("login");
    } catch (error) {
      showAlert("เกิดข้อผิดพลาด", getErrorMessageTH(error));
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const onSubmitMain =
    mode === "login"
      ? handleLogin
      : mode === "register"
      ? handleRegister
      : handleForgotPassword;

  const isEmailFocused = focusedField === "email";
  const isPassFocused = focusedField === "password";
  const isConfirmFocused = focusedField === "confirm";

  return (
    <View style={styles.root}>
      {/* แถบด้านบนสำหรับวางปุ่มย้อนกลับไว้มุมซ้ายบน (ซ่อนในโหมดเว็บแอดมินแยก) */}
      {onBack && role !== "super_admin" ? (
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topLeftBackBtn}
            onPress={onBack}
            activeOpacity={0.75}
          >
            <Icon name="chevron-back" size={18} color={colors.textSecondary} />
            <Text style={styles.topLeftBackText}>ย้อนกลับ</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ height: 24 }} />
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollCenter}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          {/* ส่วนหัวโลโก้เหมือนหน้า RoleSelectScreen */}
          <View style={styles.brandHeader}>
            <View style={styles.brandLogoBox}>
              <Image
                source={require("../../assets/icon.png")}
                style={styles.brandLogoImg}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.brandTitle}>
              {role === "super_admin" ? "BuddyPOS Admin" : "BuddyPOS"}
            </Text>
            <Text style={styles.brandSub}>
              {role === "super_admin"
                ? "เว็บระบบผู้ดูแลระบบกลางแยกเฉพาะ (Super Admin Web Portal)"
                : "ระบบจัดการร้านอาหารสำหรับเจ้าของร้าน"}
            </Text>
          </View>

          {/* การ์ดฟอร์ม */}
          <View style={styles.card}>
            {role === "super_admin" && mode !== "forgot" ? (
              <View style={styles.forgotHeaderBox}>
                <Text style={styles.forgotHeaderTitle}>เข้าสู่ระบบผู้ดูแลระบบกลาง</Text>
                <Text style={styles.forgotHeaderSub}>
                  เฉพาะบัญชีที่ได้รับสิทธิ์ Super Admin เท่านั้น
                </Text>
              </View>
            ) : mode !== "forgot" ? (
              <View style={styles.segmentedBar}>
                <TouchableOpacity
                  style={[styles.segmentBtn, mode === "login" && styles.segmentBtnActive]}
                  onPress={() => switchMode("login")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, mode === "login" && styles.segmentTextActive]}>
                    เข้าสู่ระบบ
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, mode === "register" && styles.segmentBtnActive]}
                  onPress={() => switchMode("register")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, mode === "register" && styles.segmentTextActive]}>
                    ลงทะเบียนใหม่
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.forgotHeaderBox}>
                <Text style={styles.forgotHeaderTitle}>ลืมรหัสผ่าน</Text>
                <Text style={styles.forgotHeaderSub}>กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</Text>
              </View>
            )}

            {/* ส่วนของ Input */}
            <View style={styles.formWrap}>
              {/* ช่องกรอก Email */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, isEmailFocused && styles.fieldLabelFocused]}>
                  อีเมลผู้ใช้งาน
                </Text>
                <View style={[styles.inputBox, isEmailFocused && styles.inputBoxFocused]}>
                  <View style={[styles.iconBadge, isEmailFocused && styles.iconBadgeFocused]}>
                    <Icon
                      name="mail-outline"
                      size={18}
                      color={isEmailFocused ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="name@example.com"
                    placeholderTextColor={colors.textFaint}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType={mode === "forgot" ? "done" : "next"}
                    onSubmitEditing={() => {
                      if (mode === "forgot") {
                        handleForgotPassword();
                      } else {
                        passwordRef.current?.focus();
                      }
                    }}
                  />
                  {email.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearBtn}
                      onPress={() => setEmail("")}
                      activeOpacity={0.7}
                    >
                      <Icon name="close-circle" size={17} color={colors.textFaint} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* ช่องกรอก Password */}
              {mode !== "forgot" && (
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Text style={[styles.fieldLabel, isPassFocused && styles.fieldLabelFocused, { marginBottom: 0 }]}>
                      รหัสผ่าน
                    </Text>
                    {mode === "login" && (
                      <TouchableOpacity onPress={() => switchMode("forgot")} activeOpacity={0.7}>
                        <Text style={styles.forgotInlineText}>ลืมรหัสผ่าน?</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[styles.inputBox, isPassFocused && styles.inputBoxFocused]}>
                    <View style={[styles.iconBadge, isPassFocused && styles.iconBadgeFocused]}>
                      <Icon
                        name="lock-closed-outline"
                        size={18}
                        color={isPassFocused ? colors.primary : colors.textMuted}
                      />
                    </View>
                    <TextInput
                      ref={passwordRef}
                      style={styles.textInput}
                      placeholder="กรอกรหัสผ่านของคุณ"
                      placeholderTextColor={colors.textFaint}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!showPassword}
                      returnKeyType={mode === "register" ? "next" : "done"}
                      onSubmitEditing={() => {
                        if (mode === "register") {
                          confirmRef.current?.focus();
                        } else {
                          handleLogin();
                        }
                      }}
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
              )}

              {/* ช่องยืนยัน Password */}
              {mode === "register" && (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, isConfirmFocused && styles.fieldLabelFocused]}>
                    ยืนยันรหัสผ่านอีกครั้ง
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
                      placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง"
                      placeholderTextColor={colors.textFaint}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setFocusedField("confirm")}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!showPassword}
                      returnKeyType="done"
                      onSubmitEditing={handleRegister}
                    />
                  </View>
                </View>
              )}

              {/* ปุ่มหลัก */}
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={onSubmitMain}
                disabled={loading || googleLoading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {mode === "login" && "เข้าสู่ระบบ"}
                    {mode === "register" && "สร้างบัญชีเจ้าของร้าน"}
                    {mode === "forgot" && "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
                  </Text>
                )}
              </TouchableOpacity>

              {/* ปุ่ม Google */}
              {mode === "login" && (
                <>
                  <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>หรือดำเนินการต่อด้วย</Text>
                    <View style={styles.orLine} />
                  </View>

                  <TouchableOpacity
                    style={styles.googleBtn}
                    onPress={handleGoogleLogin}
                    disabled={loading || googleLoading}
                    activeOpacity={0.85}
                  >
                    {googleLoading ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <View style={styles.googleInner}>
                        <Icon name="logo-google" size={18} color="#EA4335" />
                        <Text style={styles.googleText}>เข้าสู่ระบบด้วย Google</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {mode === "forgot" && (
              <TouchableOpacity style={styles.centerLinkBtn} onPress={() => switchMode("login")}>
                <Text style={styles.centerLinkText}>กลับไปหน้าเข้าสู่ระบบ</Text>
              </TouchableOpacity>
            )}
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

  /* ส่วนหัวโลโก้เหมือน RoleSelectScreen */
  brandHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  brandLogoBox: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 16,
    ...shadow.raised,
  },
  brandLogoImg: {
    width: "100%",
    height: "100%",
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

  /* การ์ดหลัก */
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

  /* แถบสลับโหมด เข้าสู่ระบบ / ลงทะเบียน */
  segmentedBar: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSubtle,
    padding: 4,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: "#FFFFFF",
    ...shadow.sm,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: "700",
  },

  forgotHeaderBox: {
    alignItems: "center",
    marginBottom: 22,
  },
  forgotHeaderTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  forgotHeaderSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },

  /* ส่วนของ Input ดีไซน์ใหม่ */
  formWrap: {
    width: "100%",
  },
  fieldGroup: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
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
  forgotInlineText: {
    fontSize: 13,
    fontWeight: "600",
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
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  eyeTouch: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },

  /* ปุ่มกด */
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
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  orText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: colors.textFaint,
    fontWeight: "500",
  },
  googleBtn: {
    height: 50,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  googleInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  googleText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  centerLinkBtn: {
    marginTop: 18,
    alignItems: "center",
  },
  centerLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
});
