"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api";
import {
  toCurrentUser,
  type AuthOperations,
  type AuthStatus,
  type CurrentUser,
  type LoginCredentials,
} from "./auth";
import { authOperations } from "./authApi";

type Notice = { tone: "info" | "error"; message: string } | null;

type AuthContextValue = {
  status: AuthStatus;
  user: CurrentUser | null;
  notice: Notice;
  loggingOut: boolean;
  /** Server logout failed; local data is gone but the session may live on. */
  serverLogoutPending: boolean;
  check: () => Promise<void>;
  /** Rejects with the adapter error so the form can explain the failure. */
  login: (credentials: LoginCredentials) => Promise<void>;
  /** Resolves true only when the server confirmed the session ended. */
  logout: () => Promise<boolean>;
  /** Call when any protected API answers 401. */
  handleUnauthorized: () => void;
  clearNotice: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const expiredNotice: Notice = {
  tone: "info",
  message: "로그인이 만료됐어요. 다시 로그인해 주세요.",
};

export function AuthProvider({
  operations = authOperations,
  children,
}: {
  operations?: AuthOperations;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [serverLogoutPending, setServerLogoutPending] = useState(false);
  const operationsRef = useRef(operations);
  const statusRef = useRef(status);
  const pendingRef = useRef(false);
  const checking = useRef(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const sequence = useRef(0);

  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  const update = useCallback(
    (next: AuthStatus, nextUser: CurrentUser | null) => {
      statusRef.current = next;
      setStatus(next);
      setUser(nextUser);
    },
    [],
  );

  const signOutLocally = useCallback(
    (next: "anonymous" | "expired", nextNotice: Notice) => {
      sequence.current += 1;
      checking.current = false;
      update(next, null);
      setNotice(nextNotice);
    },
    [update],
  );

  const check = useCallback(async () => {
    // After an unconfirmed logout a successful me() must not sign the user back in.
    if (checking.current || locked.current || pendingRef.current) return;
    checking.current = true;
    const requestId = ++sequence.current;
    const current = () => mounted.current && sequence.current === requestId;
    let result: CurrentUser | null;
    try {
      result = toCurrentUser(await operationsRef.current.me());
    } catch (error) {
      if (!current()) return;
      checking.current = false;
      if (error instanceof ApiError && error.status === 401) {
        result = null;
      } else {
        // A failed recheck keeps a signed-in user; protected APIs still answer 401.
        if (statusRef.current !== "authenticated") update("unavailable", null);
        return;
      }
    }
    if (!current()) return;
    checking.current = false;
    if (result) {
      update("authenticated", result);
    } else if (statusRef.current === "authenticated") {
      update("expired", null);
      setNotice(expiredNotice);
    } else if (statusRef.current !== "expired") {
      update("anonymous", null);
    }
  }, [update]);

  useEffect(() => {
    mounted.current = true;
    void check();
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, [check]);

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === "visible") void check();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) void check();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("pageshow", restored);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("pageshow", restored);
    };
  }, [check]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      if (locked.current || !mounted.current) return;
      locked.current = true;
      const requestId = ++sequence.current;
      checking.current = false;
      setNotice(null);
      try {
        await operationsRef.current.login(credentials);
        // The issued session is trusted only after me() confirms who it is.
        const confirmed = toCurrentUser(await operationsRef.current.me());
        if (!confirmed) throw new Error("로그인 세션을 확인하지 못했습니다.");
        if (!mounted.current || sequence.current !== requestId) return;
        pendingRef.current = false;
        setServerLogoutPending(false);
        update("authenticated", confirmed);
      } finally {
        locked.current = false;
      }
    },
    [update],
  );

  const logout = useCallback(async () => {
    if (locked.current || !mounted.current) return false;
    locked.current = true;
    sequence.current += 1;
    checking.current = false;
    setLoggingOut(true);
    setNotice(null);
    let confirmed = false;
    try {
      await operationsRef.current.logout();
      confirmed = true;
    } catch (error) {
      // An already-expired session is a finished logout (AC-AUTH-002-03).
      confirmed = error instanceof ApiError && error.status === 401;
    }
    locked.current = false;
    if (!mounted.current) return confirmed;
    pendingRef.current = !confirmed;
    setServerLogoutPending(!confirmed);
    setLoggingOut(false);
    signOutLocally(
      "anonymous",
      confirmed
        ? { tone: "info", message: "로그아웃했어요." }
        : {
            tone: "error",
            message:
              "이 기기의 로그인 정보는 지웠지만 서버 로그아웃을 확인하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.",
          },
    );
    return confirmed;
  }, [signOutLocally]);

  const handleUnauthorized = useCallback(() => {
    if (statusRef.current === "anonymous" || statusRef.current === "expired") {
      return;
    }
    signOutLocally("expired", expiredNotice);
  }, [signOutLocally]);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({
      status,
      user,
      notice,
      loggingOut,
      serverLogoutPending,
      check,
      login,
      logout,
      handleUnauthorized,
      clearNotice,
    }),
    [
      status,
      user,
      notice,
      loggingOut,
      serverLogoutPending,
      check,
      login,
      logout,
      handleUnauthorized,
      clearNotice,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {/* A new user or sign-out remounts the tree so no protected state carries over. */}
      <Fragment key={user?.id ?? "signed-out"}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider 안에서 useAuth를 사용해 주세요.");
  return value;
}

export type AuthController = AuthContextValue;
