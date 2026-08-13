"use client";

import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import type { AuthResponse } from "../lib/types";

type AuthProps = {
  onAuthenticated: (auth: AuthResponse) => void;
};

export default function Auth({ onAuthenticated }: AuthProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("123456");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const auth =
        mode === "login"
          ? await api.login({ username, otp })
          : await api.register({
              username,
              display_name: displayName,
              phone,
              otp,
            });
      onAuthenticated(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">S</div>
        <h1>Secure Messaging Platform</h1>
        <p className="muted">Signal-inspired demo with mocked OTP authentication.</p>

        <div className="segmented">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">
            Login
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} type="button">
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="alice" required />
          </label>
          {mode === "register" && (
            <>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Alice Sharma"
                  required
                />
              </label>
              <label>
                Phone
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" />
              </label>
            </>
          )}
          <label>
            OTP
            <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="123456" required />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary-action" disabled={loading} type="submit">
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
