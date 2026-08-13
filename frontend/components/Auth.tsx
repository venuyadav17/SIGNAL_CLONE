"use client";

import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import type { AuthResponse } from "../lib/types";

type AuthProps = {
  onAuthenticated: (auth: AuthResponse) => void;
  onToggleTheme: () => void;
  theme: "light" | "dark";
};

export default function Auth({
  onAuthenticated,
  onToggleTheme,
  theme,
}: AuthProps) {
  const [mode, setMode] = useState<"login" | "register">("login");

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(
    newMode: "login" | "register"
  ) {
    setMode(newMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function getPasswordStrength(value: string) {
    if (!value) return 0;

    let strength = 0;

    if (value.length >= 6) strength++;
    if (/[A-Z]/.test(value)) strength++;
    if (/[0-9]/.test(value)) strength++;
    if (/[^A-Za-z0-9]/.test(value)) strength++;

    return strength;
  }

  const passwordStrength =
    getPasswordStrength(password);

  function passwordStrengthText() {
    if (!password) return "";
    if (passwordStrength <= 1) return "Weak password";
    if (passwordStrength === 2) return "Fair password";
    if (passwordStrength === 3) return "Good password";
    return "Strong password";
  }

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    if (mode === "register") {
      if (password.length < 6) {
        setError(
          "Password must contain at least 6 characters."
        );
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);

    try {
      const auth =
        mode === "login"
          ? await api.login({
              username: username.trim(),
              password,
            })
          : await api.register({
              username: username.trim(),
              phone: phone.trim() || undefined,
              password,
            });

      onAuthenticated(auth);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Authentication failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-background">
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
      </div>

      <section className="auth-panel">
        {/* Theme button */}
        <button
          className="auth-theme-toggle"
          onClick={onToggleTheme}
          type="button"
          aria-label="Switch theme"
          title={
            theme === "light"
              ? "Switch to dark mode"
              : "Switch to light mode"
          }
        >
          <span>
            {theme === "light" ? "☾" : "☀"}
          </span>

          {theme === "light"
            ? "Dark"
            : "Light"}
        </button>

        <div className="auth-brand">
          <div className="brand-mark">
            <span>S</span>
          </div>

          <div className="brand-status">
            <span className="status-dot" />
            Private & secure
          </div>
        </div>

        <div className="auth-heading">
          <h1>
            {mode === "login"
              ? "Welcome back"
              : "Create your account"}
          </h1>

          <p>
            {mode === "login"
              ? "Sign in to continue your private conversations."
              : "Join a simple, private messaging experience."}
          </p>
        </div>

        <div className="segmented">
          <button
            className={
              mode === "login" ? "active" : ""
            }
            onClick={() => switchMode("login")}
            type="button"
          >
            Sign in
          </button>

          <button
            className={
              mode === "register" ? "active" : ""
            }
            onClick={() =>
              switchMode("register")
            }
            type="button"
          >
            Create account
          </button>
        </div>

        <form
          className="auth-form"
          onSubmit={submit}
        >
          <div className="auth-field">
            <label htmlFor="username">
              Username
            </label>

            <div className="input-wrap">
              <span className="input-icon">
                @
              </span>

              <input
                id="username"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                placeholder="Enter your username"
                required
                minLength={2}
                maxLength={50}
                autoComplete="username"
              />
            </div>
          </div>

          {mode === "register" && (
            <div className="auth-field auth-field-animated">
              <label htmlFor="phone">
                Phone
                <span>Optional</span>
              </label>

              <div className="input-wrap">
                <span className="input-icon">
                  +
                </span>

                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value)
                  }
                  placeholder="Enter your phone number"
                  maxLength={30}
                  autoComplete="tel"
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="password">
              Password
            </label>

            <div className="input-wrap">
              <span className="input-icon">
                ●
              </span>

              <input
                id="password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                required
                minLength={6}
                maxLength={128}
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(
                    (value) => !value
                  )
                }
              >
                {showPassword
                  ? "Hide"
                  : "Show"}
              </button>
            </div>

            {mode === "register" &&
              password && (
                <div className="password-strength">
                  <div className="strength-bars">
                    {[1, 2, 3, 4].map(
                      (bar) => (
                        <span
                          key={bar}
                          className={
                            bar <=
                            passwordStrength
                              ? "filled"
                              : ""
                          }
                        />
                      )
                    )}
                  </div>

                  <small>
                    {passwordStrengthText()}
                  </small>
                </div>
              )}
          </div>

          {mode === "register" && (
            <div className="auth-field auth-field-animated">
              <label htmlFor="confirm-password">
                Confirm password
              </label>

              <div className="input-wrap">
                <span className="input-icon">
                  ●
                </span>

                <input
                  id="confirm-password"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  placeholder="Enter your password again"
                  required
                  minLength={6}
                  maxLength={128}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowConfirmPassword(
                      (value) => !value
                    )
                  }
                >
                  {showConfirmPassword
                    ? "Hide"
                    : "Show"}
                </button>
              </div>

              {confirmPassword &&
                password !==
                  confirmPassword && (
                  <small className="field-error">
                    Passwords do not match
                  </small>
                )}

              {confirmPassword &&
                password ===
                  confirmPassword && (
                  <small className="field-success">
                    Passwords match
                  </small>
                )}
            </div>
          )}

          {error && (
            <div className="auth-error">
              <span>!</span>
              {error}
            </div>
          )}

          <button
            className="primary-action auth-submit"
            disabled={loading}
            type="submit"
          >
            {loading ? (
              <>
                <span className="button-spinner" />
                {mode === "login"
                  ? "Signing in..."
                  : "Creating account..."}
              </>
            ) : (
              <>
                {mode === "login"
                  ? "Sign in"
                  : "Create account"}

                <span className="button-arrow">
                  →
                </span>
              </>
            )}
          </button>
        </form>

        <div className="auth-security">
          <div className="security-icon">
            ✓
          </div>

          <div>
            <strong>
              Your privacy matters
            </strong>

            <p>
              Your password is securely
              protected. Messages use simulated
              encryption for this demo.
            </p>
          </div>
        </div>

        <p className="auth-footer">
          {mode === "login"
            ? "New here?"
            : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() =>
              switchMode(
                mode === "login"
                  ? "register"
                  : "login"
              )
            }
          >
            {mode === "login"
              ? "Create an account"
              : "Sign in"}
          </button>
        </p>
      </section>
    </main>
  );
}