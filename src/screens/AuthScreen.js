import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import useAuth from "../hooks/useAuth";

const ACCENT = "#4F6CF7";
const DARK_TEXT = "#141820";
const MUTED_TEXT = "#6B7280";
const BORDER_COLOR = "#D4D9E6";
const BACKGROUND = "#F3F4FB";

const EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginFocused, setLoginFocused] = useState({ email: false, password: false });
  const [loginLoading, setLoginLoading] = useState(false);

  const [signupStep, setSignupStep] = useState(1);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupForm, setSignupForm] = useState({
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
    organization: "",
    role: "guardian",
  });
  const [agreements, setAgreements] = useState({
    all: false,
    service: false,
    privacy: false,
    location: false,
  });
  const [emailStatus, setEmailStatus] = useState({
    state: "idle",
    message: "",
  });

  const progressSteps = [1, 2, 3];
  const progressFillPercent = (signupStep / progressSteps.length) * 100;

  const handleSwitchMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (nextMode === "login") {
      setSignupStep(1);
      setSignupLoading(false);
    } else {
      setLoginLoading(false);
      setEmailStatus({ state: "idle", message: "" });
    }
  };

  const handleLogin = async () => {
    const email = loginEmail.trim();
    if (!EMAIL_REGEX.test(email)) {
      Alert.alert("입력 확인", "올바른 이메일을 입력해 주세요.");
      return;
    }
    if (!loginPassword) {
      Alert.alert("입력 확인", "비밀번호를 입력해 주세요.");
      return;
    }

    try {
      setLoginLoading(true);
      const { error } = await signIn({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) {
        Alert.alert("로그인 실패", error.message);
      }
    } catch (error) {
      Alert.alert("로그인 실패", error instanceof Error ? error.message : String(error));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCheckEmail = () => {
    const email = signupForm.email.trim();
    if (!EMAIL_REGEX.test(email)) {
      setEmailStatus({ state: "invalid", message: "올바른 이메일 형식을 입력해 주세요." });
      return;
    }

    // TODO: Supabase RPC 또는 Edge Function으로 이메일 중복 체크 연동
    setEmailStatus({ state: "valid", message: "사용 가능한 이메일입니다." });
  };

  const canProceedStep1 = emailStatus.state === "valid";
  const passwordMatches =
    signupForm.password.length > 0 && signupForm.password === signupForm.confirmPassword;
  const passwordValid = PASSWORD_RULE.test(signupForm.password);

  const canProceedStep2 =
    signupForm.name.trim().length > 0 && passwordValid && passwordMatches;

  const canProceedStep3 = agreements.service && agreements.privacy && agreements.location;

  const canGoNext = useMemo(() => {
    if (signupStep === 1) return canProceedStep1;
    if (signupStep === 2) return canProceedStep2;
    if (signupStep === 3) return canProceedStep3;
    return false;
  }, [signupStep, canProceedStep1, canProceedStep2, canProceedStep3]);

  const toggleAgreement = (key) => {
    if (key === "all") {
      const next = !agreements.all;
      setAgreements({ all: next, service: next, privacy: next, location: next });
      return;
    }

    const nextState = { ...agreements, [key]: !agreements[key] };
    nextState.all = nextState.service && nextState.privacy && nextState.location;
    setAgreements(nextState);
  };

  const resetSignup = () => {
    setSignupForm({
      email: "",
      name: "",
      password: "",
      confirmPassword: "",
      organization: "",
      role: "guardian",
    });
    setAgreements({ all: false, service: false, privacy: false, location: false });
    setEmailStatus({ state: "idle", message: "" });
    setSignupStep(1);
  };

  const completeSignup = async () => {
    const { email, name, password, organization, role } = signupForm;
    try {
      setSignupLoading(true);
      const { error } = await signUp({
        email: email.trim(),
        password,
        metadata: {
          name: name.trim(),
          affiliation: organization.trim() || undefined,
          role,
          agreements: {
            service: agreements.service,
            privacy: agreements.privacy,
            location: agreements.location,
          },
        },
      });

      if (error) {
        Alert.alert("회원가입 실패", error.message);
        return;
      }

      Alert.alert("회원가입 완료", "이제 바로 로그인하실 수 있습니다.", [
        {
          text: "확인",
          onPress: () => {
            resetSignup();
            setMode("login");
            setLoginEmail(email.trim());
          },
        },
      ]);
    } catch (error) {
      Alert.alert("회원가입 실패", error instanceof Error ? error.message : String(error));
    } finally {
      setSignupLoading(false);
    }
  };

  const handleNext = () => {
    if (signupStep < 3) {
      setSignupStep((prev) => prev + 1);
      return;
    }
    if (!signupLoading) {
      completeSignup();
    }
  };

  const handlePrev = () => {
    if (signupStep === 1) {
      handleSwitchMode("login");
    } else {
      setSignupStep((prev) => prev - 1);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {mode === "login" ? (
            <>
              <View style={styles.brandColumn}>
                <Text style={styles.brandTitle}>늘봄</Text>
                <Text style={styles.brandSubtitle}>돌봄의 일상을 공유하다</Text>
              </View>

              <View style={styles.loginCard}>
                <Text style={styles.loginHeader}>로그인</Text>

                <Text style={styles.loginGreeting}>안녕하세요</Text>
                <Text style={styles.loginHighlight}>
                  <Text style={styles.loginPrimary}>늘봄 </Text>
                  입니다
                </Text>
                <Text style={styles.loginDescription}>회원 서비스를 이용을 위해 로그인 해주세요</Text>

                <View style={styles.inputGroupUnderline}>
                  <Text style={styles.label}>이메일</Text>
                  <TextInput
                    style={[
                      styles.inputUnderline,
                      loginFocused.email && styles.inputUnderlineFocused,
                    ]}
                    placeholder="이메일을 입력해 주세요"
                    placeholderTextColor={MUTED_TEXT}
                    value={loginEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onFocus={() => setLoginFocused((prev) => ({ ...prev, email: true }))}
                    onBlur={() => setLoginFocused((prev) => ({ ...prev, email: false }))}
                    onChangeText={setLoginEmail}
                  />
                </View>

                <View style={styles.inputGroupUnderline}>
                  <Text style={styles.label}>비밀번호</Text>
                  <TextInput
                    style={[
                      styles.inputUnderline,
                      loginFocused.password && styles.inputUnderlineFocused,
                    ]}
                    placeholder="비밀번호를 입력해 주세요"
                    placeholderTextColor={MUTED_TEXT}
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    secureTextEntry
                    onFocus={() => setLoginFocused((prev) => ({ ...prev, password: true }))}
                    onBlur={() => setLoginFocused((prev) => ({ ...prev, password: false }))}
                  />
                </View>

                <View style={styles.linkRow}>
                  <TouchableOpacity><Text style={styles.linkText}>아이디 찾기</Text></TouchableOpacity>
                  <Text style={styles.linkDivider}>|</Text>
                  <TouchableOpacity><Text style={styles.linkText}>비밀번호 찾기</Text></TouchableOpacity>
                  <Text style={styles.linkDivider}>|</Text>
                  <TouchableOpacity onPress={() => handleSwitchMode("signup")}>
                    <Text style={[styles.linkText, styles.linkPrimary]}>회원가입</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loginLoading && styles.primaryButtonDisabled]}
                  onPress={handleLogin}
                  disabled={loginLoading}
                >
                  <Text style={styles.primaryButtonText}>
                    {loginLoading ? "로그인 중..." : "로그인"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.signupWrapper}>
              <View style={styles.signupHeaderRow}>
                <TouchableOpacity onPress={handlePrev}>
                  <Text style={styles.backButton}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.signupHeaderTitle}>회원가입</Text>
                <View style={{ width: 20 }} />
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${Math.max(33.34, progressFillPercent)}%` }]}
                />
              </View>

              {signupStep === 1 && (
                <View style={styles.stepCard}>
                  <Text style={styles.stepTitle}>환영합니다!</Text>
                  <Text style={styles.stepDescription}>로그인에 사용할 이메일을 입력해 주세요</Text>

                  <TextInput
                    style={styles.inputBoxed}
                    placeholder="이메일"
                    placeholderTextColor={MUTED_TEXT}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={signupForm.email}
                    onChangeText={(value) => {
                      setSignupForm((prev) => ({ ...prev, email: value }));
                      setEmailStatus({ state: "idle", message: "" });
                    }}
                  />

                  {emailStatus.message ? (
                    <Text
                      style={[
                        styles.statusText,
                        emailStatus.state === "valid"
                          ? styles.statusTextPositive
                          : styles.statusTextNegative,
                      ]}
                    >
                      {emailStatus.message}
                    </Text>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.primaryButton, !signupForm.email && styles.primaryButtonDisabled]}
                    onPress={handleCheckEmail}
                    disabled={!signupForm.email}
                  >
                    <Text style={styles.primaryButtonText}>중복 확인</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryButton, (!canGoNext || signupLoading) && styles.primaryButtonDisabled, styles.stepPrimaryButton]}
                    onPress={handleNext}
                    disabled={!canGoNext || signupLoading}
                  >
                    <Text style={styles.primaryButtonText}>다음</Text>
                  </TouchableOpacity>
                </View>
              )}

              {signupStep === 2 && (
                <View style={styles.stepCard}>
                  <Text style={styles.stepTitle}>비밀번호와 이름을 입력해주세요</Text>
                  <Text style={styles.stepDescription}>
                    안전한 비밀번호를 설정하고 이름을 입력해 주세요
                  </Text>

                  <TextInput
                    style={styles.inputBoxed}
                    placeholder="이름"
                    placeholderTextColor={MUTED_TEXT}
                    value={signupForm.name}
                    onChangeText={(value) => setSignupForm((prev) => ({ ...prev, name: value }))}
                  />

                  <TextInput
                    style={styles.inputBoxed}
                    placeholder="비밀번호"
                    placeholderTextColor={MUTED_TEXT}
                    value={signupForm.password}
                    onChangeText={(value) => setSignupForm((prev) => ({ ...prev, password: value }))}
                    secureTextEntry
                    autoCapitalize="none"
                  />

                  <TextInput
                    style={styles.inputBoxed}
                    placeholder="비밀번호 확인"
                    placeholderTextColor={MUTED_TEXT}
                    value={signupForm.confirmPassword}
                    onChangeText={(value) =>
                      setSignupForm((prev) => ({ ...prev, confirmPassword: value }))
                    }
                    secureTextEntry
                    autoCapitalize="none"
                  />

                  <View style={styles.validationList}>
                    <Text
                      style={[
                        styles.validationItem,
                        passwordValid ? styles.validationPass : styles.validationFail,
                      ]}
                    >
                      영문, 숫자, 특수문자 포함 8자 이상
                    </Text>
                    <Text
                      style={[
                        styles.validationItem,
                        passwordMatches ? styles.validationPass : styles.validationFail,
                      ]}
                    >
                      비밀번호를 한번 더 입력해 주세요
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, (!canGoNext || signupLoading) && styles.primaryButtonDisabled, styles.stepPrimaryButton]}
                    onPress={handleNext}
                    disabled={!canGoNext || signupLoading}
                  >
                    <Text style={styles.primaryButtonText}>다음</Text>
                  </TouchableOpacity>
                </View>
              )}

              {signupStep === 3 && (
                <View style={styles.stepCard}>
                  <Text style={styles.stepTitle}>소속기관명을 입력해주세요</Text>
                  <Text style={styles.stepDescription}>어린이집, 요양원 등 기관명을 입력해 주세요</Text>

                  <View style={styles.organizationRow}>
                    <TextInput
                      style={[styles.inputBoxed, styles.organizationInput]}
                      placeholder="소속명"
                      placeholderTextColor={MUTED_TEXT}
                      value={signupForm.organization}
                      onChangeText={(value) =>
                        setSignupForm((prev) => ({ ...prev, organization: value }))
                      }
                    />
                    {signupForm.organization ? (
                      <TouchableOpacity
                        style={styles.clearButton}
                        onPress={() => setSignupForm((prev) => ({ ...prev, organization: "" }))}
                      >
                        <Text style={styles.clearButtonText}>×</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <Text style={styles.roleLabel}>어떤 역할로 이용하시나요?</Text>
                  <View style={styles.roleSelector}>
                    <TouchableOpacity
                      style={[
                        styles.roleOption,
                        signupForm.role === "guardian" && styles.roleOptionActive,
                      ]}
                      onPress={() => setSignupForm((prev) => ({ ...prev, role: "guardian" }))}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          signupForm.role === "guardian" && styles.roleOptionTextActive,
                        ]}
                      >
                        보호자
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.roleOption,
                        signupForm.role === "caregiver" && styles.roleOptionActive,
                      ]}
                      onPress={() => setSignupForm((prev) => ({ ...prev, role: "caregiver" }))}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          signupForm.role === "caregiver" && styles.roleOptionTextActive,
                        ]}
                      >
                        돌봄자
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.agreementList}>
                    <TouchableOpacity
                      style={styles.agreementRow}
                      onPress={() => toggleAgreement("all")}
                    >
                      <View
                        style={[styles.checkbox, agreements.all && styles.checkboxChecked]}
                      />
                      <Text style={[styles.agreementText, styles.agreementTextBold]}>모두 동의합니다</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.agreementRow}
                      onPress={() => toggleAgreement("service")}
                    >
                      <View
                        style={[styles.checkbox, agreements.service && styles.checkboxChecked]}
                      />
                      <Text style={styles.agreementText}>이용약관 동의 (필수)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.agreementRow}
                      onPress={() => toggleAgreement("privacy")}
                    >
                      <View
                        style={[styles.checkbox, agreements.privacy && styles.checkboxChecked]}
                      />
                      <Text style={styles.agreementText}>개인정보 수집 이용 동의 (필수)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.agreementRow}
                      onPress={() => toggleAgreement("location")}
                    >
                      <View
                        style={[styles.checkbox, agreements.location && styles.checkboxChecked]}
                      />
                      <Text style={styles.agreementText}>위치기반 서비스 이용 동의 (필수)</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, (!canGoNext || signupLoading) && styles.primaryButtonDisabled, styles.stepPrimaryButton]}
                    onPress={handleNext}
                    disabled={!canGoNext || signupLoading}
                  >
                    <Text style={styles.primaryButtonText}>{signupLoading ? "..." : "회원가입 완료"}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  wrapper: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  brandColumn: {
    marginTop: 40,
    alignItems: "center",
    marginBottom: 32,
  },
  brandTitle: {
    fontSize: 48,
    fontWeight: "800",
    color: ACCENT,
  },
  brandSubtitle: {
    marginTop: 12,
    color: MUTED_TEXT,
    fontSize: 14,
  },
  loginCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 32,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  loginHeader: {
    fontSize: 16,
    color: MUTED_TEXT,
    marginBottom: 24,
    textAlign: "center",
  },
  loginGreeting: {
    fontSize: 26,
    fontWeight: "700",
    color: DARK_TEXT,
  },
  loginHighlight: {
    fontSize: 24,
    marginTop: 4,
    marginBottom: 16,
  },
  loginPrimary: {
    color: ACCENT,
    fontWeight: "700",
  },
  loginDescription: {
    color: MUTED_TEXT,
    fontSize: 13,
    marginBottom: 32,
  },
  label: {
    fontSize: 13,
    color: DARK_TEXT,
    marginBottom: 6,
    fontWeight: "600",
  },
  inputGroupUnderline: {
    marginBottom: 24,
  },
  inputUnderline: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    paddingVertical: 10,
    fontSize: 16,
    color: DARK_TEXT,
  },
  inputUnderlineFocused: {
    borderBottomColor: ACCENT,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  linkText: {
    fontSize: 12,
    color: MUTED_TEXT,
  },
  linkDivider: {
    marginHorizontal: 8,
    color: BORDER_COLOR,
  },
  linkPrimary: {
    color: ACCENT,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: "#A5B4FC",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  stepPrimaryButton: {
    marginTop: 16,
  },
  signupWrapper: {
    marginTop: 16,
  },
  signupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  backButton: {
    fontSize: 28,
    color: DARK_TEXT,
    paddingHorizontal: 4,
  },
  signupHeaderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEXT,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E4E9F6",
    overflow: "hidden",
    marginBottom: 24,
  },
  progressFill: {
    height: 4,
    backgroundColor: ACCENT,
    borderRadius: 2,
  },
  stepCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: "#1E293B",
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: DARK_TEXT,
    marginBottom: 12,
    textAlign: "center",
  },
  stepDescription: {
    color: MUTED_TEXT,
    fontSize: 13,
    marginBottom: 24,
    textAlign: "center",
  },
  inputBoxed: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: DARK_TEXT,
    backgroundColor: "#FFFFFF",
    marginBottom: 18,
  },
  statusText: {
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  statusTextPositive: {
    color: "#0F9D58",
  },
  statusTextNegative: {
    color: "#DC2626",
  },
  validationList: {
    gap: 6,
  },
  validationItem: {
    fontSize: 12,
    textAlign: "center",
  },
  validationPass: {
    color: "#16A34A",
  },
  validationFail: {
    color: "#DC2626",
  },
  organizationRow: {
    position: "relative",
  },
  organizationInput: {
    paddingRight: 40,
  },
  clearButton: {
    position: "absolute",
    right: 10,
    top: 14,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonText: {
    color: MUTED_TEXT,
    fontSize: 16,
    lineHeight: 18,
  },
  agreementList: {
    marginTop: 12,
    gap: 18,
  },
  agreementRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  agreementText: {
    fontSize: 14,
    color: DARK_TEXT,
  },
  agreementTextBold: {
    fontWeight: "700",
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: DARK_TEXT,
    marginTop: 8,
    marginBottom: 12,
  },
  roleSelector: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  roleOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  roleOptionActive: {
    borderColor: ACCENT,
    backgroundColor: "#EEF1FF",
  },
  roleOptionText: {
    color: MUTED_TEXT,
    fontWeight: "600",
  },
  roleOptionTextActive: {
    color: ACCENT,
  },
});
