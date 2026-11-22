// App.js
import React, { useState, useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Platform, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { supabase } from "./src/lib/supabase";
import Icon from "./src/theme/Icon";
import { colors, radius, shadow } from "./src/theme";

import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import RoleSelectScreen from "./src/screens/RoleSelectScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import StoreDashboard from "./src/screens/StoreDashboard";
import StaffLoginScreen from "./src/screens/StaffLoginScreen";
import StaffMainScreen from "./src/screens/StaffMainScreen";
import CustomerOrderScreen from "./src/screens/CustomerOrderScreen";
import SuperAdminScreen from "./src/screens/SuperAdminScreen";

const STORAGE_ROLE_KEY = "buddypos_role";
const STORAGE_ACTIVE_STORE_KEY = "buddypos_active_store";
const STORAGE_DASHBOARD_VIEW_KEY = "buddypos_dashboard_view";

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App ErrorBoundary caught error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleResetToHome = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_ACTIVE_STORE_KEY);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_ACTIVE_STORE_KEY);
      }
    } catch (e) {
      // ignore storage cleanup errors
    }
    if (this.props.onResetState) {
      this.props.onResetState();
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.errorScreen}>
          <View style={styles.errorCard}>
            <View style={styles.errorIconCircle}>
              <Icon name="alert-circle-outline" size={36} color={colors.danger} />
            </View>
            <Text style={styles.errorTitle}>เกิดข้อผิดพลาดในการแสดงผลหน้าจอ</Text>
            <Text style={styles.errorSubtitle}>
              ระบบตรวจพบข้อผิดพลาดที่ไม่คาดคิด คุณสามารถกดปุ่มด้านล่างเพื่อโหลดหน้าจอใหม่อีกครั้ง
            </Text>
            {this.state.error ? (
              <View style={styles.errorDetailBox}>
                <Text style={styles.errorDetailText} numberOfLines={4}>
                  {this.state.error?.message || this.state.error?.toString()}
                </Text>
              </View>
            ) : null}
            <View style={styles.errorActionRow}>
              <TouchableOpacity
                style={styles.errorPrimaryBtn}
                onPress={this.handleRetry}
                activeOpacity={0.85}
              >
                <Icon name="refresh-outline" size={18} color="#FFFFFF" />
                <Text style={styles.errorPrimaryBtnText}>ลองโหลดหน้าจอใหม่</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.errorSecondaryBtn}
                onPress={this.handleResetToHome}
                activeOpacity={0.85}
              >
                <Icon name="home-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.errorSecondaryBtnText}>กลับสู่หน้าเลือกร้าน</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [activeStore, setActiveStore] = useState(null);
  const [dashboardView, setDashboardView] = useState("dashboard");

  // State สำหรับลูกค้าที่เปิดลิงก์ QR Code ประจำโต๊ะ
  const [customerToken, setCustomerToken] = useState(null);
  // State สำหรับโหมดแอดมินกลางที่เปิดผ่านลิงก์แยก (?mode=admin เท่านั้น)
  const [isAdminMode, setIsAdminMode] = useState(false);

  const handleSelectRole = (role) => {
    setSelectedRole(role);
    try {
      if (role) {
        AsyncStorage.setItem(STORAGE_ROLE_KEY, role);
        if (Platform.OS === "web" && typeof window !== "undefined") {
          localStorage.setItem(STORAGE_ROLE_KEY, role);
        }
      } else {
        AsyncStorage.removeItem(STORAGE_ROLE_KEY);
        if (Platform.OS === "web" && typeof window !== "undefined") {
          localStorage.removeItem(STORAGE_ROLE_KEY);
        }
      }
    } catch (e) {
      // ignore storage errors
    }
  };

  const handleUpdateDashboardView = (view) => {
    const nextView = view || "dashboard";
    setDashboardView(nextView);
    try {
      AsyncStorage.setItem(STORAGE_DASHBOARD_VIEW_KEY, nextView);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        localStorage.setItem(STORAGE_DASHBOARD_VIEW_KEY, nextView);
      }
    } catch (e) {
      // ignore storage errors
    }
  };

  const handleSelectActiveStore = (storeObj) => {
    setActiveStore(storeObj);
    try {
      if (storeObj) {
        const serialized = JSON.stringify(storeObj);
        AsyncStorage.setItem(STORAGE_ACTIVE_STORE_KEY, serialized);
        if (Platform.OS === "web" && typeof window !== "undefined") {
          localStorage.setItem(STORAGE_ACTIVE_STORE_KEY, serialized);
        }
      } else {
        handleUpdateDashboardView("dashboard");
        AsyncStorage.removeItem(STORAGE_ACTIVE_STORE_KEY);
        if (Platform.OS === "web" && typeof window !== "undefined") {
          localStorage.removeItem(STORAGE_ACTIVE_STORE_KEY);
        }
      }
    } catch (e) {
      // ignore storage errors
    }
  };

  const parseAndSetSession = async (urlStr) => {
    if (!urlStr) return;
    const getParam = (str, param) => {
      const match = str.match(new RegExp(`[#?&]${param}=([^&]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    };
    const type = getParam(urlStr, "type");
    const accessToken = getParam(urlStr, "access_token");
    const refreshToken = getParam(urlStr, "refresh_token");
    const authCode = getParam(urlStr, "code");
    const idToken = getParam(urlStr, "id_token");
    const oauthState = getParam(urlStr, "state");

    // กรณีล็อกอิน Google จากแอปมือถือ Android (.apk) ที่วิ่งกลับมาที่เว็บหลัก ให้ส่งต่อไปยัง Deep Link ของแอปทันที
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      oauthState &&
      oauthState.startsWith("native_app_") &&
      idToken
    ) {
      const deepLinkUrl = `buddypos://auth/callback#id_token=${encodeURIComponent(idToken)}&state=${encodeURIComponent(oauthState)}`;
      window.location.replace(deepLinkUrl);
      return;
    }

    if (type === "recovery") {
      setIsResettingPassword(true);
      handleSelectRole("owner");
    }

    if (idToken) {
      try {
        let savedNonce = undefined;
        if (Platform.OS === "web" && typeof window !== "undefined") {
          savedNonce = localStorage.getItem("buddypos_google_nonce") || undefined;
          localStorage.removeItem("buddypos_google_nonce");
          if (localStorage.getItem("buddypos_google_admin") === "1") {
            localStorage.removeItem("buddypos_google_admin");
            setIsAdminMode(true);
          }
        }
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
          nonce: savedNonce,
        });
        if (!error && data?.session) {
          setSession(data.session);
          if (!selectedRole) handleSelectRole("owner");
        }
      } catch (err) {
        console.error("Sign in with Google ID token error:", err);
      }
    } else if (accessToken && refreshToken) {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error && data.session) {
          setSession(data.session);
          if (!selectedRole) handleSelectRole("owner");
        }
      } catch (err) {
        console.error("Set session error:", err);
      }
    } else if (authCode) {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
        if (!error && data.session) {
          setSession(data.session);
          if (!selectedRole) handleSelectRole("owner");
        }
      } catch (err) {
        console.error("Exchange code error:", err);
      }
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        let detectedToken = null;
        let detectedStaffToken = null;
        let detectedStaffStoreId = null;
        let detectedStaffRole = null;
        let restoredRole = null;
        let restoredStore = null;
        let restoredView = "dashboard";

        // 1. ตรวจสอบว่าเปิดผ่านเว็บแอดมินแยกต่างหาก (/admin หรือ ?mode=admin บน Web เท่านั้น), ลิงก์พนักงาน (?staff_token=...), หรือลิงก์โต๊ะอาหาร (?token=...)
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          const staffTokenParam = urlParams.get("staff_token");
          const storeIdParam = urlParams.get("store_id") || urlParams.get("restaurant_id");
          const staffRoleParam = urlParams.get("staff_role");
          const tokenParam = urlParams.get("token") || urlParams.get("t");
          const modeParam = urlParams.get("mode");
          const isWebAdminPath =
            window.location.pathname === "/admin" ||
            window.location.pathname.startsWith("/admin/");
          if (modeParam === "admin" || isWebAdminPath) {
            setIsAdminMode(true);
          } else if (staffTokenParam) {
            detectedStaffToken = staffTokenParam;
            detectedStaffStoreId = storeIdParam;
            if (staffRoleParam === "kitchen" || staffRoleParam === "cashier") {
              detectedStaffRole = staffRoleParam;
            }
          } else if (tokenParam) {
            detectedToken = tokenParam;
            setCustomerToken(tokenParam);
          }

          restoredRole = localStorage.getItem(STORAGE_ROLE_KEY);
          const rawStore = localStorage.getItem(STORAGE_ACTIVE_STORE_KEY);
          if (rawStore) {
            try {
              restoredStore = JSON.parse(rawStore);
            } catch (e) {
              localStorage.removeItem(STORAGE_ACTIVE_STORE_KEY);
            }
          }
          restoredView = localStorage.getItem(STORAGE_DASHBOARD_VIEW_KEY) || "dashboard";

          if (window.location.hash || window.location.search.includes("code=") || window.location.search.includes("type=recovery")) {
            await parseAndSetSession(window.location.href);
            if (!tokenParam && modeParam !== "admin" && !isWebAdminPath) {
              window.history.replaceState(null, "", window.location.pathname);
            } else if (isWebAdminPath) {
              window.history.replaceState(null, "", "/admin");
            } else if (modeParam === "admin") {
              window.history.replaceState(null, "", `${window.location.pathname}?mode=admin`);
            }
          }
        } else {
          restoredRole = await AsyncStorage.getItem(STORAGE_ROLE_KEY);
          const rawStore = await AsyncStorage.getItem(STORAGE_ACTIVE_STORE_KEY);
          if (rawStore) {
            try {
              restoredStore = JSON.parse(rawStore);
            } catch (e) {
              await AsyncStorage.removeItem(STORAGE_ACTIVE_STORE_KEY);
            }
          }
          restoredView = (await AsyncStorage.getItem(STORAGE_DASHBOARD_VIEW_KEY)) || "dashboard";
        }

        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          if (Platform.OS === "web" && (/[?&]mode=admin(?:&|$)/.test(initialUrl) || /\/admin(?:\/|\?|$)/.test(initialUrl))) {
            setIsAdminMode(true);
          }
          const staffMatch = initialUrl.match(/[?&]staff_token=([^&]+)/);
          const storeMatch = initialUrl.match(/[?&](?:store_id|restaurant_id)=([^&]+)/);
          const staffRoleMatch = initialUrl.match(/[?&]staff_role=([^&]+)/);
          if (staffMatch) {
            detectedStaffToken = decodeURIComponent(staffMatch[1]);
            if (storeMatch) detectedStaffStoreId = decodeURIComponent(storeMatch[1]);
            if (staffRoleMatch) {
              const r = decodeURIComponent(staffRoleMatch[1]);
              if (r === "kitchen" || r === "cashier") detectedStaffRole = r;
            }
          } else {
            const match = initialUrl.match(/[?&](?:token|t)=([^&]+)/);
            if (match) {
              detectedToken = decodeURIComponent(match[1]);
              setCustomerToken(detectedToken);
            }
          }
          await parseAndSetSession(initialUrl);
        }

        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);

        if (detectedStaffToken) {
          let staffQuery = supabase
            .from("restaurants")
            .select("id, name, image_url, staff_token, status")
            .eq("staff_token", detectedStaffToken);
          if (detectedStaffStoreId) {
            staffQuery = staffQuery.eq("id", detectedStaffStoreId);
          }
          const { data: staffRest } = await staffQuery.maybeSingle();

          const resolvedStaffRole = detectedStaffRole || "cashier";
          handleSelectRole(resolvedStaffRole);
          if (staffRest && staffRest.status !== "suspended") {
            const staffStorePayload = {
              id: staffRest.id,
              restaurantId: staffRest.id,
              name: staffRest.name || "ร้านค้า BuddyPOS (พนักงาน)",
              image_url: staffRest.image_url || null,
              staffToken: staffRest.staff_token,
              role: "staff",
              staffRole: resolvedStaffRole,
              loginTime: new Date().toISOString(),
            };
            handleSelectActiveStore(staffStorePayload);
            if (Platform.OS === "web" && typeof window !== "undefined") {
              try {
                localStorage.setItem("buddypos_recent_staff_store", JSON.stringify(staffStorePayload));
                window.history.replaceState(null, "", window.location.pathname);
              } catch (e) {}
            }
          } else {
            handleSelectActiveStore(null);
          }
        } else if (!detectedToken) {
          if (restoredRole) {
            setSelectedRole(restoredRole);
          }
          if (restoredStore) {
            const storeId = restoredStore.id || restoredStore.restaurantId;
            if (restoredRole === "owner") {
              // ตรวจสอบสิทธิ์เจ้าของร้านและสถานะร้านค้าก่อนกู้คืนหน้าจัดการร้าน
              if (currentSession?.user?.id && storeId) {
                const { data: verifiedRest } = await supabase
                  .from("restaurants")
                  .select("id, name, image_url, owner_id, status")
                  .eq("id", storeId)
                  .eq("owner_id", currentSession.user.id)
                  .maybeSingle();

                if (verifiedRest && verifiedRest.status !== "suspended") {
                  setActiveStore({
                    ...restoredStore,
                    id: verifiedRest.id,
                    restaurantId: verifiedRest.id,
                    name: verifiedRest.name,
                    restaurantName: verifiedRest.name,
                    image_url: verifiedRest.image_url,
                  });
                  setDashboardView(restoredView);
                } else {
                  handleSelectActiveStore(null);
                }
              } else {
                handleSelectActiveStore(null);
              }
            } else if (
              (restoredRole === "staff" || restoredRole === "cashier" || restoredRole === "kitchen") &&
              storeId &&
              restoredStore.staffToken
            ) {
              // กู้คืนหน้าร้านสำหรับพนักงาน (StaffMainScreen จะตรวจสอบ staff_token และ status อีกชั้น)
              setActiveStore({
                ...restoredStore,
                staffRole:
                  restoredStore.staffRole ||
                  (restoredRole === "kitchen" ? "kitchen" : "cashier"),
              });
            }
          }
        }
      } catch (err) {
        console.error("Init auth error:", err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const linkingSubscription = Linking.addEventListener("url", (event) => {
      if (event?.url) {
        parseAndSetSession(event.url);
        if (/[?&]mode=admin(?:&|$)/.test(event.url)) {
          setIsAdminMode(true);
        }
        const match = event.url.match(/[?&](?:token|t)=([^&]+)/);
        if (match) {
          setCustomerToken(decodeURIComponent(match[1]));
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setIsResettingPassword(true);
        handleSelectRole("owner");
      } else if (event === "SIGNED_OUT") {
        setSelectedRole((prevRole) => {
          if (prevRole === "owner") {
            handleSelectActiveStore(null);
          }
          return prevRole;
        });
      }
      setLoading(false);
    });

    return () => {
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  // ฟังก์ชันส่งคืน "ชื่อไฟล์หน้าจอ" แบบตรงเป้าหมาย
  const getCurrentScreenFileName = () => {
    if (isAdminMode) {
      if (!session || !session.user) return "LoginScreen.js";
      return "SuperAdminScreen.js";
    }
    if (customerToken) return "CustomerOrderScreen.js";
    if (isResettingPassword) return "ResetPasswordScreen.js";
    if (!selectedRole) return "RoleSelectScreen.js";
    if (selectedRole === "staff" && !activeStore) return "StaffLoginScreen.js";
    if (selectedRole === "staff" && activeStore) return "StaffMainScreen.js";
    if (activeStore) {
      if (dashboardView === "tables") return "TableManagementScreen.js";
      if (dashboardView === "menu") return "MenuManagementScreen.js";
      if (dashboardView === "staff_qr") return "StaffQrScreen.js";
      if (dashboardView === "reports") return "SalesReportScreen.js";
      if (dashboardView === "payment") return "PaymentSettingsScreen.js";
      if (dashboardView === "customers") return "CustomerListScreen.js";
      return "StoreDashboard.js";
    }
    if (!session || !session.user) return "LoginScreen.js";
    return "HomeScreen.js";
  };

  const currentFileName = getCurrentScreenFileName();

  if (loading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.center} edges={["top", "bottom", "left", "right"]}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
          <ActivityIndicator size="large" color="#059669" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary onResetState={() => handleSelectActiveStore(null)}>
        <SafeAreaView style={styles.appContainer} edges={["top", "bottom", "left", "right"]}>
          <StatusBar barStyle="dark-content" backgroundColor="#F6F7F9" translucent={false} />

          {/* ส่วนเนื้อหาหลัก */}
          <View style={styles.container}>
            {Platform.OS === "web" && isAdminMode ? (
              session && session.user ? (
                <SuperAdminScreen
                  session={session}
                  onExitAdminMode={() => {
                    setIsAdminMode(false);
                    if (Platform.OS === "web" && typeof window !== "undefined") {
                      window.history.replaceState(null, "", "/");
                    }
                  }}
                  onLogout={async () => {
                    await supabase.auth.signOut();
                  }}
                />
              ) : (
                <LoginScreen
                  role="super_admin"
                  onLoginSuccess={(user) => console.log("Super Admin logged in:", user?.email)}
                />
              )
            ) : customerToken ? (
              <CustomerOrderScreen
                token={customerToken}
                onBackToHome={() => {
                  setCustomerToken(null);
                  if (Platform.OS === "web" && typeof window !== "undefined") {
                    window.history.replaceState(null, "", window.location.pathname);
                  }
                }}
              />
            ) : isResettingPassword ? (
              <ResetPasswordScreen
                onComplete={async () => {
                  setIsResettingPassword(false);
                  await supabase.auth.signOut();
                }}
              />
            ) : !selectedRole ? (
              <RoleSelectScreen
                onSelectOwner={() => handleSelectRole("owner")}
                onSelectStaff={() => handleSelectRole("cashier")}
                onSelectCashier={() => handleSelectRole("cashier")}
                onSelectKitchen={() => handleSelectRole("kitchen")}
              />
            ) : (selectedRole === "staff" || selectedRole === "cashier" || selectedRole === "kitchen") && !activeStore ? (
              <StaffLoginScreen
                staffRole={selectedRole === "kitchen" ? "kitchen" : "cashier"}
                onBack={() => {
                  handleSelectRole(null);
                  handleSelectActiveStore(null);
                }}
                onStaffLogin={(storeObj) => {
                  if (storeObj?.staffRole === "kitchen" || storeObj?.staffRole === "cashier") {
                    handleSelectRole(storeObj.staffRole);
                  }
                  handleSelectActiveStore(storeObj);
                }}
              />
            ) : (selectedRole === "staff" || selectedRole === "cashier" || selectedRole === "kitchen") && activeStore ? (
              <StaffMainScreen
                store={{
                  ...activeStore,
                  staffRole:
                    activeStore?.staffRole ||
                    (selectedRole === "kitchen" ? "kitchen" : "cashier"),
                }}
                onBack={() => {
                  handleSelectActiveStore(null);
                }}
              />
            ) : activeStore ? (
              <StoreDashboard
                store={activeStore}
                session={session}
                initialView={dashboardView}
                onViewChange={handleUpdateDashboardView}
                onBack={() => {
                  handleSelectActiveStore(null);
                }}
              />
            ) : session && session.user ? (
              <HomeScreen
                session={session}
                role={selectedRole}
                navigation={{
                  navigate: (screen, params) => {
                    if (screen === "StoreDashboard") {
                      const storeObj = params?.id
                        ? params
                        : { id: params?.restaurantId, name: params?.restaurantName, ...params };
                      handleUpdateDashboardView("dashboard");
                      handleSelectActiveStore(storeObj);
                    }
                  },
                }}
                onLogout={async () => {
                  await supabase.auth.signOut();
                  handleSelectRole(null);
                  handleSelectActiveStore(null);
                }}
              />
            ) : (
              <LoginScreen
                role={selectedRole}
                onBack={() => handleSelectRole(null)}
                onLoginSuccess={(user) => console.log("Logged in user:", user.email)}
              />
            )}
          </View>
        </SafeAreaView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  /* แถบแจ้งชื่อไฟล์หน้าจอ (Dev Bar) */
  devHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  devHeaderLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginRight: 6,
  },
  devHeaderFileName: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  /* หน้าจอ ErrorBoundary */
  errorScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  errorIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.dangerSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  errorDetailBox: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 20,
  },
  errorDetailText: {
    fontSize: 12,
    color: colors.danger,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorActionRow: {
    width: '100%',
    gap: 10,
  },
  errorPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },
  errorPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  errorSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },
  errorSecondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
